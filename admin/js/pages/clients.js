Pages.clients = {
  currentClients: [],
  search: '',
  editingClientId: null,
  allWorkflowTypes: [],

  async load() {
    const data = await API.getClients(this.search);
    this.currentClients = data.clients || [];
    
    // Load workflow types for the modal
    const workflowsData = await API.getWorkflows(100, 0, '');
    this.allWorkflowTypes = workflowsData.workflows.map(w => w.type);
    
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

  async openCreateModal() {
    this.editingClientId = null;
    document.getElementById('modal-client-title').textContent = 'Nouveau client';
    document.getElementById('modal-client-btn').textContent = 'Créer le client';
    document.getElementById('client-name').value = '';
    
    // Reset checkboxes
    document.querySelectorAll('#client-scopes-group input').forEach((cb, i) => {
      cb.checked = i < 2;
      cb.parentElement.classList.toggle('checked', cb.checked);
    });
    
    // Load workflow types
    this.renderAllowedTypes([]);
    
    Modals.open('modal-client');
  },

  async openEditModal(client) {
    this.editingClientId = client.client_id;
    document.getElementById('modal-client-title').textContent = 'Modifier le client';
    document.getElementById('modal-client-btn').textContent = 'Enregistrer';
    document.getElementById('client-name').value = client.name;
    
    // Set scope checkboxes
    const scopes = client.scopes || [];
    document.querySelectorAll('#client-scopes-group input').forEach((cb) => {
      cb.checked = scopes.includes(cb.value);
      cb.parentElement.classList.toggle('checked', cb.checked);
    });
    
    // Load workflow types with current selection
    const allowedTypes = client.allowed_types || [];
    this.renderAllowedTypes(allowedTypes);
    
    Modals.open('modal-client');
  },

  renderAllowedTypes(selectedTypes = []) {
    const container = document.getElementById('allowed-types-group');
    const search = document.getElementById('allowed-types-search')?.value?.toLowerCase() || '';
    
    const filtered = this.allWorkflowTypes.filter(t => t.toLowerCase().includes(search));
    
    container.innerHTML = filtered.map(type => {
      const isSelected = selectedTypes.includes(type);
      return `<label class="cb-item ${isSelected ? 'checked' : ''}" onclick="Pages.clients.filterAllowedTypes()">
        <input type="checkbox" ${isSelected ? 'checked' : ''} value="${type}" onchange="this.parentElement.classList.toggle('checked', this.checked)">${type}
      </label>`;
    }).join('');
    
    if (filtered.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:11px">Aucun type trouvé</div>';
    }
  },

  filterAllowedTypes(query) {
    const selectedTypes = this.getSelectedAllowedTypes();
    this.renderAllowedTypes(selectedTypes);
  },

  getSelectedAllowedTypes() {
    return [...document.querySelectorAll('#allowed-types-group input[type="checkbox"]:checked')].map(i => i.value);
  },

  async save() {
    const name = document.getElementById('client-name').value;
    if (!name) return App.showToast('Veuillez entrer un nom');
    
    const scopes = [...document.querySelectorAll('#client-scopes-group input[type="checkbox"]:checked')].map(i => i.value);
    const allowedTypes = this.getSelectedAllowedTypes();
    
    if (this.editingClientId) {
      await API.updateClient(this.editingClientId, { name, scopes, allowed_types: allowedTypes });
      App.showToast('Client mis à jour');
    } else {
      await API.createClient(name, scopes, allowedTypes);
      App.showToast('Client "' + name + '" créé');
    }
    
    Modals.close('modal-client');
    this.load();
  },

  async create() {
    const name = document.getElementById('client-name').value;
    if (!name) return App.showToast('Veuillez entrer un nom');
    
    const scopes = [...document.querySelectorAll('#client-scopes-group input[type="checkbox"]:checked')].map(i => i.value);
    const allowedTypes = this.getSelectedAllowedTypes();
    
    await API.createClient(name, scopes, allowedTypes);
    
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
