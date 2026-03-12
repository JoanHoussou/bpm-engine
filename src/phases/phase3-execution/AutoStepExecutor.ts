import { ExecutionContext, StepResult } from '../../core/ExecutionContext.js';
import { WorkflowStep } from '../../core/WorkflowRegistry.js';

export class StepFailedError extends Error {
  public stepName: string;
  public retryable: boolean;
  public data?: unknown;

  constructor(stepName: string, message: string, retryable: boolean = false, data?: unknown) {
    super(message);
    this.name = 'StepFailedError';
    this.stepName = stepName;
    this.retryable = retryable;
    this.data = data;
  }
}

interface StepResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable?: boolean };
  message?: string;
}

export class AutoStepExecutor {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<StepResult> {
    const stepUrl = this.buildUrl(step.url!, context);
    const timeout = step.timeout_ms || 5000;
    const maxRetries = step.retry || 0;
    const retryDelay = step.retry_delay_ms || 1000;
    const stepMethod = step.method || 'POST';
    const retryStrategy = step.retry_strategy || 'exponential';
    const maxRetryDelay = step.max_retry_delay_ms || 30000;

    let lastError: Error | null = null;
    let attempt = 0;

    for (attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(stepUrl, step.name, context, timeout, stepMethod, step);
        
        if (!result.success) {
          if (result.error?.retryable === false || attempt === maxRetries) {
            return {
              success: false,
              data: result.data,
              error: result.error,
              timestamp: new Date().toISOString(),
            };
          }
          
          lastError = new Error(result.error?.message || 'Step failed');
          const delay = this.calculateRetryDelay(retryStrategy, retryDelay, attempt, maxRetryDelay);
          await this.delay(delay);
          continue;
        }

        return {
          success: true,
          data: result.data,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateRetryDelay(retryStrategy, retryDelay, attempt, maxRetryDelay);
          await this.delay(delay);
          continue;
        }
        
        break;
      }
    }

    return {
      success: false,
      error: {
        code: 'STEP_FAILED',
        message: lastError?.message || 'Unknown error',
        step: step.name,
        retryable: attempt < maxRetries,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private calculateRetryDelay(
    strategy: string,
    baseDelay: number,
    attempt: number,
    maxDelay: number
  ): number {
    let delay: number;
    
    switch (strategy) {
      case 'fixed':
        delay = baseDelay;
        break;
      case 'linear':
        delay = baseDelay * (attempt + 1);
        break;
      case 'exponential':
      default:
        delay = baseDelay * Math.pow(2, attempt);
        break;
    }
    
    return Math.min(delay, maxDelay);
  }

  private buildUrl(url: string, context: ExecutionContext): string {
    let result = url
      .replace('{execution_id}', context.execution_id)
      .replace('{trace_id}', context.trace_id)
      .replace('{type}', context.type);

    // Support {$.payload.field} syntax
    if (context.payload && typeof context.payload === 'object') {
      const payload = context.payload as Record<string, unknown>;
      Object.entries(payload).forEach(([key, value]) => {
        result = result.replace(`{$.payload.${key}}`, String(value));
      });
    }

    // Support {$.results.step_name.data.field} syntax
    context.results.forEach((value, stepName) => {
      if (value.data && typeof value.data === 'object') {
        const stepData = value.data as Record<string, unknown>;
        Object.entries(stepData).forEach(([key, val]) => {
          result = result.replace(`{$.results.${stepName}.data.${key}}`, String(val));
        });
      }
    });

    return result;
  }

  private async executeWithTimeout(
    url: string,
    stepName: string,
    context: ExecutionContext,
    timeout: number,
    method: string = 'POST',
    step?: WorkflowStep
  ): Promise<StepResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fullUrl = `${this.baseUrl}${url}`;
      
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Execution-Id': context.execution_id,
          'X-Trace-Id': context.trace_id,
          'X-Step-Name': stepName,
        },
        signal: controller.signal,
      };

