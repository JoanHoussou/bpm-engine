// Callback Service
// Handles sending structured callback notifications

import { 
  BpmCallbackPayload, 
  BpmCallbackResponse,
  createCallbackPayload,
  BpmEventType,
  WorkflowStatus 
} from '../types/callback.types.js';

export class CallbackService {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Send a callback to the configured URL
   */
  async sendCallback(
    callbackUrl: string,
    payload: BpmCallbackPayload
  ): Promise<BpmCallbackResponse> {
    if (!callbackUrl) {
      console.log('No callback URL configured, skipping notification');
      return { received: false, execution_id: payload.execution_id, message: 'No callback URL' };
    }

    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BPM-Event-Type': payload.event_type,
          'X-BPM-Execution-Id': payload.execution_id,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`Callback sent successfully to ${callbackUrl}`);
        return { received: true, execution_id: payload.execution_id };
      } else {
        const errorText = await response.text();
        console.error(`Callback failed: ${response.status} - ${errorText}`);
        return { 
          received: false, 
          execution_id: payload.execution_id, 
          message: `HTTP ${response.status}: ${errorText}` 
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Callback error: ${errorMessage}`);
      return { 
        received: false, 
        execution_id: payload.execution_id, 
        message: errorMessage 
      };
    }
  }

  /**
   * Create and send workflow started callback
   */
  async onWorkflowStarted(
    executionId: string,
    traceId: string,
    workflowType: string,
    payload: Record<string, unknown>
  ): Promise<BpmCallbackPayload> {
    const callbackPayload = createCallbackPayload({
      eventType: 'WORKFLOW_STARTED' as BpmEventType,
      executionId,
      traceId,
      workflowType,
      status: 'RUNNING' as WorkflowStatus,
      payload,
      baseUrl: this.baseUrl,
    });

    return callbackPayload;
  }

  /**
   * Create and send workflow completed callback
   */
  async onWorkflowCompleted(
    executionId: string,
    traceId: string,
    workflowType: string,
    results: Record<string, unknown>
  ): Promise<BpmCallbackPayload> {
    const callbackPayload = createCallbackPayload({
      eventType: 'WORKFLOW_COMPLETED' as BpmEventType,
      executionId,
      traceId,
      workflowType,
      status: 'COMPLETED' as WorkflowStatus,
      results,
      baseUrl: this.baseUrl,
    });

    return callbackPayload;
  }

  /**
   * Create and send human step callback
   */
  async onHumanStep(
    executionId: string,
    traceId: string,
    workflowType: string,
    stepName: string,
    decision: { key: string; label: string; actor: string; decided_at: string }
  ): Promise<BpmCallbackPayload> {
    const callbackPayload = createCallbackPayload({
      eventType: 'HUMAN_STEP_RESUMED' as BpmEventType,
      executionId,
      traceId,
      workflowType,
      status: 'RUNNING' as WorkflowStatus,
      stepName,
      stepType: 'human',
      decision,
      baseUrl: this.baseUrl,
    });

    return callbackPayload;
  }

  /**
   * Create and send error callback
   */
  async onError(
    executionId: string,
    traceId: string,
    workflowType: string,
    error: { code: string; message: string; step?: string; retryable?: boolean }
  ): Promise<BpmCallbackPayload> {
    const callbackPayload = createCallbackPayload({
      eventType: 'WORKFLOW_FAILED' as BpmEventType,
      executionId,
      traceId,
      workflowType,
      status: 'FAILED' as WorkflowStatus,
      error,
      baseUrl: this.baseUrl,
    });

    return callbackPayload;
  }
}

export default CallbackService;
