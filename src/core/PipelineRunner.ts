import { prisma } from '../services/PrismaService.js';
import { ExecutionContext, StepResult } from './ExecutionContext.js';
import { WorkflowDefinition, WorkflowStep } from './WorkflowRegistry.js';
import { toJsonValue } from './JsonValue.js';
import { AutoStepExecutor, StepFailedError } from '../phases/phase3-execution/AutoStepExecutor.js';
import { HumanStepExecutor, HumanStepSuspendedException } from '../phases/phase3-execution/HumanStepExecutor.js';
import { ArchiveService } from '../phases/phase4-output/ArchiveService.js';
import { NotificationService } from '../phases/phase4-output/NotificationService.js';

export interface PipelineResult {
  success: boolean;
  executionId: string;
  status: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    step?: string;
  };
  completedSteps: string[];
}

export class PipelineRunner {
  private completedSteps: string[] = [];

  async run(
    workflowDef: WorkflowDefinition,
    context: ExecutionContext
  ): Promise<PipelineResult> {
    this.completedSteps = [];
    return this.executeWorkflow(workflowDef, context, 0);
  }

  async runContinue(
    workflowDef: WorkflowDefinition,
    context: ExecutionContext,
    startStepName: string
  ): Promise<PipelineResult> {
    const startIndex = workflowDef.steps.findIndex(s => s.name === startStepName);
    if (startIndex === -1) {
      return {
        success: false,
        executionId: context.execution_id,
        status: 'FAILED',
        error: { code: 'STEP_NOT_FOUND', message: `Step ${startStepName} not found` },
        completedSteps: this.completedSteps,
      };
    }
    return this.executeWorkflow(workflowDef, context, startIndex);
  }

  private async executeWorkflow(
    workflowDef: WorkflowDefinition,
    context: ExecutionContext,
    startIndex: number
  ): Promise<PipelineResult> {
    const stepMap = new Map<string, WorkflowStep>();
    for (const step of workflowDef.steps) {
      stepMap.set(step.name, step);
    }

    let currentStepIndex = startIndex;

    while (currentStepIndex < workflowDef.steps.length) {
      const step = workflowDef.steps[currentStepIndex];
      
      const stepResult = await this.executeStepWithHandlers(step, context, workflowDef);
      
      if (stepResult.return) {
        return stepResult.return;
      }

      currentStepIndex++;
    }

    return this.completeWorkflow(context);
  }

  private async executeStepWithHandlers(
    step: WorkflowStep,
    context: ExecutionContext,
    workflowDef: WorkflowDefinition
  ): Promise<{ return?: PipelineResult }> {
    context.current_step = step.name;
    await this.updateExecutionStatus(context, 'RUNNING');

    await ArchiveService.writeEvent(
      context.execution_id,
      'STEP_STARTED',
      step.name,
      {
        step_name: step.name,
        step_type: step.type,
        started_at: new Date().toISOString(),
      }
    );

    try {
      const result = await this.executeStep(step, context, workflowDef);
      
      context.addResult(step.name, result);

      await this.logStepEvent(context, step, result);

      if (!result.success) {
        if (step.on_failure === 'compensate' && this.completedSteps.length > 0) {
          await this.compensate(context, workflowDef);
        }

        return {
          return: {
            success: false,
            executionId: context.execution_id,
            status: 'FAILED',
            error: result.error,
            completedSteps: this.completedSteps,
          },
        };
      }

      this.completedSteps.push(step.name);

      const nextStepName = this.determineNextStep(step, result);
      
      if (nextStepName) {
        const nextIndex = workflowDef.steps.findIndex(s => s.name === nextStepName);
        if (nextIndex !== -1) {
          return { return: undefined };
        }
      }

    } catch (error) {
      const errorResult = this.handleStepError(error, step, context, workflowDef);
      if (errorResult) {
        return { return: errorResult };
      }
      throw error;
    }

    return {};
  }

