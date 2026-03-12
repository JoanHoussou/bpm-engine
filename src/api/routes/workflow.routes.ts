import { FastifyInstance } from 'fastify';
import { prisma } from '../../services/PrismaService.js';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionContext } from '../../core/ExecutionContext.js';
import { resolveWorkflow } from '../../core/WorkflowRegistry.js';
import { checkIdempotency, storeIdempotency } from '../../services/IdempotencyService.js';
import { executeGuardChain, defaultGuardChain, GuardContext } from '../../phases/phase2-validation/GuardChain.js';
import { addWorkflowJob } from '../../queue/workers/workflow.worker.js';

interface ExecuteBody {
  type: string;
  payload: Record<string, unknown>;
  idempotency_key?: string;
}

interface ExecutionParams {
  id: string;
}

interface ResumeBody {
  decision: string;
  comment?: string;
}

export async function workflowRoutes(app: FastifyInstance): Promise<void> {

  app.addHook('preHandler', async (request, reply) => {
    const body = request.body as ExecuteBody | undefined;
    const client = (request as any).client;
    const traceId = (request as any).traceId;
    
    if (body?.type && client?.allowedTypes && client.allowedTypes.length > 0) {
      if (!client.allowedTypes.includes(body.type)) {
        return reply.status(403).send({
          error: `Workflow type "${body.type}" not allowed for this client`,
          type: body.type,
          allowed: client.allowedTypes,
          statusCode: 403,
          trace_id: traceId
        });
      }
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url;
    const client = (request as any).client;
    const traceId = (request as any).traceId;
    
    if (path === '/execute' || path.startsWith('/execute')) {
      if (!client?.scopes?.includes('workflow:execute')) {
        return reply.status(403).send({
          error: 'Insufficient scope: workflow:execute required',
          code: 'FORBIDDEN',
          statusCode: 403,
          trace_id: traceId
        });
      }
    }
    
    if (path.startsWith('/') && !path.includes('/execute') && !path.includes('/resume')) {
      if (!client?.scopes?.includes('workflow:read')) {
        return reply.status(403).send({
          error: 'Insufficient scope: workflow:read required',
          code: 'FORBIDDEN',
          statusCode: 403,
          trace_id: traceId
        });
      }
    }
    
    if (path.includes('/resume')) {
      if (!client?.scopes?.includes('workflow:resume')) {
        return reply.status(403).send({
          error: 'Insufficient scope: workflow:resume required',
          code: 'FORBIDDEN',
          statusCode: 403,
          trace_id: traceId
        });
      }
    }
    
    if (path.includes('/cancel')) {
      if (!client?.scopes?.includes('workflow:cancel')) {
        return reply.status(403).send({
          error: 'Insufficient scope: workflow:cancel required',
          code: 'FORBIDDEN',
          statusCode: 403,
          trace_id: traceId
        });
      }
    }
  });

  app.post('/execute', async (request, reply) => {
    const body = request.body as ExecuteBody;
    const traceId = (request as any).traceId || uuidv4();
    const client = (request as any).client;

    if (!body.type || !body.payload) {
      return reply.status(400).send({
        error: 'Missing required fields: type and payload are required',
        trace_id: traceId,
      });
    }

    const idempotencyKey = body.idempotency_key || `${client.id}:${body.type}:${JSON.stringify(body.payload)}`;
    
    const existingResult = await checkIdempotency(idempotencyKey);
    if (existingResult) {
      return reply.status(200).send({
        execution_id: existingResult.execution_id,
        trace_id: traceId,
        status: existingResult.status,
        result: existingResult.result,
        idempotent: true,
      });
    }

    const guardContext: GuardContext = {
      request,
      body: body as unknown as Record<string, unknown>,
      client,
      traceId,
    };

    const guardResult = await executeGuardChain(defaultGuardChain, guardContext);
    
    if (!guardResult.valid) {
      return reply.status(400).send({
        error: guardResult.reason,
        step: guardResult.step,
        trace_id: traceId,
      });
    }

    let workflowDef;
    try {
      workflowDef = await resolveWorkflow(body.type);
      if (!workflowDef) {
        return reply.status(422).send({
          error: `Workflow type "${body.type}" not found in registry`,
          message: 'Register this workflow first using POST /api/v1/registry/register',
          trace_id: traceId,
        });
      }
    } catch (error) {
      return reply.status(422).send({
        error: `Workflow type "${body.type}" not found in registry`,
        message: 'Register this workflow first using POST /api/v1/registry/register',
        trace_id: traceId,
      });
    }

    const context = new ExecutionContext(
      body.type,
      client.id,
      body.payload,
      traceId,
      idempotencyKey
    );

    await prisma.workflowExecution.create({
      data: {
        id: context.execution_id,
        traceId: context.trace_id,
        type: context.type,
        clientId: client.id,
        status: 'QUEUED',
        payload: body.payload as any,
        context: context.serialize() as any,
        startedAt: new Date(),
      },
    });

    await storeIdempotency(
      idempotencyKey,
      context.execution_id,
      'QUEUED'
    );

    try {
      await addWorkflowJob(context.execution_id, body.type);

      return reply.status(202).send({
        execution_id: context.execution_id,
        trace_id: traceId,
        status: 'QUEUED',
        message: 'Workflow queued for execution',
      });
    } catch (error) {
      await prisma.workflowExecution.update({
        where: { id: context.execution_id },
        data: {
          status: 'FAILED',
          error: {
            code: 'QUEUE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to queue workflow',
          } as any,
        },
      });

      return reply.status(500).send({
        error: 'Failed to queue workflow execution',
        trace_id: traceId,
      });
    }
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as ExecutionParams;
    const traceId = (request as any).traceId || uuidv4();

    const execution = await prisma.workflowExecution.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
      },
    });

    if (!execution) {
      return reply.status(404).send({
        error: `Execution ${id} not found`,
        trace_id: traceId,
      });
    }

    let durationMs: number | null = null;
    if (execution.completedAt) {
      durationMs = execution.completedAt.getTime() - execution.startedAt.getTime();
    }

    return reply.send({
      execution_id: execution.id,
      trace_id: execution.traceId,
      type: execution.type,
      status: execution.status,
      payload: execution.payload,
      result: execution.result,
      error: execution.error,
      started_at: execution.startedAt.toISOString(),
      completed_at: execution.completedAt?.toISOString() || null,
      duration_ms: durationMs,
      steps: execution.context ? (execution.context as any).results : null,
      events: execution.events.map(e => ({
        step_name: e.stepName,
        event_type: e.eventType,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  });

  app.post('/:id/resume', async (request, reply) => {
    const { id } = request.params as ExecutionParams;
    const body = request.body as ResumeBody;
    const traceId = (request as any).traceId || uuidv4();
    const client = (request as any).client;

    if (!body.decision) {
      return reply.status(400).send({
        error: 'Missing required field: decision',
        trace_id: traceId,
      });
    }

    const execution = await prisma.workflowExecution.findUnique({
      where: { id },
    });

    if (!execution) {
      return reply.status(404).send({
        error: `Execution ${id} not found`,
        trace_id: traceId,
      });
    }

    if (execution.status !== 'WAITING_HUMAN') {
      return reply.status(400).send({
        error: `Execution ${id} is not waiting for human input`,
        trace_id: traceId,
      });
    }

    const resultData = execution.result as any;
    const humanStep = resultData?.humanStep;

    if (!humanStep) {
      return reply.status(400).send({
        error: 'No human step found in execution context',
        trace_id: traceId,
      });
    }

    const { HumanStepExecutor } = await import('../../phases/phase3-execution/HumanStepExecutor.js');
    const executor = new HumanStepExecutor('');
    
    try {
      const resumeResult = await executor.resume(id, humanStep, {
        decision: body.decision,
        actor: client.id,
        comment: body.comment,
      });

      const { getWorkflow } = await import('../../core/WorkflowRegistry.js');
      const workflowDef = await getWorkflow(execution.type);
      
      if (!workflowDef) {
        return reply.status(404).send({
          error: `Workflow type ${execution.type} not found`,
          trace_id: traceId,
        });
      }

      const { PipelineRunner } = await import('../../core/PipelineRunner.js');
      const pipeline = new PipelineRunner();
      
      const contextData = execution.context as any;
      const { ExecutionContext } = await import('../../core/ExecutionContext.js');
      const context = ExecutionContext.fromSnapshot({
        ...contextData,
        status: 'RUNNING',
      });
      context.results.set(humanStep, {
        success: true,
        data: resumeResult.decisionData,
        timestamp: new Date().toISOString(),
      });

      if (!resumeResult.nextStep) {
        return reply.status(400).send({
          error: 'No next step specified after resume',
          trace_id: traceId,
        });
      }

      const continueResult = await pipeline.runContinue(workflowDef, context, resumeResult.nextStep);

      await prisma.workflowExecution.update({
        where: { id: id },
        data: {
          status: continueResult.status,
          result: continueResult.result as any,
          error: continueResult.error as any,
          completedAt: continueResult.status === 'COMPLETED' ? new Date() : null,
        },
      });

      return reply.send({
        execution_id: id,
        trace_id: traceId,
        status: continueResult.status,
        next_step: resumeResult.nextStep,
        result: continueResult.result,
      });
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : 'Resume failed',
        trace_id: traceId,
      });
    }
  });

  app.post('/:id/cancel', async (request, reply) => {
    const { id } = request.params as ExecutionParams;
    const traceId = (request as any).traceId || uuidv4();

    const execution = await prisma.workflowExecution.findUnique({
      where: { id },
    });

    if (!execution) {
      return reply.status(404).send({
        error: `Execution ${id} not found`,
        trace_id: traceId,
      });
    }

    const terminalStates = ['COMPLETED', 'FAILED', 'CANCELLED'];
    if (terminalStates.includes(execution.status)) {
      return reply.status(400).send({
        error: `Cannot cancel execution in terminal state: ${execution.status}`,
        trace_id: traceId,
      });
    }

    await prisma.workflowExecution.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    return reply.send({
      execution_id: id,
      status: 'CANCELLED',
      trace_id: traceId,
    });
  });
}
