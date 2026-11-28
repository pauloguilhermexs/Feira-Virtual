/**
 * Gerenciamento de Autenticação, Perfis de Usuário (Multi-perfil) e LGPD.
 */
import { apiFetch, parseError, tokens } from './api.js?v=20261121a';
import {
  clearFormError,
  closeModal,
  escapeHtml,
  openModal,
  renderIcon,
  showToast,
} from './ui.js?v=20261121a';

export const authState = {
  user: null,
};

export async function checkAuth() {
  if (!tokens.access) {
    authState.user = null;
    renderUserNav();
    window.dispatchEvent(new CustomEvent('fv:auth-changed', { detail: null }));
    return null;
  }

  try {
    const res = await apiFetch('/perfil/');
    if (res.ok) {
      authState.user = await res.json();
    } else {
      tokens.clear();
      authState.user = null;
    }
  } catch (_) {
    authState.user = null;
  }

  renderUserNav();
  window.dispatchEvent(new CustomEvent('fv:auth-changed', { detail: authState.user }));
  return authState.user;
}

export async function login(username, password) {
  const res = await apiFetch('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }

  const data = await res.json();
  tokens.access = data.access;
  if (data.refresh) tokens.refresh = data.refresh;

  await checkAuth();
  showToast(`Bem-vindo(a), ${authState.user?.first_name || authState.user?.username}!`, 'success');
  return authState.user;
}

export async function register(payload, role = 'cliente') {
  let endpoint = '/auth/registro/cliente/';
  if (role === 'produtor') endpoint = '/auth/registro/produtor/';
  else if (role === 'entregador') endpoint = '/auth/registro/entregador/';

  const body = payload instanceof FormData ? payload : JSON.stringify(payload);
  const res = await apiFetch(endpoint, {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }

  const msgExtra =
    role === 'produtor' ? ' Seu perfil aguarda aprovação do administrador para publicar produtos.' : '';
  showToast(`Cadastro realizado com sucesso!${msgExtra} Faça login para continuar.`, 'success');
  return true;
}

export async function logout() {
  if (tokens.refresh) {
    try {
      await apiFetch('/auth/logout/', {
        method: 'POST',
        body: JSON.stringify({ refresh: tokens.refresh }),
      });
    } catch (_) {}
  }
  tokens.clear();
  authState.user = null;
  renderUserNav();
  window.dispatchEvent(new CustomEvent('fv:auth-changed', { detail: null }));
  showToast('Você saiu da sua conta.', 'info');
}

export async function updateProfile(payload) {
  const res = await apiFetch('/perfil/', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }
  authState.user = await res.json();
  renderUserNav();
  showToast('Perfil atualizado com sucesso!', 'success');
  return authState.user;
}

export async function requestPasswordReset(email) {
  const res = await apiFetch('/auth/recuperar-senha/', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }
  showToast('Se o e-mail estiver cadastrado, enviaremos o link de redefinição.', 'success');
  return true;
}

export async function confirmPasswordReset(payload) {
  const res = await apiFetch('/auth/redefinir-senha/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }
  showToast('Senha redefinida com sucesso! Já pode entrar.', 'success');
  return true;
}

export async function exportUserData() {
  const res = await apiFetch('/perfil/exportar-dados/');
  if (!res.ok) throw new Error('Não foi possível exportar seus dados.');
  const data = await res.json();

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dados_feira_virtual_${authState.user?.username || 'titular'}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Arquivo de dados baixado com sucesso (LGPD).', 'success');
}

export function openDeleteAccountModal() {
  clearFormError('deleteAccountError');
  const form = document.getElementById('deleteAccountForm');
  if (form) form.reset();
  const btn = document.getElementById('btnConfirmDeleteAccount');
  if (btn) btn.disabled = true;
  openModal('deleteAccountModalOverlay');
}

export async function confirmDeleteUserAccount(password) {
  const res = await apiFetch('/perfil/excluir-conta/', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }
  closeModal('deleteAccountModalOverlay');
  tokens.clear();
  authState.user = null;
  renderUserNav();
  window.dispatchEvent(new CustomEvent('fv:auth-changed', { detail: null }));
  showToast('Sua conta foi excluída e seus dados foram anonimizados conforme LGPD.', 'info');
}

export function loadProfileModal() {
  const u = authState.user;
  if (!u) return;
  document.getElementById('profFirstName').value = u.first_name || '';
  document.getElementById('profLastName').value = u.last_name || '';
  document.getElementById('profEmail').value = u.email || '';
  document.getElementById('profTelefone').value = u.telefone || '';
  openModal('profileModalOverlay');
}

export function renderRoleNavigation(user) {
  const desktopNav = document.getElementById('navbarLinksDesktop');
  const mobileNav = document.getElementById('navbarLinksMobile');
  const cartBtn = document.getElementById('btnOpenCart');
  const footerLinks = document.getElementById('footerLinks');

  const tipo = user?.tipo || null;

  if (tipo === 'PRODUTOR') {
    const items = [
      { tab: 'visao_geral', label: 'Visão geral' },
      { tab: 'produtos', label: 'Meus produtos' },
      { tab: 'propriedade', label: 'Minhas propriedades' },
      { tab: 'pedidos', label: 'Pedidos recebidos' },
      { tab: 'avaliacoes', label: 'Avaliações' },
    ];
    const html = items
      .map(
        it =>
          `<li><button type="button" class="navbar__link navbar__link--btn" data-producer-nav="${it.tab}">${it.label}</button></li>`
      )
      .join('');
    if (desktopNav) desktopNav.innerHTML = html;
    if (mobileNav) mobileNav.innerHTML = html;
    if (cartBtn) cartBtn.style.display = 'none';
    if (footerLinks) {
      footerLinks.innerHTML = `
        <button type="button" class="btn-link" data-producer-nav="produtos">Meus produtos</button>
        <button type="button" class="btn-link" data-producer-nav="propriedade">Minhas propriedades</button>
        <button type="button" class="btn-link" data-producer-nav="pedidos">Pedidos recebidos</button>
      `;
    }
    return;
  }

  if (tipo === 'ENTREGADOR') {
    const items = [
      { tab: 'visao_geral', label: 'Visão geral' },
      { tab: 'disponiveis', label: 'Entregas disponíveis' },
      { tab: 'minhas', label: 'Minhas entregas' },
      { tab: 'historico', label: 'Histórico' },
      { tab: 'ganhos', label: 'Ganhos' },
    ];
    const html = items
      .map(
        it =>
          `<li><button type="button" class="navbar__link navbar__link--btn" data-delivery-nav="${it.tab}">${it.label}</button></li>`
      )
      .join('');
    if (desktopNav) desktopNav.innerHTML = html;
    if (mobileNav) mobileNav.innerHTML = html;
    if (cartBtn) cartBtn.style.display = 'none';
    if (footerLinks) {
      footerLinks.innerHTML = `
        <button type="button" class="btn-link" data-delivery-nav="disponiveis">Entregas disponíveis</button>
        <button type="button" class="btn-link" data-delivery-nav="minhas">Minhas entregas</button>
        <button type="button" class="btn-link" data-delivery-nav="historico">Histórico</button>
      `;
    }
    return;
  }

  if (tipo === 'ADMIN') {
    const items = [
      { tab: 'indicadores', label: 'Visão geral' },
      { tab: 'produtos', label: 'Produtos' },
      { tab: 'produtores', label: 'Produtores' },
      { tab: 'clientes', label: 'Clientes' },
      { tab: 'pedidos', label: 'Pedidos' },
      { tab: 'reclamacoes', label: 'Reclamações' },
    ];
    const html = items
      .map(
        it =>
          `<li><button type="button" class="navbar__link navbar__link--btn" data-admin-nav="${it.tab}">${it.label}</button></li>`
      )
      .join('');
    if (desktopNav) desktopNav.innerHTML = html;
    if (mobileNav) mobileNav.innerHTML = html;
    if (cartBtn) cartBtn.style.display = 'none';
    if (footerLinks) {
      footerLinks.innerHTML = `
        <button type="button" class="btn-link" data-admin-nav="indicadores">Dashboard Admin</button>
        <button type="button" class="btn-link" data-admin-nav="produtores">Produtores</button>
        <button type="button" class="btn-link" data-admin-nav="vitrine">Vitrine pública</button>
      `;
    }
    return;
  }

  // Visitante ou CLIENTE
  const isClient = tipo === 'CLIENTE';
  const publicHtml = isClient
    ? `
      <li><a href="#produtos" class="navbar__link">Produtos</a></li>
      <li><a href="#produtores" class="navbar__link">Produtores</a></li>
    `
    : `
      <li><a href="#produtos" class="navbar__link">Produtos</a></li>
      <li><a href="#produtores" class="navbar__link">Produtores</a></li>
      <li><a href="#como-funciona" class="navbar__link">Como funciona</a></li>
    `;
  if (desktopNav) desktopNav.innerHTML = publicHtml;
  if (mobileNav) mobileNav.innerHTML = publicHtml;
  if (cartBtn) cartBtn.style.display = 'inline-flex';
  if (footerLinks) {
    footerLinks.innerHTML = isClient
      ? `
        <a href="#produtos">Catálogo</a>
        <a href="#produtores">Produtores</a>
      `
      : `
        <a href="#produtos">Catálogo</a>
        <a href="#produtores">Produtores</a>
        <a href="#como-funciona">Como funciona</a>
      `;
  }
}

export function renderUserNav() {
  const desktopArea = document.getElementById('navAuthArea');
  const mobileArea = document.getElementById('mobileAuthArea');
  renderRoleNavigation(authState.user);

  if (!authState.user) {
    if (desktopArea) {
      desktopArea.innerHTML = `
        <button type="button" class="btn btn--outline btn--sm" id="btnOpenLogin">Entrar</button>
        <button type="button" class="btn btn--primary btn--sm" id="btnOpenRegister">Cadastrar</button>
      `;
    }
    if (mobileArea) {
      mobileArea.innerHTML = `
        <button type="button" class="btn btn--outline btn--full" id="btnMobileLogin">Entrar</button>
        <button type="button" class="btn btn--primary btn--full" id="btnMobileRegister">Cadastrar</button>
      `;
    }
    return;
  }

  const u = authState.user;
  const roleBadges = {
    CLIENTE: '<span class="badge badge--cliente">Cliente</span>',
    PRODUTOR: '<span class="badge badge--produtor">Produtor</span>',
    ENTREGADOR: '<span class="badge badge--entregador">Entregador</span>',
    ADMIN: '<span class="badge badge--admin">Admin</span>',
  };

  let roleLinks = '';
  if (u.tipo === 'CLIENTE') {
    roleLinks = `
      <button type="button" class="dropdown__link" data-action="my-orders">${renderIcon('package', 16)} Meus Pedidos</button>
      <button type="button" class="dropdown__link" data-action="my-reviews">${renderIcon('star', 16)} Minhas Avaliações</button>
      <button type="button" class="dropdown__link" data-action="my-addresses">${renderIcon('map-pin', 16)} Meus Endereços</button>
    `;
  } else if (u.tipo === 'PRODUTOR') {
    roleLinks = `
      <button type="button" class="dropdown__link" data-action="producer-panel">${renderIcon('wheat', 16)} Painel do Produtor</button>
    `;
  } else if (u.tipo === 'ENTREGADOR') {
    roleLinks = `
      <button type="button" class="dropdown__link" data-action="delivery-panel">${renderIcon('bike', 16)} Painel de Entregas</button>
    `;
  } else if (u.tipo === 'ADMIN') {
    roleLinks = `
      <button type="button" class="dropdown__link" data-action="admin-panel">${renderIcon('shield', 16)} Dashboard Administrativo</button>
      <button type="button" class="dropdown__link" data-action="admin-storefront">${renderIcon('external-link', 16)} Ver Vitrine Pública</button>
    `;
  }

  const initial = escapeHtml((u.first_name || u.username || 'U')[0].toUpperCase());
  const displayName = escapeHtml(u.first_name || u.username);

  if (desktopArea) {
    desktopArea.innerHTML = `
      <div class="user-menu-dropdown">
        <button type="button" class="user-menu-btn" id="userMenuToggle" aria-haspopup="true" aria-expanded="false" aria-controls="userDropdownMenu">
          <span class="user-avatar" aria-hidden="true">${initial}</span>
          <span class="user-name">${displayName}</span>
          ${roleBadges[u.tipo] || ''}
        </button>
        <div class="user-dropdown-menu" id="userDropdownMenu" role="menu" style="display: none;">
          ${roleLinks}
          <button type="button" class="dropdown__link" data-action="edit-profile">${renderIcon('user', 16)} Meu Perfil</button>
          <div class="dropdown__divider"></div>
          <button type="button" class="dropdown__link" data-action="export-lgpd">${renderIcon('file-text', 16)} Exportar Dados (LGPD)</button>
          <button type="button" class="dropdown__link dropdown__link--danger" data-action="delete-account">${renderIcon('trash-2', 16)} Excluir Conta</button>
          <div class="dropdown__divider"></div>
          <button type="button" class="dropdown__link dropdown__link--danger" data-action="logout">${renderIcon('log-out', 16)} Sair da Conta</button>
        </div>
      </div>
    `;
  }

  if (mobileArea) {
    mobileArea.innerHTML = `
      <div class="mobile-user-header">
        <strong>${displayName}</strong> ${roleBadges[u.tipo] || ''}
      </div>
      ${roleLinks}
      <button type="button" class="dropdown__link" data-action="edit-profile">${renderIcon('user', 16)} Meu Perfil</button>
      <button type="button" class="dropdown__link" data-action="export-lgpd">${renderIcon('file-text', 16)} Exportar Dados (LGPD)</button>
      <button type="button" class="dropdown__link dropdown__link--danger" data-action="delete-account">${renderIcon('trash-2', 16)} Excluir Conta</button>
      <button type="button" class="btn btn--outline btn--full" data-action="logout">${renderIcon('log-out', 16)} Sair da Conta</button>
    `;
  }
}
