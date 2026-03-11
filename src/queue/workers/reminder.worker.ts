import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { resolveWorkflow } from '../../core/WorkflowRegistry.js';
import { reminderQueue, ReminderJobData } from '../queues.js';

const prisma = new PrismaClient();

const REMINDERS_QUEUE_NAME = 'reminders';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const reminderWorker = new Worker<ReminderJobData>(
  REMINDERS_QUEUE_NAME,
  async (job: Job<ReminderJobData>) => {
    const { executionId, stepName, actorEmail, executionIdShort } = job.data;

    console.log(`[ReminderWorker] Processing reminder for execution: ${executionId}, step: ${stepName}`);

    const execution = await prisma.workflowExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      console.log(`[ReminderWorker] Execution not found: ${executionId}`);
      return { success: false, error: 'Execution not found' };
    }

    if (execution.status !== 'WAITING_HUMAN') {
      console.log(`[ReminderWorker] Execution ${executionId} is not WAITING_HUMAN (status: ${execution.status}), skipping reminder`);
      return { success: true, skipped: true, reason: 'not waiting' };
    }

    const workflowDef = await resolveWorkflow(execution.type);
    if (!workflowDef) {
      console.error(`[ReminderWorker] Workflow not found: ${execution.type}`);
      return { success: false, error: 'Workflow not found' };
    }

    const step = workflowDef.steps.find(s => s.name === stepName);
    if (!step || step.type !== 'human') {
      console.error(`[ReminderWorker] Step not found or not human: ${stepName}`);
      return { success: false, error: 'Step not found' };
    }

    const payload = execution.payload as any;
    const workflowTitle = payload?.internship?.title || payload?.title || execution.type;

    await prisma.workflowEvent.create({
      data: {
        executionId,
        stepName,
        eventType: 'REMINDER_SENT',
        data: {
          type: 'email',
          to: actorEmail,
          subject: `Rappel: Action requise pour ${workflowTitle}`,
          executionId: executionIdShort,
        } as any,
      },
    });

    console.log(`[ReminderWorker] Reminder sent to ${actorEmail} for execution ${executionId}`);

    return {
      success: true,
      action: 'reminder_sent',
      actorEmail,
      stepName,
    };
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 10,
  }
);

reminderWorker.on('completed', (job) => {
  console.log(`[ReminderWorker] Job ${job.id} completed for execution: ${job.data.executionId}`);
});

reminderWorker.on('failed', (job, err) => {
  console.error(`[ReminderWorker] Job ${job?.id} failed:`, err.message);
});

reminderWorker.on('error', (err) => {
  console.error('[ReminderWorker] Worker error:', err);
});

export async function scheduleReminder(
  executionId: string,
  stepName: string,
  actorEmail: string,
  hoursFromNow: number
): Promise<void> {
  const delayMs = hoursFromNow * 60 * 60 * 1000;
  const executionIdShort = executionId.slice(0, 8);

  await reminderQueue.add(
    'reminder',
    { executionId, stepName, actorEmail, executionIdShort },
    {
      delay: delayMs,
      jobId: `${executionId}-reminder-${hoursFromNow}h`,
    }
  );

  console.log(`[ReminderWorker] Scheduled reminder for ${executionId} step ${stepName} to ${actorEmail} in ${hoursFromNow}h`);
}
