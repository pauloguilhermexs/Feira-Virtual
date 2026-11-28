/**
 * Orquestrador principal da aplicação (ES Module — sem estado global solto).
 */
import {
  confirmAdminDelete,
  deleteAdminCategory,
  handleAdminAction,
  loadAdminClients,
  loadAdminOrders,
  loadAdminProducers,
  loadAdminProducts,
  loadAdminUsers,
  openAdminCategoryForm,
  openAdminClientDetails,
  openAdminDeleteConfirm,
  openAdminPanel,
  openAdminProducerDetails,
  openAdminProductEdit,
  openAdminStorefrontPreview,
  saveAdminCategory,
  saveAdminComplaint,
  saveAdminProductEdit,
  switchAdminTab,
  toggleAdminCategory,
} from './js/admin.js?v=20261121a';
import { apiFetch } from './js/api.js?v=20261121a';
import {
  authState,
  checkAuth,
  confirmDeleteUserAccount,
  confirmPasswordReset,
  exportUserData,
  loadProfileModal,
  login,
  logout,
  openDeleteAccountModal,
  register,
  requestPasswordReset,
  updateProfile,
} from './js/auth.js?v=20261121a';
import {
  addToCart,
  clearCart,
  closeCartDrawer,
  loadCart,
  openCartDrawer,
  openCheckout,
  refreshCheckoutAddresses,
  removeItem,
  setDeliveryFeeRate,
  submitCheckout,
  updateCheckoutSummary,
  updateItemQuantity,
} from './js/cart.js?v=20261121a';
import {
  handleDeliveryAction,
  openDeliveryPanel,
  refreshCurrentDeliveryTab,
  saveDeliveryVehicle,
  setDeliveryMineGroup,
  switchDeliveryTab,
} from './js/delivery.js?v=20261121a';
import {
  cancelOrder,
  createAddress,
  deleteAddress,
  deleteMyReview,
  fetchViaCEP,
  loadAddresses,
  loadClientWelcomeBanner,
  loadMyOrders,
  openComplaintModalForOrder,
  openEditAddress,
  openEditReviewModal,
  openMyReviews,
  openReviewModalForOrder,
  resetAddressForm,
  showPixDetails,
  submitComplaint,
  submitReview,
  switchOrdersTab,
} from './js/orders.js?v=20261121a';
import {
  deleteProducerProduct,
  handleProducerOrderAction,
  openClientReviewModal,
  openProducerPanel,
  openProductForm,
  saveProducerProduct,
  saveProducerProperty,
  setProducerOrderStatusFilter,
  submitClientReview,
  switchProducerTab,
  updateProductPreview,
  updatePropertyPreview,
} from './js/producer.js?v=20261121a';
import {
  catalogState,
  loadCategories,
  loadProducers,
  loadProducts,
  openProducerDetail,
  openProductDetail,
  renderCategoryPills,
} from './js/products.js?v=20261121b';
import {
  clearFormError,
  clearFormFieldErrors,
  closeModal,
  escapeHtml,
  getUnitStep,
  maskCEP,
  maskPhone,
  openModal,
  setFieldError,
  showFormError,
  showToast,
} from './js/ui.js?v=20261121a';

function showRecoverRequestMode() {
  const heading = document.getElementById('recoverModalHeading');
  const subtitle = document.getElementById('recoverModalSubtitle');
  const recForm = document.getElementById('recoverForm');
  const sentBox = document.getElementById('recoverSentState');
  const resetForm = document.getElementById('resetConfirmForm');
  if (heading) heading.textContent = 'Recuperação de Senha';
  if (subtitle)
    subtitle.textContent =
      'Informe seu e-mail cadastrado e enviaremos um link seguro para você cadastrar uma nova senha.';
  if (recForm) recForm.style.display = 'block';
  if (sentBox) sentBox.style.display = 'none';
  if (resetForm) resetForm.style.display = 'none';
  clearFormError('recoverError');
  clearFormError('resetError');
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const tabRecover = document.getElementById('tabRecover');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const recoverWrap = document.getElementById('recoverWrap');

  [tabLogin, tabRegister, tabRecover].forEach(el => {
    if (!el) return;
    el.classList.remove('active');
    el.setAttribute('aria-selected', 'false');
  });

  if (loginForm) loginForm.style.display = 'none';
  if (registerForm) registerForm.style.display = 'none';
  if (recoverWrap) recoverWrap.style.display = 'none';

  if (tab === 'login') {
    tabLogin?.classList.add('active');
    tabLogin?.setAttribute('aria-selected', 'true');
    if (loginForm) loginForm.style.display = 'block';
  } else if (tab === 'register') {
    tabRegister?.classList.add('active');
    tabRegister?.setAttribute('aria-selected', 'true');
    if (registerForm) registerForm.style.display = 'block';
  } else if (tab === 'recover') {
    tabRecover?.classList.add('active');
    tabRecover?.setAttribute('aria-selected', 'true');
    if (recoverWrap) recoverWrap.style.display = 'block';
  }
}

function updateRegisterRoleFields(role) {
  const prodFields = document.getElementById('regProducerFields');
  const delivFields = document.getElementById('regDeliveryFields');
  const propInput = document.getElementById('regNomePropriedade');

  document.querySelectorAll('.role-option').forEach(label => {
    const radio = label.querySelector('input[type="radio"]');
    label.classList.toggle('active', radio?.value === role);
  });

  if (prodFields) prodFields.style.display = role === 'produtor' ? 'block' : 'none';
  if (delivFields) delivFields.style.display = role === 'entregador' ? 'block' : 'none';
  if (propInput) {
    propInput.required = role === 'produtor';
  }
}