  private handleStepError(
    error: unknown,
    step: WorkflowStep,
    context: ExecutionContext,
    workflowDef: WorkflowDefinition
  ): PipelineResult | null {
    if (error instanceof HumanStepSuspendedException) {
      this.updateExecutionStatus(context, 'WAITING_HUMAN').catch(err => 
        console.error('Failed to update status:', err)
      );
      
      return {
        success: true,
        executionId: context.execution_id,
        status: 'WAITING_HUMAN',
        result: {
          humanStep: error.stepName,
          actor: error.actor,
          decisions: error.decisions,
        },
        completedSteps: this.completedSteps,
      };
    }

    if (error instanceof StepFailedError) {
      if (step.on_failure === 'compensate' && this.completedSteps.length > 0) {
        this.compensate(context, workflowDef).catch(err => 
          console.error('Compensation failed:', err)
        );
      }

      return {
        success: false,
        executionId: context.execution_id,
        status: 'FAILED',
        error: {
          code: 'STEP_FAILED',
          message: error.message,
          step: error.stepName,
        },
        completedSteps: this.completedSteps,
      };
    }

    return null;
  }

  private async completeWorkflow(
    context: ExecutionContext,
  ): Promise<PipelineResult> {
    await this.updateExecutionStatus(context, 'COMPLETED');
    const durationMs = context.started_at ? Date.now() - new Date(context.started_at).getTime() : 0;
    
    this.handlePostCompletion(context, 'COMPLETED', durationMs).catch(err => 
      console.error('Post-completion handler error:', err)
    );

    return {
      success: true,
      executionId: context.execution_id,
      status: 'COMPLETED',
      result: this.collectResults(context),
      completedSteps: this.completedSteps,
    };
  }

  private async executeStep(
    step: WorkflowStep,
    context: ExecutionContext,
    workflowDef: WorkflowDefinition
  ): Promise<StepResult> {
    switch (step.type) {
      case 'auto': {
        const executor = new AutoStepExecutor(workflowDef.base_url);
        return await executor.execute(step, context);
      }

      case 'human': {
        const executor = new HumanStepExecutor(workflowDef.base_url);
        return await executor.execute(step, context);
      }

      case 'condition': {
        return this.evaluateCondition(step, context);
      }

      case 'parallel': {
        return await this.executeParallel(step, context, workflowDef);
      }

      default:
        return {
          success: false,
          error: {
            code: 'UNKNOWN_STEP_TYPE',
            message: `Unknown step type: ${(step as any).type}`,
          },
          timestamp: new Date().toISOString(),
        };
    }
  }

