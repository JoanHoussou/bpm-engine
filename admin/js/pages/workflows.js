Pages.workflows = {
  page: 0,
  limit: 10,
  search: '',
  allWorkflows: [],

  async load(page = 0) {
    this.page = page;
    const offset = page * this.limit;
    const search = this.search;

    const data = await API.getWorkflows(this.limit, offset, search);
    const tbody = document.getElementById('workflows-table');
    
    if (!data.workflows?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Aucun workflow</td></tr>';
      document.getElementById('workflows-pagination').innerHTML = '';
      return;
    }
    
    this.allWorkflows = data.workflows;
    
    tbody.innerHTML = data.workflows.map(w => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--blue)">${w.type}</span></td>
        <td class="mono">${w.version}</td>
        <td class="mono">${w.step_count}</td>
        <td class="mono" style="color:var(--cyan)">${w.human_step_count}</td>
        <td class="mono" style="color:var(--muted)">${Utils.formatDate(w.updated_at)}</td>
        <td>
          <button class="tb-btn" onclick="event.stopPropagation();Pages.workflows.editWorkflow('${w.type}')">✎ Éditer</button>
        </td>
      </tr>
    `).join('');

    const total = data.total || 0;
    const pages = Math.ceil(total / this.limit);
    document.getElementById('workflows-pagination').innerHTML = Components.pagination(page, pages, total, 'Pages.workflows.load');
  },

  init() {
    this.search = '';
    this.loadExecuteModal();
  },

  async loadExecuteModal() {
    const data = await API.getWorkflows(100, 0, '');
    const select = document.getElementById('execute-workflow-type');
    if (!select) return;
    
    this.allWorkflows = data.workflows || [];
    select.innerHTML = '<option value="">Sélectionner un type...</option>' + 
      this.allWorkflows.map(w => `<option value="${w.type}">${w.type}</option>`).join('');
  },

  updatePayloadTemplate() {
    const type = document.getElementById('execute-workflow-type').value;
    const textarea = document.getElementById('execute-workflow-payload');
    
    const workflow = this.allWorkflows.find(w => w.type === type);
    if (workflow && workflow.steps && workflow.steps.length > 0) {
      const firstStep = workflow.steps[0];
      if (firstStep.config && firstStep.config.samplePayload) {
        textarea.value = JSON.stringify(firstStep.config.samplePayload, null, 2);
      } else {
        textarea.value = '{\n  \n}';
      }
    } else {
      textarea.value = '{\n  \n}';
    }
  },

  async execute() {
    const type = document.getElementById('execute-workflow-type').value;
    const payloadStr = document.getElementById('execute-workflow-payload').value;
    
    if (!type) {
      return App.showToast('Veuillez sélectionner un type de workflow');
    }
    
    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      return App.showToast('Payload JSON invalide');
    }
    
    try {
      const result = await API.executeWorkflow(type, payload);
      App.showToast('Workflow exécuté: ' + result.execution_id);
      Modals.close('modal-execute-workflow');
      Pages.dashboard.load();
      Pages.executions.load();
    } catch (e) {
      App.showToast('Erreur: ' + (e.error || e.message));
    }
  },

  openResumeModal(executionId) {
    document.getElementById('resume-execution-id').value = executionId;
    document.querySelectorAll('#resume-decision-group input').forEach(cb => {
      cb.checked = false;
      cb.parentElement.classList.remove('checked');
    });
    document.getElementById('resume-comment').value = '';
    Modals.open('modal-resume-workflow');
  },

  async resume() {
    const executionId = document.getElementById('resume-execution-id').value;
    const decisionCheckbox = document.querySelector('#resume-decision-group input:checked');
    const comment = document.getElementById('resume-comment').value;
    
    if (!executionId) {
      return App.showToast('ID d\'exécution manquant');
    }
    
    if (!decisionCheckbox) {
      return App.showToast('Veuillez sélectionner une décision');
    }
    
    const decision = decisionCheckbox.value;
    
    try {
      const result = await API.resumeWorkflow(executionId, decision, comment || null);
      App.showToast('Workflow repris: ' + result.status);
      Modals.close('modal-resume-workflow');
      Pages.executions.load(Pages.executions.page);
    } catch (e) {
      App.showToast('Erreur: ' + (e.error || e.message));
    }
  },

  createNew() {
    WorkflowEditor.showEditor(null);
  },

  editWorkflow(type) {
    WorkflowEditor.showEditor(type);
  },

  showList() {
    WorkflowEditor.showList();
  }
};
