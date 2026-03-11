Pages.logs = {
  async load() {
    const data = await API.getAccessLogs(50);
    const tbody = document.getElementById('logs-table');
    
    if (!data.logs?.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">Aucun log</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.logs.map(l => `
      <tr>
        <td class="mono" style="color:var(--muted)">${Utils.formatDate(l.timestamp).split(' ')[1]}</td>
        <td>${l.client_id?.slice(0,8) || 'unknown'}</td>
        <td class="mono">${l.path}</td>
        <td style="color:var(--blue)">${l.method}</td>
        <td>${Components.badge(l.status_code < 400 ? 'COMPLETED' : 'FAILED')}</td>
        <td class="mono">${l.duration_ms}ms</td>
        <td class="mono" style="color:var(--muted)">${l.ip_address || '—'}</td>
      </tr>
    `).join('');
  }
};