  private evaluateCondition(step: WorkflowStep, context: ExecutionContext): StepResult {
    if (!step.evaluate || !step.branches || step.branches.length === 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONDITION',
          message: 'Condition step requires evaluate and branches',
        },
        timestamp: new Date().toISOString(),
      };
    }

    const value = this.resolveJsonPath(step.evaluate, context);
    const branches = step.branches;

    for (const branch of branches) {
      if (branch.condition === 'default') {
        return {
          success: true,
          data: {
            next: branch.next,
            evaluated: value,
            condition: 'default',
          },
          timestamp: new Date().toISOString(),
        };
      }

      if (this.evaluateConditionExpression(value, branch.condition)) {
        return {
          success: true,
          data: {
            next: branch.next,
            evaluated: value,
            condition: branch.condition,
          },
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'NO_MATCHING_BRANCH',
        message: 'No matching condition branch found',
      },
      timestamp: new Date().toISOString(),
    };
  }

  private resolveJsonPath(path: string, context: ExecutionContext): unknown {
    if (!path.startsWith('$.')) {
      return path;
    }

    const parts = path.slice(2).split('.');
    let value: unknown = { payload: context.payload, results: {} };
    
    context.results.forEach((v, k) => {
      (value as any).results[k] = v.data;
    });

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private evaluateConditionExpression(value: unknown, condition: string): boolean {
    const match = condition.match(/^(.+?)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    
    if (!match) return false;

    const [, left, op, right] = match;
    
    let leftVal = this.parseValue(left.trim(), value);
    const rightVal = this.parseValue(right.trim(), value);

    switch (op) {
      case '>=':
        return leftVal >= rightVal;
      case '<=':
        return leftVal <= rightVal;
      case '>':
        return leftVal > rightVal;
      case '<':
        return leftVal < rightVal;
      case '==':
        return leftVal == rightVal;
      case '!=':
        return leftVal != rightVal;
      default:
        return false;
    }
  }

  private parseValue(str: string, contextValue?: unknown): number {
    if (str === '$') {
      return Number(contextValue);
    }
    
    const num = Number(str);
    if (!isNaN(num)) {
      return num;
    }
    
    if (str.startsWith('$.') && contextValue !== undefined) {
      return Number(contextValue);
    }
    
    return 0;
  }

  private determineNextStep(step: WorkflowStep, result: StepResult): string | null {
    if (step.type === 'condition' && result.data && typeof result.data === 'object') {
      const data = result.data as Record<string, unknown>;
      return data.next as string || null;
    }

    return null;
  }

  private async executeParallel(
    step: WorkflowStep,
    context: ExecutionContext,
    workflowDef: WorkflowDefinition
  ): Promise<StepResult> {
    if (!step.steps || step.steps.length === 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_PARALLEL',
          message: 'Parallel step requires steps array',
        },
        timestamp: new Date().toISOString(),
      };
    }

    const subSteps = step.steps.map(stepName => {
      const found = workflowDef.steps.find(s => s.name === stepName);
      return found;
    }).filter(Boolean) as WorkflowStep[];

    const results = await Promise.allSettled(
      subSteps.map(subStep => this.executeStep(subStep, context, workflowDef))
    );

    const allSuccessful = results.every(r => r.status === 'fulfilled' && r.value.success);
    const anySuccessful = results.some(r => r.status === 'fulfilled' && r.value.success);

    const waitFor = step.wait_for || 'all';

    if (waitFor === 'all' && !allSuccessful) {
      return {
        success: false,
        error: {
          code: 'PARALLEL_FAILED',
          message: 'One or more parallel steps failed',
        },
        timestamp: new Date().toISOString(),
      };
    }

    if (waitFor === 'any' && !anySuccessful) {
      return {
        success: false,
        error: {
          code: 'PARALLEL_FAILED',
          message: 'All parallel steps failed',
        },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: {
        results: results.map((r, i) => ({
          step: subSteps[i].name,
          success: r.status === 'fulfilled' ? r.value.success : false,
          data: r.status === 'fulfilled' ? r.value.data : null,
        })),
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async compensate(context: ExecutionContext, workflowDef: WorkflowDefinition): Promise<void> {
    const reverseSteps = [...this.completedSteps].reverse();

    for (const stepName of reverseSteps) {
      const step = workflowDef.steps.find(s => s.name === stepName);
      
      if (!step || step.type !== 'auto' || !step.compensate_url) {
        continue;
      }

      try {
        await fetch(`${workflowDef.base_url}${step.compensate_url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Execution-Id': context.execution_id,
            'X-Step-Name': stepName,
            'X-Compensation': 'true',
          },
          body: JSON.stringify({
            execution_id: context.execution_id,
            step: stepName,
            payload: context.payload,
          }),
        });

        await this.logStepEvent(context, step, {
          success: true,
          data: { compensated: true },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Failed to compensate step ${stepName}:`, error);
      }
    }
  }

  private async updateExecutionStatus(context: ExecutionContext, status: string): Promise<void> {
    await prisma.workflowExecution.update({
      where: { id: context.execution_id },
      data: {
        status,
        context: toJsonValue(context.serialize()),
      },
    });
  }

  private async logStepEvent(
    context: ExecutionContext,
    step: WorkflowStep,
    result: StepResult
  ): Promise<void> {
    await prisma.workflowEvent.create({
      data: {
        executionId: context.execution_id,
        stepName: step.name,
        eventType: result.success ? 'STEP_COMPLETED' : 'STEP_FAILED',
        data: toJsonValue(result),
      },
    });
  }

  private async handlePostCompletion(
    context: ExecutionContext,
    status: 'COMPLETED' | 'FAILED',
    durationMs: number
  ): Promise<void> {
    await ArchiveService.updateKPI(context.type, status, durationMs);

    await ArchiveService.writeEvent(
      context.execution_id,
      status === 'COMPLETED' ? 'WORKFLOW_COMPLETED' : 'WORKFLOW_FAILED',
      null,
      { type: context.type, durationMs }
    );

    const notifyPromise = status === 'COMPLETED'
      ? NotificationService.notifyWorkflowCompleted(
          'noreply@bpm.local',
          context.execution_id,
          context.type
        )
      : NotificationService.notifyWorkflowFailed(
          'noreply@bpm.local',
          context.execution_id,
          context.type,
          'Workflow failed',
          context.current_step || undefined
        );

    await Promise.allSettled([
      ArchiveService.writeEvent(context.execution_id, 'NOTIFICATION_SENT', null, { type: status }),
      notifyPromise,
    ]);
  }

  private collectResults(context: ExecutionContext): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    
    context.results.forEach((value, key) => {
      results[key] = value.data;
    });

    return results;
  }
}
