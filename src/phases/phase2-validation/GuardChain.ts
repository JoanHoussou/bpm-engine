import { FastifyRequest } from 'fastify';
import { SanitizeGuard } from './SanitizeGuard.js';

export interface GuardResult {
  valid: boolean;
  reason?: string;
  step?: string;
}

export interface GuardContext {
  request: FastifyRequest;
  body: Record<string, unknown>;
  client: {
    id: string;
    allowedTypes: string[];
    scopes: string[];
  };
  traceId: string;
}

export type Guard = (context: GuardContext) => Promise<GuardResult>;

export async function executeGuardChain(
  guards: Guard[],
  context: GuardContext
): Promise<GuardResult> {
  for (const guard of guards) {
    const result = await guard(context);
    
    if (!result.valid) {
      return {
        valid: false,
        reason: result.reason,
        step: result.step,
      };
    }
  }

  return { valid: true };
}

export const AuthGuard: Guard = async (context: GuardContext): Promise<GuardResult> => {
  if (!context.client) {
    return { valid: false, reason: 'Client not authenticated', step: 'AuthGuard' };
  }

  return { valid: true };
};

export const SchemaGuard: Guard = async (context: GuardContext): Promise<GuardResult> => {
  const body = context.body;
  
  if (!body.type || typeof body.type !== 'string') {
    return { 
      valid: false, 
      reason: 'Missing or invalid required field: type', 
      step: 'SchemaGuard' 
    };
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return { 
      valid: false, 
      reason: 'Missing or invalid required field: payload', 
      step: 'SchemaGuard' 
    };
  }

  if (body.idempotency_key && typeof body.idempotency_key !== 'string') {
    return { 
      valid: false, 
      reason: 'idempotency_key must be a string', 
      step: 'SchemaGuard' 
    };
  }

  return { valid: true };
};

export const SanitizeGuardNew: Guard = async (context: GuardContext): Promise<GuardResult> => {
  const { valid, sanitized, warnings } = await SanitizeGuard.checkForXSS(context.body as Record<string, unknown>);
  
  context.body = sanitized;

  if (warnings.length > 0) {
    SanitizeGuard.logSanitization(context.traceId, warnings);
  }

  return { valid: true };
};

export const RateLimitGuard: Guard = async (context: GuardContext): Promise<GuardResult> => {
  const clientId = context.client.id;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 100;

  const key = `ratelimit:${clientId}:${Math.floor(now / windowMs)}`;
  
  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL, { 
      lazyConnect: true,
      maxRetriesPerRequest: 1 
    });
    
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.pexpire(key, windowMs);
    }
    
    await redis.quit();
    
    if (current > maxRequests) {
      return { 
        valid: false, 
        reason: 'Rate limit exceeded. Try again later.', 
        step: 'RateLimitGuard' 
      };
    }
  } catch {
    return { valid: true };
  }

  return { valid: true };
};

export const defaultGuardChain = [
  AuthGuard,
  SchemaGuard,
  SanitizeGuardNew,
  RateLimitGuard,
];
