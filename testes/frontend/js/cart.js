/**
 * Gerenciamento do Carrinho de Compras, Drawer Lateral e Checkout.
 */
import { apiFetch, parseError } from './api.js?v=20261121a';
import { authState } from './auth.js?v=20261121a';
import {
  closeModal,
  escapeHtml,
  formatCurrency,
  formatQuantity,
  formatUnitLabel,
  getUnitStep,
  openModal,
  renderIcon,
  showToast,
} from './ui.js?v=20261121a';

export const cartState = {
  items: [],
  total: 0,
  deliveryFeePerOrder: 0,
};

export function setDeliveryFeeRate(rate) {
  const num = parseFloat(rate);
  cartState.deliveryFeePerOrder = Number.isFinite(num) && num > 0 ? num : 0;
}

export async function loadCart() {
  if (!authState.user || authState.user.tipo !== 'CLIENTE') {
    cartState.items = [];
    cartState.total = 0;
    renderCartBadge();
    renderCartDrawer();
    return;
  }

  try {
    const res = await apiFetch('/carrinho/');
    if (res.ok) {
      const data = await res.json();
      cartState.items = data.itens || [];
      cartState.total = parseFloat(data.total) || 0;
    }
  } catch (err) {
    console.error('Erro ao carregar carrinho:', err);
  }

  renderCartBadge();
  renderCartDrawer();
}

export function renderCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = cartState.items.length;
  badge.textContent = String(count);
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
  badge.setAttribute('aria-hidden', String(count === 0));
}

export async function addToCart(produtoId, quantidade = 1) {
  if (!authState.user) {
    showToast('Faça login para adicionar produtos ao carrinho.', 'info');
    openModal('authModalOverlay');
    return;
  }

  if (authState.user.tipo !== 'CLIENTE') {
    showToast('Apenas contas de Cliente podem realizar compras.', 'error');
    return;
  }

  try {
    const res = await apiFetch('/carrinho/itens/', {
      method: 'POST',
      body: JSON.stringify({ produto: produtoId, quantidade }),
    });

    if (!res.ok) {
      const err = await parseError(res);
      showToast(err, 'error');
      return;
    }

    showToast('Item adicionado ao carrinho!', 'success');
    await loadCart();
    openCartDrawer();
  } catch (_) {
    showToast('Erro ao adicionar produto.', 'error');
  }
}

