import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface ApiKeyInfo {
  id: string;
  clientId: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ClientInfo {
  id: string;
  name: string;
  allowedTypes: string[];
  scopes: string[];
}

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateRandomKey(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

export async function generateKey(
  clientId: string,
  scopes: string[] = ['workflow:execute', 'workflow:read'],
  expiresAt: Date | null = null
): Promise<{ rawKey: string; keyId: string }> {
  const rawKey = `bpm_live_${generateRandomKey(32)}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const apiKey = await prisma.apiKey.create({
    data: {
      clientId,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt,
    },
  });

  return { rawKey, keyId: apiKey.id };
}

export async function verifyKey(rawKey: string): Promise<{
  valid: boolean;
  client: ClientInfo | null;
  reason?: string;
}> {
  if (!rawKey || (!rawKey.startsWith('bpm_live_') && !rawKey.startsWith('bpm_test_'))) {
    return { valid: false, client: null, reason: 'Invalid key format' };
  }

  const keyHash = hashKey(rawKey);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { client: true },
  });

  if (!apiKey) {
    return { valid: false, client: null, reason: 'Key not found' };
  }

  if (apiKey.revokedAt) {
    return { valid: false, client: null, reason: 'Key revoked' };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, client: null, reason: 'Key expired' };
  }

  return {
    valid: true,
    client: {
      id: apiKey.client.id,
      name: apiKey.client.name,
      allowedTypes: apiKey.client.allowedTypes,
      scopes: apiKey.scopes,
    },
  };
}

export async function revokeKey(keyId: string): Promise<boolean> {
  const apiKey = await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });

  return !!apiKey;
}

export async function getClientApiKeys(clientId: string): Promise<ApiKeyInfo[]> {
  const keys = await prisma.apiKey.findMany({
    where: { clientId, revokedAt: null },
    select: {
      id: true,
      clientId: true,
      keyPrefix: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  return keys;
}

export async function createClient(
  name: string,
  allowedTypes: string[] = [],
  scopes: string[] = ['workflow:execute', 'workflow:read']
): Promise<ClientInfo> {
  const client = await prisma.apiClient.create({
    data: {
      name,
      allowedTypes,
      scopes,
    },
  });

  return {
    id: client.id,
    name: client.name,
    allowedTypes: client.allowedTypes,
    scopes: client.scopes,
  };
}

export async function getClient(clientId: string): Promise<ClientInfo | null> {
  const client = await prisma.apiClient.findUnique({
    where: { id: clientId },
  });

  if (!client) return null;

  return {
    id: client.id,
    name: client.name,
    allowedTypes: client.allowedTypes,
    scopes: client.scopes,
  };
}

export async function listClients(search = ''): Promise<ClientInfo[]> {
  const where = search ? {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
    ]
  } : {};

  const clients = await prisma.apiClient.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    allowedTypes: c.allowedTypes,
    scopes: c.scopes,
  }));
}

export async function deleteClient(clientId: string): Promise<boolean> {
  const client = await prisma.apiClient.delete({
    where: { id: clientId },
  });

  return !!client;
}
