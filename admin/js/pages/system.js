Pages.system = {
  async load() {
    try {
      const data = await API.getSystemHealth();
      
      document.getElementById('sys-db-status').textContent = data.database.status === 'connected' ? 'OK' : 'ERR';
      document.getElementById('sys-db-status').style.color = data.database.status === 'connected' ? 'var(--green)' : 'var(--red)';
      document.getElementById('sys-db-latency').textContent = data.database.latency_ms ? `${data.database.latency_ms}ms` : '—';
      
      const q = data.queues;
      const totalWaiting = q.workflow.waiting + q.humanTimeout.waiting + q.reminder.waiting;
      const totalActive = q.workflow.active + q.humanTimeout.active + q.reminder.active;
      
      document.getElementById('sys-jobs-waiting').textContent = totalWaiting;
      document.getElementById('sys-jobs-active').textContent = totalActive;
      document.getElementById('sys-jobs-detail').textContent = `${q.workflow.waiting} · ${q.humanTimeout.waiting} · ${q.reminder.waiting}`;
      
      document.getElementById('sys-uptime').textContent = data.uptime.formatted;
      document.getElementById('sys-uptime-precise').textContent = `${data.uptime.days}d ${data.uptime.hours % 24}h ${data.uptime.minutes % 60}m ${data.uptime.seconds % 60}s`;
      
      document.getElementById('queues-table').innerHTML = 
        Components.queueRow('Workflow', q.workflow, 'blue') +
        Components.queueRow('Human Timeout', q.humanTimeout, 'orange') +
        Components.queueRow('Reminder', q.reminder, 'purple');
      
      const totalCompleted = q.workflow.completed + q.humanTimeout.completed + q.reminder.completed;
      const totalFailed = q.workflow.failed + q.humanTimeout.failed + q.reminder.failed;
      
      document.getElementById('sys-metrics').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="padding:16px;background:var(--bg3);border-radius:6px;text-align:center">
            <div style="font-size:24px;font-weight:700;font-family:var(--font-mono);color:var(--green)">${totalCompleted}</div>
            <div style="font-size:10px;color:var(--muted);letter-spacing:1px;margin-top:4px">JOBS COMPLÉTÉS</div>
          </div>
          <div style="padding:16px;background:var(--bg3);border-radius:6px;text-align:center">
            <div style="font-size:24px;font-weight:700;font-family:var(--font-mono);color:var(--red)">${totalFailed}</div>
            <div style="font-size:10px;color:var(--muted);letter-spacing:1px;margin-top:4px">JOBS ÉCHOUÉS</div>
          </div>
          <div style="padding:16px;background:var(--bg3);border-radius:6px;text-align:center">
            <div style="font-size:24px;font-weight:700;font-family:var(--font-mono);color:var(--blue)">${data.database.latency_ms || 0}ms</div>
            <div style="font-size:10px;color:var(--muted);letter-spacing:1px;margin-top:4px">LATENCE DB</div>
          </div>
          <div style="padding:16px;background:var(--bg3);border-radius:6px;text-align:center">
            <div style="font-size:24px;font-weight:700;font-family:var(--font-mono);color:var(--text)">${data.uptime.days}d</div>
            <div style="font-size:10px;color:var(--muted);letter-spacing:1px;margin-top:4px">UPTIME</div>
          </div>
        </div>
      `;
    } catch (e) {
      console.error('Failed to load system health:', e);
      App.showToast('Erreur chargement santé système');
    }
  }
};
