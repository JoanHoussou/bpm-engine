import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { v4 as traceId } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminRoutes } from './api/routes/admin.routes.js';
import { workflowRoutes } from './api/routes/workflow.routes.js';
import { registryRoutes } from './api/routes/registry.routes.js';
import { adminAuthMiddleware } from './middleware/adminAuth.middleware.js';
import { verifyKey } from './services/ApiKeyService.js';
import { loadWorkflowsToMemory } from './core/WorkflowRegistry.js';
import { PrismaClient } from '@prisma/client';
import { workflowWorker } from './queue/workers/workflow.worker.js';
import { humanTimeoutWorker } from './queue/workers/humanTimeout.worker.js';
import { reminderWorker } from './queue/workers/reminder.worker.js';
import { loadSystemSettings } from './services/SettingsService.js';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

app.get('/', async (_request, reply) => {
  return reply.redirect('/admin/');
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, '../admin'),
  prefix: '/admin/',
  wildcard: false,
});

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

await app.register(async (instance) => {
  await adminAuthMiddleware(instance, {});
  await instance.register(adminRoutes);
}, { prefix: '/admin/api' });

app.addHook('onRequest', async (request, reply) => {
  const urlPath = request.url;
  
  if (urlPath.startsWith('/api/v1/')) {
    const trace_id = (request.headers['x-trace-id'] as string) || traceId();
    (request as any).traceId = trace_id;

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.log.error({ trace_id, error: 'Missing Authorization header' });
      return reply.status(401).send({ 
        error: { error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' },
        trace_id 
      });
    }

    const rawKey = authHeader.slice(7);
    const verification = await verifyKey(rawKey);

    if (!verification.valid) {
      request.log.error({ trace_id, error: verification.reason });
      return reply.status(401).send({ 
        error: { error: verification.reason || 'Invalid key', code: 'UNAUTHORIZED' },
        trace_id 
      });
    }

    (request as any).client = verification.client!;

    request.log.info({ trace_id, client_id: verification.client!.id, path: urlPath }, 'Authenticated request');
  }
});

await app.register(async (instance) => {
  await instance.register(workflowRoutes);
}, { prefix: '/api/v1/workflow' });

await app.register(async (instance) => {
  await instance.register(registryRoutes);
}, { prefix: '/api/v1/registry' });

const start = async () => {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
  
  try {
    await prisma.$connect();
    app.log.info('PostgreSQL connected');

    const count = await loadWorkflowsToMemory();
    app.log.info(`WorkflowRegistry: ${count} workflows loaded to memory`);

    const config = await loadSystemSettings();
    app.log.info('System settings loaded:', config);

    console.log('[BullMQ] Workers started: workflow, human-timeout, reminders');
    console.log(`[BullMQ] workflowWorker: ${workflowWorker.name}`);
    console.log(`[BullMQ] humanTimeoutWorker: ${humanTimeoutWorker.name}`);
    console.log(`[BullMQ] reminderWorker: ${reminderWorker.name}`);

    await app.listen({ port, host });
    console.log(`BPM Engine running at http://${host}:${port}`);
    console.log(`API: http://${host}:${port}/api/v1`);
    console.log(`Admin: http://${host}:${port}/admin/`);
    console.log(`Admin API: http://${host}:${port}/admin/api/`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
