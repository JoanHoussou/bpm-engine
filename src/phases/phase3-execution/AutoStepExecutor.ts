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

    let lastError: Error | null = null;
    let attempt = 0;

    for (attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(stepUrl, step.name, context, timeout);
        
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
          await this.delay(retryDelay * Math.pow(2, attempt));
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
          await this.delay(retryDelay * Math.pow(2, attempt));
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

  private buildUrl(url: string, context: ExecutionContext): string {
    return url
      .replace('{execution_id}', context.execution_id)
      .replace('{trace_id}', context.trace_id)
      .replace('{type}', context.type);
  }

  private async executeWithTimeout(
    url: string,
    stepName: string,
    context: ExecutionContext,
    timeout: number
  ): Promise<StepResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fullUrl = `${this.baseUrl}${url}`;
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Execution-Id': context.execution_id,
          'X-Trace-Id': context.trace_id,
          'X-Step-Name': stepName,
        },
        body: JSON.stringify({
          execution_id: context.execution_id,
          step: stepName,
          payload: context.payload,
          context: this.serializeContextResults(context),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json() as StepResponse;

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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.name === 'AbortError') return true;
      if (error.message.includes('ECONNREFUSED')) return true;
      if (error.message.includes('ENOTFOUND')) return false;
    }
    return false;
  }
}
