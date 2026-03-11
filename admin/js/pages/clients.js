Pages.clients = {
  currentClients: [],
  search: '',

  async load() {
    const data = await API.getClients(this.search);
    this.currentClients = data.clients || [];
    
    const grid = document.getElementById('clients-grid');
    if (!this.currentClients.length) {
      grid.innerHTML = '<div class="empty">Aucun client</div>';
      return;
    }
    
    grid.innerHTML = this.currentClients.map((c, i) => Components.clientCard(c, i)).join('');
    
    // Populate API key modal select
    const select = document.getElementById('apikey-client-select');
    select.innerHTML = this.currentClients.map(c => `<option value="${c.client_id}">${c.name}</option>`).join('');
  },

  init() {
    this.search = '';
  },

  async create() {
    const name = document.getElementById('client-name').value;
    if (!name) return App.showToast('Veuillez entrer un nom');
    
    const scopes = [...document.querySelectorAll('#modal-client .cb-item.checked input')].map(i => i.parentElement.textContent.trim());
    
    await API.createClient(name, scopes);
    
    Modals.close('modal-client');
    App.showToast('Client "' + name + '" créé');
    Pages.dashboard.load();
    this.load();
  },

  async delete(clientId, clientName) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le client "${clientName}"?`)) return;
    await API.deleteClient(clientId);
    App.showToast('Client supprimé');
    this.load();
  }
};
