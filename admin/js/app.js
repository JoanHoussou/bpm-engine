const Modals = {
  open(id) {
    document.getElementById(id).classList.add('open');
  },
  
  close(id) {
    document.getElementById(id).classList.remove('open');
  }
};

const App = {
  pages: {
    dashboard: Pages.dashboard,
    executions: Pages.executions,
    workflows: Pages.workflows,
    clients: Pages.clients,
    apikeys: Pages.apikeys,
    system: Pages.system,
    settings: Pages.settings,
    logs: Pages.logs
  },

  titles: {
    dashboard: ['Dashboard', 'Vue d\'ensemble du moteur BPM'],
    executions: ['Exécutions', 'Suivi temps réel des exécutions'],
    workflows: ['Workflows', 'Registre des workflows déclarés'],
    clients: ['Clients', 'Applications connectées au moteur'],
    apikeys: ['API Keys', 'Gestion des clés d\'accès'],
    system: ['Santé système', 'Métriques et statut des services'],
    settings: ['Paramètres', 'Configuration du moteur et par client'],
    logs: ['Logs d\'accès', 'Audit trail en temps réel']
  },

  init() {
    this.setupNavigation();
    this.setupTheme();
    this.setupGlobalSearch();
    this.checkAuth();
    this.setupAutoRefresh();
  },

  setupGlobalSearch() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;
    
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = searchInput.value.toLowerCase().trim();
        const activePage = document.querySelector('.section.active')?.id?.replace('section-', '');
        
        if (activePage === 'workflows' && Pages.workflows?.load) {
          Pages.workflows.search = query;
          Pages.workflows.load(0);
        } else if (activePage === 'executions' && Pages.executions?.load) {
          Pages.executions.search = query;
          Pages.executions.load(0);
        } else if (activePage === 'clients' && Pages.clients?.load) {
          Pages.clients.search = query;
          Pages.clients.load();
        } else if (activePage === 'apikeys' && Pages.apikeys?.load) {
          Pages.apikeys.search = query;
          Pages.apikeys.load();
        } else if (activePage === 'settings' && Pages.settings?.load) {
          Pages.settings.search = query;
          Pages.settings.load();
        }
      }, 300);
    });
  },

  setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        this.navigate(page);
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });
  },

  navigate(page) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`section-${page}`)?.classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    
    const title = this.titles[page] || [page, ''];
    document.getElementById('page-title').textContent = title[0];
    document.getElementById('page-sub').textContent = title[1];
    
    document.getElementById('global-search').value = '';
    
    if (page !== 'dashboard') {
      document.getElementById('nav-waiting-badge').style.display = 'none';
    }

    if (this.pages[page]?.init) {
      this.pages[page].init();
    }
    
    if (this.pages[page]?.load) {
      this.pages[page].load();
    }
  },

  setupTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.getElementById('theme-toggle').textContent = '☀️';
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    document.getElementById('theme-toggle').textContent = next === 'light' ? '☀️' : '🌙';
  },

  checkAuth() {
    const secret = sessionStorage.getItem('adminSecret') || localStorage.getItem('adminSecret');
    if (!secret) {
      const input = prompt('Entrez votre X-Admin-Secret:');
      if (input) {
        sessionStorage.setItem('adminSecret', input);
      }
    }
    this.navigate('dashboard');
  },

  setupAutoRefresh() {
    setInterval(() => {
      const activePage = document.querySelector('.section.active')?.id?.replace('section-', '');
      if (activePage && this.pages[activePage]?.load) {
        this.pages[activePage].load();
      }
    }, 30000);
  },

  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = '✓  ' + msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