function closeUserDropdownAndMobile() {
  const menu = document.getElementById('userDropdownMenu');
  const toggle = document.getElementById('userMenuToggle');
  if (menu) menu.style.display = 'none';
  if (toggle) toggle.setAttribute('aria-expanded', 'false');

  const mobile = document.getElementById('mobileMenu');
  const hamburger = document.getElementById('hamburger');
  if (mobile) {
    mobile.classList.remove('active');
    mobile.setAttribute('aria-hidden', 'true');
  }
  if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
}

function handleUserAction(action) {
  closeUserDropdownAndMobile();
  switch (action) {
    case 'my-orders':
      loadMyOrders();
      break;
    case 'my-reviews':
      openMyReviews();
      break;
    case 'my-addresses':
      resetAddressForm();
      loadAddresses();
      openModal('addressesModalOverlay');
      break;
    case 'producer-panel':
      openProducerPanel('visao_geral');
      break;
    case 'delivery-panel':
      openDeliveryPanel('visao_geral');
      break;
    case 'admin-panel':
      openAdminPanel('indicadores');
      break;
    case 'admin-storefront':
      openAdminStorefrontPreview();
      break;
    case 'edit-profile':
      loadProfileModal();
      break;
    case 'export-lgpd':
      exportUserData().catch(err => showToast(err.message, 'error'));
      break;
    case 'delete-account':
      openDeleteAccountModal();
      break;
    case 'logout':
      logout();
      break;
    default:
      break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Barra de loading global ────────────────────────────────────────────
  const loadingBar = document.getElementById('globalLoadingBar');
  window.addEventListener('fv:loading', e => {
    loadingBar?.classList.toggle('active', Boolean(e.detail));
  });

  window.addEventListener('fv:auth-expired', () => {
    showToast('Sua sessão expirou. Entre novamente.', 'info');
    checkAuth();
  });

  function syncRoleWorkspace(user) {
    const storefront = document.getElementById('publicStorefront');
    const prodWs = document.getElementById('producerWorkspace');
    const delivWs = document.getElementById('deliveryWorkspace');
    const adminWs = document.getElementById('adminWorkspace');
    const adminBar = document.getElementById('adminStorefrontBar');
    const hero = document.getElementById('heroSection');
    const trust = document.getElementById('trustBarSection');
    const how = document.getElementById('como-funciona');
    const clientBanner = document.getElementById('clientWelcomeBanner');

    if (user?.tipo === 'PRODUTOR') {
      openProducerPanel('visao_geral');
      return;
    }
    if (user?.tipo === 'ENTREGADOR') {
      openDeliveryPanel('visao_geral');
      return;
    }
    if (user?.tipo === 'ADMIN') {
      openAdminPanel('indicadores');
      return;
    }

    if (prodWs) prodWs.style.display = 'none';
    if (delivWs) delivWs.style.display = 'none';
    if (adminWs) adminWs.style.display = 'none';
    if (adminBar) adminBar.style.display = 'none';
    if (storefront) storefront.style.display = 'block';

    const isClient = user?.tipo === 'CLIENTE';
    if (hero) hero.style.display = isClient ? 'none' : 'block';
    if (trust) trust.style.display = isClient ? 'none' : 'block';
    if (how) how.style.display = isClient ? 'none' : 'block';
    if (clientBanner) {
      clientBanner.style.display = isClient ? 'block' : 'none';
      if (isClient) loadClientWelcomeBanner(user);
    }

    loadCategories();
    loadProducts(1);
    loadProducers(1);
  }

  window.addEventListener('fv:auth-changed', e => {
    loadCart();
    syncRoleWorkspace(e.detail);
  });

  window.addEventListener('fv:open-pix', e => {
    if (e.detail) showPixDetails(e.detail);
  });

  window.addEventListener('fv:catalog-updated', () => {
    loadCategories();
    loadProducts(1);
    loadProducers(1);
    if (authState.user?.tipo === 'CLIENTE') {
      loadClientWelcomeBanner(authState.user);
    }
  });

  window.addEventListener('fv:addresses-updated', () => {
    refreshCheckoutAddresses();
  });

  window.addEventListener('fv:close-drawer', () => {
    closeCartDrawer();
  });

  // ── Tema Dark/Light ────────────────────────────────────────────────────
  const htmlEl = document.documentElement;
  const savedTheme = localStorage.getItem('fv_theme') || 'light';
  htmlEl.setAttribute('data-theme', savedTheme);

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', next);
    localStorage.setItem('fv_theme', next);
  });

  // ── Menu Mobile ────────────────────────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  hamburger?.addEventListener('click', () => {
    const open = !mobileMenu.classList.contains('active');
    mobileMenu.classList.toggle('active', open);
    mobileMenu.setAttribute('aria-hidden', String(!open));
    hamburger.setAttribute('aria-expanded', String(open));
  });

  // ── Delegação da Navbar / Auth Area / Banner do Cliente ────────────────
  const bindActionContainer = el => {
    el?.addEventListener('click', e => {
      const target = e.target;
      if (target.closest('#btnOpenLogin, #btnMobileLogin')) {
        closeUserDropdownAndMobile();
        switchAuthTab('login');
        openModal('authModalOverlay');
        return;
      }
      if (target.closest('#btnOpenRegister, #btnMobileRegister')) {
        closeUserDropdownAndMobile();
        switchAuthTab('register');
        openModal('authModalOverlay');
        return;
      }
      const toggle = target.closest('#userMenuToggle');
      if (toggle) {
        const menu = document.getElementById('userDropdownMenu');
        if (menu) {
          const visible = menu.style.display === 'block';
          menu.style.display = visible ? 'none' : 'block';
          toggle.setAttribute('aria-expanded', String(!visible));
        }
        return;
      }
      const actionBtn = target.closest('[data-action]');
      if (actionBtn) {
        handleUserAction(actionBtn.dataset.action);
      }
    });
  };
  bindActionContainer(document.getElementById('navAuthArea'));
  bindActionContainer(document.getElementById('mobileAuthArea'));
  bindActionContainer(document.getElementById('clientWelcomeBanner'));

  document.addEventListener('click', e => {
    if (!e.target.closest('.user-menu-dropdown')) {
      const menu = document.getElementById('userDropdownMenu');
      const toggle = document.getElementById('userMenuToggle');
      if (menu && menu.style.display === 'block') {
        menu.style.display = 'none';
        toggle?.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // ── Modal de Auth (Login, Registro Multi-perfil, Recuperação) ──────────
  document
    .getElementById('btnCloseAuthModal')
    ?.addEventListener('click', () => closeModal('authModalOverlay'));
  document.getElementById('tabLogin')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('tabRecover')?.addEventListener('click', () => {
    showRecoverRequestMode();
    switchAuthTab('recover');
  });
  document.getElementById('btnForgotPassword')?.addEventListener('click', () => {
    showRecoverRequestMode();
    switchAuthTab('recover');
  });
  document.getElementById('btnRecoverSendAnother')?.addEventListener('click', () => {
    showRecoverRequestMode();
    document.getElementById('recoverEmail')?.focus();
  });

  async function initPublicConfig() {
    try {
      const res = await apiFetch('/config/');
      if (!res.ok) return;
      const cfg = await res.json();
      setDeliveryFeeRate(cfg.taxa_entrega_padrao);

      const demoBox = document.getElementById('demoAccountBox');
      if (demoBox && cfg.demo === true && Array.isArray(cfg.demo_accounts) && cfg.demo_accounts.length > 0) {
        demoBox.style.display = 'block';
        demoBox.innerHTML = `
          <p><strong>Acesso rápido (ambiente local):</strong></p>
          <div class="demo-btn-row">
            ${cfg.demo_accounts
              .map(
                (acc, idx) => `
              <button type="button" class="btn-link btnDemoQuickFill" data-idx="${idx}"><code>${escapeHtml(acc.label)}</code></button>
            `
              )
              .join(' • ')}
          </div>
        `;
        demoBox.addEventListener('click', e => {
          const btn = e.target.closest('.btnDemoQuickFill');
          if (!btn) return;
          const acc = cfg.demo_accounts[Number(btn.dataset.idx)];
          if (acc) {
            document.getElementById('loginUsername').value = acc.username;
            document.getElementById('loginPassword').value = acc.password;
          }
        });
      }
    } catch (_) {}
  }

  function handlePasswordResetHash() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#redefinir-senha')) return;
    const queryIdx = hash.indexOf('?');
    if (queryIdx === -1) return;
    const params = new URLSearchParams(hash.slice(queryIdx + 1));
    const uid = params.get('uid');
    const token = params.get('token');
    if (!uid || !token) return;

    document.getElementById('resetUid').value = uid;
    document.getElementById('resetToken').value = token;
    document.getElementById('resetNovaSenha').value = '';
    document.getElementById('resetConfirmSenha').value = '';

    const heading = document.getElementById('recoverModalHeading');
    const subtitle = document.getElementById('recoverModalSubtitle');
    const recForm = document.getElementById('recoverForm');
    const sentBox = document.getElementById('recoverSentState');
    const resetForm = document.getElementById('resetConfirmForm');
    if (heading) heading.textContent = 'Defina sua nova senha';
    if (subtitle)
      subtitle.textContent = 'Escolha uma senha segura com no mínimo 8 caracteres para sua conta.';
    if (recForm) recForm.style.display = 'none';
    if (sentBox) sentBox.style.display = 'none';
    if (resetForm) resetForm.style.display = 'block';

    switchAuthTab('recover');
    openModal('authModalOverlay');
    document.getElementById('resetNovaSenha')?.focus();
    // Limpa o token da barra de endereços sem recarregar a página
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  window.addEventListener('hashchange', handlePasswordResetHash);
  initPublicConfig();
  handlePasswordResetHash();

  document.querySelectorAll('input[name="regRole"]').forEach(radio => {
    radio.addEventListener('change', e => updateRegisterRoleFields(e.target.value));
  });

  document.getElementById('regTelefone')?.addEventListener('input', e => maskPhone(e.target));
  document.getElementById('profTelefone')?.addEventListener('input', e => maskPhone(e.target));

  document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('loginError');
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    try {
      await login(u, p);
      closeModal('authModalOverlay');
    } catch (err) {
      showFormError('loginError', err.message);
    }
  });

  document.getElementById('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('registerError');
    clearFormFieldErrors(e.target);

    const role = document.querySelector('input[name="regRole"]:checked')?.value || 'cliente';
    const passwordInput = document.getElementById('regPassword');
    if (passwordInput.value.length < 8) {
      setFieldError(passwordInput, 'A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    const payload = {
      first_name: document.getElementById('regFirstName').value.trim(),
      last_name: document.getElementById('regLastName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      telefone: document.getElementById('regTelefone').value.trim(),
      username: document.getElementById('regUsername').value.trim(),
      password: passwordInput.value,
    };

    let registerData = payload;
    if (role === 'produtor') {
      payload.nome_propriedade = document.getElementById('regNomePropriedade').value.trim();
      payload.cidade = document.getElementById('regCidade').value.trim();
      payload.estado = document.getElementById('regEstado').value.trim().toUpperCase();
      payload.descricao = document.getElementById('regDescricao').value.trim();
      payload.chave_pix = document.getElementById('regChavePix').value.trim();
      payload.possui_maquininha = document.getElementById('regPossuiMaquininha').checked;
      payload.aceita_dinheiro = document.getElementById('regAceitaDinheiro').checked;

      const fotoInput = document.getElementById('regFotoPropriedade');
      if (fotoInput?.files?.length > 0) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          fd.append(k, typeof v === 'boolean' ? (v ? 'true' : 'false') : v);
        });
        fd.append('foto_propriedade', fotoInput.files[0]);
        registerData = fd;
      }
    } else if (role === 'entregador') {
      payload.veiculo = document.getElementById('regVeiculo').value.trim();
      payload.placa = document.getElementById('regPlaca').value.trim().toUpperCase();
      payload.area_atuacao = document.getElementById('regAreaAtuacao').value.trim();
    }

    try {
      await register(registerData, role);
      document.getElementById('loginUsername').value = payload.username;
      switchAuthTab('login');
    } catch (err) {
      showFormError('registerError', err.message);
    }
  });

  document.getElementById('recoverForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('recoverError');
    try {
      await requestPasswordReset(document.getElementById('recoverEmail').value.trim());
      const recForm = document.getElementById('recoverForm');
      const sentBox = document.getElementById('recoverSentState');
      if (recForm) recForm.style.display = 'none';
      if (sentBox) sentBox.style.display = 'flex';
    } catch (err) {
      showFormError('recoverError', err.message);
    }
  });

  document.getElementById('resetConfirmForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('resetError');
    const nova = document.getElementById('resetNovaSenha').value;
    const confirma = document.getElementById('resetConfirmSenha').value;
    if (nova.length < 8) {
      showFormError('resetError', 'A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (nova !== confirma) {
      showFormError('resetError', 'A confirmação da senha não confere.');
      return;
    }
    try {
      await confirmPasswordReset({
        uid: document.getElementById('resetUid').value.trim(),
        token: document.getElementById('resetToken').value.trim(),
        nova_senha: nova,
      });
      showRecoverRequestMode();
      switchAuthTab('login');
    } catch (err) {
      showFormError('resetError', err.message);
    }
  });

  // ── Modal Exclusão de Conta (LGPD) ─────────────────────────────────────
  const syncDeleteAccountBtn = () => {
    const pw = document.getElementById('deleteAccountPassword')?.value || '';
    const checked = Boolean(document.getElementById('deleteAccountConfirmCheck')?.checked);
    const btn = document.getElementById('btnConfirmDeleteAccount');
    if (btn) btn.disabled = !(checked && pw.length > 0);
  };
  document
    .getElementById('btnCloseDeleteAccountModal')
    ?.addEventListener('click', () => closeModal('deleteAccountModalOverlay'));
  document
    .getElementById('btnCancelDeleteAccount')
    ?.addEventListener('click', () => closeModal('deleteAccountModalOverlay'));
  document.getElementById('deleteAccountPassword')?.addEventListener('input', syncDeleteAccountBtn);
  document.getElementById('deleteAccountConfirmCheck')?.addEventListener('change', syncDeleteAccountBtn);
  document.getElementById('deleteAccountForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('deleteAccountError');
    const pw = document.getElementById('deleteAccountPassword')?.value || '';
    try {
      await confirmDeleteUserAccount(pw);
    } catch (err) {
      showFormError('deleteAccountError', err.message);
    }
  });

  // ── Catálogo, Busca, Filtros, Paginação e Detalhes ─────────────────────
  let searchTimer = null;
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('btnClearSearch');

  searchInput?.addEventListener('input', e => {
    const val = e.target.value.trim();
    if (clearSearchBtn) clearSearchBtn.style.display = val ? 'inline-flex' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      catalogState.searchQuery = val;
      loadProducts(1);
    }, 300);
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    catalogState.searchQuery = '';
    loadProducts(1);
  });

  document.getElementById('tipoProducaoSelect')?.addEventListener('change', e => {
    catalogState.selectedProductionType = e.target.value;
    loadProducts(1);
  });

  document.getElementById('orderingSelect')?.addEventListener('change', e => {
    catalogState.ordering = e.target.value;
    loadProducts(1);
  });

  document.getElementById('categoryPills')?.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    catalogState.selectedCategory = pill.dataset.category || '';
    renderCategoryPills();
    loadProducts(1);
  });

  document.getElementById('paginationControls')?.addEventListener('click', e => {
    if (e.target.closest('#btnPrevPage') && catalogState.currentPage > 1) {
      loadProducts(catalogState.currentPage - 1);
    } else if (e.target.closest('#btnNextPage') && catalogState.currentPage < catalogState.totalPages) {
      loadProducts(catalogState.currentPage + 1);
    }
  });

  document.getElementById('activeProducerFilter')?.addEventListener('click', e => {
    if (e.target.closest('#btnClearProducerFilter')) {
      catalogState.selectedProducer = null;
      catalogState.selectedProducerName = '';
      loadProducts(1);
    }
  });

  document.getElementById('productsGrid')?.addEventListener('click', e => {
    const addBtn = e.target.closest('.btnAddToCart');
    if (addBtn) {
      const { min } = getUnitStep(addBtn.dataset.unit);
      addToCart(Number(addBtn.dataset.id), min);
      return;
    }
    const prodBtn = e.target.closest('.btnProducerDetail');
    if (prodBtn) {
      openProducerDetail(Number(prodBtn.dataset.id));
      return;
    }
    const detailBtn = e.target.closest('.btnProductDetail');
    if (detailBtn) {
      openProductDetail(Number(detailBtn.dataset.id));
    }
  });

  document.getElementById('productsGrid')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const detailBtn = e.target.closest('.btnProductDetail');
      if (detailBtn) {
        e.preventDefault();
        openProductDetail(Number(detailBtn.dataset.id));
      }
    }
  });

  document.getElementById('producerShowcase')?.addEventListener('click', e => {
    const btn = e.target.closest('.btnProducerDetail');
    if (btn) openProducerDetail(Number(btn.dataset.id));
  });

  document.getElementById('productDetailBody')?.addEventListener('click', e => {
    const prodBtn = e.target.closest('.btnProducerDetail');
    if (prodBtn) {
      closeModal('productDetailModalOverlay');
      openProducerDetail(Number(prodBtn.dataset.id));
    }
  });

  document.getElementById('producerDetailBody')?.addEventListener('click', e => {
    const filterBtn = e.target.closest('#btnFilterByProducer');
    if (filterBtn) {
      catalogState.selectedProducer = Number(filterBtn.dataset.id);
      catalogState.selectedProducerName = filterBtn.dataset.name || '';
      closeModal('producerDetailModalOverlay');
      loadProducts(1);
      document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  document
    .getElementById('btnCloseProductDetailModal')
    ?.addEventListener('click', () => closeModal('productDetailModalOverlay'));
  document
    .getElementById('btnCloseProducerDetailModal')
    ?.addEventListener('click', () => closeModal('producerDetailModalOverlay'));

  // ── Carrinho e Checkout ────────────────────────────────────────────────
  document.getElementById('btnOpenCart')?.addEventListener('click', openCartDrawer);
  document.getElementById('btnCloseCart')?.addEventListener('click', closeCartDrawer);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCartDrawer);
  document.getElementById('btnClearCart')?.addEventListener('click', clearCart);
  document.getElementById('btnCheckout')?.addEventListener('click', openCheckout);
  document
    .getElementById('btnCloseCheckoutModal')
    ?.addEventListener('click', () => closeModal('checkoutModalOverlay'));

  document.getElementById('cartItemsList')?.addEventListener('click', e => {
    if (e.target.closest('#btnContinueShopping')) {
      closeCartDrawer();
      return;
    }
    const inc = e.target.closest('.btnInc');
    if (inc) {
      updateItemQuantity(Number(inc.dataset.id), parseFloat(inc.dataset.qtd));
      return;
    }
    const dec = e.target.closest('.btnDec');
    if (dec) {
      updateItemQuantity(Number(dec.dataset.id), parseFloat(dec.dataset.qtd));
      return;
    }
    const del = e.target.closest('.btnDel');
    if (del) {
      removeItem(Number(del.dataset.id));
    }
  });

  document.querySelectorAll('input[name="modalidade"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const val = e.target.value;
      document.getElementById('enderecoGroup').style.display = val === 'ENTREGA' ? 'block' : 'none';
      document.querySelectorAll('.radio-card').forEach(c => {
        c.classList.toggle('active', c.querySelector('input')?.value === val);
      });
      updateCheckoutSummary();
    });
  });

  document.querySelectorAll('input[name="forma_pagamento"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const val = e.target.value;
      document.querySelectorAll('.payment-option').forEach(c => {
        c.classList.toggle('active', c.querySelector('input')?.value === val);
      });
    });
  });

  document.getElementById('btnQuickAddAddress')?.addEventListener('click', () => {
    resetAddressForm();
    loadAddresses();
    openModal('addressesModalOverlay');
  });

  document.getElementById('checkoutForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('checkoutError');
    const modalidade = document.querySelector('input[name="modalidade"]:checked')?.value || 'RETIRADA';
    const forma_pagamento = document.querySelector('input[name="forma_pagamento"]:checked')?.value || 'PIX';
    const observacao = document.getElementById('checkoutObs')?.value.trim() || '';

    const payload = { modalidade, forma_pagamento, observacao };
    if (modalidade === 'ENTREGA') {
      const endId = document.getElementById('enderecoSelect')?.value;
      if (!endId) {
        showFormError('checkoutError', 'Selecione ou cadastre um endereço de entrega.');
        return;
      }
      payload.endereco_id = Number(endId);
    }

    try {
      await submitCheckout(payload);
    } catch (err) {
      showFormError('checkoutError', err.message);
    }
  });

  // ── Pedidos, Pix, Avaliações, Reclamações, Endereços e Perfil ──────────
  document
    .getElementById('btnCloseMyOrdersModal')
    ?.addEventListener('click', () => closeModal('myOrdersModalOverlay'));
  document.getElementById('tabOrdersList')?.addEventListener('click', () => switchOrdersTab('pedidos'));
  document.getElementById('tabMyReviews')?.addEventListener('click', () => switchOrdersTab('avaliacoes'));
  document.getElementById('tabMyComplaints')?.addEventListener('click', () => switchOrdersTab('reclamacoes'));

  document.getElementById('myOrdersList')?.addEventListener('click', e => {
    const pixBtn = e.target.closest('.btnShowPix');
    if (pixBtn) {
      showPixDetails(Number(pixBtn.dataset.id));
      return;
    }
    const cancelBtn = e.target.closest('.btnCancelOrder');
    if (cancelBtn) {
      cancelOrder(Number(cancelBtn.dataset.id));
      return;
    }
    const reviewBtn = e.target.closest('.btnOpenReview');
    if (reviewBtn) {
      openReviewModalForOrder(Number(reviewBtn.dataset.id), reviewBtn.dataset.mode || 'all');
      return;
    }
    const compBtn = e.target.closest('.btnOpenComplaint');
    if (compBtn) {
      openComplaintModalForOrder(Number(compBtn.dataset.id));
    }
  });

  document.getElementById('myReviewsList')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.btnEditMyReview');
    if (editBtn) {
      openEditReviewModal(Number(editBtn.dataset.id));
      return;
    }
    const delBtn = e.target.closest('.btnDeleteMyReview');
    if (delBtn) {
      deleteMyReview(Number(delBtn.dataset.id));
    }
  });

  document.getElementById('btnClosePixModal')?.addEventListener('click', () => closeModal('pixModalOverlay'));
  document.getElementById('btnCopyPix')?.addEventListener('click', async () => {
    const val = document.getElementById('pixCopiaColaInput')?.value;
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      showToast('Código Pix copiado!', 'success');
    } catch (_) {
      document.getElementById('pixCopiaColaInput').select();
      showToast('Selecione e copie o código manualmente.', 'info');
    }
  });

  document
    .getElementById('btnCloseReviewModal')
    ?.addEventListener('click', () => closeModal('reviewModalOverlay'));
  document.getElementById('reviewForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('reviewError');
    const editId = document.getElementById('reviewEditId')?.value.trim() || '';
    const orderIdStr = document.getElementById('reviewOrderId')?.value.trim() || '';
    const nota = Number(document.querySelector('input[name="reviewNota"]:checked')?.value || 5);
    const comentario = document.getElementById('reviewComment')?.value.trim() || '';

    const payload = { nota, comentario };
    if (!editId) {
      const targetVal = document.getElementById('reviewTarget')?.value || '';
      const [kind, idStr] = targetVal.split(':');
      if (orderIdStr) payload.pedido = Number(orderIdStr);
      if (kind === 'produto') payload.produto = Number(idStr);
      else payload.produtor = Number(idStr);
    }

    try {
      await submitReview(payload, editId || null);
    } catch (err) {
      showFormError('reviewError', err.message);
    }
  });

  document
    .getElementById('btnCloseComplaintModal')
    ?.addEventListener('click', () => closeModal('complaintModalOverlay'));
  document.getElementById('complaintForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('complaintError');
    const payload = {
      pedido: Number(document.getElementById('complaintOrderId').value),
      assunto: document.getElementById('complaintSubject').value.trim(),
      descricao: document.getElementById('complaintDescription').value.trim(),
    };
    try {
      await submitComplaint(payload);
    } catch (err) {
      showFormError('complaintError', err.message);
    }
  });

  document.getElementById('btnCloseAddressesModal')?.addEventListener('click', () => {
    resetAddressForm();
    closeModal('addressesModalOverlay');
  });
  document.getElementById('btnCancelAddressEdit')?.addEventListener('click', resetAddressForm);

  const cepInput = document.getElementById('addrCep');
  cepInput?.addEventListener('input', async e => {
    maskCEP(e.target);
    const clean = e.target.value.replace(/\D/g, '');
    const statusEl = document.getElementById('addrCepStatus');
    if (clean.length === 8) {
      if (statusEl) statusEl.textContent = 'Buscando CEP...';
      const data = await fetchViaCEP(clean);
      if (data) {
        document.getElementById('addrLogradouro').value = data.logradouro || '';
        document.getElementById('addrBairro').value = data.bairro || '';
        document.getElementById('addrCidade').value = data.localidade || '';
        document.getElementById('addrEstado').value = data.uf || '';
        if (statusEl) statusEl.textContent = 'CEP preenchido automaticamente.';
      } else if (statusEl) {
        statusEl.textContent = 'CEP não localizado — preencha manualmente.';
      }
    } else if (statusEl) {
      statusEl.textContent = '';
    }
  });

  document.getElementById('addressForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('addressError');
    const editId = document.getElementById('addrEditId')?.value.trim() || null;
    const payload = {
      rotulo: document.getElementById('addrRotulo').value.trim() || 'Casa',
      cep: document.getElementById('addrCep').value.trim(),
      logradouro: document.getElementById('addrLogradouro').value.trim(),
      numero: document.getElementById('addrNumero').value.trim(),
      complemento: document.getElementById('addrComplemento').value.trim(),
      bairro: document.getElementById('addrBairro').value.trim(),
      cidade: document.getElementById('addrCidade').value.trim(),
      estado: document.getElementById('addrEstado').value.trim().toUpperCase(),
    };
    try {
      await createAddress(payload, editId);
    } catch (err) {
      showFormError('addressError', err.message);
    }
  });

  document.getElementById('addressesList')?.addEventListener('click', e => {
    if (e.target.closest('.btnRetryAddresses')) {
      loadAddresses();
      return;
    }
    const editBtn = e.target.closest('.btnEditAddress');
    if (editBtn) {
      openEditAddress(Number(editBtn.dataset.id));
      return;
    }
    const delBtn = e.target.closest('.btnDeleteAddress');
    if (delBtn) deleteAddress(Number(delBtn.dataset.id));
  });

  document
    .getElementById('btnCloseProfileModal')
    ?.addEventListener('click', () => closeModal('profileModalOverlay'));
  document.getElementById('profileForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearFormError('profileError');
    try {
      await updateProfile({
        first_name: document.getElementById('profFirstName').value.trim(),
        last_name: document.getElementById('profLastName').value.trim(),
        email: document.getElementById('profEmail').value.trim(),
        telefone: document.getElementById('profTelefone').value.trim(),
      });
      closeModal('profileModalOverlay');
    } catch (err) {
      showFormError('profileError', err.message);
    }
  });

  // ── Navegação por Perfil (Navbar Desktop, Mobile, Footer e Atalhos) ────
  document.addEventListener('click', e => {
    const prodNav = e.target.closest('[data-producer-nav]');
    if (prodNav) {
      closeUserDropdownAndMobile();
      openProducerPanel(prodNav.dataset.producerNav);
      return;
    }
    const delivNav = e.target.closest('[data-delivery-nav]');
    if (delivNav) {
      closeUserDropdownAndMobile();
      openDeliveryPanel(delivNav.dataset.deliveryNav);
      return;
    }
    const adminNav = e.target.closest('[data-admin-nav]');
    if (adminNav) {
      closeUserDropdownAndMobile();
      if (adminNav.dataset.adminNav === 'vitrine') {
        openAdminStorefrontPreview();
      } else {
        openAdminPanel(adminNav.dataset.adminNav);
      }
    }
  });

  // ── Painel Dedicado do Produtor Rural ──────────────────────────────────
  document.getElementById('producerPanelTabs')?.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-producer-tab]');
    if (tabBtn) switchProducerTab(tabBtn.dataset.producerTab);
  });
  document.getElementById('btnQuickNewProduct')?.addEventListener('click', () => {
    switchProducerTab('produtos');
    openProductForm(null);
  });
  document.getElementById('btnNewProducerProduct')?.addEventListener('click', () => openProductForm(null));
  document.getElementById('btnCancelProducerProduct')?.addEventListener('click', () => {
    document.getElementById('producerProductFormWrap').style.display = 'none';
  });
  document.getElementById('producerProductForm')?.addEventListener('input', updateProductPreview);
  document.getElementById('producerProductForm')?.addEventListener('change', updateProductPreview);
  document.getElementById('producerProductForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveProducerProduct();
  });
  document.getElementById('producerProductsList')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.btnEditProdProduct');
    if (editBtn) openProductForm(Number(editBtn.dataset.id));
    const delBtn = e.target.closest('.btnDeleteProdProduct');
    if (delBtn) deleteProducerProduct(Number(delBtn.dataset.id));
  });
  document.getElementById('producerOrderFilters')?.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (pill) setProducerOrderStatusFilter(pill.dataset.producerStatus || '');
  });
  document.getElementById('producerOrdersList')?.addEventListener('click', e => {
    const rateBtn = e.target.closest('.btnRateClient');
    if (rateBtn) {
      openClientReviewModal(Number(rateBtn.dataset.id));
      return;
    }
    const actBtn = e.target.closest('.btnProdOrderAction');
    if (actBtn) {
      handleProducerOrderAction(Number(actBtn.dataset.id), actBtn.dataset.action, actBtn.dataset.next || '');
    }
  });
  document
    .getElementById('btnCloseClientReviewModal')
    ?.addEventListener('click', () => closeModal('clientReviewModalOverlay'));
  document.getElementById('clientReviewForm')?.addEventListener('submit', e => {
    e.preventDefault();
    submitClientReview();
  });
  document.getElementById('producerPropertyForm')?.addEventListener('input', updatePropertyPreview);
  document.getElementById('producerPropertyForm')?.addEventListener('change', updatePropertyPreview);
  document.getElementById('producerPropertyForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveProducerProperty();
  });

  // ── Painel Dedicado do Entregador ──────────────────────────────────────
  document.getElementById('btnRefreshDelivery')?.addEventListener('click', refreshCurrentDeliveryTab);
  document.getElementById('deliveryPanelTabs')?.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-delivery-tab]');
    if (tabBtn) switchDeliveryTab(tabBtn.dataset.deliveryTab);
  });
  document.getElementById('deliveryMineFilters')?.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (pill) setDeliveryMineGroup(pill.dataset.deliveryGroup || '');
  });
  document.getElementById('deliveryWorkspace')?.addEventListener('click', e => {
    const btn = e.target.closest('.btnDeliveryAction');
    if (btn) handleDeliveryAction(Number(btn.dataset.id), btn.dataset.action);
  });
  document.getElementById('deliveryVehicleForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveDeliveryVehicle();
  });

  // ── Painel Dedicado Administrativo (#adminWorkspace) ───────────────────
  document.getElementById('btnAdminViewStorefront')?.addEventListener('click', openAdminStorefrontPreview);
  document
    .getElementById('btnBackToAdminWorkspace')
    ?.addEventListener('click', () => openAdminPanel('indicadores'));
  document
    .getElementById('btnCloseAdminDetailModal')
    ?.addEventListener('click', () => closeModal('adminDetailModalOverlay'));
  document
    .getElementById('btnCloseAdminConfirmModal')
    ?.addEventListener('click', () => closeModal('adminConfirmModalOverlay'));
  document
    .getElementById('btnCancelAdminConfirm')
    ?.addEventListener('click', () => closeModal('adminConfirmModalOverlay'));
  document.getElementById('btnProceedAdminConfirm')?.addEventListener('click', () => confirmAdminDelete());

  document.getElementById('adminPanelTabs')?.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-admin-tab]');
    if (tabBtn) switchAdminTab(tabBtn.dataset.adminTab);
  });

  // Filtros e edição de produtos (Admin)
  let adminSearchTimer = null;
  const bindDebouncedAdminSearch = (elId, callback) => {
    document.getElementById(elId)?.addEventListener('input', () => {
      clearTimeout(adminSearchTimer);
      adminSearchTimer = setTimeout(() => callback(1), 300);
    });
  };
  bindDebouncedAdminSearch('adminProdSearch', loadAdminProducts);
  document.getElementById('adminProdCatFilter')?.addEventListener('change', () => loadAdminProducts(1));
  document.getElementById('adminProdProducerFilter')?.addEventListener('change', () => loadAdminProducts(1));
  document.getElementById('adminProdStatusFilter')?.addEventListener('change', () => loadAdminProducts(1));
  document.getElementById('btnCancelAdminProductEdit')?.addEventListener('click', () => {
    const wrap = document.getElementById('adminProductEditWrap');
    if (wrap) wrap.style.display = 'none';
  });
  document.getElementById('adminProductEditForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveAdminProductEdit();
  });

  // Filtros de Produtores, Clientes e Usuários (Admin)
  bindDebouncedAdminSearch('adminProducerSearch', loadAdminProducers);
  document
    .getElementById('adminProducerStatusFilter')
    ?.addEventListener('change', () => loadAdminProducers(1));
  bindDebouncedAdminSearch('adminClientSearch', loadAdminClients);
  document.getElementById('adminClientStatusFilter')?.addEventListener('change', () => loadAdminClients(1));
  bindDebouncedAdminSearch('adminUserSearch', loadAdminUsers);
  document.getElementById('adminUserTypeFilter')?.addEventListener('change', () => loadAdminUsers(1));

  document
    .getElementById('btnNewAdminCategory')
    ?.addEventListener('click', () => openAdminCategoryForm(null));
  document.getElementById('btnCancelAdminCategory')?.addEventListener('click', () => {
    const wrap = document.getElementById('adminCategoryFormWrap');
    if (wrap) wrap.style.display = 'none';
  });
  document.getElementById('adminCategoryForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveAdminCategory();
  });
  document.getElementById('adminOrderStatusFilter')?.addEventListener('change', () => loadAdminOrders(1));

  document.getElementById('adminWorkspace')?.addEventListener('click', e => {
    const editProdBtn = e.target.closest('.btnEditAdminProduct');
    if (editProdBtn) {
      openAdminProductEdit(Number(editProdBtn.dataset.id));
      return;
    }
    const prodDetailBtn = e.target.closest('.btnAdminProducerDetail');
    if (prodDetailBtn) {
      openAdminProducerDetails(Number(prodDetailBtn.dataset.id));
      return;
    }
    const clientDetailBtn = e.target.closest('.btnAdminClientDetail');
    if (clientDetailBtn) {
      openAdminClientDetails(Number(clientDetailBtn.dataset.id));
      return;
    }
    const delEntityBtn = e.target.closest('.btnDeleteAdminEntity');
    if (delEntityBtn) {
      openAdminDeleteConfirm(
        delEntityBtn.dataset.resource,
        Number(delEntityBtn.dataset.id),
        delEntityBtn.dataset.label || '',
        delEntityBtn.dataset.tab || null,
        delEntityBtn.dataset.kind || 'registro'
      );
      return;
    }
    const actBtn = e.target.closest('.btnAdminAction');
    if (actBtn) {
      handleAdminAction(
        actBtn.dataset.resource,
        Number(actBtn.dataset.id),
        actBtn.dataset.action,
        actBtn.dataset.tab || null
      );
      return;
    }
    const editCatBtn = e.target.closest('.btnEditAdminCat');
    if (editCatBtn) {
      openAdminCategoryForm(Number(editCatBtn.dataset.id));
      return;
    }
    const toggleCatBtn = e.target.closest('.btnToggleAdminCat');
    if (toggleCatBtn) {
      toggleAdminCategory(Number(toggleCatBtn.dataset.id), toggleCatBtn.dataset.ativa === '1');
      return;
    }
    const delCatBtn = e.target.closest('.btnDeleteAdminCat');
    if (delCatBtn) {
      deleteAdminCategory(Number(delCatBtn.dataset.id), delCatBtn.dataset.label || '');
      return;
    }
    const saveCompBtn = e.target.closest('.btnSaveComplaint');
    if (saveCompBtn) {
      saveAdminComplaint(Number(saveCompBtn.dataset.id));
    }
  });

  // ── Inicialização de Dados ─────────────────────────────────────────────
  // checkAuth() dispara fv:auth-changed -> syncRoleWorkspace() carrega o painel
  // dedicado (Admin/Produtor/Entregador) ou a vitrine (Visitante/Cliente).
  checkAuth();
});