export async function updateItemQuantity(itemId, newQtd) {
  if (newQtd <= 0) {
    return removeItem(itemId);
  }

  try {
    const res = await apiFetch(`/carrinho/itens/${itemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ quantidade: newQtd }),
    });

    if (!res.ok) {
      const err = await parseError(res);
      showToast(err, 'error');
      return;
    }

    await loadCart();
  } catch (_) {
    showToast('Erro ao atualizar quantidade.', 'error');
  }
}

export async function removeItem(itemId) {
  try {
    const res = await apiFetch(`/carrinho/itens/${itemId}/`, { method: 'DELETE' });
    if (!res.ok) {
      showToast('Erro ao remover item.', 'error');
      return;
    }
    await loadCart();
  } catch (_) {
    showToast('Erro ao remover item.', 'error');
  }
}

export async function clearCart() {
  try {
    const res = await apiFetch('/carrinho/', { method: 'DELETE' });
    if (!res.ok) {
      showToast('Erro ao limpar carrinho.', 'error');
      return;
    }
    showToast('Carrinho esvaziado.', 'info');
    await loadCart();
  } catch (_) {
    showToast('Erro ao limpar carrinho.', 'error');
  }
}

export function openCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  drawer?.classList.add('open');
  drawer?.setAttribute('aria-hidden', 'false');
  overlay?.classList.add('active');
  requestAnimationFrame(() => {
    document.getElementById('btnCloseCart')?.focus();
  });
}

export function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  drawer?.classList.remove('open');
  drawer?.setAttribute('aria-hidden', 'true');
  overlay?.classList.remove('active');
  document.getElementById('btnOpenCart')?.focus();
}

export function renderCartDrawer() {
  const container = document.getElementById('cartItemsList');
  const footer = document.getElementById('cartFooter');
  const totalEl = document.getElementById('cartTotalVal');
  if (!container) return;

  if (cartState.items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty__icon" aria-hidden="true">${renderIcon('shopping-basket', 28)}</span>
        <p>Seu carrinho está vazio.</p>
        <a href="#produtos" class="btn btn--outline btn--sm" id="btnContinueShopping">Explorar produtos</a>
      </div>
    `;
    if (footer) footer.style.display = 'none';
    if (totalEl) totalEl.textContent = formatCurrency(0);
    return;
  }

  if (footer) footer.style.display = 'block';
  if (totalEl) totalEl.textContent = formatCurrency(cartState.total);

  container.innerHTML = cartState.items
    .map(item => {
      const { step } = getUnitStep(item.unidade_medida);
      const qtd = parseFloat(item.quantidade) || 0;
      const estoque = parseFloat(item.estoque);
      const prevQtd = Math.round((qtd - step) * 1000) / 1000;
      const nextQtd = Math.round((qtd + step) * 1000) / 1000;
      const atMax = Number.isFinite(estoque) && nextQtd > estoque;
      return `
    <div class="cart-item">
      <div class="cart-item__info">
        <div class="cart-item__name">${escapeHtml(item.produto_nome)}</div>
        <div class="cart-item__price">${formatCurrency(item.preco_unitario)} / ${escapeHtml(formatUnitLabel(item.unidade_medida))}</div>
        <div class="cart-item__subtotal">${formatCurrency(item.subtotal)}</div>
      </div>
      <div class="cart-item__qty">
        <button type="button" class="qty-btn btnDec" data-id="${item.id}" data-qtd="${prevQtd}" aria-label="Diminuir quantidade">−</button>
        <span class="qty-val">${escapeHtml(formatQuantity(qtd, item.unidade_medida))}</span>
        <button type="button" class="qty-btn btnInc" data-id="${item.id}" data-qtd="${nextQtd}" ${atMax ? 'disabled title="Estoque máximo atingido"' : ''} aria-label="Aumentar quantidade">+</button>
      </div>
      <button type="button" class="cart-item__remove btnDel" data-id="${item.id}" title="Remover item" aria-label="Remover item">${renderIcon('trash-2', 16)}</button>
    </div>
  `;
    })
    .join('');
}

function groupCartByProducer() {
  const map = new Map();
  for (const item of cartState.items) {
    const key = item.produtor || 'default';
    if (!map.has(key)) {
      map.set(key, {
        produtor: item.produtor,
        produtor_nome: item.produtor_nome || 'Produtor',
        aceita_pix: item.aceita_pix !== false,
        possui_maquininha: item.possui_maquininha !== false,
        aceita_dinheiro: item.aceita_dinheiro !== false,
        items: [],
        subtotal: 0,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    group.subtotal += parseFloat(item.subtotal) || 0;
  }
  return Array.from(map.values());
}

export function updateCheckoutSummary() {
  const groups = groupCartByProducer();
  const modalidade = document.querySelector('input[name="modalidade"]:checked')?.value || 'RETIRADA';
  const taxaTotal = modalidade === 'ENTREGA' ? cartState.deliveryFeePerOrder * groups.length : 0;
  const totalFinal = cartState.total + taxaTotal;

  const totalDisplay = document.getElementById('checkoutTotalDisplay');
  if (totalDisplay) totalDisplay.textContent = formatCurrency(totalFinal);

  const feeEl = document.getElementById('checkoutFeeBreakdown');
  if (feeEl) {
    if (modalidade === 'ENTREGA') {
      feeEl.style.display = 'block';
      feeEl.innerHTML = `
        Subtotal dos produtos: <strong>${formatCurrency(cartState.total)}</strong> •
        Taxa de entrega (${groups.length} pedido${groups.length > 1 ? 's' : ''}): <strong>${formatCurrency(taxaTotal)}</strong>
      `;
    } else {
      feeEl.style.display = 'none';
      feeEl.innerHTML = '';
    }
  }

  const summaryEl = document.getElementById('checkoutProducerSummary');
  if (summaryEl) {
    summaryEl.innerHTML = groups
      .map(
        g => `
      <div class="checkout-producer-group">
        <div class="checkout-producer-group__head">
          <strong>${escapeHtml(g.produtor_nome)}</strong>
          <span>${formatCurrency(g.subtotal)}</span>
        </div>
        <ul class="checkout-producer-group__items">
          ${g.items.map(it => `<li>${escapeHtml(it.produto_nome)} × ${escapeHtml(formatQuantity(it.quantidade, it.unidade_medida))} ${escapeHtml(formatUnitLabel(it.unidade_medida))}</li>`).join('')}
        </ul>
      </div>
    `
      )
      .join('');
  }

  const methods = [
    { value: 'PIX', label: 'Pix', check: g => g.aceita_pix, reason: 'não aceita Pix' },
    {
      value: 'CARTAO',
      label: 'Cartão',
      check: g => g.possui_maquininha,
      reason: 'não possui maquininha de cartão',
    },
    { value: 'DINHEIRO', label: 'Dinheiro', check: g => g.aceita_dinheiro, reason: 'não aceita dinheiro' },
  ];

  const reasons = [];
  let firstAvailable = null;

  methods.forEach(m => {
    const blocking = groups.filter(g => !m.check(g));
    const allowed = blocking.length === 0;
    const radio = document.querySelector(`input[name="forma_pagamento"][value="${m.value}"]`);
    const labelEl = radio?.closest('.payment-option');
    if (radio && labelEl) {
      radio.disabled = !allowed;
      labelEl.classList.toggle('payment-option--disabled', !allowed);
      if (!allowed) {
        const names = blocking.map(b => b.produtor_nome).join(', ');
        const msg = `${m.label} indisponível (${names} ${m.reason}).`;
        labelEl.title = msg;
        reasons.push(msg);
      } else {
        labelEl.removeAttribute('title');
        if (!firstAvailable) firstAvailable = radio;
      }
    }
  });

  const checked = document.querySelector('input[name="forma_pagamento"]:checked');
  if ((!checked || checked.disabled) && firstAvailable) {
    firstAvailable.checked = true;
  }
  const activeVal = document.querySelector('input[name="forma_pagamento"]:checked')?.value;
  document.querySelectorAll('.payment-option').forEach(opt => {
    const r = opt.querySelector('input[name="forma_pagamento"]');
    opt.classList.toggle('active', Boolean(r && !r.disabled && r.value === activeVal));
  });

  const hintEl = document.getElementById('paymentUnavailableHint');
  if (hintEl) {
    if (reasons.length > 0) {
      hintEl.textContent = reasons.join(' ');
      hintEl.style.display = 'block';
    } else {
      hintEl.textContent = '';
      hintEl.style.display = 'none';
    }
  }
}

// ── Checkout ──────────────────────────────────────────────────────────────
export async function refreshCheckoutAddresses() {
  const addrSelect = document.getElementById('enderecoSelect');
  if (!addrSelect) return;

  try {
    const res = await apiFetch('/enderecos/');
    if (res.ok) {
      const addrs = await res.json();
      if (addrs.length === 0) {
        addrSelect.innerHTML = '<option value="">Nenhum endereço cadastrado — cadastre abaixo</option>';
      } else {
        addrSelect.innerHTML = addrs
          .map(
            a => `
          <option value="${a.id}">${escapeHtml(a.rotulo)} — ${escapeHtml(a.logradouro)}, ${escapeHtml(a.numero)} (${escapeHtml(a.bairro)})</option>
        `
          )
          .join('');
      }
    }
  } catch (_) {}
}

export async function openCheckout() {
  closeCartDrawer();
  updateCheckoutSummary();
  await refreshCheckoutAddresses();
  openModal('checkoutModalOverlay');
}

export async function submitCheckout(payload) {
  const res = await apiFetch('/pedidos/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }

  const pedidos = await res.json();
  closeModal('checkoutModalOverlay');
  await loadCart();

  showToast(
    pedidos.length > 1
      ? `${pedidos.length} pedidos criados (um por produtor)!`
      : 'Pedido realizado com sucesso!',
    'success'
  );
  window.dispatchEvent(new CustomEvent('fv:order-placed', { detail: pedidos }));

  const primeiroPix = Array.isArray(pedidos) && pedidos.find(p => p.forma_pagamento === 'PIX');
  if (primeiroPix) {
    window.dispatchEvent(new CustomEvent('fv:open-pix', { detail: primeiroPix.id }));
  }

  return pedidos;
}
