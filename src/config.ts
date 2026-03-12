// BPM Engine Configuration
// All settings can be configured via environment variables

export const config = {
  // Server
  port: parseInt(process.env.BPM_PORT || process.env.PORT || '3000', 10),
  host: process.env.BPM_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'),
  
  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://bpm:bpm@localhost:5432/bpm_engine',
  },
  
  // Redis/Queue
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  // Security
  security: {
    adminSecret: process.env.BPM_ADMIN_SECRET || process.env.ADMIN_SECRET || 'changez-moi-en-production-32-chars-min',
    jwtSecret: process.env.BPM_JWT_SECRET || process.env.JWT_SECRET || 'changez-moi-aussi-32-chars-min',
    apiKeyPrefix: process.env.BPM_API_KEY_PREFIX || 'bpm_live_',
  },
  
  // Workflow defaults
  workflow: {
    defaultTimeoutMs: parseInt(process.env.BPM_DEFAULT_TIMEOUT_MS || '30000', 10),
    defaultRetry: parseInt(process.env.BPM_DEFAULT_RETRY || '3', 10),
    defaultRetryDelayMs: parseInt(process.env.BPM_DEFAULT_RETRY_DELAY_MS || '1000', 10),
    defaultRetryStrategy: process.env.BPM_DEFAULT_RETRY_STRATEGY || 'exponential',
  },
  
  // Queue
  queue: {
    concurrency: parseInt(process.env.BPM_QUEUE_CONCURRENCY || '10', 10),
    maxRetries: parseInt(process.env.BPM_QUEUE_MAX_RETRIES || '5', 10),
  },
  
  // Environment
  env: process.env.NODE_ENV || 'development',
  
  // Debug
  debug: process.env.BPM_DEBUG === 'true' || process.env.NODE_ENV === 'development',
};

export default config;
