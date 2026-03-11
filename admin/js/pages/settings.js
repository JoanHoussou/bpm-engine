Pages.settings = {
  clients: [],
  config: null,
  health: null,

  async load() {
    const [settingsData, healthData, clientsData] = await Promise.all([
      API.getSettings(),
      API.getSystemHealth(),
      API.getClients()
    ]);

    this.config = settingsData.config || {};
    this.health = healthData;
    this.clients = clientsData.clients || [];

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('setting-timeout', this.config.defaultTimeoutMs || 30000);
    setVal('setting-retries', this.config.defaultRetries || 2);
    setVal('setting-human-timeout', this.config.humanTimeoutHours || 72);
    setVal('setting-callback', this.config.globalErrorCallbackUrl || '');

    if (healthData.smtp) {
      setVal('setting-smtp-host', healthData.smtp.host || '');
      setVal('setting-smtp-port', healthData.smtp.port || 587);
      setVal('setting-smtp-user', healthData.smtp.user || '');
      setVal('setting-smtp-from', healthData.smtp.from || '');
    }

    this.renderSystemStatus(healthData);
    await this.renderClientSettings();
  },

  renderSystemStatus(health) {
    const html = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px">Moteur BPM</span>
          <span class="badge completed">Opérationnel</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px">PostgreSQL</span>
          <span class="badge ${health.postgresql === 'ok' ? 'completed' : 'failed'}">${health.postgresql === 'ok' ? 'Connecté' : 'Erreur'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px">Redis (cache)</span>
          <span class="badge ${health.redis === 'ok' ? 'completed' : 'failed'}">${health.redis === 'ok' ? 'Connecté' : 'Erreur'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px">Queue workers</span>
          <span class="badge completed">${health.workers || 4} actifs</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px">Notifications email</span>
          <span class="badge ${health.smtp?.configured ? 'completed' : 'waiting'}">${health.smtp?.configured ? 'Configuré' : 'Non configuré'}</span>
        </div>
      </div>
    `;
    document.getElementById('system-status').innerHTML = html;
  },

  async renderClientSettings() {
    const tbody = document.getElementById('client-settings-table');
    if (!tbody) return;
    
    if (!this.clients.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Aucun client</td></tr>';
      return;
    }

    const clientSettingsPromises = this.clients.map(c => API.getClientSettings(c.client_id));
    const allSettings = await Promise.all(clientSettingsPromises);

    tbody.innerHTML = this.clients.map((c, i) => {
      const s = allSettings[i].settings;
      return `
        <tr>
          <td>${c.name}</td>
          <td><input type="number" class="form-input" style="width:100px" 
            value="${s?.defaultTimeoutMs || this.config.defaultTimeoutMs || 30000}"
            data-client="${c.client_id}" data-field="defaultTimeoutMs"></td>
          <td><input type="number" class="form-input" style="width:70px" 
            value="${s?.defaultRetries || this.config.defaultRetries || 2}"
            data-client="${c.client_id}" data-field="defaultRetries"></td>
          <td><input type="number" class="form-input" style="width:70px" 
            value="${s?.humanTimeoutHours || this.config.humanTimeoutHours || 72}"
            data-client="${c.client_id}" data-field="humanTimeoutHours"></td>
          <td><input type="text" class="form-input" style="width:200px" 
            value="${s?.callbackUrl || ''}" placeholder="https://..."
            data-client="${c.client_id}" data-field="callbackUrl"></td>
          <td><button class="tb-btn" onclick="Pages.settings.saveClient('${c.client_id}')">Sauvegarder</button></td>
        </tr>
      `;
    }).join('');
  },

  async save() {
    const timeoutMs = parseInt(document.getElementById('setting-timeout')?.value || 30000);
    const retries = parseInt(document.getElementById('setting-retries')?.value || 2);
    const humanTimeout = parseInt(document.getElementById('setting-human-timeout')?.value || 72);
    const callback = document.getElementById('setting-callback')?.value || '';

    const smtpHost = document.getElementById('setting-smtp-host')?.value || '';
    const smtpPort = parseInt(document.getElementById('setting-smtp-port')?.value || 587);
    const smtpUser = document.getElementById('setting-smtp-user')?.value || '';
    const smtpPass = document.getElementById('setting-smtp-pass')?.value || '';
    const smtpFrom = document.getElementById('setting-smtp-from')?.value || '';

    const promises = [
      API.saveSetting('defaultTimeoutMs', timeoutMs, 'Timeout global par défaut en ms'),
      API.saveSetting('defaultRetries', retries, 'Nombre de retries par défaut'),
      API.saveSetting('humanTimeoutHours', humanTimeout, 'Timeout humain par défaut en heures'),
      API.saveSetting('globalErrorCallbackUrl', callback || null, 'URL de callback erreur globale')
    ];

    if (smtpHost) {
      promises.push(API.saveSetting('smtpHost', smtpHost, 'Hôte SMTP'));
      promises.push(API.saveSetting('smtpPort', smtpPort, 'Port SMTP'));
      promises.push(API.saveSetting('smtpUser', smtpUser, 'Utilisateur SMTP'));
      if (smtpPass) {
        promises.push(API.saveSetting('smtpPass', smtpPass, 'Mot de passe SMTP'));
      }
      promises.push(API.saveSetting('smtpFrom', smtpFrom, 'Adresse expéditeur SMTP'));
    }

    await Promise.all(promises);

    this.config = { defaultTimeoutMs: timeoutMs, defaultRetries: retries, humanTimeoutHours: humanTimeout, globalErrorCallbackUrl: callback };
    this.health = await API.getSystemHealth();
    this.renderSystemStatus(this.health);
    App.showToast('Configuration sauvegardée');
  },

  async saveClient(clientId) {
    const rows = document.querySelectorAll('#client-settings-table tr');
    let data = {};

    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      inputs.forEach(input => {
        if (input.dataset.client === clientId) {
          const field = input.dataset.field;
          const value = input.type === 'number' ? parseInt(input.value) : input.value;
          if (field === 'callbackUrl' && !value) return;
          data[field] = value;
        }
      });
    });

    await API.updateClientSettings(clientId, data);
    App.showToast('Paramètres client sauvegardés');
  }
};
