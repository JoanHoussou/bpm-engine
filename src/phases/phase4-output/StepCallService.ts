export interface StepCallOptions {
  timeout?: number;
  retry?: number;
}

export interface StepCallResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  statusCode: number;
}

export interface StepCallContext {
  execution_id: string;
  trace_id?: string;
  step: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
}

export class StepCallService {
  private defaultTimeout: number = 5000;

  setDefaultTimeout(ms: number): void {
    this.defaultTimeout = ms;
  }

  async callStep(
    url: string,
    context: StepCallContext,
    options: StepCallOptions = {}
  ): Promise<StepCallResponse> {
    const timeout = options.timeout || this.defaultTimeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Execution-Id': context.execution_id,
          ...(context.trace_id && { 'X-Trace-Id': context.trace_id }),
        },
        body: JSON.stringify({
          execution_id: context.execution_id,
          step: context.step,
          payload: context.payload,
          context: context.context,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        return {
          success: false,
          statusCode: response.status,
          error: {
            code: errorData.error?.code || 'HTTP_ERROR',
            message: errorData.error?.message || errorData.message || `HTTP ${response.status}`,
            retryable: response.status >= 500 || response.status === 429,
          },
        };
      }

      const data = await response.json() as any;
      return {
        success: data.success ?? true,
        data: data.data,
        error: data.error,
        statusCode: response.status,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          statusCode: 0,
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${timeout}ms`,
            retryable: true,
          },
        };
      }

      return {
        success: false,
        statusCode: 0,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  buildUrl(baseUrl: string, path: string, context: { execution_id: string; trace_id?: string; type?: string }): string {
    return `${baseUrl}${path}`
      .replace('{execution_id}', context.execution_id)
      .replace('{trace_id}', context.trace_id || '')
      .replace('{type}', context.type || '');
  }
}

export const stepCallService = new StepCallService();
