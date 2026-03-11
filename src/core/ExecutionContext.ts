import { v4 as uuidv4 } from 'uuid';

export interface StepResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    step?: string;
    retryable?: boolean;
  };
  timestamp: string;
  durationMs?: number;
}

export interface ExecutionContextData {
  execution_id: string;
  trace_id: string;
  type: string;
  client_id: string;
  payload: Record<string, unknown>;
  initial_snapshot: Record<string, unknown>;
  idempotency_key?: string;
  transaction_id: string;
  started_at: string;
  results: Record<string, StepResult>;
  metadata: Record<string, unknown>;
  current_step?: string;
  status: 'RUNNING' | 'WAITING_HUMAN' | 'COMPLETED' | 'FAILED' | 'REJECTED';
}

export class ExecutionContext {
  public readonly execution_id: string;
  public readonly trace_id: string;
  public readonly type: string;
  public readonly client_id: string;
  public readonly payload: Record<string, unknown>;
  public readonly initial_snapshot: Record<string, unknown>;
  public readonly idempotency_key?: string;
  public readonly transaction_id: string;
  public readonly started_at: string;
  
  public results: Map<string, StepResult>;
  public metadata: Map<string, unknown>;
  public current_step?: string;
  public status: 'RUNNING' | 'WAITING_HUMAN' | 'COMPLETED' | 'FAILED' | 'REJECTED';

  constructor(
    type: string,
    clientId: string,
    payload: Record<string, unknown>,
    traceId: string,
    idempotencyKey?: string
  ) {
    this.execution_id = `exec-${uuidv4()}`;
    this.trace_id = traceId;
    this.type = type;
    this.client_id = clientId;
    this.payload = payload;
    this.initial_snapshot = JSON.parse(JSON.stringify(payload));
    this.idempotency_key = idempotencyKey;
    this.transaction_id = `txn-${uuidv4()}`;
    this.started_at = new Date().toISOString();
    this.results = new Map();
    this.metadata = new Map();
    this.status = 'RUNNING';
  }

  addResult(stepName: string, result: StepResult): void {
    this.results.set(stepName, result);
  }

  getResult(stepName: string): StepResult | undefined {
    return this.results.get(stepName);
  }

  get(stepName: string): unknown {
    const result = this.results.get(stepName);
    return result?.data;
  }

  set(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  getMetadata(key: string): unknown {
    return this.metadata.get(key);
  }

  serialize(): ExecutionContextData {
    const resultsObj: Record<string, StepResult> = {};
    this.results.forEach((value, key) => {
      resultsObj[key] = value;
    });

    const metadataObj: Record<string, unknown> = {};
    this.metadata.forEach((value, key) => {
      metadataObj[key] = value;
    });

    return {
      execution_id: this.execution_id,
      trace_id: this.trace_id,
      type: this.type,
      client_id: this.client_id,
      payload: this.payload,
      initial_snapshot: this.initial_snapshot,
      idempotency_key: this.idempotency_key,
      transaction_id: this.transaction_id,
      started_at: this.started_at,
      results: resultsObj,
      metadata: metadataObj,
      current_step: this.current_step,
      status: this.status,
    };
  }

  static fromSnapshot(data: ExecutionContextData): ExecutionContext {
    const context = new ExecutionContext(
      data.type,
      data.client_id,
      data.payload,
      data.trace_id,
      data.idempotency_key
    );
    
    Object.assign(context, {
      execution_id: data.execution_id,
      transaction_id: data.transaction_id,
      started_at: data.started_at,
      current_step: data.current_step,
      status: data.status,
    });

    context.results = new Map(Object.entries(data.results || {}));
    context.metadata = new Map(Object.entries(data.metadata || {}));

    return context;
  }
}
