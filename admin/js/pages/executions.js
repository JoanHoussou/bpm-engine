Pages.executions = {
  page: 0,
  limit: 20,
  search: '',

  async load(page = 0) {
    this.page = page;
    const offset = page * this.limit;
    const status = document.getElementById('filter-status').value;
    const type = document.getElementById('filter-type').value;
    const globalSearch = document.getElementById('global-search')?.value || '';
    const search = globalSearch || this.search;

    const data = await API.getExecutions(this.limit, offset, status, type, search);
    const tbody = document.getElementById('executions-list');

    if (!data.executions?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Aucune exécution</td></tr>';
      document.getElementById('exec-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.executions.map(e => Components.executionRow(e)).join('');
    
    const total = data.total || 0;
    const pages = Math.ceil(total / this.limit);
    document.getElementById('exec-pagination').innerHTML = Components.pagination(page, pages, total, 'Pages.executions.load');
  },

  init() {
    this.search = '';
    this.loadFilterTypes();
  },

  async loadFilterTypes() {
    const data = await API.getStats('30d');
    const select = document.getElementById('filter-type');
    if (!select || !data.executions_by_type?.length) return;
    
    const sorted = [...data.executions_by_type].sort((a, b) => b.count - a.count).slice(0, 10);
    
    select.innerHTML = '<option value="">Tous les types</option>' + 
      sorted.map(w => `<option value="${w.type}">${w.type} (${w.count})</option>`).join('');
  },

  async showDetail(id) {
    const exec = await API.getExecution(id);
    
    document.getElementById('execution-detail').style.display = 'block';
    document.getElementById('detail-title').textContent = `Execution: ${id}`;
    
    const duration = exec.completed_at && exec.started_at 
      ? Math.round((new Date(exec.completed_at) - new Date(exec.started_at)) / 1000) + 's'
      : '—';
    
    const steps = this.buildTimeline(exec);
    
    let body = `
      <div class="exec-detail-header">
        <div class="exec-id">${exec.execution_id}</div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:6px">
          ${Components.badge(exec.status)}
          <span style="font-size:11px;color:var(--muted)">${exec.type} · ${exec.client_name}</span>
        </div>
        <div class="exec-meta">
          <div class="exec-meta-item"><span class="exec-meta-key">Démarré</span><span class="exec-meta-val">${Utils.formatDate(exec.started_at)}</span></div>
          <div class="exec-meta-item"><span class="exec-meta-key">Terminé</span><span class="exec-meta-val">${Utils.formatDate(exec.completed_at)}</span></div>
          <div class="exec-meta-item"><span class="exec-meta-key">Durée</span><span class="exec-meta-val">${duration}</span></div>
        </div>
      </div>

      <div class="grid2" style="margin-bottom:20px">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Progression des étapes</span>
            <span style="font-size:11px;color:var(--muted)">${steps.completed} / ${steps.total} étapes</span>
          </div>
          <div class="card-body">
            <div class="progress-bar" style="margin-bottom:20px">
              <div class="progress-fill" style="width:${steps.percent}%;background:linear-gradient(90deg,var(--green),var(--blue))"></div>
            </div>
            <div class="exec-timeline">
              ${steps.html}
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-header"><span class="card-title">Payload initial</span></div>
            <div class="card-body" style="padding:12px">
              <pre style="font-size:10px;color:var(--muted);font-family:var(--font-mono);line-height:1.6;overflow-x:auto">${exec.payload ? JSON.stringify(exec.payload, null, 2).slice(0, 500) : '—'}</pre>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Actions admin</span></div>
            <div class="card-body">
              <div style="display:flex;flex-direction:column;gap:10px">
                <button class="tb-btn primary" style="text-align:left;width:100%" onclick="Pages.workflows.openResumeModal('${exec.execution_id}')" ${exec.status !== 'WAITING_HUMAN' ? 'disabled' : ''}>▶ Reprendre le workflow</button>
                <button class="tb-btn" style="text-align:left;width:100%" onclick="Pages.executions.sendReminder('${exec.execution_id}')" ${exec.status !== 'WAITING_HUMAN' ? 'disabled' : ''}>📧 Envoyer relance maintenant</button>
                <button class="tb-btn" style="text-align:left;width:100%" onclick="Pages.executions.escalate('${exec.execution_id}')" ${exec.status !== 'WAITING_HUMAN' ? 'disabled' : ''}>↑ Escalader manuellement</button>
                <button class="tb-btn" style="text-align:left;width:100%;color:var(--orange)" onclick="Pages.executions.suspend('${exec.execution_id}')" ${['WAITING_HUMAN','RUNNING'].indexOf(exec.status) === -1 ? 'disabled' : ''}>⏸ Suspendre le workflow</button>
                <button class="tb-btn" style="text-align:left;width:100%;color:var(--red)" onclick="Pages.executions.cancel('${exec.execution_id}')" ${['COMPLETED','FAILED','CANCELLED'].indexOf(exec.status) > -1 ? 'disabled' : ''}>✕ Annuler + Saga rollback</button>
                <button class="tb-btn primary" style="text-align:left;width:100%" onclick="Pages.executions.replay('${exec.execution_id}')">↻ Rejouer cette exécution</button>
                <button class="tb-btn" style="text-align:left;width:100%" onclick="Pages.executions.showTimeline('${exec.execution_id}')">📋 Voir la timeline</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    if (exec.error) {
      const error = exec.error;
      const hasStack = error.stack || error.stacktrace;
      body += `
        <div class="card" style="margin-bottom:16px;border-color:var(--red)">
          <div class="card-header" style="background:rgba(239,68,68,0.1)">
            <span class="card-title" style="color:var(--red)">❌ Erreur</span>
          </div>
          <div class="card-body">
            <div style="margin-bottom:12px">
              <div style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Code</div>
              <div style="font-family:var(--font-mono);font-size:13px;color:var(--red)">${error.code || 'UNKNOWN_ERROR'}</div>
            </div>
            <div style="margin-bottom:12px">
              <div style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Message</div>
              <div style="font-size:13px;color:var(--text)">${error.message || error.error || 'Unknown error'}</div>
            </div>
            ${hasStack ? `
            <div>
              <div style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Stack Trace</div>
              <pre style="font-size:10px;color:var(--orange);font-family:var(--font-mono);line-height:1.5;overflow-x:auto;background:var(--bg3);padding:12px;border-radius:4px;max-height:200px">${error.stack || error.stacktrace}</pre>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    }
    
    if (exec.compensations?.length) {
      body += `
        <div class="card" style="margin-bottom:16px;border-color:var(--orange)">
          <div class="card-header" style="background:rgba(245,158,11,0.1)">
            <span class="card-title" style="color:var(--orange)">↩ Compensations (${exec.compensations.length})</span>
          </div>
          <div class="card-body" style="padding:0">
            <table class="tbl">
              <thead><tr><th>Étape</th><th>Données</th><th>Timestamp</th></tr></thead>
              <tbody>
                ${exec.compensations.map(c => `
                  <tr>
                    <td><span style="color:var(--orange)">${c.step_name}</span></td>
                    <td class="mono" style="font-size:10px">${JSON.stringify(c.data).slice(0, 100)}</td>
                    <td class="mono" style="color:var(--muted)">${Utils.formatDate(c.timestamp)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
    
    if (exec.events?.length) {
      body += `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">Événements (${exec.events.length})</span></div>
          <div class="card-body" style="padding:0">
            <table class="tbl">
              <thead><tr><th>Événement</th><th>Étape</th><th>Timestamp</th></tr></thead>
              <tbody>
                ${exec.events.map(ev => `
                  <tr>
                    <td>${Components.badge(ev.event_type)}</td>
                    <td>${ev.step_name || '—'}</td>
                    <td class="mono" style="color:var(--muted)">${Utils.formatDate(ev.timestamp)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
    
    if (exec.payload) {
      body += `
        <div class="card">
          <div class="card-header"><span class="card-title">Payload</span></div>
          <div class="card-body" style="padding:12px">
            <pre style="font-size:10px;color:var(--muted);font-family:var(--font-mono);line-height:1.6;overflow-x:auto">${JSON.stringify(exec.payload, null, 2)}</pre>
          </div>
        </div>
      `;
    }
    
    document.getElementById('detail-body').innerHTML = body;
    document.getElementById('section-executions').scrollIntoView({ behavior: 'smooth' });
  },

  buildTimeline(exec) {
    const events = exec.events || [];
    const stepEvents = events.filter(e => e.step_name);
    
    const stepMap = new Map();
    stepEvents.forEach(ev => {
      if (!stepMap.has(ev.step_name)) {
        stepMap.set(ev.step_name, []);
      }
      stepMap.get(ev.step_name).push(ev);
    });

    const steps = Array.from(stepMap.entries()).map(([name, evts]) => {
      const stepEvents = evts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const startEv = stepEvents.find(e => e.event_type === 'STEP_STARTED');
      const endEv = stepEvents.find(e => e.event_type === 'STEP_COMPLETED' || e.event_type === 'STEP_FAILED');
      
      let status = 'pending';
      if (endEv?.event_type === 'STEP_COMPLETED') status = 'done';
      else if (endEv?.event_type === 'STEP_FAILED') status = 'failed';
      else if (startEv) status = 'active';

      const startTime = startEv ? new Date(startEv.timestamp) : null;
      const endTime = endEv ? new Date(endEv.timestamp) : null;
      const duration = startTime && endTime ? Math.round((endTime - startTime) / 1000) : null;

      const lastEv = stepEvents[stepEvents.length - 1];
      const desc = this.getStepDescription(lastEv);

      return { name, status, startTime, endTime, duration, desc, lastEv };
    });

    const completed = steps.filter(s => s.status === 'done').length;
    const total = steps.length || 1;
    const percent = Math.round((completed / total) * 100);

    const html = steps.map((s, i) => {
      const dotClass = s.status === 'done' ? 'dot-done' : s.status === 'active' ? 'dot-active' : 'dot-pending';
      const icon = s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : (i + 1);
      const timeStr = s.startTime ? Utils.formatDate(s.startTime.timestamp || s.startTime).split(' ')[1] : '—';
      const durationStr = s.duration ? (s.duration < 60 ? `${s.duration}ms` : `${Math.round(s.duration/60)}m ${s.duration%60}s`) : s.status === 'active' ? 'En cours' : '—';
      const color = s.status === 'done' ? 'var(--green)' : s.status === 'failed' ? 'var(--red)' : s.status === 'active' ? 'var(--orange)' : 'var(--dim)';
      
      return `
        <div class="exec-step">
          <div class="exec-step-dot ${dotClass}">${icon}</div>
          <div>
            <div class="exec-step-name" style="color:${s.status === 'pending' ? 'var(--muted)' : 'var(--text)'}">${s.name}</div>
            <div class="exec-step-desc" style="color:${s.status === 'pending' ? 'var(--dim)' : 'var(--muted)'}">${s.desc}</div>
          </div>
          <div class="exec-step-time" style="color:${color}">${timeStr}<br>${durationStr !== '—' ? `<span style="color:${color}">${durationStr}</span>` : durationStr}</div>
        </div>
      `;
    }).join('');

    return { completed, total, percent, html };
  },

  getStepDescription(event) {
    if (!event) return 'En attente';
    const type = event.event_type;
    const data = event.data || {};
    
    if (type === 'STEP_COMPLETED') return 'Terminé';
    if (type === 'STEP_FAILED') return `Échec: ${data.error || 'Erreur inconnue'}`;
    if (type === 'STEP_STARTED') return 'En cours';
    if (type === 'HUMAN_ACTION') return data.action ? `Action: ${data.action}` : 'En attente de réponse';
    if (type === 'HUMAN_APPROVED') return `Approuvé par ${data.actor || 'Unknown'}`;
    if (type === 'HUMAN_REJECTED') return `Rejeté par ${data.actor || 'Unknown'}`;
    if (type === 'COMPENSATION_EXECUTED') return 'Compensation exécutée';
    return type;
  },

  async sendReminder(executionId) {
    try {
      const result = await API.sendReminder(executionId);
      App.showToast(result.message || 'Relance envoyée');
      this.showDetail(executionId);
    } catch (e) {
      App.showToast('Erreur: ' + e.message);
    }
  },

  async escalate(executionId) {
    const escalateTo = prompt('Email du nouveau destinataire:');
    if (!escalateTo) return;
    try {
      const result = await API.escalateExecution(executionId, escalateTo);
      App.showToast(result.message || 'Escalade effectuée');
      this.showDetail(executionId);
    } catch (e) {
      App.showToast('Erreur: ' + e.message);
    }
  },

  async suspend(executionId) {
    if (!confirm('Voulez-vous suspendre ce workflow?')) return;
    try {
      const result = await API.suspendExecution(executionId);
      App.showToast(result.message || 'Workflow suspendu');
      this.showDetail(executionId);
    } catch (e) {
      App.showToast('Erreur: ' + e.message);
    }
  },

  async cancel(executionId) {
    if (!confirm('Voulez-vous annuler ce workflow? Les étapes complétées seront compensées.')) return;
    try {
      const result = await API.cancelExecution(executionId);
      App.showToast(result.message || 'Workflow annulé');
      this.load(this.page);
      this.closeDetail();
    } catch (e) {
      App.showToast('Erreur: ' + e.message);
    }
  },

  async replay(executionId) {
    if (!confirm('Voulez-vous rejouer cette exécution? Une nouvelle exécution sera créée avec le même payload.')) return;
    try {
      const result = await API.replayExecution(executionId);
      if (result.success) {
        App.showToast('Nouvelle exécution créée: ' + result.newExecutionId);
        this.load(this.page);
      } else {
        App.showToast('Erreur: ' + result.message);
      }
    } catch (e) {
      App.showToast('Erreur: ' + e.message);
    }
  },

  async showTimeline(executionId) {
    try {
      const data = await API.getExecutionTimeline(executionId);
      const timeline = data.timeline || [];
      
      let html = '<div style="max-height:400px;overflow-y:auto">';
      timeline.forEach((event, i) => {
        const icon = event.type === 'STEP_STARTED' ? '▶' 
          : event.type === 'STEP_COMPLETED' ? '✓' 
          : event.type === 'STEP_FAILED' ? '✗'
          : event.type === 'WORKFLOW_COMPLETED' ? '✓✓'
          : event.type === 'WORKFLOW_FAILED' ? '✗✗'
          : '●';
        const color = event.type.includes('COMPLETED') ? 'var(--green)' 
          : event.type.includes('FAILED') ? 'var(--red)' 
          : 'var(--muted)';
        
        html += `
          <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11px">
            <span style="color:${color}">${icon}</span>
            <span style="color:var(--text)">${event.type}</span>
            ${event.step ? `<span style="color:var(--blue)">${event.step}</span>` : ''}
            <span style="color:var(--muted);margin-left:auto">${Utils.formatDate(event.timestamp)}</span>
          </div>
        `;
      });
      html += '</div>';
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:20px;max-width:600px;width:90%">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--text)">Timeline: ${executionId}</h3>
            <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button>
          </div>
          ${html}
        </div>
      `;
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000';
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    } catch (e) {
      App.showToast('Erreur: ' + e.message);
    }
  },

  closeDetail() {
    document.getElementById('execution-detail').style.display = 'none';
  }
};
