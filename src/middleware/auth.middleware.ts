import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { verifyKey, ClientInfo } from '../services/ApiKeyService.js';
import { PrismaClient } from '@prisma/client';
import { v4 as traceId } from 'uuid';

const prisma = new PrismaClient();

declare module 'fastify' {
  interface FastifyRequest {
    client?: ClientInfo;
    traceId: string;
  }
}

export async function authMiddleware(
  app: FastifyInstance,
  options: { requiredScope?: string; allowedTypes?: string[] }
): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url;
    
    if (path.startsWith('/api/v1/')) {
      const trace_id = (request.headers['x-trace-id'] as string) || traceId();
      request.traceId = trace_id;

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const error = { error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' };
        request.log.error({ trace_id, error: 'Missing Authorization header' });
        
        await logAccess(request, 401, null);
        return reply.status(401).send({ 
          error, 
          trace_id 
        });
      }

      const rawKey = authHeader.slice(7);
      const verification = await verifyKey(rawKey);

      if (!verification.valid) {
        const error = { error: verification.reason || 'Invalid key', code: 'UNAUTHORIZED' };
        request.log.error({ trace_id, error: verification.reason });
        
        await logAccess(request, 401, null);
        return reply.status(401).send({ 
          error, 
          trace_id 
        });
      }

      request.client = verification.client!;

      if (options.requiredScope) {
        const hasScope = verification.client!.scopes.includes(options.requiredScope);
        if (!hasScope) {
          const error = { error: 'Insufficient scope', code: 'FORBIDDEN' };
          request.log.error({ trace_id, error: 'Insufficient scope', required: options.requiredScope });
          
          await logAccess(request, 403, verification.client!.id);
          return reply.status(403).send({ 
            error, 
            trace_id 
          });
        }
      }

      if (request.body && typeof request.body === 'object') {
        const body = request.body as Record<string, unknown>;
        const workflowType = body.type as string | undefined;
        
        if (workflowType && verification.client!.allowedTypes.length > 0) {
          if (!verification.client!.allowedTypes.includes(workflowType)) {
            const error = { error: `Workflow type "${workflowType}" not allowed for this client`, code: 'FORBIDDEN' };
            request.log.error({ trace_id, error: 'Type not allowed', type: workflowType, allowed: verification.client!.allowedTypes });
            
            await logAccess(request, 403, verification.client!.id);
            return reply.status(403).send({ 
              error, 
              trace_id 
            });
          }
        }
      }

      await logAccess(request, 200, verification.client!.id);
    }
  });
}

async function logAccess(
  request: FastifyRequest,
  statusCode: number,
  clientId: string | null
): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        timestamp: new Date(),
        method: request.method,
        path: request.url,
        statusCode,
        apiKeyId: request.client?.id,
        clientId: clientId,
        traceId: request.traceId,
        userAgent: request.headers['user-agent'] as string || undefined,
        ipAddress: request.ip || request.headers['x-forwarded-for'] as string || undefined,
      },
    });
  } catch (err) {
    console.error('Failed to log access:', err);
  }
}

export async function requireClient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.client) {
    return reply.status(401).send({ 
      error: { error: 'Authentication required', code: 'UNAUTHORIZED' },
      trace_id: request.traceId 
    });
  }
}
