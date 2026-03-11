const WorkflowEditor = {
  steps: [],
  selectedStep: null,
  searchQuery: '',
  activeTab: 'steps',
  currentWorkflowType: null,
  history: [],
  historyIndex: -1,
  MAX_HISTORY: 50,
  isEditorVisible: false,

  TYPE_META: {
    auto: { color: '#10B981', cGlow: 'rgba(16,185,129,0.08)', c10: 'rgba(16,185,129,0.1)', c20: 'rgba(16,185,129,0.2)', icon: '⚙', label: 'Auto', badge: 'editor-type-auto' },
    human: { color: '#06B6D4', cGlow: 'rgba(6,182,212,0.08)', c10: 'rgba(6,182,212,0.1)', c20: 'rgba(6,182,212,0.2)', icon: '👤', label: 'Human', badge: 'editor-type-human' },
    condition: { color: '#F59E0B', cGlow: 'rgba(245,158,11,0.08)', c10: 'rgba(245,158,11,0.1)', c20: 'rgba(245,158,11,0.2)', icon: '⑂', label: 'Condition', badge: 'editor-type-condition' },
    parallel: { color: '#8B5CF6', cGlow: 'rgba(139,92,246,0.08)', c10: 'rgba(139,92,246,0.1)', c20: 'rgba(139,92,246,0.2)', icon: '⫘', label: 'Parallel', badge: 'editor-type-parallel' }
  },

  init() {
    this.setupKeyboardShortcuts();
  },

  isEditorActive() {
    const editorView = document.getElementById('workflows-editor-view');
    return editorView && editorView.style.display !== 'none';
  },

  showEditor(type = null) {
    document.getElementById('workflows-list-view').style.display = 'none';
    document.getElementById('workflows-editor-view').style.display = 'grid';
    document.querySelector('.workflow-list-header').style.display = 'none';
    this.isEditorVisible = true;

    if (type) {
      this.loadWorkflow(type);
    } else {
      this.createNewWorkflow();
    }
  },

  showList() {
    document.getElementById('workflows-list-view').style.display = 'block';
    document.getElementById('workflows-editor-view').style.display = 'none';
    document.querySelector('.workflow-list-header').style.display = 'flex';
    this.isEditorVisible = false;
    this.currentWorkflowType = null;
    Pages.workflows.load();
  },

  createNewWorkflow() {
    this.steps = [
      { name: 'approval-n1', type: 'human', actor: '$.payload.approver_email', action_url: '/approval/{execution_id}/n1', timeout_hours: 48, on_timeout: 'escalate', escalate_to: '$.payload.n2_email', reminder_hours: [24, 40], decisions: [{ key: 'approved', label: 'Approuver', next: 'finalize' }, { key: 'rejected', label: 'Refuser', next: 'notify-rejection' }] },
      { name: 'finalize', type: 'auto', url: '/steps/finalize', timeout_ms: 5000, retry: 3, on_failure: 'compensate' }
    ];
    this.selectedStep = null;
    this.currentWorkflowType = null;
    this.history = [];
    this.historyIndex = -1;
    document.getElementById('wf-type').value = 'nouveau-workflow';
    document.getElementById('wf-version').value = '1.0.0';
    document.getElementById('wf-base-url').value = 'https://app.internal.com';
    document.getElementById('wf-cb-ok').value = '/bpm/callback';
    document.getElementById('wf-cb-fail').value = '/bpm/callback';
    document.getElementById('wf-notif-ok').value = 'email';
    document.getElementById('wf-fail-strategy').value = 'compensate';
    this.saveHistory();
    this.refresh();
    this.resetValidityBadge();
  },

  resetValidityBadge() {
    const badge = document.getElementById('editor-validity-badge');
    badge.className = 'editor-validity-badge neutral';
    document.getElementById('editor-validity-icon').textContent = '◌';
    document.getElementById('editor-validity-text').textContent = 'Non validé';
  },

  async loadWorkflow(type) {
    try {
      const data = await API.getWorkflow(type);
      if (data && data.type) {
        this.steps = data.steps || [];
        this.currentWorkflowType = type;
        this.history = [];
        this.historyIndex = -1;
        
        document.getElementById('wf-type').value = data.type || type;
        document.getElementById('wf-version').value = data.version || '1.0.0';
        document.getElementById('wf-base-url').value = data.base_url || '';

        if (data.on_complete) {
          document.getElementById('wf-cb-ok').value = data.on_complete.callback_url || '/bpm/callback';
          const notif = data.on_complete.notify || [];
          if (notif.length === 2) document.getElementById('wf-notif-ok').value = 'both';
          else if (notif.includes('email')) document.getElementById('wf-notif-ok').value = 'email';
          else if (notif.includes('slack')) document.getElementById('wf-notif-ok').value = 'slack';
          else document.getElementById('wf-notif-ok').value = 'none';
        } else {
          document.getElementById('wf-cb-ok').value = '/bpm/callback';
          document.getElementById('wf-notif-ok').value = 'email';
        }

        if (data.on_failure) {
          document.getElementById('wf-cb-fail').value = data.on_failure.callback_url || '/bpm/callback';
          document.getElementById('wf-fail-strategy').value = data.on_failure.strategy || 'compensate';
        } else {
          document.getElementById('wf-cb-fail').value = '/bpm/callback';
          document.getElementById('wf-fail-strategy').value = 'compensate';
        }

        this.selectedStep = null;
        this.saveHistory();
        this.refresh();
        this.resetValidityBadge();
      } else {
        this.showToast('Workflow non trouvé', 'error', '✗');
        this.showList();
      }
    } catch (e) {
      this.showToast('Erreur lors du chargement: ' + e.message, 'error', '✗');
      this.showList();
    }
  },

  saveHistory() {
    const snapshot = JSON.stringify({
      steps: this.steps,
      type: document.getElementById('wf-type').value,
      version: document.getElementById('wf-version').value,
      base_url: document.getElementById('wf-base-url').value,
      cb_ok: document.getElementById('wf-cb-ok').value,
      cb_fail: document.getElementById('wf-cb-fail').value,
      notif_ok: document.getElementById('wf-notif-ok').value,
      fail_strategy: document.getElementById('wf-fail-strategy').value
    });
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.updateUndoRedoBtns();
  },

  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    const snapshot = JSON.parse(this.history[this.historyIndex]);
    this.steps = snapshot.steps;
    document.getElementById('wf-type').value = snapshot.type;
    document.getElementById('wf-version').value = snapshot.version;
    document.getElementById('wf-base-url').value = snapshot.base_url;
    document.getElementById('wf-cb-ok').value = snapshot.cb_ok;
    document.getElementById('wf-cb-fail').value = snapshot.cb_fail;
    document.getElementById('wf-notif-ok').value = snapshot.notif_ok;
    document.getElementById('wf-fail-strategy').value = snapshot.fail_strategy;
    
    if (this.selectedStep !== null && this.selectedStep >= this.steps.length) this.selectedStep = this.steps.length - 1;
    if (this.steps.length === 0) this.selectedStep = null;
    this.refresh();
    this.showToast('Annulé', 'info', '↩');
  },

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    const snapshot = JSON.parse(this.history[this.historyIndex]);
    this.steps = snapshot.steps;
    document.getElementById('wf-type').value = snapshot.type;
    document.getElementById('wf-version').value = snapshot.version;
    document.getElementById('wf-base-url').value = snapshot.base_url;
    document.getElementById('wf-cb-ok').value = snapshot.cb_ok;
    document.getElementById('wf-cb-fail').value = snapshot.cb_fail;
    document.getElementById('wf-notif-ok').value = snapshot.notif_ok;
    document.getElementById('wf-fail-strategy').value = snapshot.fail_strategy;
    this.refresh();
    this.showToast('Rétabli', 'info', '↪');
  },

  updateUndoRedoBtns() {
    document.getElementById('btn-undo').disabled = this.historyIndex <= 0;
    document.getElementById('btn-redo').disabled = this.historyIndex >= this.history.length - 1;
  },

  renderStepsList() {
    const container = document.getElementById('editor-steps-list');
    const empty = document.getElementById('editor-steps-empty');

    if (!this.steps.length) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    container.innerHTML = this.steps.map((s, i) => {
      const m = this.TYPE_META[s.type] || this.TYPE_META.auto;
      const isSelected = this.selectedStep === i;
      const hidden = this.searchQuery && !s.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ? 'hidden-search' : '';

      return `
        <div class="editor-step-card ${isSelected ? 'selected' : ''} ${hidden}"
             style="--c:${m.color};--c-10:${m.c10};--c-20:${m.c20}"
             id="step-card-${i}"
             onclick="WorkflowEditor.selectStep(${i})"
             draggable="true"
             ondragstart="WorkflowEditor.onDragStart(event,${i})"
             ondragover="WorkflowEditor.onDragOver(event,${i})"
             ondrop="WorkflowEditor.onDrop(event,${i})"
             ondragleave="WorkflowEditor.onDragLeave(event,${i})"
             ondragend="WorkflowEditor.onDragEnd()">
          <div class="editor-step-card-header">
            <div class="editor-step-num">${String(i + 1).padStart(2, '0')}</div>
            <div class="editor-step-info">
              <div class="editor-step-info-name">${this.highlight(s.name, this.searchQuery)}</div>
              <div class="editor-step-info-row">
                <span class="editor-step-info-type">${s.type}</span>
              </div>
            </div>
            <div class="editor-step-actions" onclick="event.stopPropagation()">
              <button class="editor-step-btn dup" title="Dupliquer" onclick="WorkflowEditor.duplicateStep(${i})">⎘</button>
              <button class="editor-step-btn" title="Monter" onclick="WorkflowEditor.moveStep(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="editor-step-btn" title="Descendre" onclick="WorkflowEditor.moveStep(${i},1)" ${i === this.steps.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="editor-step-btn del" title="Supprimer" onclick="WorkflowEditor.removeStep(${i})">✕</button>
            </div>
          </div>
        </div>
        ${i < this.steps.length - 1 ? `<div class="editor-step-connector"><div class="editor-step-connector-arrow">▼</div></div>` : ''}
      `;
    }).join('');
  },

  highlight(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + `<mark style="background:rgba(45,126,248,0.3);color:var(--text);border-radius:2px">${text.slice(idx, idx + query.length)}</mark>` + text.slice(idx + query.length);
  },

  renderCanvas() {
    const pipeline = document.getElementById('editor-v-pipeline');
    const empty = document.getElementById('editor-canvas-empty');

    if (!this.steps.length) {
      pipeline.style.display = 'none';
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    pipeline.style.display = 'flex';

    pipeline.innerHTML = this.steps.map((s, i) => {
      const m = this.TYPE_META[s.type] || this.TYPE_META.auto;
      const isActive = this.selectedStep === i;
      const nextStep = this.steps[i + 1];
      const nextM = nextStep ? (this.TYPE_META[nextStep.type] || this.TYPE_META.auto) : null;

      let pills = '';
      if (s.url) pills += this.nodePill('🔗', 'endpoint', s.url);
      if (s.actor) pills += this.nodePill('👤', 'actor', s.actor);
      if (s.evaluate) pills += this.nodePill('⑂', 'eval', s.evaluate);
      if (s.timeout_ms) pills += this.nodePill('⏱', 'timeout', s.timeout_ms + 'ms');
      if (s.timeout_hours) pills += this.nodePill('⏱', 'timeout', s.timeout_hours + 'h');

      let decisionsHtml = '';
      
      // Pour type human: afficher les décisions
      if (s.decisions && s.decisions.length > 0) {
        decisionsHtml = `<div class="editor-v-decisions">${s.decisions.map(d => {
          const step = this.steps.find(st => st.name === d.next);
          const nextStepColor = step ? (this.TYPE_META[step.type]?.color || 'var(--muted)') : 'var(--muted)';
          return `
            <div class="editor-v-decision">
              <div class="editor-v-decision-key">${d.key}</div>
              <div class="editor-v-decision-next" style="color:${nextStepColor}">→ ${d.next || '?'}</div>
            </div>
          `;
        }).join('')}</div>`;
      }
      
      // Pour type condition: afficher les branches
      if (s.branches && s.branches.length > 0) {
        decisionsHtml = `<div class="editor-v-decisions">${s.branches.map(b => {
          const step = this.steps.find(st => st.name === b.next);
          const nextStepColor = step ? (this.TYPE_META[step.type]?.color || 'var(--muted)') : 'var(--muted)';
          return `
            <div class="editor-v-decision">
              <div class="editor-v-decision-key" style="color:var(--orange)">${b.condition}</div>
              <div class="editor-v-decision-next" style="color:${nextStepColor}">→ ${b.next || '?'}</div>
            </div>
          `;
        }).join('')}</div>`;
      }

      // Flèche vers l'étape suivante - couleur de l'étape actuelle (qu'on quitte)
      let arrowHtml = '';
      if (nextStep && nextM) {
        arrowHtml = `
          <div class="editor-v-arrow">
            <div class="editor-v-arrow-line" style="background:linear-gradient(to bottom,${m.color},${m.color})"></div>
            <div class="editor-v-arrow-head" style="color:${m.color}">▼</div>
          </div>`;
      }

      return `
        <div class="editor-v-node ${isActive ? 'active' : ''}"
             style="--c:${m.color};--c-glow:${m.cGlow};animation-delay:${i * 0.03}s"
             onclick="WorkflowEditor.selectStep(${i})">
          <div class="editor-v-node-top">
            <div>
              <div class="editor-v-node-name">${m.icon} ${s.name}</div>
              <div class="editor-v-node-meta">
                <span>${s.type.toUpperCase()}</span>
                ${s.retry > 0 ? `<span>·</span><span>retry ${s.retry}x</span>` : ''}
              </div>
            </div>
            <span class="editor-type-badge ${m.badge}">${m.label}</span>
          </div>
          <div class="editor-v-node-body">${pills}${decisionsHtml}</div>
        </div>
        ${arrowHtml}
      `;
    }).join('');
  },

  nodePill(icon, label, val) {
    return `<div class="editor-v-node-pill"><span style="font-size:10px">${icon}</span><span class="editor-v-node-pill-label">${label}</span><span class="editor-v-node-pill-val">${val}</span></div>`;
  },

  getStepColor(stepName) {
    const step = this.steps.find(s => s.name === stepName);
    if (!step) return 'var(--muted)';
    const meta = this.TYPE_META[step.type];
    return meta ? meta.color : 'var(--muted)';
  },

  renderProps() {
    const iconWrap = document.getElementById('editor-prop-icon-wrap');
    const propTitle = document.getElementById('editor-prop-title');
    const propSubtitle = document.getElementById('editor-prop-subtitle');
    const propBody = document.getElementById('editor-prop-body');

    if (this.selectedStep === null || !this.steps[this.selectedStep]) {
      propTitle.textContent = 'Sélectionnez une étape';
      propSubtitle.textContent = '';
      document.getElementById('editor-prop-icon').textContent = '⚙';
      iconWrap.style.cssText = '';
      propBody.innerHTML = `<div class="editor-prop-empty"><div class="editor-prop-empty-icon">←</div><div class="editor-prop-empty-text">Cliquez sur une étape<br>pour éditer ses propriétés</div></div>`;
      return;
    }

    const idx = this.selectedStep;
    const s = this.steps[idx];
    const m = this.TYPE_META[s.type] || this.TYPE_META.auto;

    document.getElementById('editor-prop-icon').textContent = m.icon;
    iconWrap.style.cssText = `background:${m.c10};border-color:${m.c20};`;
    propTitle.textContent = s.name;
    propSubtitle.textContent = `Étape ${idx + 1} · ${s.type}`;

    let html = `
      <div class="editor-section-label" style="margin-bottom:10px">Identité</div>
      <div class="editor-form-group">
        <label class="editor-form-label">Nom <span class="editor-req">*</span></label>
        <input class="editor-form-input" value="${this.esc(s.name)}" oninput="WorkflowEditor.updateStep(${idx},'name',this.value)">
      </div>
      <div class="editor-form-group">
        <label class="editor-form-label">Type</label>
        <select class="editor-form-select" onchange="WorkflowEditor.updateStepType(${idx},this.value)">
          ${['auto', 'human', 'condition', 'parallel'].map(t => `<option value="${t}" ${s.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
        </select>
      </div>
    `;

    if (s.type === 'auto') {
      html += `
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:10px">HTTP</div>
        <div class="editor-form-group">
          <label class="editor-form-label">URL <span class="editor-req">*</span></label>
          <input class="editor-form-input" value="${this.esc(s.url || '')}" placeholder="/steps/mon-step"
            oninput="WorkflowEditor.updateStep(${idx},'url',this.value)">
        </div>
        <div class="editor-grid-2">
          <div class="editor-form-group">
            <label class="editor-form-label">Timeout (ms)</label>
            <input class="editor-form-input" type="number" value="${s.timeout_ms || 3000}" oninput="WorkflowEditor.updateStep(${idx},'timeout_ms',+this.value)">
          </div>
          <div class="editor-form-group">
            <label class="editor-form-label">Retry</label>
            <input class="editor-form-input" type="number" value="${s.retry || 0}" min="0" max="5" oninput="WorkflowEditor.updateStep(${idx},'retry',+this.value)">
          </div>
        </div>
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:10px">Échec</div>
        <div class="editor-form-group">
          <label class="editor-form-label">Stratégie</label>
          <select class="editor-form-select" onchange="WorkflowEditor.updateStep(${idx},'on_failure',this.value)">
            <option value="compensate" ${s.on_failure === 'compensate' ? 'selected' : ''}>Compenser (Saga)</option>
            <option value="abort" ${s.on_failure === 'abort' ? 'selected' : ''}>Arrêter</option>
            <option value="continue" ${s.on_failure === 'continue' ? 'selected' : ''}>Continuer</option>
          </select>
        </div>
        <div class="editor-form-group">
          <label class="editor-form-label">URL compensation</label>
          <input class="editor-form-input" value="${this.esc(s.compensate_url || '')}" placeholder="/steps/mon-step/compensate" oninput="WorkflowEditor.updateStep(${idx},'compensate_url',this.value)">
        </div>
      `;
    }

    if (s.type === 'human') {
      const stepNames = this.steps.map(st => st.name);
      const currentStepName = s.name;
      html += `
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:10px">Acteur & Action</div>
        <div class="editor-form-group">
          <label class="editor-form-label">Acteur (JSONPath) <span class="editor-req">*</span></label>
          <input class="editor-form-input" value="${this.esc(s.actor || '')}" placeholder="$.payload.manager_email" oninput="WorkflowEditor.updateStep(${idx},'actor',this.value)">
        </div>
        <div class="editor-form-group">
          <label class="editor-form-label">URL d'action</label>
          <input class="editor-form-input" value="${this.esc(s.action_url || '')}" placeholder="/approval/{execution_id}/step" oninput="WorkflowEditor.updateStep(${idx},'action_url',this.value)">
        </div>
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:10px">Timeout & Escalade</div>
        <div class="editor-grid-2">
          <div class="editor-form-group">
            <label class="editor-form-label">Timeout (h)</label>
            <input class="editor-form-input" type="number" value="${s.timeout_hours || 48}" oninput="WorkflowEditor.updateStep(${idx},'timeout_hours',+this.value)">
          </div>
          <div class="editor-form-group">
            <label class="editor-form-label">Si timeout</label>
            <select class="editor-form-select" onchange="WorkflowEditor.updateStep(${idx},'on_timeout',this.value);WorkflowEditor.renderProps()">
              <option value="escalate" ${s.on_timeout === 'escalate' ? 'selected' : ''}>Escalader</option>
              <option value="auto_approve" ${s.on_timeout === 'auto_approve' ? 'selected' : ''}>Auto-approuver</option>
              <option value="reject" ${s.on_timeout === 'reject' ? 'selected' : ''}>Rejeter</option>
            </select>
          </div>
        </div>
        ${s.on_timeout === 'escalate' ? `
        <div class="editor-form-group">
          <label class="editor-form-label">Escalader vers</label>
          <input class="editor-form-input" value="${this.esc(s.escalate_to || '')}" placeholder="$.payload.n2_email" oninput="WorkflowEditor.updateStep(${idx},'escalate_to',this.value)">
        </div>` : ''}
        <div class="editor-form-group">
          <label class="editor-form-label">Relances (h, virgule)</label>
          <input class="editor-form-input" value="${(s.reminder_hours || []).join(', ')}" placeholder="24, 40" oninput="WorkflowEditor.updateStep(${idx},'reminder_hours',this.value.split(',').map(n => +n.trim()).filter(n => n > 0))">
        </div>
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:6px">Décisions</div>
        <div class="editor-decisions-list" id="editor-decisions-list">
          ${(s.decisions || []).map((d, di) => `
            <div class="editor-decision-item">
              <div class="editor-decision-item-header">
                <div class="editor-decision-num">${di + 1}</div>
                <span style="font-size:10px;font-weight:600;color:var(--text2);font-family:var(--font-mono)">${d.key}</span>
                <button class="editor-decision-remove" onclick="WorkflowEditor.removeDecision(${idx},${di})">✕</button>
              </div>
              <div class="editor-grid-2" style="margin-bottom:4px">
                <div class="editor-form-group" style="margin-bottom:0">
                  <label class="editor-form-label" style="font-size:8px">Clé</label>
                  <input class="editor-form-input" style="font-size:10px" value="${this.esc(d.key)}" placeholder="approved" oninput="WorkflowEditor.updateDecision(${idx},${di},'key',this.value)">
                </div>
                <div class="editor-form-group" style="margin-bottom:0">
                  <label class="editor-form-label" style="font-size:8px">Label</label>
                  <input class="editor-form-input" style="font-size:10px" value="${this.esc(d.label)}" placeholder="Approuver" oninput="WorkflowEditor.updateDecision(${idx},${di},'label',this.value)">
                </div>
              </div>
              <div class="editor-form-group" style="margin-bottom:0">
                <label class="editor-form-label" style="font-size:8px">Étape suivante</label>
                <select class="editor-form-select" style="font-size:10px" onchange="WorkflowEditor.updateDecision(${idx},${di},'next',this.value)">
                  <option value="">— Choisir —</option>
                  ${stepNames.filter(name => name !== currentStepName).map(name => `<option value="${name}" ${d.next === name ? 'selected' : ''}>${name}</option>`).join('')}
                </select>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="editor-add-decision-btn" onclick="WorkflowEditor.addDecision(${idx})">+ Ajouter une décision</button>
      `;
    }

    if (s.type === 'condition') {
      const stepNames = this.steps.map(st => st.name);
      const currentStepName = s.name;
      html += `
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:10px">Expression</div>
        <div class="editor-form-group">
          <label class="editor-form-label">Évaluer (JSONPath) <span class="editor-req">*</span></label>
          <input class="editor-form-input" value="${this.esc(s.evaluate || '')}" placeholder="$.results.score.data.value" oninput="WorkflowEditor.updateStep(${idx},'evaluate',this.value)">
        </div>
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:6px">Branches</div>
        <div class="editor-decisions-list" id="editor-branches-list">
          ${(s.branches || []).map((b, bi) => `
            <div class="editor-decision-item">
              <div class="editor-decision-item-header">
                <div class="editor-decision-num">${bi + 1}</div>
                <span style="font-size:10px;font-weight:600;color:var(--orange);font-family:var(--font-mono)">${b.condition || 'condition'}</span>
                <button class="editor-decision-remove" onclick="WorkflowEditor.removeBranch(${idx},${bi})">✕</button>
              </div>
              <div class="editor-grid-2" style="margin-bottom:4px">
                <div class="editor-form-group" style="margin-bottom:0">
                  <label class="editor-form-label" style="font-size:8px">Condition</label>
                  <input class="editor-form-input" style="font-size:10px" value="${this.esc(b.condition)}" placeholder=">= 80" oninput="WorkflowEditor.updateBranch(${idx},${bi},'condition',this.value)">
                </div>
                <div class="editor-form-group" style="margin-bottom:0">
                  <label class="editor-form-label" style="font-size:8px">Étape suivante</label>
                  <select class="editor-form-select" style="font-size:10px" onchange="WorkflowEditor.updateBranch(${idx},${bi},'next',this.value)">
                    <option value="">— Choisir —</option>
                    ${stepNames.filter(name => name !== currentStepName).map(name => `<option value="${name}" ${b.next === name ? 'selected' : ''}>${name}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="editor-add-decision-btn" onclick="WorkflowEditor.addBranch(${idx})">+ Ajouter une branche</button>
      `;
    }

    if (s.type === 'parallel') {
      const availableSteps = this.steps.filter(st => st.name !== s.name);
      html += `
        <div class="editor-divider"></div>
        <div class="editor-section-label" style="margin-bottom:10px">Exécution parallèle</div>
        <div class="editor-form-group">
          <label class="editor-form-label">Attendre</label>
          <select class="editor-form-select" onchange="WorkflowEditor.updateStep(${idx},'wait_for',this.value)">
            <option value="all" ${s.wait_for === 'all' ? 'selected' : ''}>Toutes les branches (all)</option>
            <option value="any" ${s.wait_for === 'any' ? 'selected' : ''}>Première branche (any)</option>
          </select>
        </div>
        <div class="editor-form-group">
          <label class="editor-form-label">Étapes à exécuter en parallèle</label>
          <div class="editor-checkbox-list">
            ${availableSteps.map(st => {
              const isChecked = (s.steps || []).includes(st.name);
              const meta = this.TYPE_META[st.type] || this.TYPE_META.auto;
              return `
                <label class="editor-checkbox-row">
                  <input type="checkbox" ${isChecked ? 'checked' : ''} 
                    onchange="WorkflowEditor.toggleParallelStep(${idx},'${st.name}',this.checked)">
                  <span class="editor-checkbox-label" style="color:${meta.color}">${meta.icon} ${st.name}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    propBody.innerHTML = html;
  },

  selectStep(i) {
    this.selectedStep = i;
    this.renderStepsList();
    this.renderCanvas();
    this.renderProps();
    const nodes = document.querySelectorAll('.editor-v-node');
    if (nodes[i]) nodes[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  moveStep(i, dir) {
    const ni = i + dir;
    if (ni < 0 || ni >= this.steps.length) return;
    this.saveHistory();
    
    // Sauvegarder le nom de l'étape qui est actuellement à la position cible (ni)
    // C'est cette étape qui va "descendre"
    const oldNameAtTarget = this.steps[ni].name;
    
    // Échanger les positions
    [this.steps[i], this.steps[ni]] = [this.steps[ni], this.steps[i]];
    
    // Le nom de l'étape qui est maintenant à la position ni (celle qui était à la position i)
    const newNameAtTarget = this.steps[ni].name;
    
    // Mettre à jour les références pour qu'elles pointent vers l'étape qui est maintenant à la position ni
    this.steps.forEach((step) => {
      if (step.decisions) {
        step.decisions.forEach(d => {
          // Si une décision pointait vers l'ancienne étape à cette position, elle pointe maintenant vers la nouvelle
          if (d.next === oldNameAtTarget) {
            d.next = newNameAtTarget;
          }
        });
      }
      if (step.branches) {
        step.branches.forEach(b => {
          if (b.next === oldNameAtTarget) {
            b.next = newNameAtTarget;
          }
        });
      }
    });
    
    // Mettre à jour selectedStep
    if (this.selectedStep === i) this.selectedStep = ni;
    else if (this.selectedStep === ni) this.selectedStep = i;
    
    this.refresh();
  },

  removeStep(i) {
    this.saveHistory();
    const name = this.steps[i].name;
    this.steps.splice(i, 1);
    if (this.selectedStep >= this.steps.length) this.selectedStep = this.steps.length - 1;
    if (this.steps.length === 0) this.selectedStep = null;
    this.refresh();
    this.showToast(`Étape "${name}" supprimée`, 'info', '✕');
  },

  duplicateStep(i) {
    this.saveHistory();
    const clone = JSON.parse(JSON.stringify(this.steps[i]));
    clone.name = clone.name + '-copy';
    this.steps.splice(i + 1, 0, clone);
    this.selectedStep = i + 1;
    this.refresh();
    this.showToast(`"${clone.name}" créée`, 'success', '⎘');
  },

  updateStep(i, key, val) {
    this.steps[i][key] = val;
    if (key === 'name') {
      this.renderStepsList();
      this.renderCanvas();
      this.renderProps();
    } else {
      this.renderCanvas();
    }
    this.syncPreview();
    this.updateStatusBar();
  },

  updateStepType(i, newType) {
    this.saveHistory();
    const oldStep = this.steps[i];
    const defaults = {
      auto: { name: oldStep.name, type: 'auto', url: '/steps/' + oldStep.name, timeout_ms: 3000, retry: 1, on_failure: 'compensate' },
      human: { name: oldStep.name, type: 'human', actor: '$.payload.approver_email', action_url: '/approval/{execution_id}/' + oldStep.name, timeout_hours: 48, on_timeout: 'escalate', escalate_to: '', reminder_hours: [24, 40], decisions: [{ key: 'approved', label: 'Approuver', next: '' }, { key: 'rejected', label: 'Refuser', next: '' }] },
      condition: { name: oldStep.name, type: 'condition', evaluate: '', branches: [] },
      parallel: { name: oldStep.name, type: 'parallel', wait_for: 'all', steps: [] }
    };
    this.steps[i] = defaults[newType];
    this.refresh();
  },

  tryUpdateJson(i, key, val) {
    try { this.steps[i][key] = JSON.parse(val); this.syncPreview(); } catch (e) { }
  },

  updateDecision(stepIdx, decIdx, key, val) {
    this.steps[stepIdx].decisions[decIdx][key] = val;
    this.syncPreview();
    this.renderCanvas();
    this.renderStepsList();
  },

  addDecision(stepIdx) {
    if (!this.steps[stepIdx].decisions) this.steps[stepIdx].decisions = [];
    const nextStepName = this.steps[0]?.name || '';
    this.steps[stepIdx].decisions.push({ key: 'new_decision', label: 'Nouvelle décision', next: nextStepName });
    this.renderProps();
    this.syncPreview();
  },

  removeDecision(stepIdx, decIdx) {
    this.steps[stepIdx].decisions.splice(decIdx, 1);
    this.renderProps();
    this.syncPreview();
    this.renderCanvas();
  },

  addBranch(stepIdx) {
    if (!this.steps[stepIdx].branches) this.steps[stepIdx].branches = [];
    this.steps[stepIdx].branches.push({ condition: '', next: '' });
    this.renderProps();
    this.syncPreview();
  },

  updateBranch(stepIdx, branchIdx, key, val) {
    this.steps[stepIdx].branches[branchIdx][key] = val;
    this.syncPreview();
  },

  removeBranch(stepIdx, branchIdx) {
    this.steps[stepIdx].branches.splice(branchIdx, 1);
    this.renderProps();
    this.syncPreview();
    this.renderCanvas();
  },

  toggleParallelStep(stepIdx, stepName, checked) {
    if (!this.steps[stepIdx].steps) {
      this.steps[stepIdx].steps = [];
    }
    if (checked) {
      if (!this.steps[stepIdx].steps.includes(stepName)) {
        this.steps[stepIdx].steps.push(stepName);
      }
    } else {
      this.steps[stepIdx].steps = this.steps[stepIdx].steps.filter(s => s !== stepName);
    }
    this.syncPreview();
    this.renderCanvas();
  },

  openAddStepModal() {
    this.openModal('editor-overlay-add-step');
  },

  addStepOfType(type) {
    this.closeModal('editor-overlay-add-step');
    this.saveHistory();
    const n = this.steps.length + 1;
    const defaults = {
      auto: { name: `step-${n}`, type: 'auto', url: `/steps/step-${n}`, timeout_ms: 3000, retry: 1, retry_delay_ms: 0, on_failure: 'compensate' },
      human: { name: `approval-${n}`, type: 'human', actor: '$.payload.approver_email', action_url: `/approval/{execution_id}/step-${n}`, timeout_hours: 48, on_timeout: 'escalate', escalate_to: '', reminder_hours: [24, 40], decisions: [{ key: 'approved', label: 'Approuver', next: '' }, { key: 'rejected', label: 'Refuser', next: '' }] },
      condition: { name: `condition-${n}`, type: 'condition', evaluate: '$.results.step.data.value', branches: [{ condition: '>= 0', next: '' }, { condition: 'default', next: '' }] },
      parallel: { name: `parallel-${n}`, type: 'parallel', wait_for: 'all', steps: [] }
    };
    this.steps.push(defaults[type]);
    this.selectedStep = this.steps.length - 1;
    this.refresh();
    this.switchTab('steps');
    this.showToast(`Étape "${defaults[type].name}" ajoutée`, 'success', '+');
  },

  filterSteps(val) {
    this.searchQuery = val;
    this.renderStepsList();
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('editor-tab-steps').style.display = tab === 'steps' ? 'flex' : 'none';
    document.getElementById('editor-tab-steps').style.flexDirection = 'column';
    document.getElementById('editor-tab-config').style.display = tab === 'config' ? 'flex' : 'none';
    document.getElementById('editor-tab-config').style.flexDirection = 'column';
  },

  buildJson() {
    const notifOk = document.getElementById('wf-notif-ok').value;
    const notify = notifOk === 'both' ? ['email', 'slack'] : notifOk === 'none' ? [] : [notifOk];
    return {
      type: document.getElementById('wf-type').value || 'my_workflow',
      version: document.getElementById('wf-version').value || '1.0.0',
      base_url: document.getElementById('wf-base-url').value || '',
      steps: this.steps,
      on_complete: { notify, callback_url: document.getElementById('wf-cb-ok').value || '/bpm/callback' },
      on_failure: { notify: ['slack'], callback_url: document.getElementById('wf-cb-fail').value || '/bpm/callback', strategy: document.getElementById('wf-fail-strategy').value }
    };
  },

  syntaxHighlight(json) {
    const str = JSON.stringify(json, null, 2);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => {
      let cls = 'j-num';
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'j-key' : 'j-str';
      else if (/true|false/.test(m)) cls = 'j-bool';
      else if (/null/.test(m)) cls = 'j-null';
      return `<span class="${cls}">${m}</span>`;
    });
  },

  validate() {
    const errors = [];
    const wf = this.buildJson();

    if (!wf.type || wf.type.trim() === '') errors.push({ msg: 'Le type du workflow est requis', ctx: 'config' });
    if (!wf.base_url || wf.base_url.trim() === '') errors.push({ msg: 'La base URL est requise', ctx: 'config' });
    if (!this.steps.length) errors.push({ msg: 'Au moins une étape est requise', ctx: 'global' });

    const stepNames = new Set();
    this.steps.forEach((s, i) => {
      if (!s.name || s.name.trim() === '') errors.push({ msg: `Étape ${i + 1}: le nom est requis`, step: i });
      if (stepNames.has(s.name)) errors.push({ msg: `Étape "${s.name}": nom en double`, step: i });
      stepNames.add(s.name);
      
      if (s.type === 'auto' && !s.url) errors.push({ msg: `"${s.name}": l'URL est requise`, step: i });
      if (s.type === 'human') {
        if (!s.actor) errors.push({ msg: `"${s.name}": l'acteur est requis`, step: i });
        if (!s.decisions || !s.decisions.length) errors.push({ msg: `"${s.name}": au moins une décision est requise`, step: i });
        s.decisions?.forEach((d, di) => {
          if (!d.key) errors.push({ msg: `"${s.name}": décision ${di + 1} sans clé`, step: i });
          if (!d.next) errors.push({ msg: `"${s.name}": décision "${d.label}" sans étape suivante`, step: i });
        });
      }
      if (s.type === 'condition' && !s.evaluate) errors.push({ msg: `"${s.name}": l'expression JSONPath est requise`, step: i });
      if (s.type === 'parallel' && (!s.steps || s.steps.length === 0)) errors.push({ msg: `"${s.name}": au moins une étape parallèle est requise`, step: i });
    });

    const badge = document.getElementById('editor-validity-badge');
    const icon = document.getElementById('editor-validity-icon');
    const text = document.getElementById('editor-validity-text');

    if (!errors.length) {
      badge.className = 'editor-validity-badge valid';
      icon.textContent = '✓';
      text.textContent = 'Valide';
    } else {
      badge.className = 'editor-validity-badge invalid';
      icon.textContent = '✗';
      text.textContent = `${errors.length} erreur${errors.length > 1 ? 's' : ''}`;
      const list = document.getElementById('editor-errors-list');
      list.innerHTML = errors.map(e => `
        <div class="editor-error-item">
          <span class="editor-error-item-icon">✗</span>
          <span class="editor-error-item-text">${e.msg}</span>
          ${e.step != null ? `<button class="editor-btn" style="padding:2px 6px;font-size:9px;flex-shrink:0" onclick="WorkflowEditor.selectStep(${e.step});WorkflowEditor.closeModal('editor-overlay-errors')">→</button>` : ''}
        </div>
      `).join('');
      this.openModal('editor-overlay-errors');
    }
    return errors.length === 0;
  },

  syncPreview() {
    const wf = this.buildJson();
    document.getElementById('editor-json-output').innerHTML = this.syntaxHighlight(wf);
    document.getElementById('breadcrumb-type').textContent = wf.type || 'Nouveau workflow';
    document.getElementById('breadcrumb-version').textContent = 'v' + (wf.version || '1.0.0');
    this.updateStatusBar();
  },

  updateStatusBar() {
    const human = this.steps.filter(s => s.type === 'human').length;
    document.getElementById('sb-steps').innerHTML = `<div class="editor-status-dot" style="--c:var(--blue)"></div><span>${this.steps.length} étape${this.steps.length !== 1 ? 's' : ''}</span>`;
    document.getElementById('sb-human').innerHTML = `<div class="editor-status-dot" style="--c:var(--cyan)"></div><span>${human} humaine${human !== 1 ? 's' : ''}</span>`;
    document.getElementById('sb-time').textContent = new Date().toLocaleTimeString('fr-FR');
  },

  refresh() {
    this.renderStepsList();
    this.renderCanvas();
    this.renderProps();
    this.syncPreview();
  },

  async save() {
    const isValid = this.validate();
    if (!isValid) return;
    
    const wf = this.buildJson();
    this.showToast('Enregistrement...', 'info', '↑');

    try {
      await API.saveWorkflow(wf);
      this.currentWorkflowType = wf.type;
      this.showToast(`"${wf.type}" v${wf.version} enregistré`, 'success', '✓');
    } catch (e) {
      this.showToast('Erreur: ' + e.message, 'error', '✗');
    }
  },

  openPreviewModal() {
    this.syncPreview();
    this.openModal('editor-overlay-preview');
  },

  copyJson() {
    navigator.clipboard?.writeText(JSON.stringify(this.buildJson(), null, 2));
    this.showToast('JSON copié', 'success', '⎘');
  },

  downloadJson() {
    const blob = new Blob([JSON.stringify(this.buildJson(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (document.getElementById('wf-type').value || 'workflow') + '.json';
    a.click();
    this.showToast('Fichier téléchargé', 'success', '↓');
  },

  importJson() {
    const text = document.getElementById('editor-import-text').value.trim();
    if (!text) { this.showToast('Aucun JSON à importer', 'error', '✗'); return; }
    try {
      const wf = JSON.parse(text);
      if (wf.type) document.getElementById('wf-type').value = wf.type;
      if (wf.version) document.getElementById('wf-version').value = wf.version;
      if (wf.base_url) document.getElementById('wf-base-url').value = wf.base_url;
      if (Array.isArray(wf.steps) && wf.steps.length > 0) {
        this.saveHistory();
        this.steps = wf.steps;
        this.selectedStep = null;
        this.history = [];
        this.historyIndex = -1;
      } else {
        this.showToast('Le JSON doit contenir un tableau "steps"', 'error', '✗');
        return;
      }
      this.closeModal('editor-overlay-import');
      document.getElementById('editor-import-text').value = '';
      this.refresh();
      this.resetValidityBadge();
      this.showToast(`Workflow "${wf.type || '?'}" importé · ${this.steps.length} étapes`, 'success', '↑');
    } catch (e) {
      this.showToast('JSON invalide: ' + e.message, 'error', '✗');
    }
  },

  handleFileDrop(e) {
    e.preventDefault();
    const dropZone = document.getElementById('editor-drop-zone');
    if (dropZone) dropZone.classList.remove('drag-active');
    const file = e.dataTransfer.files[0];
    if (file) this.readFile(file);
  },

  handleFileInput(input) {
    const file = input.files[0];
    if (file) this.readFile(file);
  },

  readFile(file) {
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('editor-import-text').value = e.target.result; };
    reader.readAsText(file);
  },

  openModal(id) {
    if (id === 'editor-overlay-preview') this.syncPreview();
    document.getElementById(id).classList.add('open');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('open');
  },

  showToast(msg, type = 'success', icon = '') {
    const container = document.getElementById('editor-toast-container');
    const el = document.createElement('div');
    el.className = `editor-toast ${type}`;
    el.innerHTML = `
      ${icon ? `<span class="editor-toast-icon" style="color:${type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : 'var(--blue)'}">${icon}</span>` : ''}
      <span class="editor-toast-msg">${msg}</span>
      <button class="editor-toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
    }, 3000);
  },

  esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (!this.isEditorActive()) return;

      const tag = document.activeElement.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        document.querySelectorAll('.editor-overlay.open').forEach(o => o.classList.remove('open'));
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); this.undo(); return; }
        if (e.key === 'y') { e.preventDefault(); this.redo(); return; }
        if (e.key === 'n' && !isInput) { e.preventDefault(); this.openAddStepModal(); return; }
        if (e.key === 'd' && !isInput && this.selectedStep !== null) { e.preventDefault(); this.duplicateStep(this.selectedStep); return; }
        if (e.key === 's') { e.preventDefault(); this.save(); return; }
        if (e.key === 'j') { e.preventDefault(); this.openPreviewModal(); return; }
      }

      if (!isInput) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.selectedStep !== null) { e.preventDefault(); this.removeStep(this.selectedStep); }
          return;
        }
        if (e.altKey) {
          if (e.key === 'ArrowUp' && this.selectedStep !== null) { e.preventDefault(); this.moveStep(this.selectedStep, -1); return; }
          if (e.key === 'ArrowDown' && this.selectedStep !== null) { e.preventDefault(); this.moveStep(this.selectedStep, 1); return; }
        }
        if (e.key === 'ArrowUp' && this.selectedStep !== null && this.selectedStep > 0) { e.preventDefault(); this.selectStep(this.selectedStep - 1); return; }
        if (e.key === 'ArrowDown' && this.selectedStep !== null && this.selectedStep < this.steps.length - 1) { e.preventDefault(); this.selectStep(this.selectedStep + 1); return; }
      }
    });
  },

  dragIdx: null,

  onDragStart(e, i) {
    this.dragIdx = i;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => document.getElementById(`step-card-${i}`)?.classList.add('dragging'), 0);
  },

  onDragOver(e, i) {
    e.preventDefault();
    if (this.dragIdx === null || this.dragIdx === i) return;
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.editor-step-card').forEach(c => c.classList.remove('drag-over'));
    document.getElementById(`step-card-${i}`)?.classList.add('drag-over');
  },

  onDrop(e, i) {
    e.preventDefault();
    if (this.dragIdx === null || this.dragIdx === i) return;
    this.saveHistory();
    
    // Sauvegarder le nom de l'étape qui est à la position cible (avant le déplacement)
    const oldNameAtTarget = this.steps[i].name;
    
    // Déplacer l'étape à la nouvelle position
    const moved = this.steps.splice(this.dragIdx, 1)[0];
    this.steps.splice(i, 0, moved);
    
    // Le nom de l'étape qui est maintenant à la position i
    const newNameAtTarget = this.steps[i].name;
    
    // Mettre à jour les références qui pointaient vers l'ancienne étape à cette position
    this.steps.forEach((step) => {
      if (step.decisions) {
        step.decisions.forEach(d => {
          if (d.next === oldNameAtTarget) {
            d.next = newNameAtTarget;
          }
        });
      }
      if (step.branches) {
        step.branches.forEach(b => {
          if (b.next === oldNameAtTarget) {
            b.next = newNameAtTarget;
          }
        });
      }
    });
    
    // Mettre à jour selectedStep
    if (this.dragIdx < i) {
      if (this.selectedStep === this.dragIdx) this.selectedStep = i - 1;
    } else {
      if (this.selectedStep === this.dragIdx) this.selectedStep = i;
    }
    this.dragIdx = null;
    this.refresh();
  },

  onDragLeave(e, i) {
    document.getElementById(`step-card-${i}`)?.classList.remove('drag-over');
  },

  onDragEnd() {
    this.dragIdx = null;
    document.querySelectorAll('.editor-step-card').forEach(c => {
      c.classList.remove('dragging', 'drag-over');
    });
  }
};

WorkflowEditor.init();
