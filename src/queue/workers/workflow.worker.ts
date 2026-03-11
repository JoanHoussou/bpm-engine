import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PipelineRunner } from '../../core/PipelineRunner.js';
import { ExecutionContext } from '../../core/ExecutionContext.js';
import { resolveWorkflow } from '../../core/WorkflowRegistry.js';
import { toJsonValue } from '../../core/JsonValue.js';
import { ArchiveService } from '../../phases/phase4-output/ArchiveService.js';
import { workflowQueue, WorkflowJobData } from '../queues.js';
import { humanTimeoutQueue } from '../queues.js';

const prisma = new PrismaClient();

const WORKFLOW_QUEUE_NAME = 'workflow-execution';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const workflowWorker = new Worker<WorkflowJobData>(
  WORKFLOW_QUEUE_NAME,
  async (job: Job<WorkflowJobData>) => {
    const { executionId, type } = job.data;

    console.log(`[WorkflowWorker] Processing execution: ${executionId}`);

    const execution = await prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      console.error(`[WorkflowWorker] Execution not found: ${executionId}`);
      return { success: false, error: 'Execution not found' };
    }

    await ArchiveService.writeEvent(
      executionId,
      'WORKFLOW_STARTED',
      null,
      {
        type: execution.type,
        started_at: new Date().toISOString(),
        client_id: execution.clientId,
      }
    );

    const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED', 'ROLLED_BACK'];

    if (TERMINAL_STATUSES.includes(execution.status)) {
      console.log(`[WorkflowWorker] Execution ${executionId} already in terminal status: ${execution.status}, skipping`);
      return {
        success: true,
        skipped: true,
        reason: `Execution already in terminal status: ${execution.status}`
      };
    }

    const workflowDef = await resolveWorkflow(type);
    if (!workflowDef) {
      console.error(`[WorkflowWorker] Workflow not found: ${type}`);
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          error: toJsonValue({ code: 'WORKFLOW_NOT_FOUND', message: `Workflow type ${type} not found` }),
        },
      });
      return { success: false, error: 'Workflow not found' };
    }

    const contextData = execution.context as any;
    const context = ExecutionContext.fromSnapshot({
      ...contextData,
      status: 'RUNNING',
    });

    for (const [stepName, result] of Object.entries(contextData.results || {})) {
      context.addResult(stepName, result as any);
    }

    const pipeline = new PipelineRunner();

    let result;

    try {
      if (execution.status === 'WAITING_HUMAN') {
      const resumeData = contextData.lastResume;
      const nextStepName = resumeData?.next_step;

      if (!nextStepName) {
        console.error(`[WorkflowWorker] No next_step found in resume data for execution ${executionId}`);
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'FAILED',
            error: toJsonValue({ code: 'NO_NEXT_STEP', message: 'No next_step found in resume data' }),
          },
        });
        return { success: false, error: 'No next_step found in resume data' };
      }

      console.log(`[WorkflowWorker] Resuming execution ${executionId} from step: ${nextStepName}`);
      result = await pipeline.runContinue(workflowDef, context, nextStepName);
    } else {
      result = await pipeline.run(workflowDef, context);
    }

    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: result.status,
        result: toJsonValue(result.result),
        error: toJsonValue(result.error),
        completedAt: result.status === 'COMPLETED' ? new Date() : null,
        context: toJsonValue(context.serialize()),
      },
    });

    if (result.status === 'WAITING_HUMAN') {
      const humanData = result.result as any;
      if (humanData?.humanStep) {
        const timeoutHours = workflowDef.steps.find(
          s => s.name === humanData.humanStep
        )?.timeout_hours || 48;

        const delayMs = timeoutHours * 60 * 60 * 1000;

        await humanTimeoutQueue.add(
          'timeout',
          {
            executionId,
            stepName: humanData.humanStep,
          },
          {
            delay: delayMs,
            jobId: `${executionId}-timeout`,
          }
        );

        console.log(`[WorkflowWorker] Scheduled timeout for ${executionId} in ${timeoutHours}h`);
      }
    }

    console.log(`[WorkflowWorker] Execution ${executionId} completed with status: ${result.status}`);

    return {
      success: result.success,
      status: result.status,
      completedSteps: result.completedSteps,
    };
  } catch (error) {
    console.error(`[WorkflowWorker] Error processing ${executionId}:`, error);

      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          error: toJsonValue({
            code: 'WORKER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 10,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

workflowWorker.on('completed', (job) => {
  console.log(`[WorkflowWorker] Job ${job.id} completed for execution: ${job.data.executionId}`);
});

workflowWorker.on('failed', (job, err) => {
  console.error(`[WorkflowWorker] Job ${job?.id} failed:`, err.message);
});

workflowWorker.on('error', (err) => {
  console.error('[WorkflowWorker] Worker error:', err);
});

export async function addWorkflowJob(executionId: string, type: string): Promise<void> {
  await workflowQueue.add(
    'execute',
    { executionId, type },
    {
      jobId: executionId,
    }
  );
  console.log(`[WorkflowWorker] Added job for execution: ${executionId}`);
}
