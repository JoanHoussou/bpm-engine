/**
 * BPM Engine - Simple Client SDK
 * Pour intégration facile dans vos projets internes
 * 
 * Installation: npm install @bpm-engine/client
 * 
 * Usage:
 *   import { BpmClient } from '@bpm-engine/client';
 *   
 *   const bpm = new BpmClient({
 *     baseUrl: 'http://localhost:3000',
 *     apiKey: 'bpm_live_xxx'
 *   });
 *   
 *   // Exécuter un workflow
 *   const result = await bpm.execute('mon_workflow', { data: '...' });
 *   
 *   // Approuver/Rejeter
 *   await bpm.approve(executionId);
 */

export interface BpmConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface WorkflowPayload {
  type: string;
  payload: Record<string, unknown>;
  idempotency_key?: string;
}

export interface ExecutionResult {
  execution_id: string;
  status: 'QUEUED' | 'RUNNING' | 'WAITING_HUMAN' | 'COMPLETED' | 'FAILED';
  message?: string;
}

export interface HumanDecision {
  decision: 'approved' | 'rejected';
  comment?: string;
}

export class BpmClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: BpmConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Exécuter un workflow
   * @param workflowType - Type du workflow (défini dans le registre)
   * @param payload - Données à passer au workflow
   * @param idempotencyKey - Clé pour éviter les doublons (optionnel)
   */
  async execute(
    workflowType: string, 
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<ExecutionResult> {
    const response = await this.request<ExecutionResult>('/api/v1/workflow/execute', {
      type: workflowType,
      payload,
      ...(idempotencyKey && { idempotency_key: idempotencyKey })
    });
    return response;
  }

  /**
   * Approuver une étape humaine
   */
  async approve(executionId: string, comment?: string): Promise<ExecutionResult> {
    return this.resume(executionId, 'approved', comment);
  }

  /**
   * Rejeter une étape humaine
   */
  async reject(executionId: string, comment?: string): Promise<ExecutionResult> {
    return this.resume(executionId, 'rejected', comment);
  }

  /**
   * Reprendre un workflow après une étape humaine
   */
  async resume(
    executionId: string, 
    decision: 'approved' | 'rejected',
    comment?: string
  ): Promise<ExecutionResult> {
    return this.request<ExecutionResult>(`/api/v1/workflow/${executionId}/resume`, {
      decision,
      ...(comment && { comment })
    });
  }

  /**
   * Obtenir le statut d'une exécution
   */
  async getStatus(executionId: string): Promise<ExecutionResult> {
    return this.request<ExecutionResult>(`/api/v1/workflow/${executionId}`);
  }

  /**
   * Annuler une exécution
   */
  async cancel(executionId: string): Promise<ExecutionResult> {
    return this.request<ExecutionResult>(`/api/v1/workflow/${executionId}/cancel`, {});
  }

  /**
   * Lister les workflows disponibles
   */
  async listWorkflows(): Promise<{ workflows: Array<{ type: string; version: string }> }> {
    return this.request<{ workflows: Array<{ type: string; version: string }> }>('/api/v1/registry');
  }

  /**
   * Enregistrer un nouveau workflow
   */
  async registerWorkflow(workflow: Record<string, unknown>): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/v1/registry/register', workflow);
  }

  // Méthodes privées
  private async request<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: controller.signal
      };

      if (body) {
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify(body);
      } else {
        fetchOptions.method = 'GET';
      }

      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as { error?: { message?: string } };
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

/**
 * Hook React pour utiliser le BPM Engine
 * Usage:
 *   const { execute, approve, reject, status, loading, error } = useBpm();
 */
export function createBpmHook(client: BpmClient) {
  return function useBpm() {
    let loading = false;
    let error: Error | null = null;

    async function execute(workflowType: string, payload: Record<string, unknown>) {
      loading = true;
      error = null;
      try {
        return await client.execute(workflowType, payload);
      } catch (e) {
        error = e as Error;
        throw e;
      } finally {
        loading = false;
      }
    }

    async function approve(executionId: string) {
      loading = true;
      error = null;
      try {
        return await client.approve(executionId);
      } catch (e) {
        error = e as Error;
        throw e;
      } finally {
        loading = false;
      }
    }

    async function reject(executionId: string) {
      loading = true;
      error = null;
      try {
        return await client.reject(executionId);
      } catch (e) {
        error = e as Error;
        throw e;
      } finally {
        loading = false;
      }
    }

    async function getStatus(executionId: string) {
      loading = true;
      error = null;
      try {
        return await client.getStatus(executionId);
      } catch (e) {
        error = e as Error;
        throw e;
      } finally {
        loading = false;
      }
    }

    return { execute, approve, reject, getStatus, loading, error };
  };
}

export default BpmClient;
