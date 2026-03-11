import { Queue, QueueEvents } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const WORKFLOW_QUEUE_NAME = 'workflow-execution';
export const HUMAN_TIMEOUT_QUEUE_NAME = 'human-timeout';
export const REMINDERS_QUEUE_NAME = 'reminders';

export const workflowQueue = new Queue(WORKFLOW_QUEUE_NAME, {
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const workflowQueueEvents = new QueueEvents(WORKFLOW_QUEUE_NAME, {
  connection: { url: REDIS_URL },
});

export const humanTimeoutQueue = new Queue(HUMAN_TIMEOUT_QUEUE_NAME, {
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

export const humanTimeoutQueueEvents = new QueueEvents(HUMAN_TIMEOUT_QUEUE_NAME, {
  connection: { url: REDIS_URL },
});

export const reminderQueue = new Queue(REMINDERS_QUEUE_NAME, {
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 1000 },
  },
});

export const reminderQueueEvents = new QueueEvents(REMINDERS_QUEUE_NAME, {
  connection: { url: REDIS_URL },
});

export interface WorkflowJobData {
  executionId: string;
  type: string;
}

export interface HumanTimeoutJobData {
  executionId: string;
  stepName: string;
  escalateTo?: string;
}

export interface ReminderJobData {
  executionId: string;
  stepName: string;
  actorEmail: string;
  executionIdShort: string;
}
