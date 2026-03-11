const Components = {
  badge(status) {
    return `<span class="badge ${status}">${status}</span>`;
  },

  toggleCheckbox(el) {
    el.classList.toggle('checked');
  },

  statCard(label, value, sub, icon, color) {
    return `
      <div class="stat-card" style="--c:var(--${color})">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-sub">${sub}</div>
        <div class="stat-icon">${icon}</div>
      </div>
    `;
  },

  clientCard(client, index) {
    const colors = ['#2D7EF8,#8B5CF6', '#10B981,#06B6D4', '#F59E0B,#EF4444', '#8B5CF6,#EC4899'];
    const initials = client.name.slice(0, 2).toUpperCase();
    
    return `
      <div class="client-card">
        <div class="client-card-top">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="client-avatar" style="background:linear-gradient(135deg,${colors[index % colors.length]})">${initials}</div>
            <div>
              <div class="client-name">${Utils.escapeHtml(client.name)}</div>
              <div class="client-id">${client.client_id?.slice(0, 12)}...</div>
            </div>
          </div>
          <span class="badge completed">Actif</span>
        </div>
        <div class="client-meta">
          ${(client.scopes || []).map(s => `<span class="client-tag">${s}</span>`).join('')}
        </div>
      </div>
    `;
  },

  keyRow(key) {
    const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
    const expiry = key.expires_at 
      ? Utils.formatDateShort(key.expires_at)
      : 'Illimitée';
    
    return `
      <div class="key-row">
        <div style="width:8px;height:8px;border-radius:50%;background:${isExpired ? 'var(--red)' : 'var(--green)'};box-shadow:0 0 5px ${isExpired ? 'var(--red)' : 'var(--green)'}"></div>
        <div>
          <div class="key-prefix">${Utils.escapeHtml(key.key_prefix)}<span class="key-masked">••••••••••••••••••••••••</span></div>
          <div class="key-scope" style="margin-top:3px">${Utils.escapeHtml(key.client_name)} · ${(key.scopes || []).join(', ')}</div>
        </div>
        <div style="font-size:10px;color:${isExpired ? 'var(--red)' : 'var(--green)'};font-family:var(--font-mono)">${expiry}</div>
        <div class="key-actions">
          <button class="key-btn" onclick="Pages.apikeys.copyPrefix('${Utils.escapeHtml(key.key_prefix)}')">Copier prefix</button>
          <button class="key-btn danger" onclick="Pages.apikeys.revoke('${key.key_id}', '${key.client_id}')">Révoquer</button>
        </div>
      </div>
    `;
  },

  queueRow(name, counts, color) {
    return `
      <tr>
        <td><span style="color:var(--${color})">${name}</span></td>
        <td class="mono">${counts.waiting}</td>
        <td class="mono">${counts.active}</td>
        <td class="mono">${counts.completed}</td>
        <td class="mono" style="color:${counts.failed > 0 ? 'var(--red)' : 'var(--muted)'}">${counts.failed}</td>
      </tr>
    `;
  },

  executionRow(exec, onClick = true) {
    const clickAttr = onClick ? `onclick="Pages.executions.showDetail('${exec.execution_id}')"` : '';
    return `
      <tr ${clickAttr}>
        <td><span class="mono">${Utils.truncate(exec.execution_id, 18)}</span></td>
        <td><span style="font-size:11px;color:var(--blue)">${Utils.escapeHtml(exec.type)}</span></td>
        <td>${Utils.escapeHtml(exec.client_name)}</td>
        <td>${this.badge(exec.status)}</td>
        <td style="font-size:11px;color:var(--muted)">${exec.current_step || '—'}</td>
        <td class="mono" style="color:var(--muted)">${Utils.formatDate(exec.started_at)}</td>
      </tr>
    `;
  },

  pagination(currentPage, totalPages, total, loadFn) {
    if (totalPages <= 1) return '';
    return `
      <button class="tb-btn" onclick="${loadFn}(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>← Précédent</button>
      <span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page ${currentPage + 1} / ${totalPages} · ${total} total</span>
      <button class="tb-btn" onclick="${loadFn}(${currentPage + 1})" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Suivant →</button>
    `;
  }
};
