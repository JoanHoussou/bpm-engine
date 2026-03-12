// BPM Callback Types
// Standardized callback payloads for workflow events

export interface BpmCallbackPayload {
  // Event identification
  event_type: BpmEventType;
  execution_id: string;
  trace_id: string;
  timestamp: string;
  
  // Workflow info
  workflow_type: string;
  workflow_version?: string;
  status: WorkflowStatus;
  
  // Step info (for step-specific events)
  step_name?: string;
  step_type?: 'auto' | 'human' | 'condition' | 'parallel';
  
  // Data
  payload?: Record<string, unknown>;
  results?: Record<string, unknown>;
  
  // Decision (for human steps)
  decision?: {
    key: string;
    label: string;
    actor: string;
    decided_at: string;
  };
  
  // Error info (for failure events)
  error?: {
    code: string;
    message: string;
    step?: string;
    retryable?: boolean;
  };
  
  // Links
  links?: {
    dashboard?: string;
    api?: string;
  };
}

export type BpmEventType = 
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_REJECTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'HUMAN_STEP_SUSPENDED'
  | 'HUMAN_STEP_RESUMED'
  | 'HUMAN_TIMEOUT'
  | 'NOTIFICATION_SENT';

export type WorkflowStatus = 
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_HUMAN'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED';

export interface BpmCallbackResponse {
  received: boolean;
  execution_id: string;
  message?: string;
}

// Helper to create callback payload
export function createCallbackPayload(params: {
  eventType: BpmEventType;
  executionId: string;
  traceId: string;
  workflowType: string;
  status: WorkflowStatus;
  stepName?: string;
  stepType?: 'auto' | 'human' | 'condition' | 'parallel';
  payload?: Record<string, unknown>;
  results?: Record<string, unknown>;
  decision?: { key: string; label: string; actor: string; decided_at: string };
  error?: { code: string; message: string; step?: string; retryable?: boolean };
  baseUrl?: string;
}): BpmCallbackPayload {
  const { 
    eventType, executionId, traceId, workflowType, status,
    stepName, stepType, payload, results, decision, error, baseUrl
  } = params;

  return {
    event_type: eventType,
    execution_id: executionId,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    workflow_type: workflowType,
    status,
    step_name: stepName,
    step_type: stepType,
    payload,
    results,
    decision,
    error,
    links: baseUrl ? {
      dashboard: `${baseUrl}/admin/executions/${executionId}`,
      api: `${baseUrl}/api/v1/workflow/${executionId}`,
    } : undefined,
  };
}
