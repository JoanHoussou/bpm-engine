import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PipelineRunner } from '../../core/PipelineRunner.js';
import { ExecutionContext } from '../../core/ExecutionContext.js';
import { resolveWorkflow } from '../../core/WorkflowRegistry.js';
import { resolveJsonPath } from '../../core/JsonPathResolver.js';
import { humanTimeoutQueue, HumanTimeoutJobData } from '../queues.js';

const prisma = new PrismaClient();

const HUMAN_TIMEOUT_QUEUE_NAME = 'human-timeout';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const humanTimeoutWorker = new Worker<HumanTimeoutJobData>(
  HUMAN_TIMEOUT_QUEUE_NAME,
  async (job: Job<HumanTimeoutJobData>) => {
    const data = job.data;
    const executionId = data.executionId;
    const stepName = data.stepName;
    const escalateToFromJob = data.escalateTo;

    console.log(`[HumanTimeoutWorker] Processing timeout for execution: ${executionId}, step: ${stepName}`);

    const execution = await prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      console.log(`[HumanTimeoutWorker] Execution not found: ${executionId}`);
      return { success: false, error: 'Execution not found' };
    }

    if (execution.status !== 'WAITING_HUMAN') {
      console.log(`[HumanTimeoutWorker] Execution ${executionId} is not WAITING_HUMAN (status: ${execution.status}), skipping timeout`);
      return { success: true, skipped: true, reason: 'not waiting' };
    }

    const workflowDef = await resolveWorkflow(execution.type);
    if (!workflowDef) {
      console.error(`[HumanTimeoutWorker] Workflow not found: ${execution.type}`);
      return { success: false, error: 'Workflow not found' };
    }

    const step = workflowDef.steps.find(s => s.name === stepName);
    if (!step || step.type !== 'human') {
      console.error(`[HumanTimeoutWorker] Step not found or not human: ${stepName}`);
      return { success: false, error: 'Step not found' };
    }

    const onTimeout = step.on_timeout || 'escalate';
    console.log(`[HumanTimeoutWorker] Applying on_timeout: ${onTimeout} for step ${stepName}`);

    const contextData = execution.context as any;
    const context = ExecutionContext.fromSnapshot({
      ...contextData,
      status: 'RUNNING',
    });

    for (const [resultStepName, result] of Object.entries(contextData.results || {})) {
      context.addResult(resultStepName, result as any);
    }

    const pipeline = new PipelineRunner();

    if (onTimeout === 'auto_approve') {
      const approveDecision = step.decisions?.find(d => d.key === 'approved');
      if (!approveDecision) {
        console.error(`[HumanTimeoutWorker] No 'approved' decision found for step ${stepName}`);
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'FAILED', error: { code: 'NO_APPROVE_DECISION', message: 'No approved decision defined' } as any },
        });
        return { success: false, error: 'No approved decision' };
      }

      context.addResult(stepName, {
        success: true,
        data: {
          decision: 'approved',
          actor: 'AUTO_TIMEOUT',
          comment: 'Auto-approved due to timeout',
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      const result = await pipeline.runContinue(workflowDef, context, approveDecision.next);

      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: result.status as any,
          result: result.result as any,
          error: result.error as any,
          completedAt: result.status === 'COMPLETED' ? new Date() : null,
          context: context.serialize() as any,
        },
      });

      await prisma.workflowEvent.create({
        data: {
          executionId,
          stepName,
          eventType: 'HUMAN_TIMEOUT_AUTO_APPROVED',
          data: { decision: 'approved' } as any,
        },
      });

      console.log(`[HumanTimeoutWorker] Execution ${executionId} auto-approved, status: ${result.status}`);
      return { success: true, action: 'auto_approve', status: result.status };
    }

    if (onTimeout === 'reject') {
      const rejectDecision = step.decisions?.find(d => d.key === 'rejected');
      if (!rejectDecision) {
        console.error(`[HumanTimeoutWorker] No 'rejected' decision found for step ${stepName}`);
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'FAILED', error: { code: 'NO_REJECT_DECISION', message: 'No rejected decision defined' } as any },
        });
        return { success: false, error: 'No rejected decision' };
      }

      context.addResult(stepName, {
        success: true,
        data: {
          decision: 'rejected',
          actor: 'AUTO_TIMEOUT',
          comment: 'Auto-rejected due to timeout',
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      const result = await pipeline.runContinue(workflowDef, context, rejectDecision.next);

      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: result.status as any,
          result: result.result as any,
          error: result.error as any,
          completedAt: result.status === 'COMPLETED' ? new Date() : null,
          context: context.serialize() as any,
        },
      });

      await prisma.workflowEvent.create({
        data: {
          executionId,
          stepName,
          eventType: 'HUMAN_TIMEOUT_AUTO_REJECTED',
          data: { decision: 'rejected' } as any,
        },
      });

      console.log(`[HumanTimeoutWorker] Execution ${executionId} auto-rejected, status: ${result.status}`);
      return { success: true, action: 'auto_reject', status: result.status };
    }

    if (onTimeout === 'escalate') {
      const escalateToValue = escalateToFromJob || step.escalate_to;
      if (!escalateToValue) {
        console.error(`[HumanTimeoutWorker] No escalate_to defined for step ${stepName}`);
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'FAILED', error: { code: 'NO_ESCALATE', message: 'No escalate_to defined' } as any },
        });
        return { success: false, error: 'No escalate_to defined' };
      }

      const contextData = execution.context as any;
      const resolvedEscalateTo = resolveJsonPath(escalateToValue, {
        payload: execution.payload as Record<string, unknown>,
        results: contextData?.results || {},
        metadata: contextData?.metadata || {},
      });
      console.log(`[HumanTimeoutWorker] Escalating to: ${resolvedEscalateTo}`);

      const timeoutHours = step.timeout_hours || 48;
      const newTimeoutMs = timeoutHours * 60 * 60 * 1000;

      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          result: {
            ...(execution.result as any),
            escalatedTo: resolvedEscalateTo,
            escalatedAt: new Date().toISOString(),
          },
        },
      });

      await prisma.workflowEvent.create({
        data: {
          executionId,
          stepName,
          eventType: 'HUMAN_ESCALATED',
          data: { escalateTo: resolvedEscalateTo } as any,
        },
      });

      await humanTimeoutQueue.add(
        'timeout',
        {
          executionId,
          stepName,
          escalateTo: resolvedEscalateTo,
        },
        {
          delay: newTimeoutMs,
          jobId: `${executionId}-escalated-timeout`,
        }
      );

      console.log(`[HumanTimeoutWorker] Execution ${executionId} escalated to ${resolvedEscalateTo}, rescheduled timeout`);

      return { success: true, action: 'escalate', escalateTo: resolvedEscalateTo };
    }

    return { success: false, error: 'Unknown on_timeout action' };
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 5,
  }
);

humanTimeoutWorker.on('completed', (job) => {
  console.log(`[HumanTimeoutWorker] Job ${job.id} completed for execution: ${job.data.executionId}`);
});

humanTimeoutWorker.on('failed', (job, err) => {
  console.error(`[HumanTimeoutWorker] Job ${job?.id} failed:`, err.message);
});

humanTimeoutWorker.on('error', (err) => {
  console.error('[HumanTimeoutWorker] Worker error:', err);
});

export async function scheduleHumanTimeout(
  executionId: string,
  stepName: string,
  timeoutHours: number
): Promise<void> {
  const delayMs = timeoutHours * 60 * 60 * 1000;

  await humanTimeoutQueue.add(
    'timeout',
    { executionId, stepName },
    {
      delay: delayMs,
      jobId: `${executionId}-timeout`,
    }
  );

  console.log(`[HumanTimeoutWorker] Scheduled timeout for ${executionId} step ${stepName} in ${timeoutHours}h`);
}
