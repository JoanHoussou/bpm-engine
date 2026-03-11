import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface WorkflowStep {
  name: string;
  type: 'auto' | 'human' | 'condition' | 'parallel';
  url?: string;
  timeout_ms?: number;
  retry?: number;
  retry_delay_ms?: number;
  compensate_url?: string;
  on_failure?: 'compensate' | 'abort' | 'continue';
  
  actor?: string;
  action_url?: string;
  timeout_hours?: number;
  on_timeout?: 'escalate' | 'auto_approve' | 'reject';
  escalate_to?: string;
  reminder_hours?: number[];
  decisions?: { key: string; label: string; next: string }[];
  
  evaluate?: string;
  branches?: { condition: string; next: string }[];
  
  steps?: string[];
  wait_for?: 'all' | 'any';
}

export interface WorkflowOnComplete {
  notify?: string[];
  callback_url?: string;
}

export interface WorkflowOnFailure {
  notify?: string[];
  callback_url?: string;
  strategy?: 'compensate' | 'abort';
}

export interface WorkflowDefinition {
  type: string;
  version: string;
  base_url: string;
  steps: WorkflowStep[];
  on_complete?: WorkflowOnComplete;
  on_failure?: WorkflowOnFailure;
}

export class UnknownTypeError extends Error {
  constructor(type: string) {
    super(`Workflow type "${type}" not found in registry`);
    this.name = 'UnknownTypeError';
  }
}

const inMemoryRegistry = new Map<string, WorkflowDefinition>();

export async function registerWorkflow(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
  await prisma.workflowRegistry.upsert({
    where: { type: definition.type },
    update: {
      version: definition.version,
      baseUrl: definition.base_url,
      workflowDef: definition as any,
    },
    create: {
      type: definition.type,
      version: definition.version,
      baseUrl: definition.base_url,
      workflowDef: definition as any,
    },
  });

  inMemoryRegistry.set(definition.type, definition);
  return definition;
}

export async function resolveWorkflow(type: string): Promise<WorkflowDefinition> {
  if (inMemoryRegistry.has(type)) {
    return inMemoryRegistry.get(type)!;
  }

  const workflow = await prisma.workflowRegistry.findUnique({
    where: { type },
  });

  if (!workflow) {
    throw new UnknownTypeError(type);
  }

  const definition = workflow.workflowDef as unknown as WorkflowDefinition;
  inMemoryRegistry.set(type, definition);
  return definition;
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const workflows = await prisma.workflowRegistry.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return workflows.map((w) => w.workflowDef as unknown as WorkflowDefinition);
}

export async function getWorkflow(type: string): Promise<WorkflowDefinition | null> {
  try {
    return await resolveWorkflow(type);
  } catch {
    return null;
  }
}

export async function deleteWorkflow(type: string): Promise<boolean> {
  const deleted = await prisma.workflowRegistry.delete({
    where: { type },
  });

  inMemoryRegistry.delete(type);
  return !!deleted;
}

export async function loadWorkflowsToMemory(): Promise<number> {
  const workflows = await prisma.workflowRegistry.findMany();
  for (const workflow of workflows) {
    inMemoryRegistry.set(workflow.type, workflow.workflowDef as unknown as WorkflowDefinition);
  }
  return workflows.length;
}
