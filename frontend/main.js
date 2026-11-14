/**
 * FEIRA VIRTUAL — Frontend Client & API Integration
 * Conexão completa com o Django REST Framework backend
 */

// Auto-detecção da URL base da API
const API_BASE = window.location.port === '8000' 
  ? '/api' 
  : 'http://127.0.0.1:8000/api';

// Estado global da aplicação
const state = {
  user: null,
  tokens: {
    access: localStorage.getItem('fv_access_token'),
    refresh: localStorage.getItem('fv_refresh_token'),
  },
  cart: { itens: [], total: '0.00' },
  categories: [],
  selectedCategory: '',
  searchQuery: '',
  tipoProducao: '',
  ordering: 'nome',
};

// ==========================================
// 1. HELPER DE REQUISIÇÕES (com autenticação)
// ==========================================
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.tokens.access) {
    headers['Authorization'] = `Bearer ${state.tokens.access}`;
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    console.error('Falha de conexão com a API:', err);
    throw new Error('Não foi possível conectar ao servidor. Verifique se o Django está em execução.');
  }

  // Se o token expirou (401), tenta refresh automático
  if (response.status === 401 && state.tokens.refresh && !options._retry) {
    const refreshed = await refreshToken();
    if (refreshed) {
      options._retry = true;
      return apiFetch(endpoint, options);
    }
  }

  return response;
}

async function refreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: state.tokens.refresh }),
    });
    if (res.ok) {
      const data = await res.json();
      state.tokens.access = data.access;
      localStorage.setItem('fv_access_token', data.access);
      return true;
    }
  } catch (e) {
    console.error('Falha ao renovar token:', e);
  }
  logoutLocal();
  return false;
}

// ==========================================
// 2. AUTENTICAÇÃO E PERFIL DO USUÁRIO
// ==========================================
async function checkAuth() {
  if (!state.tokens.access) {
    renderAuthArea();
    return;
  }

  try {
    const res = await apiFetch('/perfil/');
    if (res.ok) {
      state.user = await res.json();
      renderAuthArea();
      if (state.user.tipo === 'CLIENTE') {
        loadCart();
      }
    } else {
      logoutLocal();
    }
  } catch (err) {
    console.warn('Sessão offline ou inválida');
    renderAuthArea();
  }
}

async function loginUser(username, password) {
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.detail || 'Usuário ou senha incorretos.';
    throw new Error(msg);
  }

  state.tokens.access = data.access;
  state.tokens.refresh = data.refresh;
  localStorage.setItem('fv_access_token', data.access);
  localStorage.setItem('fv_refresh_token', data.refresh);

  await checkAuth();
  showToast('Login realizado com sucesso!', 'success');
}

