import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as traceId } from 'uuid';
import {
  createClient,
  listClients,
  getClient,
  deleteClient,
  generateKey,
  revokeKey,
  getClientApiKeys,
} from '../../services/ApiKeyService.js';
import { PrismaClient } from '@prisma/client';
import { workflowQueue, humanTimeoutQueue, reminderQueue } from '../../queue/queues.js';
import { loadSystemSettings, getAllSystemSettings, setSystemSetting, getClientSettings, updateClientSettings, deleteClientSettings, getSmtpConfig } from '../../services/SettingsService.js';
import { registerWorkflow, getWorkflow } from '../../core/WorkflowRegistry.js';

const prisma = new PrismaClient();

interface CreateClientBody {
  name: string;
  allowed_types?: string[];
  scopes?: string[];
}

interface ClientParams {
  id: string;
}

interface KeyParams {
  id: string;
  keyId: string;
}

interface StatsQuery {
  period?: string;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const trace_id = traceId();

  app.post('/clients', async (request: FastifyRequest<{ Body: CreateClientBody }>, reply: FastifyReply) => {
    const { name, allowed_types = [], scopes = ['workflow:execute', 'workflow:read'] } = request.body;

    if (!name) {
      return reply.status(400).send({
        error: { error: 'Name is required', code: 'VALIDATION_ERROR' },
        trace_id,
      });
    }

    const client = await createClient(name, allowed_types, scopes);

    return reply.status(201).send({
      client_id: client.id,
      name: client.name,
      allowed_types: client.allowedTypes,
      scopes: client.scopes,
    });
  });

  app.get('/clients', async (request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) => {
    const search = request.query.search?.toLowerCase() || '';
    const clients = await listClients(search);

    return reply.send({
      clients: clients.map((c: { id: string; name: string; allowedTypes: string[]; scopes: string[] }) => ({
        client_id: c.id,
        name: c.name,
        allowed_types: c.allowedTypes,
        scopes: c.scopes,
      })),
    });
  });

  app.get('/clients/:id', async (request: FastifyRequest<{ Params: ClientParams }>, reply: FastifyReply) => {
    const client = await getClient(request.params.id);

    if (!client) {
      return reply.status(404).send({
        error: { error: 'Client not found', code: 'NOT_FOUND' },
        trace_id,
      });
    }

    const keys = await getClientApiKeys(client.id);

    return reply.send({
      client_id: client.id,
      name: client.name,
      allowed_types: client.allowedTypes,
      scopes: client.scopes,
      keys: keys.map((k: { id: string; keyPrefix: string; scopes: string[]; expiresAt: Date | null }) => ({
        id: k.id,
        key_prefix: k.keyPrefix,
        scopes: k.scopes,
        expires_at: k.expiresAt,
        created_at: new Date().toISOString(),
      })),
    });
  });

  app.delete('/clients/:id', async (request: FastifyRequest<{ Params: ClientParams }>, reply: FastifyReply) => {
    const deleted = await deleteClient(request.params.id);

    if (!deleted) {
      return reply.status(404).send({
        error: { error: 'Client not found', code: 'NOT_FOUND' },
        trace_id,
      });
    }

    return reply.status(204).send();
  });

  app.post('/clients/:id/keys', async (request: FastifyRequest<{ Params: ClientParams; Body?: { scopes?: string[]; expires_at?: string } }>, reply: FastifyReply) => {
    const client = await getClient(request.params.id);

    if (!client) {
      return reply.status(404).send({
        error: { error: 'Client not found', code: 'NOT_FOUND' },
        trace_id,
      });
    }

    const scopes = request.body?.scopes || client.scopes;
    const expiresAt = request.body?.expires_at ? new Date(request.body.expires_at) : null;

    const { rawKey, keyId } = await generateKey(client.id, scopes, expiresAt);

    return reply.status(201).send({
      api_key: rawKey,
      key_id: keyId,
      scopes,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      message: 'Store this key securely - it will not be shown again',
    });
  });