      // Add custom headers from step configuration
      if (step?.headers) {
        Object.entries(step.headers).forEach(([key, value]) => {
          (fetchOptions.headers as Record<string, string>)[key] = value;
        });
      }

      // Add authentication headers
      if (step?.auth) {
        await this.addAuthHeaders(fetchOptions.headers as Record<string, string>, step.auth, context);
      }

      // Only add body for methods that support it
      if (method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = JSON.stringify({
          execution_id: context.execution_id,
          step: stepName,
          payload: context.payload,
          context: this.serializeContextResults(context),
        });
      }

      const response = await fetch(fullUrl, fetchOptions);

      clearTimeout(timeoutId);

      // Handle empty responses
      const text = await response.text();
      if (!text.trim()) {
        // Empty but successful response
        return {
          success: true,
          data: null,
        };
      }

      let data: StepResponse;
      try {
        data = JSON.parse(text) as StepResponse;
      } catch (parseError) {
        // Response is not valid JSON but request was successful
        return {
          success: true,
          data: text,
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: data.error?.code || 'HTTP_ERROR',
            message: data.error?.message || data.message || `HTTP ${response.status}`,
            retryable: response.status >= 500 || response.status === 429,
          },
        };
      }

      return {
        success: data.success ?? true,
        data: data.data,
        error: data.error,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Step timed out after ${timeout}ms`,
            retryable: true,
          },
        };
      }

      throw error;
    }
  }

  private serializeContextResults(context: ExecutionContext): Record<string, unknown> {
    const results: Record<string, unknown> = {};
      
    context.results.forEach((value, key) => {
      results[key] = value.data;
    });

    return results;
  }

  private async addAuthHeaders(
    headers: Record<string, string>,
    auth: WorkflowStep['auth'],
    context?: ExecutionContext
  ): Promise<void> {
    if (!auth || auth.type === 'none') return;

    // Generate cache key for OAuth tokens
    const oauthCacheKey = auth.token_url ? `oauth_token_${auth.token_url}` : null;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;

      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'api_key':
        const keyName = auth.api_key_header || 'X-API-Key';
        const keyValue = auth.token || auth.api_key_name;
        if (keyValue) {
          headers[keyName] = keyValue;
        }
        break;

      case 'client_credentials':
        // Check if we have a cached token
        let accessToken: string | null = null;
        
        if (oauthCacheKey && context?.metadata.has(oauthCacheKey)) {
          const cached = context.metadata.get(oauthCacheKey) as { token: string; expiresAt: number };
          if (cached && cached.expiresAt > Date.now()) {
            accessToken = cached.token;
          }
        }

        // If no cached token, fetch a new one
        if (!accessToken && auth.token_url && auth.client_id && auth.client_secret) {
          try {
            const tokenResponse = await fetch(auth.token_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: auth.client_id,
                client_secret: auth.client_secret,
                scope: auth.scope || '',
              }),
            });
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json() as { access_token: string; expires_in?: number };
              accessToken = tokenData.access_token;
              
              // Cache the token
              if (oauthCacheKey && context) {
                const expiresIn = (tokenData.expires_in || 3600) * 1000; // Default 1 hour
                context.metadata.set(oauthCacheKey, {
                  token: accessToken,
                  expiresAt: Date.now() + expiresIn - 60000 // 1 min buffer
                });
              }
            }
          } catch (error) {
            console.error('Failed to get OAuth token:', error);
          }
        }

        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        break;

      default:
        // Unknown auth type, skip
        console.warn(`Unknown auth type: ${auth.type}`);
        break;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.name === 'AbortError') return true;
      if (error.message.includes('ECONNREFUSED')) return true;
      if (error.message.includes('ENOTFOUND')) return false;
      if (error.message.includes('fetch failed')) return true;
      if (error.message.includes('NetworkError')) return true;
      if (error.message.includes('Failed to fetch')) return true;
    }
    return false;
  }
}