async function registerUser(payload) {
  const res = await fetch(`${API_BASE}/auth/registro/cliente/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    // Extrai mensagem de validação do Django
    let msg = 'Erro no cadastro.';
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        msg = `${keys[0]}: ${Array.isArray(data[keys[0]]) ? data[keys[0]][0] : data[keys[0]]}`;
      }
    }
    throw new Error(msg);
  }

  // Faz login automático após cadastro
  await loginUser(payload.username, payload.password);
  showToast('Conta criada com sucesso! Bem-vindo(a) à feira!', 'success');
}

async function logout() {
  if (state.tokens.refresh) {
    try {
      await apiFetch('/auth/logout/', {
        method: 'POST',
        body: JSON.stringify({ refresh: state.tokens.refresh }),
      });
    } catch (e) {
      // Ignora erro no logout
    }
  }
  logoutLocal();
  showToast('Você saiu da sua conta.', 'info');
}

function logoutLocal() {
  state.user = null;
  state.tokens = { access: null, refresh: null };
  state.cart = { itens: [], total: '0.00' };
  localStorage.removeItem('fv_access_token');
  localStorage.removeItem('fv_refresh_token');
  renderAuthArea();
  updateCartBadge();
}

function renderAuthArea() {
  const area = document.getElementById('navAuthArea');
  const mobileArea = document.getElementById('mobileAuthArea');

  if (state.user) {
    const initials = (state.user.first_name?.[0] || state.user.username[0] || 'U').toUpperCase();
    const roleLabel = {
      'CLIENTE': 'Cliente',
      'PRODUTOR': 'Produtor',
      'ENTREGADOR': 'Entregador',
      'ADMIN': 'Admin',
    }[state.user.tipo] || state.user.tipo;

    const html = `
      <div class="user-chip" title="Logado como ${state.user.username}">
        <span class="user-chip__avatar">${initials}</span>
        <span class="user-chip__name">${state.user.first_name || state.user.username}</span>
        <span class="user-chip__role">(${roleLabel})</span>
        <button class="user-chip__logout" id="btnLogout" title="Sair da conta" aria-label="Sair">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    `;

    area.innerHTML = html;
    mobileArea.innerHTML = `
      <div style="padding: 10px; font-weight: 600;">Olá, ${state.user.first_name || state.user.username} (${roleLabel})</div>
      <button class="btn btn--outline btn--full" id="btnMobileLogout">Sair da conta</button>
    `;

    document.getElementById('btnLogout')?.addEventListener('click', logout);
    document.getElementById('btnMobileLogout')?.addEventListener('click', logout);
  } else {
    area.innerHTML = `
      <button class="btn btn--outline btn--sm" id="btnOpenLogin">Entrar</button>
      <button class="btn btn--primary btn--sm" id="btnOpenRegister">Cadastrar</button>
    `;
    mobileArea.innerHTML = `
      <button class="btn btn--outline btn--full" id="btnMobileLogin">Entrar</button>
      <button class="btn btn--primary btn--full" id="btnMobileRegister">Cadastrar</button>
    `;

    document.getElementById('btnOpenLogin')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('btnOpenRegister')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('btnMobileLogin')?.addEventListener('click', () => { closeMobileMenu(); openAuthModal('login'); });
    document.getElementById('btnMobileRegister')?.addEventListener('click', () => { closeMobileMenu(); openAuthModal('register'); });
  }
}

// ==========================================
// 3. CARREGAMENTO DO CATÁLOGO DE PRODUTOS
// ==========================================
async function loadCategories() {
  try {
    const res = await apiFetch('/categorias/');
    if (res.ok) {
      state.categories = await res.json();
      renderCategoryPills();
    }
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

function renderCategoryPills() {
  const container = document.getElementById('categoryPills');
  const activeClass = (id) => (state.selectedCategory === String(id) ? 'active' : '');

  let pillsHtml = `
    <button class="pill ${state.selectedCategory === '' ? 'active' : ''}" data-category="">
      Todas as categorias
    </button>
  `;

  state.categories.forEach(cat => {
    pillsHtml += `
      <button class="pill ${activeClass(cat.id)}" data-category="${cat.id}">
        ${cat.nome}
      </button>
    `;
  });

  container.innerHTML = pillsHtml;

  container.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedCategory = btn.dataset.category;
      loadProducts();
    });
  });
}

async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = `
    <div class="catalog-loading">
      <div class="spinner"></div>
      <p>Buscando produtos frescos...</p>
    </div>
  `;

  const params = new URLSearchParams();
  if (state.searchQuery) params.append('search', state.searchQuery);
  if (state.selectedCategory) params.append('categoria', state.selectedCategory);
  if (state.tipoProducao) params.append('tipo_producao', state.tipoProducao);
  if (state.ordering) params.append('ordering', state.ordering);

  try {
    const res = await apiFetch(`/produtos/?${params.toString()}`);
    if (!res.ok) throw new Error('Erro na resposta da API');

    const data = await res.json();
    const products = data.results || data;
    renderProducts(products);
  } catch (err) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <p>⚠️ Não foi possível carregar os produtos.</p>
        <button class="btn btn--outline btn--sm" onclick="loadProducts()" style="margin-top: 12px;">Tentar novamente</button>
      </div>
    `;
  }
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span style="font-size: 3rem;">🌱</span>
        <p style="font-weight: 700; margin-top: 8px;">Nenhum produto encontrado com esses filtros.</p>
        <p style="font-size: 0.875rem;">Experimente buscar por outro nome ou limpar as categorias.</p>
      </div>
    `;
    return;
  }

  // Ícones temáticos para produtos sem imagem
  const getProductEmoji = (nome) => {
    const n = (nome || '').toLowerCase();
    if (n.includes('alface') || n.includes('rúcula') || n.includes('folha') || n.includes('couve')) return '🥬';
    if (n.includes('tomate')) return '🍅';
    if (n.includes('cenoura')) return '🥕';
    if (n.includes('banana')) return '🍌';
    if (n.includes('mel')) return '🍯';
    if (n.includes('queijo') || n.includes('leite')) return '🧀';
    if (n.includes('laranja') || n.includes('limão')) return '🍊';
    return '🌱';
  };

  const getTipoBadge = (tipo) => {
    if (tipo === 'ORGANICO_CERTIFICADO') return '<span class="badge badge--organico">Orgânico</span>';
    if (tipo === 'AGROECOLOGICO') return '<span class="badge badge--agroecologico">Agroecológico</span>';
    return '<span class="badge badge--convencional">Convencional</span>';
  };

  const getUnitDisplay = (unit) => {
    const map = { 'KG': 'kg', 'G': 'g', 'L': 'L', 'ML': 'ml', 'UNIDADE': 'un', 'CAIXA': 'cx', 'MACO': 'maço', 'SACO': 'saco' };
    return map[unit] || unit.toLowerCase();
  };

  grid.innerHTML = products.map(p => {
    const preco = parseFloat(p.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const unit = getUnitDisplay(p.unidade_medida);
    const emoji = getProductEmoji(p.nome);
    const produtor = p.produtor_nome || 'Produtor Rural';
    const categoria = p.categoria_nome || '';

    return `
      <article class="product-card" data-id="${p.id}">
        <div class="product-card__thumb">
          ${p.imagem ? `<img src="${p.imagem}" alt="${p.nome}" loading="lazy"/>` : `<span>${emoji}</span>`}
          <div class="product-card__badges">
            ${getTipoBadge(p.tipo_producao)}
          </div>
          <span class="product-card__stock-tag">Disp: ${parseFloat(p.estoque)} ${unit}</span>
        </div>

        <span class="product-card__category">${categoria}</span>
        <h3 class="product-card__title">${p.nome}</h3>
        <p class="product-card__producer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          ${produtor}
        </p>
        <p class="product-card__desc">${p.descricao || 'Produto fresco colhido diretamente na propriedade familiar.'}</p>

        <div class="product-card__action-row">
          <div class="product-card__price-wrap">
            <span class="product-card__price">${preco}</span>
            <span class="product-card__unit">/ ${unit}</span>
          </div>
          <button class="btn btn--cta btn--sm btn-add-cart" data-id="${p.id}" data-name="${p.nome}">
            Adicionar
          </button>
        </div>
      </article>
    `;
  }).join('');

  // Atrela eventos nos botões de adicionar
  grid.querySelectorAll('.btn-add-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAddToCart(btn.dataset.id, btn.dataset.name);
    });
  });
}

// ==========================================
// 4. CARRINHO DE COMPRAS
// ==========================================
async function loadCart() {
  if (!state.user || state.user.tipo !== 'CLIENTE') return;

  try {
    const res = await apiFetch('/carrinho/');
    if (res.ok) {
      state.cart = await res.json();
      updateCartBadge();
      renderCartDrawer();
    }
  } catch (err) {
    console.error('Erro ao carregar carrinho:', err);
  }
}

async function handleAddToCart(productId, productName) {
  if (!state.user) {
    openAuthModal('login');
    showToast('Entre na sua conta para adicionar produtos ao carrinho.', 'info');
    return;
  }

  if (state.user.tipo !== 'CLIENTE') {
    showToast('Apenas contas de perfil CLIENTE podem realizar compras no carrinho.', 'error');
    return;
  }

  try {
    const res = await apiFetch('/carrinho/itens/', {
      method: 'POST',
      body: JSON.stringify({ produto: parseInt(productId), quantidade: 1 }),
    });

    if (res.ok) {
      await loadCart();
      showToast(`${productName} adicionado ao carrinho!`, 'success');
      openCartDrawer();
    } else {
      const err = await res.json();
      const msg = err.non_field_errors?.[0] || err.quantidade?.[0] || 'Não foi possível adicionar ao carrinho.';
      showToast(msg, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateCartItemQuantity(itemId, newQty) {
  if (newQty <= 0) {
    return removeCartItem(itemId);
  }

  try {
    const res = await apiFetch(`/carrinho/itens/${itemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ quantidade: newQty }),
    });
    if (res.ok) {
      await loadCart();
    } else {
      const err = await res.json();
      showToast(err.quantidade?.[0] || 'Estoque insuficiente.', 'error');
    }
  } catch (err) {
    showToast('Erro ao atualizar quantidade.', 'error');
  }
}

