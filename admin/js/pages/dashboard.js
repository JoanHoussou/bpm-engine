Pages.dashboard = {
    async load() {
      try {
        const [stats, clients, executions, workflows] = await Promise.all([
          API.getStats('24h'),
          API.getClients(),
          API.getExecutions(10, 0),
          API.getWorkflows()
        ]);

        document.getElementById('stat-executions').textContent = Utils.formatNumber(stats.total_executions);
        document.getElementById('stat-success-rate').textContent = stats.success_rate + '%';
        document.getElementById('stat-waiting').textContent = stats.waiting_human;
        document.getElementById('stat-clients').textContent = stats.active_clients;

        const failed = stats.total_executions - Math.round(stats.total_executions * stats.success_rate / 100);
        document.getElementById('stat-success-sub').textContent = `${failed} échecs · 24h`;
        document.getElementById('stat-waiting-sub').textContent = `${stats.waiting_human} en attente`;
        document.getElementById('stat-clients-sub').textContent = `${workflows.workflows?.length || 0} workflows`;

        if (stats.waiting_human > 0) {
          const badge = document.getElementById('nav-waiting-badge');
          badge.textContent = stats.waiting_human;
          badge.style.display = 'block';
        } else {
          document.getElementById('nav-waiting-badge').style.display = 'none';
        }

        this.buildActivityChart(stats.activity_7d || []);
        this.buildWorkflowTypesChart(stats.executions_by_type || []);
        this.buildRecentExecutionsTable(executions.executions || []);
        this.populateFilterTypes(workflows.workflows || []);
        
        document.getElementById('live-badge').style.display = 'flex';
        document.getElementById('uptime').textContent = 'uptime ' + new Date().toLocaleTimeString('fr-FR');
      } catch (e) {
        console.error('Dashboard load error:', e);
      }
    },

    buildActivityChart(data) {
      const container = document.getElementById('chart');
      if (!data || !data.length) {
        container.innerHTML = '<div class="empty" style="grid-column:1/-1">Aucune donnée</div>';
        return;
      }
      
      const max = Math.max(...data.map(d => d.completed + d.waiting + d.failed), 1);
      
      container.innerHTML = data.map(d => {
        const total = d.completed + d.waiting + d.failed;
        const h = Math.max(Math.round((total / max) * 350), 10);
        const hc = Math.round((d.completed / total) * h);
        const hw = Math.round((d.waiting / total) * h);
        const hf = h - hc - hw;
        const dayLabel = new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short' });
        const dateLabel = new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
        return `<div class="bar-wrap" title="${dateLabel}: ${total} executions">
          <div style="display:flex;flex-direction:column;gap:3px;width:100%;align-items:stretch">
            <div class="bar" style="height:${Math.max(hf,3)}px;background:var(--red);opacity:0.8"></div>
            <div class="bar" style="height:${Math.max(hw,3)}px;background:var(--orange);opacity:0.8"></div>
            <div class="bar" style="height:${Math.max(hc,3)}px;background:var(--blue)"></div>
          </div>
          <div class="bar-label" title="${dateLabel}">${dayLabel}</div>
        </div>`;
      }).join('');
    },

    buildWorkflowTypesChart(data) {
      const container = document.getElementById('workflow-types');
      if (!data.length) {
        container.innerHTML = '<div class="empty">Aucune donnée</div>';
        return;
      }
      const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
      const total = sortedData.reduce((sum, d) => sum + d.count, 0);
      const colors = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)', 'var(--cyan)', 'var(--red)'];
      container.innerHTML = sortedData.map((d, i) => `
        <div class="wf-type-row">
          <div class="wf-type-name">${d.type}</div>
          <div class="wf-bar"><div class="wf-fill" style="width:${(d.count/total*100)}%;background:${colors[i%colors.length]}"></div></div>
          <div class="wf-type-count">${d.count}</div>
        </div>
      `).join('');
    },

    buildRecentExecutionsTable(executions) {
      const tbody = document.getElementById('recent-executions');
      if (!executions.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">Aucune exécution</td></tr>';
        return;
      }
      tbody.innerHTML = executions.map(e => {
        const duration = e.started_at && e.completed_at 
          ? Math.round((new Date(e.completed_at) - new Date(e.started_at)) / 1000)
          : null;
        return `
        <tr>
          <td class="mono">${(e.execution_id || '').slice(0,8)}</td>
          <td>${e.type}</td>
          <td>${Components.badge(e.status)}</td>
          <td class="mono">${Utils.formatDuration(duration ? duration * 1000 : null)}</td>
          <td class="mono" style="color:var(--muted)">${Utils.formatDate(e.started_at).split(' ')[1]}</td>
        </tr>
      `}).join('');
    },

    populateFilterTypes(workflows) {
      const select = document.getElementById('filter-workflow');
      if (!select) return;
      select.innerHTML = '<option value="">Tous les workflows</option>' + 
        workflows.map(w => `<option value="${w.type}">${w.type}</option>`).join('');
    }
  };
