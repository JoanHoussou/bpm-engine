Pages.apikeys = {
  search: '',

  async load() {
    const data = await API.getKeys(this.search);
    const keys = data.keys || [];
    
    if (!keys.length) {
      document.getElementById('apikeys-list').innerHTML = '<div class="empty">Aucune API Key</div>';
      return;
    }
    
    document.getElementById('apikeys-list').innerHTML = keys.map(k => Components.keyRow(k)).join('');
  },

  init() {
    this.search = '';
  },

  async generate() {
    const clientId = document.getElementById('apikey-client-select').value;
    const expires = document.getElementById('apikey-expires').value;
    const scopes = [...document.querySelectorAll('#apikey-scopes .cb-item.checked input')].map(i => i.parentElement.textContent.trim());
    
    const expiresAt = expires ? new Date(Date.now() + parseInt(expires) * 24 * 60 * 60 * 1000).toISOString() : undefined;
    
    const result = await API.generateKey(clientId, scopes, expiresAt);
    
    document.getElementById('generated-key').textContent = result.api_key;
    document.getElementById('apikey-result').style.display = 'block';
    document.getElementById('apikey-btn').textContent = 'Copier';
    document.getElementById('apikey-btn').onclick = () => {
      navigator.clipboard?.writeText(result.api_key);
      App.showToast('Clé copiée!');
    };
  },

  resetForm() {
    document.getElementById('apikey-result').style.display = 'none';
    document.getElementById('apikey-btn').textContent = 'Générer la clé';
    document.getElementById('apikey-btn').onclick = () => Pages.apikeys.generate();
  },

  copyPrefix(prefix) {
    navigator.clipboard?.writeText(prefix);
    App.showToast('Prefix copié!');
  },

  async revoke(keyId, clientId) {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé?')) return;
    await API.revokeKey(clientId, keyId);
    App.showToast('Clé révoquée');
    this.load();
  }
};