async function removeCartItem(itemId) {
  try {
    const res = await apiFetch(`/carrinho/itens/${itemId}/`, { method: 'DELETE' });
    if (res.ok) {
      await loadCart();
      showToast('Item removido do carrinho.', 'info');
    }
  } catch (err) {
    showToast('Erro ao remover item.', 'error');
  }
}

async function clearCart() {
  try {
    const res = await apiFetch('/carrinho/', { method: 'DELETE' });
    if (res.ok) {
      state.cart = { itens: [], total: '0.00' };
      updateCartBadge();
      renderCartDrawer();
      showToast('Carrinho esvaziado.', 'info');
    }
  } catch (err) {
    showToast('Erro ao limpar carrinho.', 'error');
  }
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  const count = state.cart.itens ? state.cart.itens.length : 0;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderCartDrawer() {
  const container = document.getElementById('cartItemsList');
  const footer = document.getElementById('cartFooter');
  const totalVal = document.getElementById('cartTotalVal');

  if (!state.cart.itens || state.cart.itens.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty__icon">🧺</span>
        <p style="font-weight: 700; color: var(--text-primary);">Seu carrinho está vazio.</p>
        <p style="font-size: 0.8125rem; margin-top: 4px;">Explore o catálogo e apoie a produção local.</p>
        <button class="btn btn--outline btn--sm" id="btnExploreFromCart" style="margin-top: 16px;">
          Ver produtos
        </button>
      </div>
    `;
    document.getElementById('btnExploreFromCart')?.addEventListener('click', () => {
      closeCartDrawer();
      document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' });
    });
    footer.style.display = 'none';
    return;
  }

  const formatBRL = (val) => parseFloat(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  container.innerHTML = state.cart.itens.map(it => `
    <div class="cart-item" data-id="${it.id}">
      <div class="cart-item__info">
        <h4 class="cart-item__name">${it.produto_nome}</h4>
        <div class="cart-item__price">${formatBRL(it.preco_unitario)} / ${it.unidade_medida || 'un'}</div>
        <div class="cart-item__subtotal">${formatBRL(it.subtotal)}</div>
      </div>

      <div class="cart-item__qty">
        <button class="qty-btn btn-qty-minus" data-id="${it.id}" data-qty="${parseFloat(it.quantidade) - 1}">−</button>
        <span class="qty-val">${parseFloat(it.quantidade)}</span>
        <button class="qty-btn btn-qty-plus" data-id="${it.id}" data-qty="${parseFloat(it.quantidade) + 1}">+</button>
      </div>

      <button class="cart-item__remove btn-cart-remove" data-id="${it.id}" title="Remover item">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `).join('');

  totalVal.textContent = formatBRL(state.cart.total);
  footer.style.display = 'block';

  // Eventos nos botões de quantidade e remoção
  container.querySelectorAll('.btn-qty-minus').forEach(b => {
    b.addEventListener('click', () => updateCartItemQuantity(b.dataset.id, parseFloat(b.dataset.qty)));
  });
  container.querySelectorAll('.btn-qty-plus').forEach(b => {
    b.addEventListener('click', () => updateCartItemQuantity(b.dataset.id, parseFloat(b.dataset.qty)));
  });
  container.querySelectorAll('.btn-cart-remove').forEach(b => {
    b.addEventListener('click', () => removeCartItem(b.dataset.id));
  });
}

function openCartDrawer() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('active');
}
function closeCartDrawer() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('active');
}

// ==========================================
// 5. CHECKOUT E FINALIZAÇÃO DE PEDIDO
// ==========================================
async function openCheckoutModal() {
  closeCartDrawer();
  const modal = document.getElementById('checkoutModalOverlay');
  const totalDisplay = document.getElementById('checkoutTotalDisplay');
  totalDisplay.textContent = parseFloat(state.cart.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Carrega endereços se modalidade for Entrega
  await loadUserAddresses();

  modal.classList.add('active');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModalOverlay').classList.remove('active');
  document.getElementById('checkoutError').style.display = 'none';
}

async function loadUserAddresses() {
  const select = document.getElementById('enderecoSelect');
  try {
    const res = await apiFetch('/enderecos/');
    if (res.ok) {
      const enderecos = await res.json();
      if (enderecos.length === 0) {
        select.innerHTML = '<option value="">Nenhum endereço cadastrado</option>';
      } else {
        select.innerHTML = enderecos.map(e => `
          <option value="${e.id}">${e.logradouro}, ${e.numero} - ${e.bairro} (${e.cidade}/${e.estado})</option>
        `).join('');
      }
    }
  } catch (err) {
    select.innerHTML = '<option value="">Erro ao carregar endereços</option>';
  }
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('checkoutForm');
  const errorBox = document.getElementById('checkoutError');
  errorBox.style.display = 'none';

  const modalidade = form.elements['modalidade'].value;
  const formaPagamento = form.elements['forma_pagamento'].value;
  const observacao = document.getElementById('checkoutObs').value;
  const enderecoId = document.getElementById('enderecoSelect').value;

  const payload = {
    modalidade,
    forma_pagamento: formaPagamento,
    observacao,
  };

  if (modalidade === 'ENTREGA') {
    if (!enderecoId) {
      errorBox.textContent = 'Informe ou cadastre um endereço de entrega.';
      errorBox.style.display = 'block';
      return;
    }
    payload.endereco_id = parseInt(enderecoId);
  }

  try {
    const res = await apiFetch('/pedidos/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      closeCheckoutModal();
      await loadCart();
      showToast('🎉 Pedido realizado com sucesso! O produtor foi notificado.', 'success');
    } else {
      let msg = data.detail || data.non_field_errors?.[0] || 'Erro ao finalizar pedido.';
      if (typeof data === 'object' && !data.detail) {
        const k = Object.keys(data)[0];
        msg = `${k}: ${Array.isArray(data[k]) ? data[k][0] : data[k]}`;
      }
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
}

// ==========================================
// 6. MODAL DE AUTENTICAÇÃO (LOGIN / REGISTRO)
// ==========================================
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('authModalOverlay');
  modal.classList.add('active');
  switchAuthTab(tab);
}

function closeAuthModal() {
  document.getElementById('authModalOverlay').classList.remove('active');
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('registerError').style.display = 'none';
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  }
}

// ==========================================
// 7. TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// 8. EVENTOS E INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Inicialização básica
  checkAuth();
  loadCategories();
  loadProducts();

  // Dark/Light Theme
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('fv-theme') || 'light';
  html.setAttribute('data-theme', savedTheme);

  themeToggle?.addEventListener('click', () => {
    const cur = html.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('fv-theme', next);
  });

  // Navbar Hamburguer Mobile
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  hamburger?.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open', open);
  });

  // Fechar menu mobile ao clicar em links
  mobileMenu?.querySelectorAll('.navbar__link').forEach(l => {
    l.addEventListener('click', closeMobileMenu);
  });

  // Drawer do carrinho
  document.getElementById('btnOpenCart')?.addEventListener('click', () => {
    if (!state.user) {
      openAuthModal('login');
      showToast('Entre na sua conta para ver o carrinho.', 'info');
    } else {
      openCartDrawer();
    }
  });
  document.getElementById('btnCloseCart')?.addEventListener('click', closeCartDrawer);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCartDrawer);
  document.getElementById('btnClearCart')?.addEventListener('click', clearCart);
  document.getElementById('btnCheckout')?.addEventListener('click', openCheckoutModal);

  // Modais de Auth
  document.getElementById('btnCloseAuthModal')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModalOverlay') closeAuthModal();
  });
  document.getElementById('tabLogin')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchAuthTab('register'));

  // Preenchimento de demo
  document.getElementById('btnFillDemoClient')?.addEventListener('click', () => {
    document.getElementById('loginUsername').value = 'cliente_teste';
    document.getElementById('loginPassword').value = 'Cliente123!';
  });
  document.getElementById('btnFillDemoAdmin')?.addEventListener('click', () => {
    document.getElementById('loginUsername').value = 'paulo';
    document.getElementById('loginPassword').value = 'Senha-Forte-123';
  });

  // Submit Login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    const errBox = document.getElementById('loginError');
    errBox.style.display = 'none';

    try {
      await loginUser(u, p);
      closeAuthModal();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });

  // Submit Cadastro
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('registerError');
    errBox.style.display = 'none';

    const payload = {
      first_name: document.getElementById('regFirstName').value.trim(),
      last_name: document.getElementById('regLastName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      username: document.getElementById('regUsername').value.trim(),
      password: document.getElementById('regPassword').value,
    };

    try {
      await registerUser(payload);
      closeAuthModal();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });

  // Modal de Checkout
  document.getElementById('btnCloseCheckoutModal')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'checkoutModalOverlay') closeCheckoutModal();
  });
  document.getElementById('checkoutForm')?.addEventListener('submit', handleCheckoutSubmit);

  // Mudança de modalidade de entrega (mostrar/ocultar endereço)
  document.querySelectorAll('input[name="modalidade"]').forEach(r => {
    r.addEventListener('change', (e) => {
      document.querySelectorAll('.radio-card').forEach(rc => rc.classList.remove('active'));
      e.target.closest('.radio-card').classList.add('active');
      const endGroup = document.getElementById('enderecoGroup');
      endGroup.style.display = e.target.value === 'ENTREGA' ? 'block' : 'none';
    });
  });

  // Mudança de forma de pagamento
  document.querySelectorAll('input[name="forma_pagamento"]').forEach(r => {
    r.addEventListener('change', (e) => {
      document.querySelectorAll('.payment-option').forEach(po => po.classList.remove('active'));
      e.target.closest('.payment-option').classList.add('active');
    });
  });

  // Busca em tempo real com debounce
  let searchTimeout;
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');

  searchInput?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    btnClearSearch.style.display = val ? 'block' : 'none';
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = val;
      loadProducts();
    }, 350);
  });

  btnClearSearch?.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.style.display = 'none';
    state.searchQuery = '';
    loadProducts();
  });

  // Filtros de Tipo de Produção e Ordenação
  document.getElementById('tipoProducaoSelect')?.addEventListener('change', (e) => {
    state.tipoProducao = e.target.value;
    loadProducts();
  });
  document.getElementById('orderingSelect')?.addEventListener('change', (e) => {
    state.ordering = e.target.value;
    loadProducts();
  });
});

function closeMobileMenu() {
  document.getElementById('hamburger')?.classList.remove('open');
  document.getElementById('mobileMenu')?.classList.remove('open');
}
