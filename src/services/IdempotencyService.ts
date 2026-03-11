import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TTL = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '604800', 10); // 7 jours par défaut

let redis: any = null;

function getRedis(): any {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return null;
    }
    try {
      const Redis = require('ioredis');
      redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
    } catch {
      return null;
    }
  }
  return redis;
}

export interface IdempotencyResult {
  execution_id: string;
  status: string;
  result?: unknown;
}

export async function checkIdempotency(key: string): Promise<IdempotencyResult | null> {
  const r = getRedis();
  
  if (r) {
    try {
      const cached = await r.get(`idempotency:${key}`);
      if (cached) {
        return JSON.parse(cached) as IdempotencyResult;
      }
    } catch {
      // Fall through to PostgreSQL
    }
  }

  try {
    const record = await prisma.idempotencyKey.findUnique({
      where: { idempotencyKey: key },
    });

    if (record) {
      return {
        execution_id: record.executionId,
        status: record.status,
        result: record.result,
      };
    }
  } catch {
    // Table might not exist
  }

  return null;
}

export async function storeIdempotency(
  key: string,
  executionId: string,
  status: string,
  result?: unknown,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  const r = getRedis();
  
  const value: IdempotencyResult = {
    execution_id: executionId,
    status,
    result,
  };

  if (r) {
    try {
      await r.setex(`idempotency:${key}`, ttlSeconds, JSON.stringify(value));
    } catch {
      // Fall through to PostgreSQL
    }
  }

  try {
    await prisma.idempotencyKey.upsert({
      where: { idempotencyKey: key },
      create: {
        idempotencyKey: key,
        executionId,
        status,
        result: result as any,
      },
      update: {
        executionId,
        status,
        result: result as any,
      },
    });
  } catch {
    // Table might not exist, ignore
  }
}

export async function clearIdempotency(key: string): Promise<void> {
  const r = getRedis();
  
  if (r) {
    try {
      await r.del(`idempotency:${key}`);
    } catch {
      // Ignore
    }
  }

  try {
    await prisma.idempotencyKey.delete({
      where: { idempotencyKey: key },
    });
  } catch {
    // Ignore
  }
}
