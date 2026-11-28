/**
 * Utilitários de Interface, Acessibilidade (WCAG 2.1 AA), Validação, Máscaras, QR SVG e Toasts.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function safeUrl(url, fallback = '/static/assets/logo-horizontal.webp') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('/media/') ||
    trimmed.startsWith('/static/') ||
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  ) {
    return trimmed;
  }
  return fallback;
}

export function renderBrandLogoHtml(altText = 'Feira Virtual', imgClass = '') {
  const safeAlt = escapeHtml(altText || 'Feira Virtual');
  const cls = escapeHtml(['brand-logo-img', imgClass].filter(Boolean).join(' '));
  return `
    <picture class="brand-logo-picture brand-logo-picture--light">
      <source srcset="/static/assets/logo-horizontal.webp 1x, /static/assets/logo-horizontal-2x.webp 2x" type="image/webp" />
      <img src="/static/assets/logo-horizontal.png" alt="${safeAlt}" class="${cls}" loading="lazy" />
    </picture>
    <picture class="brand-logo-picture brand-logo-picture--dark">
      <source srcset="/static/assets/logo-horizontal-white.webp 1x, /static/assets/logo-horizontal-white-2x.webp 2x" type="image/webp" />
      <img src="/static/assets/logo-horizontal-white.png" alt="${safeAlt}" class="${cls}" loading="lazy" />
    </picture>
  `;
}

export function renderIcon(name, size = 18, extraClass = '') {
  const safeName = escapeHtml(String(name || '').replace(/[^a-z0-9-]/gi, ''));
  const px = Number(size) || 18;
  const cls = escapeHtml(['icon', extraClass].filter(Boolean).join(' '));
  return `<svg class="${cls}" width="${px}" height="${px}" aria-hidden="true" focusable="false"><use href="/static/assets/icons.svg#icon-${safeName}"></use></svg>`;
}

export function renderStars(nota, size = 14) {
  const n = Math.max(0, Math.min(5, Math.round(Number(nota) || 0)));
  let html = '<span class="stars-row" aria-hidden="true">';
  for (let i = 1; i <= 5; i += 1) {
    html += renderIcon(
      i <= n ? 'star-filled' : 'star',
      size,
      i <= n ? 'icon--star-filled' : 'icon--star-empty'
    );
  }
  html += '</span>';
  return html;
}

export function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Toasts Flutuantes com aria-live ─────────────────────────────────────────
export function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');

  const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert-triangle' : 'info';
  const iconWrap = document.createElement('span');
  iconWrap.className = 'toast__icon';
  iconWrap.innerHTML = renderIcon(iconName, 16);
  const msgSpan = document.createElement('span');
  msgSpan.textContent = String(message || '');
  toast.append(iconWrap, msgSpan);

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Pilha Acessível de Modais (Focus Trap, ESC & Backdrop) ──────────────────
const modalStack = [];

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null);
}

export function openModal(overlayId) {
  const modal = document.getElementById(overlayId);
  if (!modal) return;

  const existingIndex = modalStack.findIndex(entry => entry.id === overlayId);
  if (existingIndex !== -1) {
    modalStack.splice(existingIndex, 1);
  }

  modalStack.push({ id: overlayId, modal, prevFocus: document.activeElement });
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    const focusable = getFocusableElements(modal);
    if (focusable.length > 0) focusable[0].focus();
  });
}

export function closeModal(overlayId) {
  const modal = document.getElementById(overlayId);
  if (!modal) return;

  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');

  const idx = modalStack.findIndex(entry => entry.id === overlayId);
  let prevFocus = null;
  if (idx !== -1) {
    prevFocus = modalStack[idx].prevFocus;
    modalStack.splice(idx, 1);
  }

  if (modalStack.length > 0) {
    const top = modalStack[modalStack.length - 1].modal;
    const focusable = getFocusableElements(top);
    if (focusable.length > 0) focusable[0].focus();
  } else if (prevFocus && typeof prevFocus.focus === 'function') {
    prevFocus.focus();
  }
}

document.addEventListener('click', e => {
  if (e.target.classList?.contains('modal-overlay') && e.target.id) {
    closeModal(e.target.id);
    return;
  }

  const toggleBtn = e.target.closest?.('.password-toggle');
  if (toggleBtn) {
    const targetId = toggleBtn.dataset?.target;
    const input = targetId
      ? document.getElementById(targetId)
      : toggleBtn.parentElement?.querySelector('input');
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggleBtn.setAttribute('aria-pressed', String(isPassword));
    toggleBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
    toggleBtn.innerHTML = renderIcon(isPassword ? 'eye-off' : 'eye', 18);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (modalStack.length > 0) {
      e.preventDefault();
      const top = modalStack[modalStack.length - 1];
      closeModal(top.id);
      return;
    }
    const drawer = document.getElementById('cartDrawer');
    if (drawer?.classList.contains('open')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('fv:close-drawer'));
      return;
    }
    const userMenu = document.getElementById('userDropdownMenu');
    if (userMenu && userMenu.style.display === 'block') {
      userMenu.style.display = 'none';
      document.getElementById('userMenuToggle')?.setAttribute('aria-expanded', 'false');
      document.getElementById('userMenuToggle')?.focus();
      return;
    }
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu?.classList.contains('active')) {
      mobileMenu.classList.remove('active');
      mobileMenu.setAttribute('aria-hidden', 'true');
      const ham = document.getElementById('hamburger');
      ham?.setAttribute('aria-expanded', 'false');
      ham?.focus();
    }
    return;
  }

  if (e.key === 'Tab') {
    const activeContainer =
      modalStack.length > 0
        ? modalStack[modalStack.length - 1].modal
        : document.getElementById('cartDrawer')?.classList.contains('open')
          ? document.getElementById('cartDrawer')
          : null;
    if (!activeContainer) return;
    const focusable = getFocusableElements(activeContainer);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// ── Validação Inline & Erros de Formulário ──────────────────────────────────
export function showFormError(containerId, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

export function clearFormError(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

export function setFieldError(inputEl, message) {
  if (!inputEl) return;
  inputEl.classList.add('form-input--error');
  inputEl.setAttribute('aria-invalid', 'true');
  let errEl = inputEl.parentElement?.querySelector('.field-error');
  if (!errEl && inputEl.parentElement) {
    errEl = document.createElement('span');
    errEl.className = 'field-error';
    inputEl.parentElement.appendChild(errEl);
  }
  if (errEl) errEl.textContent = message;
}

export function clearFormFieldErrors(formEl) {
  if (!formEl) return;
  formEl.querySelectorAll('.form-input--error').forEach(el => {
    el.classList.remove('form-input--error');
    el.removeAttribute('aria-invalid');
  });
  formEl.querySelectorAll('.field-error').forEach(el => el.remove());
}

// ── Máscaras de Entrada ───────────────────────────────────────────────────
export function maskPhone(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (v.length > 6) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
  }
  input.value = v;
}

export function maskCEP(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 8);
  if (v.length > 5) {
    v = v.replace(/^(\d{5})(\d{1,3})/, '$1-$2');
  }
  input.value = v;
}

export function maskCurrency(input) {
  const digits = input.value.replace(/\D/g, '');
  if (!digits) {
    input.value = '';
    return;
  }
  const num = parseInt(digits, 10) / 100;
  input.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseCurrencyInput(str) {
  if (!str) return '0.00';
  const cleaned = String(str).trim().replace(/\./g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val.toFixed(2) : '0.00';
}

// ── Skeletons de Carregamento ─────────────────────────────────────────────
export function renderProductSkeletons(container, count = 6) {
  container.innerHTML = Array(count)
    .fill(0)
    .map(
      () => `
    <article class="product-card product-card--skeleton" aria-hidden="true">
      <div class="product-card__thumb skeleton-box"></div>
      <div class="skeleton-line" style="width: 40%; height: 12px; margin-bottom: 10px;"></div>
      <div class="skeleton-line" style="width: 82%; height: 18px; margin-bottom: 8px;"></div>
      <div class="skeleton-line" style="width: 65%; height: 14px; margin-bottom: 16px;"></div>
      <div class="skeleton-line" style="width: 55%; height: 28px; margin-top: auto;"></div>
    </article>
  `
    )
    .join('');
}

// ── Gerador Visual Determinístico de QR Code SVG (Mock Pix, 100% CSP-safe) ─
export function generateSimpleQrSvg(text) {
  const size = 21;
  const cell = 8;
  const pad = 16;
  const total = size * cell + pad * 2;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isFinder = (r, c) => {
    const inBox = (br, bc) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
  };

  const finderOn = (r, c) => {
    const lr = r >= size - 7 ? r - (size - 7) : r;
    const lc = c >= size - 7 ? c - (size - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let dark = false;
      if (isFinder(r, c)) {
        dark = finderOn(r, c);
      } else {
        hash ^= r * 31 + c * 17;
        hash = Math.imul(hash, 16777619);
        dark = Math.abs(hash) % 10 < 5;
      }
      if (dark) {
        rects += `<rect x="${pad + c * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}" fill="#1C1E18"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="180" height="180" role="img" aria-label="QR Code Pix"><rect width="${total}" height="${total}" fill="#FFFFFF" rx="12"/>${rects}</svg>`;
}

// ── Passo e Formatação de Quantidade por Unidade de Medida ────────────────
const UNIT_DISPLAY_LABELS = {
  KG: 'kg',
  G: 'g',
  L: 'L',
  LITRO: 'L',
  ML: 'ml',
  UNIDADE: 'unidade',
  CAIXA: 'caixa',
  SACO: 'saco',
  MACO: 'maço',
  MAÇO: 'maço',
};

export function formatUnitLabel(unidade) {
  if (unidade === null || unidade === undefined) return '';
  const raw = String(unidade).trim();
  if (!raw) return '';
  const key = raw.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(UNIT_DISPLAY_LABELS, key)) {
    return UNIT_DISPLAY_LABELS[key];
  }
  return raw.toLowerCase();
}

export function getUnitStep(unidade) {
  const u = String(unidade || '').toUpperCase();
  if (u === 'KG' || u === 'L') return { step: 0.5, min: 0.5, integer: false };
  if (u === 'G' || u === 'ML') return { step: 50, min: 50, integer: false };
  return { step: 1, min: 1, integer: true };
}

export function formatQuantity(val, unidade) {
  const num = Number(val) || 0;
  const { integer } = getUnitStep(unidade);
  if (integer) return String(Math.round(num));
  const rounded = Math.round(num * 1000) / 1000;
  return String(rounded);
}

// ── Paginação Reutilizável (DRF count/next/previous) ──────────────────────
export function renderPaginationBar(container, data, currentPage, onPageChange, pageSize = 20) {
  if (!container) return;
  if (!data || Array.isArray(data) || (!data.next && !data.previous)) {
    container.innerHTML = '';
    return;
  }

  const totalCount = Number(data.count) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrev = Boolean(data.previous);
  const hasNext = Boolean(data.next);

  container.innerHTML = `
    <div class="pagination">
      <button type="button" class="btn btn--outline btn--sm btnPagPrev" ${hasPrev ? '' : 'disabled'}>${renderIcon('chevron-left', 15)} Anterior</button>
      <span class="pagination__info">Página ${currentPage} de ${totalPages} (${totalCount} itens)</span>
      <button type="button" class="btn btn--outline btn--sm btnPagNext" ${hasNext ? '' : 'disabled'}>Próxima ${renderIcon('chevron-right', 15)}</button>
    </div>
  `;

  container.querySelector('.btnPagPrev')?.addEventListener('click', () => {
    if (hasPrev && currentPage > 1) onPageChange(currentPage - 1);
  });
  container.querySelector('.btnPagNext')?.addEventListener('click', () => {
    if (hasNext) onPageChange(currentPage + 1);
  });
}
