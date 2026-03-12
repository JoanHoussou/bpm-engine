const API = {
  async call(endpoint, options = {}) {
    const ADMIN_SECRET = sessionStorage.getItem('adminSecret') || localStorage.getItem('adminSecret') || '';
    const isPost = options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE';
    const headers = {
      'Authorization': `Bearer ${localStorage.getItem('bpmKey') || ''}`,
      'X-Admin-Secret': ADMIN_SECRET,
      ...options.headers
    };
    
    if (isPost && !options.body) {
      delete headers['Content-Type'];
    }
    
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      if (typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
      }
    }
    
    try {
      const res = await fetch(`/admin/api${endpoint}`, {
        ...options,
        headers
      });

      if (res.status === 401) {
        sessionStorage.removeItem('adminSecret');
        localStorage.removeItem('adminSecret');
        App.showToast('Session expirée — rechargement...');
        setTimeout(() => location.reload(), 1500);
        return null;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (e) {
      console.error('API Error:', e);
      App.showToast('Erreur: ' + e.message);
      throw e;
    }
  },

  // Stats
  async getStats(period = '24h') {
    return this.call(`/stats?period=${period}`);
  },

  // Executions
  async getExecutions(limit = 20, offset = 0, status = '', type = '', search = '') {
    let url = `/executions?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    if (type) url += `&type=${type}`;
    if (search) url += `&search=${search}`;
    return this.call(url);
  },

  async getExecution(id) {
    return this.call(`/executions/${id}`);
  },

  async executeWorkflow(type, payload, clientId = null) {
    return this.call('/execute', {
      method: 'POST',
      body: { type, payload, client_id: clientId }
    });
  },

  async resumeWorkflow(executionId, decision, comment = null) {
    return this.call('/resume', {
      method: 'POST',
      body: { execution_id: executionId, decision, comment }
    });
  },

  // Workflows
  async getWorkflows(limit = 10, offset = 0, search = '') {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    if (search) params.append('search', search);
    return this.call(`/workflows?${params}`);
  },

  async saveWorkflow(workflow) {
    return this.call('/workflows', {
      method: 'POST',
      body: workflow
    });
  },

  async getWorkflow(type) {
    return this.call(`/workflows/${encodeURIComponent(type)}`);
  },

  // Clients
  async getClients(search = '') {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    return this.call(`/clients?${params}`);
  },

  async getClient(id) {
    return this.call(`/clients/${id}`);
  },

  async createClient(name, scopes, allowedTypes = []) {
    return this.call('/clients', {
      method: 'POST',
      body: { name, scopes, allowed_types: allowedTypes }
    });
  },

  async updateClient(clientId, data) {
    return this.call(`/clients/${clientId}`, {
      method: 'PUT',
      body: data
    });
  },

  async deleteClient(id) {
    return this.call(`/clients/${id}`, { method: 'DELETE' });
  },

  // API Keys
  async getKeys(search = '') {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    return this.call(`/keys?${params}`);
  },

  async generateKey(clientId, scopes, expiresAt) {
    return this.call(`/clients/${clientId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ scopes, expires_at: expiresAt })
    });
  },

  async revokeKey(clientId, keyId) {
    return this.call(`/clients/${clientId}/keys/${keyId}`, {
      method: 'DELETE'
    });
  },

  // System
  async getSystemHealth() {
    return this.call('/system-health');
  },

  // Logs
  async getAccessLogs(limit = 50) {
    return this.call(`/access-logs?limit=${limit}`);
  },

  // Settings
  async getSettings() {
    return this.call('/settings');
  },

  async saveSetting(key, value, description) {
    return this.call('/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value, description })
    });
  },

  async getClientSettings(clientId) {
    return this.call(`/clients/${clientId}/settings`);
  },

  async updateClientSettings(clientId, data) {
    return this.call(`/clients/${clientId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // Execution admin actions
  async sendReminder(executionId) {
    return this.call(`/executions/${executionId}/reminder`, { method: 'POST' });
  },

  async escalateExecution(executionId, escalateTo) {
    return this.call(`/executions/${executionId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ escalateTo })
    });
  },

  async suspendExecution(executionId) {
    return this.call(`/executions/${executionId}/suspend`, { method: 'POST' });
  },

  async cancelExecution(executionId) {
    return this.call(`/executions/${executionId}/cancel`, { method: 'POST' });
  },

  async getExecutionTimeline(executionId) {
    return this.call(`/executions/${executionId}/timeline`);
  },

  async replayExecution(executionId, options = {}) {
    return this.call(`/executions/${executionId}/replay`, { 
      method: 'POST',
      body: options
    });
  },

  async getReplayableExecutions(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.limit) params.append('limit', String(filters.limit));
    return this.call(`/executions/replayable?${params.toString()}`);
  }
};
