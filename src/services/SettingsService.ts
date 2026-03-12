import { prisma } from './PrismaService.js';
import { toJsonValue } from '../core/JsonValue.js';

export interface SystemConfig {
  defaultTimeoutMs: number;
  defaultRetries: number;
  humanTimeoutHours: number;
  globalErrorCallbackUrl: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
}

export interface ClientConfig {
  defaultTimeoutMs?: number;
  defaultRetries?: number;
  humanTimeoutHours?: number;
  callbackUrl?: string;
  allowedTypes?: string[];
}

const DEFAULT_CONFIG: SystemConfig = {
  defaultTimeoutMs: 30000,
  defaultRetries: 2,
  humanTimeoutHours: 72,
  globalErrorCallbackUrl: null,
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpFrom: process.env.SMTP_FROM || 'noreply@bpm.local',
};

let cachedConfig: SystemConfig | null = null;

export async function loadSystemSettings(): Promise<SystemConfig> {
  if (cachedConfig) return cachedConfig;

  const settings = await prisma.systemSettings.findMany();
  
  const config: SystemConfig = { ...DEFAULT_CONFIG };
  
  for (const s of settings) {
    const key = s.key as keyof SystemConfig;
    if (key in config) {
      (config as unknown as Record<string, unknown>)[key] = s.value;
    }
  }

  cachedConfig = config;
  console.log('[Settings] Loaded config:', config);
  return config;
}

export async function getSystemSetting(key: string) {
  const setting = await prisma.systemSettings.findUnique({ where: { key } });
  return setting?.value;
}

export async function setSystemSetting(key: string, value: unknown, description?: string) {
  const setting = await prisma.systemSettings.upsert({
    where: { key },
    update: { value: toJsonValue(value), description },
    create: { key, value: toJsonValue(value), description },
  });
  
  cachedConfig = null;
  await loadSystemSettings();
  
  return setting;
}

export async function getAllSystemSettings() {
  return prisma.systemSettings.findMany({ orderBy: { key: 'asc' } });
}

export async function getClientSettings(clientId: string) {
  return prisma.clientSettings.findUnique({ where: { clientId } });
}

export async function updateClientSettings(
  clientId: string, 
  data: {
    defaultTimeoutMs?: number;
    defaultRetries?: number;
    humanTimeoutHours?: number;
    callbackUrl?: string;
    allowedTypes?: string[];
  }
) {
  return prisma.clientSettings.upsert({
    where: { clientId },
    update: data,
    create: { clientId, ...data },
  });
}

export async function deleteClientSettings(clientId: string) {
  return prisma.clientSettings.delete({ where: { clientId } }).catch(() => null);
}

export async function getEffectiveSettings(clientId?: string) {
  const system = await loadSystemSettings();
  
  if (!clientId) {
    return system;
  }
  
  const client = await getClientSettings(clientId);
  
  if (!client) {
    return system;
  }
  
  return {
    defaultTimeoutMs: client.defaultTimeoutMs ?? system.defaultTimeoutMs,
    defaultRetries: client.defaultRetries ?? system.defaultRetries,
    humanTimeoutHours: client.humanTimeoutHours ?? system.humanTimeoutHours,
    globalErrorCallbackUrl: client.callbackUrl ?? system.globalErrorCallbackUrl,
  };
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  configured: boolean;
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const dbHost = await getSystemSetting('smtpHost') as string | null;
  const dbPort = await getSystemSetting('smtpPort') as number | null;
  const dbUser = await getSystemSetting('smtpUser') as string | null;
  const dbPass = await getSystemSetting('smtpPass') as string | null;
  const dbFrom = await getSystemSetting('smtpFrom') as string | null;

  const host = dbHost || process.env.SMTP_HOST || '';
  const port = dbPort || parseInt(process.env.SMTP_PORT || '587', 10);
  const user = dbUser || process.env.SMTP_USER || '';
  const pass = dbPass || process.env.SMTP_PASS || '';
  const from = dbFrom || process.env.SMTP_FROM || 'noreply@bpm.local';

  return {
    host,
    port,
    user,
    pass,
    from,
    configured: !!host,
  };
}
