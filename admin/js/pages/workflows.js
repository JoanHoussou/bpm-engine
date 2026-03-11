Pages.workflows = {
  page: 0,
  limit: 10,
  search: '',

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
