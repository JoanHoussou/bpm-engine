import { PrismaClient } from '@prisma/client';
import { ExecutionContext, StepResult } from '../../core/ExecutionContext.js';
import { WorkflowStep } from '../../core/WorkflowRegistry.js';
import { resolveWorkflow } from '../../core/WorkflowRegistry.js';
import { resolveJsonPath } from '../../core/JsonPathResolver.js';
import { toJsonValue } from '../../core/JsonValue.js';
import { ArchiveService } from '../phase4-output/ArchiveService.js';
import { scheduleReminder } from '../../queue/workers/reminder.worker.js';
import { scheduleHumanTimeout } from '../../queue/workers/humanTimeout.worker.js';

const prisma = new PrismaClient();

export class HumanStepSuspendedException extends Error {
  public stepName: string;
  public executionId: string;
  public actor: string;
  public decisions: { key: string; label: string; next: string }[];
  public timeoutHours: number;

  constructor(
    stepName: string,
    executionId: string,
    actor: string,
    decisions: { key: string; label: string; next: string }[],
    timeoutHours: number
  ) {
    super(`Human step "${stepName}" suspended waiting for ${actor}`);
    this.name = 'HumanStepSuspendedException';
    this.stepName = stepName;
    this.executionId = executionId;
    this.actor = actor;
    this.decisions = decisions;
    this.timeoutHours = timeoutHours;
  }
}

export interface HumanDecision {
  key: string;
  label: string;
  next: string;
}

export interface ResumeData {
  decision: string;
  actor: string;
  comment?: string;
}

export class HumanStepExecutor {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    if (!step.actor || !step.decisions || step.decisions.length === 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONFIG',
          message: 'Human step requires actor and decisions',
        },
        timestamp: new Date().toISOString(),
      };
    }

    const actor = resolveJsonPath(step.actor, {
      payload: context.payload,
      results: Object.fromEntries(context.results),
      metadata: Object.fromEntries(context.metadata),
    });
    const timeoutHours = step.timeout_hours || 48;
    const actionUrl = step.action_url 
      ? `${this.baseUrl}${step.action_url.replace('{execution_id}', context.execution_id).replace('{step_name}', step.name)}`
      : `${this.baseUrl}/approval/${context.execution_id}/${step.name}`;

    await this.persistWaitingState(context, step, actor);

    await this.sendNotification(context, step, actor, actionUrl);

    if (step.timeout_hours) {
      await this.scheduleTimeout(context, step, timeoutHours);
    }

    if (step.reminder_hours && step.reminder_hours.length > 0) {
      await this.scheduleReminders(context, step, actor, step.reminder_hours);
    }

    throw new HumanStepSuspendedException(
      step.name,
      context.execution_id,
      actor,
      step.decisions,
      timeoutHours
    );
  }

  async resume(
    executionId: string,
    stepName: string,
    data: ResumeData
  ): Promise<{ nextStep: string | null; decisionData: Record<string, unknown> }> {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'WAITING_HUMAN') {
      throw new Error(`Execution ${executionId} is not waiting for human input`);
    }

    const workflowDef = await resolveWorkflow(execution.type);
    if (!workflowDef) {
      throw new Error(`Workflow type "${execution.type}" not found in registry`);
    }

    const step = workflowDef.steps.find(s => s.name === stepName);
    if (!step || step.type !== 'human') {
      throw new Error(`Step ${stepName} not found or not a human step`);
    }

    const decisions = step.decisions || [];
    const decision = decisions.find((d: { key: string; label: string; next: string }) => d.key === data.decision);

    if (!decision) {
      throw new Error(
        `Unknown decision "${data.decision}" for step "${stepName}". ` +
        `Valid decisions: ${decisions.map((d: { key: string }) => d.key).join(', ')}`
      );
    }

    const contextData = execution.context as any;

    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'RUNNING',
        context: toJsonValue({
          ...contextData,
          lastResume: {
            step: stepName,
            decision: data.decision,
            actor: data.actor,
            comment: data.comment,
            timestamp: new Date().toISOString(),
          },
        }),
      },
    });

    await ArchiveService.writeEvent(
      executionId,
      'STEP_RESUMED',
      stepName,
      {
        step_name: stepName,
        decision: data.decision,
        actor: data.actor,
        comment: data.comment,
        resumed_at: new Date().toISOString(),
      }
    );

    return {
      nextStep: decision.next,
      decisionData: {
        decision: data.decision,
        actor: data.actor,
        comment: data.comment,
        decided_at: new Date().toISOString(),
      },
    };
  }

  private async persistWaitingState(
    context: ExecutionContext,
    step: WorkflowStep,
    actor: string
  ): Promise<void> {
    await prisma.workflowExecution.update({
      where: { id: context.execution_id },
      data: {
        status: 'WAITING_HUMAN',
        context: toJsonValue({
          ...context.serialize(),
          currentHumanStep: {
            name: step.name,
            actor,
            decisions: step.decisions,
            timeoutHours: step.timeout_hours,
            startedAt: new Date().toISOString(),
          },
        }),
      },
    });

    await prisma.workflowEvent.create({
      data: {
        executionId: context.execution_id,
        stepName: step.name,
        eventType: 'HUMAN_STEP_SUSPENDED',
        data: toJsonValue({
          actor,
          decisions: step.decisions,
          timeoutHours: step.timeout_hours,
        }),
      },
    });

    await ArchiveService.writeEvent(
      context.execution_id,
      'STEP_SUSPENDED',
      step.name,
      {
        step_name: step.name,
        actor,
        suspended_at: new Date().toISOString(),
      }
    );
  }

  private async sendNotification(
    context: ExecutionContext,
    step: WorkflowStep,
    actor: string,
    actionUrl: string
  ): Promise<void> {
    try {
      await prisma.workflowEvent.create({
        data: {
          executionId: context.execution_id,
          stepName: step.name,
          eventType: 'NOTIFICATION_SENT',
          data: toJsonValue({
            type: 'email',
            to: actor,
            subject: `Action Required: ${context.type} workflow`,
            actionUrl,
          }),
        },
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  private async scheduleTimeout(
    context: ExecutionContext,
    step: WorkflowStep,
    timeoutHours: number
  ): Promise<void> {
    await scheduleHumanTimeout(
      context.execution_id,
      step.name,
      timeoutHours
    );

    const scheduledFor = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    await prisma.workflowEvent.create({
      data: {
        executionId: context.execution_id,
        stepName: step.name,
        eventType: 'HUMAN_TIMEOUT_SCHEDULED',
        data: toJsonValue({
          scheduledFor: scheduledFor.toISOString(),
          timeoutHours,
          onTimeout: step.on_timeout || 'escalate',
          escalateTo: step.escalate_to,
        }),
      },
    });
  }

  private async scheduleReminders(
    context: ExecutionContext,
    step: WorkflowStep,
    actor: string,
    reminderHours: number[]
  ): Promise<void> {
    for (const hours of reminderHours) {
      await scheduleReminder(
        context.execution_id,
        step.name,
        actor,
        hours
      );

      const scheduledFor = new Date(Date.now() + hours * 60 * 60 * 1000);

      await prisma.workflowEvent.create({
        data: {
          executionId: context.execution_id,
          stepName: step.name,
          eventType: 'REMINDER_SCHEDULED',
          data: toJsonValue({
            scheduledFor: scheduledFor.toISOString(),
            hours,
            actor,
          }),
        },
      });
    }
  }
}