  app.delete('/clients/:id/keys/:keyId', async (request: FastifyRequest<{ Params: KeyParams }>, reply: FastifyReply) => {
    const revoked = await revokeKey(request.params.keyId);

    if (!revoked) {
      return reply.status(404).send({
        error: { error: 'Key not found', code: 'NOT_FOUND' },
        trace_id,
      });
    }

    return reply.status(204).send();
  });

  app.get('/stats', async (request: FastifyRequest<{ Querystring: StatsQuery }>, reply: FastifyReply) => {
    const period = request.query.period || '24h';
    
    let startDate = new Date();
    if (period === '1h') {
      startDate = new Date(Date.now() - 60 * 60 * 1000);
    } else if (period === '24h') {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [totalExecutions, successExecutions, waitingHuman, activeClients, executionsByType, sevenDayActivity] = await Promise.all([
      prisma.workflowExecution.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.workflowExecution.count({
        where: { status: 'COMPLETED', createdAt: { gte: startDate } },
      }),
      prisma.workflowExecution.count({
        where: { status: 'WAITING_HUMAN', createdAt: { gte: startDate } },
      }),
      prisma.apiClient.count(),
      prisma.workflowExecution.groupBy({
        by: ['type'],
        where: { createdAt: { gte: startDate } },
        _count: { type: true },
      }),
      prisma.$queryRaw<{ date: Date; completed: bigint; waiting: bigint; failed: bigint }[]>`
        SELECT 
          DATE("createdAt") as date,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
          COUNT(*) FILTER (WHERE status = 'WAITING_HUMAN') as waiting,
          COUNT(*) FILTER (WHERE status = 'FAILED') as failed
        FROM "WorkflowExecution"
        WHERE "createdAt" >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);

    const successRate = totalExecutions > 0 ? Math.round((successExecutions / totalExecutions) * 100) : 0;

    const activityByDay = sevenDayActivity.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      completed: Number(row.completed),
      waiting: Number(row.waiting),
      failed: Number(row.failed),
    }));

    return reply.send({
      total_executions: totalExecutions,
      success_rate: successRate,
      waiting_human: waitingHuman,
      active_clients: activeClients,
      executions_by_type: executionsByType.map((e: { type: string; _count: { type: number } }) => ({
        type: e.type,
        count: e._count.type,
      })),
      activity_7d: activityByDay,
      period,
    });
  });

  app.get('/executions', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; status?: string; type?: string; search?: string } }>, reply: FastifyReply) => {
    const limit = parseInt(request.query.limit || '20', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    const status = request.query.status;
    const type = request.query.type;
    const search = request.query.search;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) where.id = { contains: search, mode: 'insensitive' };

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          client: { select: { name: true } },
        },
      }),
      prisma.workflowExecution.count({ where }),
    ]);

    return reply.send({
      executions: executions.map((e) => ({
        execution_id: e.id,
        type: e.type,
        client_name: e.client?.name || 'unknown',
        status: e.status,
        current_step: e.context ? (e.context as Record<string, unknown>).current_step : null,
        started_at: e.startedAt?.toISOString(),
        completed_at: e.completedAt?.toISOString(),
        created_at: e.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  });

  app.get('/executions/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: request.params.id },
      include: {
        client: { select: { name: true } },
        events: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!execution) {
      return reply.status(404).send({
        error: { error: 'Execution not found', code: 'NOT_FOUND' },
        trace_id,
      });
    }

    return reply.send({
      execution_id: execution.id,
      type: execution.type,
      client_name: execution.client?.name || 'unknown',
      status: execution.status,
      payload: execution.payload,
      context: execution.context,
      result: execution.result,
      error: execution.error,
      events: execution.events.map((ev) => ({
        event_type: ev.eventType,
        step_name: ev.stepName,
        data: ev.data,
        timestamp: ev.timestamp.toISOString(),
      })),
      compensations: execution.events
        .filter((ev) => ev.eventType === 'STEP_COMPENSATED' || ev.eventType === 'COMPENSATION_EXECUTED')
        .map((ev) => ({
          step_name: ev.stepName,
          data: ev.data,
          timestamp: ev.timestamp.toISOString(),
        })),
      started_at: execution.startedAt?.toISOString(),
      completed_at: execution.completedAt?.toISOString(),
      created_at: execution.createdAt.toISOString(),
    });
  });

  // Admin actions on executions
  app.post('/executions/:id/reminder', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: request.params.id },
      include: { client: { select: { name: true } } },
    });

    if (!execution) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    if (execution.status !== 'WAITING_HUMAN') {
      return reply.status(400).send({ error: 'Execution is not waiting for human action' });
    }

    const { NotificationService } = await import('../../phases/phase4-output/NotificationService.js');
    const context = execution.context as Record<string, unknown>;
    const stepName = context.current_step as string;
    const actionUrl = context.action_url;

    await NotificationService.sendEmail(
      context.approval_email as string || 'admin@example.com',
      'reminder',
      { executionId: execution.id, type: execution.type, actionUrl, stepName }
    );

    return reply.send({ success: true, message: 'Reminder sent' });
  });

  app.post('/executions/:id/escalate', async (request: FastifyRequest<{ Params: { id: string }; Body?: { escalateTo?: string } }>, reply: FastifyReply) => {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: request.params.id },
    });

    if (!execution) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    if (execution.status !== 'WAITING_HUMAN') {
      return reply.status(400).send({ error: 'Execution is not waiting for human action' });
    }

    const context = execution.context as Record<string, unknown>;
    const escalateTo = request.body?.escalateTo || (context.fallback_emails as string[])?.[0];

    if (!escalateTo) {
      return reply.status(400).send({ error: 'No escalation target found' });
    }

    await prisma.workflowEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'HUMAN_ESCALATED',
        stepName: context.current_step as string,
        data: { escalateTo, originalEmail: context.approval_email, escalatedBy: 'admin' },
      },
    });

    return reply.send({ success: true, message: `Escalated to ${escalateTo}` });
  });

  app.post('/executions/:id/suspend', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: request.params.id },
    });

    if (!execution) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    if (execution.status !== 'WAITING_HUMAN' && execution.status !== 'RUNNING') {
      return reply.status(400).send({ error: 'Cannot suspend execution in current state' });
    }

    await prisma.workflowExecution.update({
      where: { id: request.params.id },
      data: { status: 'SUSPENDED' },
    });

    await prisma.workflowEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'WORKFLOW_SUSPENDED',
        data: { suspendedBy: 'admin' },
      },
    });

    return reply.send({ success: true, message: 'Workflow suspended' });
  });

  app.post('/executions/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: request.params.id },
      include: { events: { orderBy: { timestamp: 'asc' } } },
    });

    if (!execution) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    if (execution.status === 'COMPLETED' || execution.status === 'FAILED' || execution.status === 'CANCELLED') {
      return reply.status(400).send({ error: 'Cannot cancel execution in terminal state' });
    }

    await prisma.workflowExecution.update({
      where: { id: request.params.id },
      data: { status: 'CANCELLED' },
    });

    const completedSteps = execution.events.filter(e => 
      e.eventType === 'STEP_COMPLETED' || e.eventType === 'HUMAN_APPROVED'
    );

    for (const step of completedSteps.reverse()) {
      if (step.stepName) {
        await prisma.workflowEvent.create({
          data: {
            executionId: execution.id,
            eventType: 'COMPENSATION_EXECUTED',
            stepName: step.stepName,
            data: { compensated: true, originalEvent: step.data },
          },
        });
      }
    }

    await prisma.workflowEvent.create({
      data: {
        executionId: execution.id,
        eventType: 'WORKFLOW_CANCELLED',
        data: { cancelledBy: 'admin', compensationsCount: completedSteps.length },
      },
    });

    return reply.send({ success: true, message: `Workflow cancelled with ${completedSteps.length} compensations` });
  });

  app.get('/workflows', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; search?: string; sortBySteps?: string } }>, reply: FastifyReply) => {
    const limit = parseInt(request.query.limit || '10', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    const search = request.query.search?.toLowerCase() || '';
    const sortBySteps = request.query.sortBySteps === 'true';

    const where = search ? {
      OR: [
        { type: { contains: search, mode: 'insensitive' as const } },
        { baseUrl: { contains: search, mode: 'insensitive' as const } },
      ]
    } : {};

    const orderBy = sortBySteps ? undefined : { updatedAt: 'desc' as const };

    const workflows = await prisma.workflowRegistry.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
    });

    const workflowsWithSteps = workflows.map((w) => {
      const def = w.workflowDef as Record<string, unknown> | null;
      const steps = (def?.steps as Array<Record<string, unknown>>) || [];
      return {
        type: w.type,
        version: w.version,
        base_url: w.baseUrl,
        step_count: steps.length,
        human_step_count: steps.filter((s) => s.type === 'human').length,
        created_at: w.createdAt.toISOString(),
        updated_at: w.updatedAt.toISOString(),
      };
    });

    let sortedWorkflows = workflowsWithSteps;
    if (sortBySteps) {
      sortedWorkflows = workflowsWithSteps.sort((a, b) => b.step_count - a.step_count);
    }

    return reply.send({
      workflows: sortedWorkflows,
      total: workflowsWithSteps.length,
      limit,
      offset,
    });
  });

  app.get('/access-logs', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    const limit = parseInt(request.query.limit || '100', 10);

    const logs = await prisma.accessLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return reply.send({
      logs: logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp.toISOString(),
        method: l.method,
        path: l.path,
        status_code: l.statusCode,
        duration_ms: l.durationMs,
        api_key_id: l.apiKeyId,
        client_id: l.clientId,
        trace_id: l.traceId,
        ip_address: l.ipAddress,
      })),
    });
  });

  app.get('/system-health', async (_request: FastifyRequest, reply: FastifyReply) => {
    let dbStatus = 'connected';
    let dbLatencyMs: number | null = null;
    
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
    } catch (error) {
      dbStatus = 'disconnected';
    }

    let queueStats = {
      workflow: { waiting: 0, active: 0, completed: 0, failed: 0 },
      humanTimeout: { waiting: 0, active: 0, completed: 0, failed: 0 },
      reminder: { waiting: 0, active: 0, completed: 0, failed: 0 },
    };

    try {
      const [workflowCounts, humanTimeoutCounts, reminderCounts] = await Promise.all([
        workflowQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
        humanTimeoutQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
        reminderQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      ]);

      queueStats = {
        workflow: workflowCounts as { waiting: number; active: number; completed: number; failed: number },
        humanTimeout: humanTimeoutCounts as { waiting: number; active: number; completed: number; failed: number },
        reminder: reminderCounts as { waiting: number; active: number; completed: number; failed: number },
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
    }

    const startTime = new Date(process.env.BPM_START_TIME ? new Date(process.env.BPM_START_TIME).getTime() : Date.now() - 3600000);
    const uptimeMs = Date.now() - startTime.getTime();
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    const smtp = await getSmtpConfig();

    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptimeSeconds,
        minutes: uptimeMinutes,
        hours: uptimeHours,
        days: uptimeDays,
        formatted: `${uptimeDays}j ${uptimeHours % 24}h ${uptimeMinutes % 60}m`,
      },
      database: {
        status: dbStatus,
        latency_ms: dbLatencyMs,
      },
      queues: queueStats,
      smtp: {
        configured: smtp.configured,
        host: smtp.host || null,
        port: smtp.port,
        user: smtp.user || '',
        from: smtp.from,
      },
    });
  });

  app.get('/keys', async (request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) => {
    const search = request.query.search?.toLowerCase() || '';
    const where: Record<string, unknown> = { revokedAt: null };
    
    if (search) {
      where.OR = [
        { keyPrefix: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const keys = await prisma.apiKey.findMany({
      where,
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      keys: keys.map((k) => ({
        key_id: k.id,
        key_prefix: k.keyPrefix,
        client_id: k.clientId,
        client_name: (k as any).client?.name || 'unknown',
        scopes: k.scopes,
        expires_at: k.expiresAt?.toISOString() || null,
        active: !k.revokedAt,
        last_used_at: null,
        created_at: k.createdAt.toISOString(),
      })),
    });
  });

  // System Settings
  app.get('/settings', async (_request: FastifyRequest, reply: FastifyReply) => {
    const settings = await getAllSystemSettings();
    const config = await loadSystemSettings();
    
    return reply.send({
      settings: settings.map(s => ({ key: s.key, value: s.value, description: s.description })),
      config,
    });
  });

  app.post('/settings', async (request: FastifyRequest<{ Body: { key: string; value: unknown; description?: string } }>, reply: FastifyReply) => {
    const { key, value, description } = request.body;
    
    if (!key) {
      return reply.status(400).send({ error: 'Key is required' });
    }

    await setSystemSetting(key, value, description);
    
    return reply.send({ success: true, key, value });
  });

  // Client Settings
  app.get('/clients/:id/settings', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const settings = await getClientSettings(request.params.id);
    return reply.send({ settings });
  });

  app.put('/clients/:id/settings', async (request: FastifyRequest<{ Params: { id: string }; Body: { defaultTimeoutMs?: number; defaultRetries?: number; humanTimeoutHours?: number; callbackUrl?: string; allowedTypes?: string[] } }>, reply: FastifyReply) => {
    const settings = await updateClientSettings(request.params.id, request.body);
    return reply.send({ settings });
  });

  app.delete('/clients/:id/settings', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await deleteClientSettings(request.params.id);
    return reply.send({ success: true });
  });

  // Workflow Registry - Admin endpoints
  app.post('/workflows', async (request: FastifyRequest<{ Body: { type: string; version: string; base_url: string; steps: unknown[]; on_complete?: unknown; on_failure?: unknown } }>, reply: FastifyReply) => {
    const { type, version, base_url, steps, on_complete, on_failure } = request.body;

    if (!type) {
      return reply.status(400).send({ error: { error: 'Type is required', code: 'VALIDATION_ERROR' }, trace_id });
    }

    if (!base_url) {
      return reply.status(400).send({ error: { error: 'Base URL is required', code: 'VALIDATION_ERROR' }, trace_id });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return reply.status(400).send({ error: { error: 'At least one step is required', code: 'VALIDATION_ERROR' }, trace_id });
    }

    try {
      const registered = await registerWorkflow({
        type,
        version: version || '1.0.0',
        base_url,
        steps,
        on_complete,
        on_failure
      });

      return reply.status(201).send({
        type: registered.type,
        version: registered.version,
        steps_count: registered.steps.length,
        message: 'Workflow saved successfully',
      });
    } catch (error) {
      request.log.error({ error, trace_id }, 'Failed to save workflow');
      return reply.status(500).send({
        error: 'Failed to save workflow',
        trace_id,
      });
    }
  });

  app.get('/workflows/:type', async (request: FastifyRequest<{ Params: { type: string } }>, reply: FastifyReply) => {
    const { type } = request.params;

    const workflow = await getWorkflow(type);

    if (!workflow) {
      return reply.status(404).send({
        error: { error: `Workflow type "${type}" not found`, code: 'NOT_FOUND' },
        trace_id,
      });
    }

    return reply.send({
      type: workflow.type,
      version: workflow.version,
      base_url: workflow.base_url,
      steps: workflow.steps,
      on_complete: workflow.on_complete,
      on_failure: workflow.on_failure,
    });
  });
}
