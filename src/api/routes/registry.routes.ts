import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerWorkflow, getWorkflow, listWorkflows, WorkflowDefinition } from '../../core/WorkflowRegistry.js';

const WorkflowStepSchema = z.object({
  name: z.string(),
  type: z.enum(['auto', 'human', 'condition', 'parallel']),
  url: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  timeout_ms: z.number().optional(),
  retry: z.number().optional(),
  retry_delay_ms: z.number().optional(),
  retry_strategy: z.enum(['fixed', 'exponential', 'linear']).optional(),
  max_retry_delay_ms: z.number().optional(),
  compensate_url: z.string().optional(),
  on_failure: z.enum(['compensate', 'abort', 'continue']).optional(),
  
  // Custom headers
  headers: z.record(z.string()).optional(),
  
  // Authentication configuration
  auth: z.object({
    type: z.enum(['none', 'bearer', 'basic', 'api_key', 'client_credentials']),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    api_key_name: z.string().optional(),
    api_key_header: z.string().optional(),
    token_url: z.string().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    scope: z.string().optional(),
  }).optional(),
  
  actor: z.string().optional(),
  action_url: z.string().optional(),
  timeout_hours: z.number().optional(),
  on_timeout: z.enum(['escalate', 'auto_approve', 'reject']).optional(),
  escalate_to: z.string().optional(),
  reminder_hours: z.array(z.number()).optional(),
  decisions: z.array(z.object({
    key: z.string(),
    label: z.string(),
    next: z.string(),
  })).optional(),
  
  evaluate: z.string().optional(),
  branches: z.array(z.object({
    condition: z.string(),
    next: z.string(),
  })).optional(),
  
  steps: z.array(z.string()).optional(),
  wait_for: z.enum(['all', 'any']).optional(),
});

const WorkflowOnCompleteSchema = z.object({
  notify: z.array(z.string()).optional(),
  callback_url: z.string().optional(),
});

const WorkflowOnFailureSchema = z.object({
  notify: z.array(z.string()).optional(),
  callback_url: z.string().optional(),
  strategy: z.enum(['compensate', 'abort']).optional(),
});

const WorkflowDefinitionSchema = z.object({
  type: z.string().min(1),
  version: z.string(),
  base_url: z.string().url(),
  steps: z.array(WorkflowStepSchema).min(1),
  on_complete: WorkflowOnCompleteSchema.optional(),
  on_failure: WorkflowOnFailureSchema.optional(),
});

interface RegisterBody {
  type: string;
  version: string;
  base_url: string;
  steps: any[];
  on_complete?: any;
  on_failure?: any;
}

interface TypeParams {
  type: string;
}

export async function registryRoutes(app: FastifyInstance): Promise<void> {

  app.post('/register', async (request, reply) => {
    const body = request.body as RegisterBody;
    const traceId = (request as any).traceId || `trace-${Date.now()}`;

    if (!body) {
      return reply.status(400).send({
        error: 'Invalid request body',
        message: 'Body is required',
      });
    }

    const validation = WorkflowDefinitionSchema.safeParse(body);
    
    if (!validation.success) {
      return reply.status(400).send({
        error: 'Invalid workflow definition',
        details: validation.error.errors,
      });
    }

    for (const step of body.steps) {
      if (step.type === 'auto' && !step.url) {
        return reply.status(400).send({
          error: `Step "${step.name}": type=auto requires url`,
        });
      }
      if (step.type === 'human' && (!step.actor || !step.decisions || step.decisions.length === 0)) {
        return reply.status(400).send({
          error: `Step "${step.name}": type=human requires actor and decisions`,
        });
      }
      if (step.type === 'condition' && (!step.evaluate || !step.branches || step.branches.length === 0)) {
        return reply.status(400).send({
          error: `Step "${step.name}": type=condition requires evaluate and branches`,
        });
      }
    }

    try {
      const definition: WorkflowDefinition = {
        type: body.type,
        version: body.version,
        base_url: body.base_url,
        steps: body.steps,
        on_complete: body.on_complete,
        on_failure: body.on_failure,
      };

      const registered = await registerWorkflow(definition);

      return reply.status(201).send({
        type: registered.type,
        version: registered.version,
        steps_count: registered.steps.length,
        message: 'Workflow registered successfully',
        trace_id: traceId,
      });
    } catch (error) {
      request.log.error({ error, trace_id: traceId }, 'Failed to register workflow');
      return reply.status(500).send({
        error: 'Failed to register workflow',
        trace_id: traceId,
      });
    }
  });

  app.get('/:type', async (request, reply) => {
    const { type } = request.params as TypeParams;
    const traceId = (request as any).traceId || `trace-${Date.now()}`;

    const workflow = await getWorkflow(type);
    
    if (!workflow) {
      return reply.status(404).send({
        error: `Workflow type "${type}" not found`,
        message: `Available workflows: ${(await listWorkflows()).map(w => w.type).join(', ')}`,
        trace_id: traceId,
      });
    }

    return reply.send({
      type: workflow.type,
      version: workflow.version,
      base_url: workflow.base_url,
      steps: workflow.steps,
      on_complete: workflow.on_complete,
      on_failure: workflow.on_failure,
      trace_id: traceId,
    });
  });

  app.get('/:type/schema', async (request, reply) => {
    const { type } = request.params as TypeParams;
    const traceId = (request as any).traceId || `trace-${Date.now()}`;

    const workflow = await getWorkflow(type);
    
    if (!workflow) {
      return reply.status(404).send({
        error: `Workflow type "${type}" not found`,
        message: `Available workflows: ${(await listWorkflows()).map(w => w.type).join(', ')}`,
        trace_id: traceId,
      });
    }

    const requiredFields: string[] = [];
    const optionalFields: string[] = [];
    const humanSteps: any[] = [];

    for (const step of workflow.steps) {
      if (step.type === 'human') {
        humanSteps.push({
          step: step.name,
          actor: step.actor,
          decisions: step.decisions?.map((d: any) => d.label),
          timeout_hours: step.timeout_hours,
          on_timeout: step.on_timeout,
          escalate_to: step.escalate_to,
        });

        const actorMatch = step.actor?.match(/\$\.payload\.(\w+)/);
        if (actorMatch) {
          requiredFields.push(actorMatch[1]);
        }

        if (step.escalate_to) {
          const escalateMatch = step.escalate_to.match(/\$\.payload\.(\w+)/);
          if (escalateMatch) {
            requiredFields.push(escalateMatch[1]);
          }
        }
      }
    }

    return reply.send({
      type: workflow.type,
      version: workflow.version,
      required_payload_fields: [...new Set(requiredFields)],
      optional_payload_fields: [...new Set(optionalFields)],
      human_steps: humanSteps,
      example_payload: {
        ...Object.fromEntries([...new Set(requiredFields)].map(f => [f, `<${f}>`])),
      },
      trace_id: traceId,
    });
  });

  app.get('/', async (request, reply) => {
    const traceId = (request as any).traceId || `trace-${Date.now()}`;

    const workflows = await listWorkflows();

    return reply.send({
      workflows: workflows.map((w) => ({
        type: w.type,
        version: w.version,
        steps_count: w.steps.length,
      })),
      count: workflows.length,
      trace_id: traceId,
    });
  });
}
