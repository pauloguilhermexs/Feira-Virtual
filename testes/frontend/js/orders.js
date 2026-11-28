/**
 * Pedidos do Cliente (Timeline, Cancelamento, Pix QR/Copia-e-Cola),
 * Avaliações de Produtos e Produtores (criação por pedido + histórico editável paginado),
 * Reclamações (paginado), Endereços (CRUD + ViaCEP) e Banner do Cliente Logado.
 */
import { apiFetch, parseError } from './api.js?v=20261121a';
import {
  clearFormError,
  closeModal,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatUnitLabel,
  generateSimpleQrSvg,
  openModal,
  renderIcon,
  renderPaginationBar,
  renderStars,
  showToast,
} from './ui.js?v=20261121a';

const ordersCache = new Map();
const myReviewsCache = new Map();
const addressesCache = new Map();
let currentOrdersTab = 'pedidos';
let currentOrdersPage = 1;

export const statusLabels = {
  PENDENTE: { label: 'Aguardando produtor', class: 'status--pending' },
  ACEITO: { label: 'Aceito pelo produtor', class: 'status--accepted' },
  RECUSADO: { label: 'Recusado', class: 'status--refused' },
  EM_PREPARO: { label: 'Em colheita/preparo', class: 'status--preparing' },
  PRONTO: { label: 'Pronto (entrega/retirada)', class: 'status--ready' },
  EM_ENTREGA: { label: 'Saiu para entrega', class: 'status--delivering' },
  CONCLUIDO: { label: 'Concluído', class: 'status--completed' },
  CANCELADO: { label: 'Cancelado', class: 'status--cancelled' },
};

function getPendingProductsForOrder(o) {
  const avaliados = new Set((o.avaliacoes_feitas?.produtos || []).map(Number));
  const seen = new Set();
  const pending = [];
  (o.itens || []).forEach(it => {
    const pid = Number(it.produto);
    if (pid && !avaliados.has(pid) && !seen.has(pid)) {
      seen.add(pid);
      pending.push(it);
    }
  });
  return pending;
}

// ── Banner personalizado para Cliente logado (Seção 5.6) ───────────────────
export async function loadClientWelcomeBanner(user) {
  const banner = document.getElementById('clientWelcomeBanner');
  if (!banner || !user || user.tipo !== 'CLIENTE') return;

  const firstName = escapeHtml(user.first_name || user.username);
  banner.innerHTML = `
    <div class="container">
      <div class="client-welcome__grid">
        <div>
          <span class="badge hero__badge">Conta ativa: Cliente</span>
          <h1 class="client-welcome__title">Olá, ${firstName}!</h1>
          <p class="client-welcome__subtitle">Escolha produtos frescos direto dos produtores rurais da sua região ou acompanhe seus pedidos recentes.</p>
          <div class="client-welcome__actions">
            <button type="button" class="btn btn--primary btn--sm" data-action="my-orders">${renderIcon('package', 16)} Meus Pedidos</button>
            <button type="button" class="btn btn--outline btn--sm" data-action="my-reviews">${renderIcon('star', 16)} Minhas Avaliações</button>
            <button type="button" class="btn btn--outline btn--sm" data-action="my-addresses">${renderIcon('map-pin', 16)} Meus Endereços</button>
          </div>
        </div>
        <div id="clientWelcomeStatusCard" class="client-welcome__card">
          <span class="text-muted">Carregando resumo dos seus pedidos...</span>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await apiFetch('/pedidos/?page=1');
    const card = document.getElementById('clientWelcomeStatusCard');
    if (!card) return;
    if (!res.ok) {
      card.innerHTML =
        '<span class="text-muted">Explore o catálogo abaixo para montar seu próximo pedido.</span>';
      return;
    }
    const data = await res.json();
    const list = data.results || data || [];
    const ativo = list.find(o => !['CONCLUIDO', 'CANCELADO', 'RECUSADO'].includes(o.status));
    const pendAval = list.filter(
      o =>
        o.status === 'CONCLUIDO' &&
        (getPendingProductsForOrder(o).length > 0 || !o.avaliacoes_feitas?.produtor)
    );

    if (ativo) {
      const st = statusLabels[ativo.status] || { label: ativo.status, class: '' };
      card.innerHTML = `
        <div class="client-welcome__card-head">
          <strong>Último pedido em andamento</strong>
          <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
        </div>
        <p class="text-muted">
          <strong>${escapeHtml(ativo.numero_publico || `#${ativo.id}`)}</strong> • ${escapeHtml(ativo.produtor_nome)} • ${formatCurrency(ativo.total_com_frete || ativo.total)}
        </p>
        ${
          pendAval.length > 0
            ? `<p class="text-muted">Você também tem <strong>${pendAval.length}</strong> compra(s) concluída(s) aguardando avaliação.</p>`
            : ''
        }
        <div>
          <button type="button" class="btn btn--outline btn--sm" data-action="my-orders">Acompanhar pedido</button>
        </div>
      `;
    } else if (pendAval.length > 0) {
      card.innerHTML = `
        <div class="client-welcome__card-head">
          <strong>Avaliações pendentes</strong>
          <span class="badge badge--success">${pendAval.length} compra(s)</span>
        </div>
        <p class="text-muted">Conte como foi a qualidade dos produtos e o atendimento dos produtores nos seus pedidos concluídos.</p>
        <div>
          <button type="button" class="btn btn--cta btn--sm" data-action="my-orders">${renderIcon('star', 15)} Avaliar compras</button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <strong>Tudo em dia por aqui</strong>
        <p class="text-muted">${list.length > 0 ? `Você já realizou ${data.count ?? list.length} pedido(s) na Feira Virtual.` : 'Você ainda não realizou pedidos.'} Navegue pelo catálogo fresco da semana logo abaixo.</p>
      `;
    }
  } catch (_) {}
}

export async function loadMyOrders(page = 1, keepModalOpen = false) {
  const container = document.getElementById('myOrdersList');
  const pagEl = document.getElementById('myOrdersPagination');
  if (!container) return;

  currentOrdersPage = page;
  container.innerHTML =
    '<div class="catalog-loading"><div class="spinner"></div><p>Carregando seus pedidos...</p></div>';
  if (pagEl) pagEl.innerHTML = '';

  if (!keepModalOpen) {
    currentOrdersTab = 'pedidos';
    setOrdersTabVisibility('pedidos');
    openModal('myOrdersModalOverlay');
  }

  try {
    const res = await apiFetch(`/pedidos/?page=${page}`);
    if (!res.ok) throw new Error('Falha ao obter pedidos.');
    const data = await res.json();
    const orders = data.results || data || [];

    ordersCache.clear();
    orders.forEach(o => ordersCache.set(String(o.id), o));

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">${renderIcon('package', 26)}</span>
          <p>Você ainda não realizou nenhum pedido.</p>
        </div>
      `;
      return;
    }

    renderOrdersList(container, orders);
    renderPaginationBar(pagEl, data, page, nextPage => loadMyOrders(nextPage, true));
  } catch (err) {
    container.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export function openMyReviews() {
  openModal('myOrdersModalOverlay');
  switchOrdersTab('avaliacoes');
}

function setOrdersTabVisibility(tab) {
  const tabPedidos = document.getElementById('tabOrdersList');
  const tabAval = document.getElementById('tabMyReviews');
  const tabReclam = document.getElementById('tabMyComplaints');
  const listPedidos = document.getElementById('myOrdersList');
  const pagPedidos = document.getElementById('myOrdersPagination');
  const listAval = document.getElementById('myReviewsList');
  const pagAval = document.getElementById('myReviewsPagination');
  const listReclam = document.getElementById('myComplaintsList');
  const pagReclam = document.getElementById('myComplaintsPagination');

  tabPedidos?.classList.toggle('active', tab === 'pedidos');
  tabAval?.classList.toggle('active', tab === 'avaliacoes');
  tabReclam?.classList.toggle('active', tab === 'reclamacoes');

  if (listPedidos) listPedidos.style.display = tab === 'pedidos' ? 'flex' : 'none';
  if (pagPedidos) pagPedidos.style.display = tab === 'pedidos' ? 'block' : 'none';
  if (listAval) listAval.style.display = tab === 'avaliacoes' ? 'flex' : 'none';
  if (pagAval) pagAval.style.display = tab === 'avaliacoes' ? 'block' : 'none';
  if (listReclam) listReclam.style.display = tab === 'reclamacoes' ? 'flex' : 'none';
  if (pagReclam) pagReclam.style.display = tab === 'reclamacoes' ? 'block' : 'none';
}

export function switchOrdersTab(tab) {
  currentOrdersTab = tab;
  setOrdersTabVisibility(tab);

  if (tab === 'pedidos') loadMyOrders(currentOrdersPage, true);
  else if (tab === 'avaliacoes') loadMyReviews(1);
  else if (tab === 'reclamacoes') loadMyComplaints(1);
}

function renderOrdersList(container, orders) {
  container.innerHTML = orders
    .map(o => {
      const st = statusLabels[o.status] || { label: o.status, class: '' };
      const canCancel = ['PENDENTE', 'ACEITO'].includes(o.status);
      const isCompleted = o.status === 'CONCLUIDO';
      const isPix = o.forma_pagamento === 'PIX' && !['CANCELADO', 'RECUSADO'].includes(o.status);

      const pendingProducts = isCompleted ? getPendingProductsForOrder(o) : [];
      const producerPending = isCompleted && Boolean(o.produtor) && !o.avaliacoes_feitas?.produtor;
      const allReviewed = isCompleted && pendingProducts.length === 0 && !producerPending;

      const timelineHtml =
        (o.historico || []).length > 0
          ? `
        <div class="order-timeline">
          ${o.historico
            .map(h => {
              const hst = statusLabels[h.status] || { label: h.status };
              return `<span class="timeline-step"><strong>${escapeHtml(hst.label)}</strong> <small>${formatDate(h.criado_em)}</small></span>`;
            })
            .join('')}
        </div>
      `
          : '';

      const modalidadeHtml =
        o.modalidade === 'ENTREGA'
          ? `${renderIcon('truck', 14)} Entrega`
          : `${renderIcon('store', 14)} Retirada`;

      return `
      <div class="order-card" data-id="${o.id}">
        <div class="order-card__header">
          <div>
            <strong>Pedido ${escapeHtml(o.numero_publico || `#${o.id}`)}</strong>
            <span class="text-muted">• ${formatDate(o.criado_em)}</span>
          </div>
          <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
        </div>

        <div class="order-card__body">
          <p><strong>Produtor:</strong> ${escapeHtml(o.produtor_nome)}</p>
          <p><strong>Modalidade:</strong> ${modalidadeHtml} • <strong>Pagamento:</strong> ${escapeHtml(o.forma_pagamento)}</p>
          ${o.endereco_entrega ? `<p><strong>Endereço:</strong> ${escapeHtml(o.endereco_entrega)}</p>` : ''}
          ${o.previsao_entrega ? `<p><strong>Previsão:</strong> ${renderIcon('clock', 14)} ${escapeHtml(o.previsao_entrega)}</p>` : ''}
          ${o.motivo_cancelamento ? `<p class="text-danger"><strong>Motivo:</strong> ${escapeHtml(o.motivo_cancelamento)}</p>` : ''}

          <ul class="order-items-list">
            ${(o.itens || [])
              .map(
                it => `
              <li>${escapeHtml(it.nome_produto)} (${parseFloat(it.quantidade)} ${escapeHtml(formatUnitLabel(it.unidade_medida))}) — ${formatCurrency(it.subtotal)}</li>
            `
              )
              .join('')}
          </ul>

          ${timelineHtml}
        </div>

        <div class="order-card__footer">
          <div class="order-card__total">
            Total: <strong>${formatCurrency(o.total_com_frete || o.total)}</strong>
          </div>
          <div class="order-card__actions">
            ${
              isPix
                ? `
              <button type="button" class="btn btn--primary btn--sm btnShowPix" data-id="${o.id}">
                <img src="/static/assets/pix-icon.webp" alt="" class="pix-brand-icon" width="16" height="16" />
                <span>Ver Pix / QR Code</span>
              </button>
            `
                : ''
            }
            ${
              canCancel
                ? `
              <button type="button" class="btn btn--outline btn--sm text-danger btnCancelOrder" data-id="${o.id}">
                Cancelar
              </button>
            `
                : ''
            }
            ${
              pendingProducts.length > 0
                ? `
              <button type="button" class="btn btn--outline btn--sm btnOpenReview" data-id="${o.id}" data-mode="produto">
                ${renderIcon('star', 14)} Avaliar produto
              </button>
            `
                : ''
            }
            ${
              producerPending
                ? `
              <button type="button" class="btn btn--outline btn--sm btnOpenReview" data-id="${o.id}" data-mode="produtor">
                ${renderIcon('star', 14)} Avaliar produtor
              </button>
            `
                : ''
            }
            ${allReviewed ? '<span class="badge status--completed">Compra avaliada</span>' : ''}
            <button type="button" class="btn btn--outline btn--sm btnOpenComplaint" data-id="${o.id}">
              ${renderIcon('alert-triangle', 14)} Reclamação
            </button>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

function renderMyReviewCard(a) {
  const targetName = a.produto_nome || a.produtor_nome || 'Registro avaliado';
  const orderTag = a.pedido_numero ? ` • Pedido ${escapeHtml(a.pedido_numero)}` : '';
  return `
    <div class="review-card" data-review-id="${a.id}">
      <div class="review-card__top">
        <strong>${escapeHtml(targetName)}</strong>
        <span>${renderStars(a.nota, 14)} (${Number(a.nota) || 0}/5)</span>
      </div>
      <p>${a.comentario ? escapeHtml(a.comentario) : '<span class="text-muted">Sem comentário adicional.</span>'}</p>
      <span class="text-muted">${formatDate(a.criado_em)}${orderTag}</span>
      <div class="review-card__actions">
        <button type="button" class="btn btn--outline btn--sm btnEditMyReview" data-id="${a.id}">${renderIcon('edit', 14)} Editar</button>
        <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteMyReview" data-id="${a.id}">${renderIcon('trash-2', 14)} Excluir</button>
      </div>
    </div>
  `;
}

export async function loadMyReviews(page = 1) {
  const container = document.getElementById('myReviewsList');
  const pagEl = document.getElementById('myReviewsPagination');
  if (!container) return;
  container.innerHTML =
    '<div class="catalog-loading"><div class="spinner"></div><p>Carregando suas avaliações...</p></div>';
  if (pagEl) pagEl.innerHTML = '';

  try {
    const res = await apiFetch(`/avaliacoes/minhas/?page=${page}`);
    if (!res.ok) throw new Error('Falha ao carregar seu histórico de avaliações.');
    const data = await res.json();
    const list = data.results || data || [];

    myReviewsCache.clear();
    list.forEach(a => myReviewsCache.set(String(a.id), a));

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">${renderIcon('star', 26)}</span>
          <p>Você ainda não enviou avaliações. Conclua um pedido para avaliar produtos e produtores.</p>
        </div>
      `;
      return;
    }

    const produtos = list.filter(a => a.tipo_avaliacao === 'PRODUTO' || a.produto);
    const produtores = list.filter(a => a.tipo_avaliacao === 'PRODUTOR' || a.produtor);

    container.innerHTML = `
      <div class="review-history-section">
        <h4 class="review-history-section__title">Produtos avaliados (${produtos.length})</h4>
        ${
          produtos.length === 0
            ? '<p class="text-muted">Nenhum produto avaliado nesta página.</p>'
            : produtos.map(renderMyReviewCard).join('')
        }
      </div>
      <div class="review-history-section">
        <h4 class="review-history-section__title">Produtores avaliados (${produtores.length})</h4>
        ${
          produtores.length === 0
            ? '<p class="text-muted">Nenhum produtor avaliado nesta página.</p>'
            : produtores.map(renderMyReviewCard).join('')
        }
      </div>
    `;
    renderPaginationBar(pagEl, data, page, nextPage => loadMyReviews(nextPage));
  } catch (err) {
    container.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function loadMyComplaints(page = 1) {
  const container = document.getElementById('myComplaintsList');
  const pagEl = document.getElementById('myComplaintsPagination');
  if (!container) return;
  container.innerHTML =
    '<div class="catalog-loading"><div class="spinner"></div><p>Carregando reclamações...</p></div>';
  if (pagEl) pagEl.innerHTML = '';

  try {
    const res = await apiFetch(`/reclamacoes/?page=${page}`);
    if (!res.ok) throw new Error('Falha ao carregar reclamações.');
    const data = await res.json();
    const list = data.results || data || [];
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Você não possui reclamações registradas.</p></div>';
      return;
    }

    container.innerHTML = list
      .map(
        r => `
      <div class="order-card">
        <div class="order-card__header">
          <strong>${escapeHtml(r.assunto)}</strong>
          <span class="badge badge--outline">${escapeHtml(r.status)}</span>
        </div>
        <p>${escapeHtml(r.descricao)}</p>
        ${r.resposta_admin ? `<div class="demo-box" style="margin-top: 8px; margin-bottom: 0;"><strong>Resposta da moderação:</strong> ${escapeHtml(r.resposta_admin)}</div>` : ''}
        <span class="text-muted">${formatDate(r.criado_em)}</span>
      </div>
    `
      )
      .join('');
    renderPaginationBar(pagEl, data, page, nextPage => loadMyComplaints(nextPage));
  } catch (err) {
    container.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Pagamento Pix (Modal + QR SVG + Copia-e-Cola) ──────────────────────────
export async function showPixDetails(pedidoId) {
  try {
    const res = await apiFetch(`/pedidos/${pedidoId}/pix/`);
    if (!res.ok) {
      const err = await parseError(res);
      showToast(err, 'error');
      return;
    }

    const pix = await res.json();
    document.getElementById('pixValorDisplay').textContent = formatCurrency(pix.valor);
    document.getElementById('pixChaveDisplay').textContent = pix.chave || 'Chave não configurada';
    document.getElementById('pixCopiaColaInput').value = pix.copia_e_cola || '';

    const notice = document.getElementById('pixSimuladoNotice');
    if (notice) {
      notice.style.display = pix.simulado ? 'block' : 'none';
    }

    const qrBox = document.getElementById('pixQrContainer');
    if (qrBox) {
      qrBox.innerHTML = generateSimpleQrSvg(pix.copia_e_cola || pix.chave || String(pedidoId));
    }

    openModal('pixModalOverlay');
  } catch (_) {
    showToast('Erro ao consultar pagamento Pix.', 'error');
  }
}

export async function cancelOrder(pedidoId) {
  const motivo = prompt('Informe o motivo do cancelamento (opcional):');
  if (motivo === null) return;
  try {
    const res = await apiFetch(`/pedidos/${pedidoId}/cancelar/`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    });
    if (!res.ok) {
      const err = await parseError(res);
      showToast(err, 'error');
      return;
    }
    showToast('Pedido cancelado com sucesso.', 'info');
    await loadMyOrders(currentOrdersPage, true);
  } catch (_) {
    showToast('Erro ao cancelar pedido.', 'error');
  }
}

// ── Avaliações e Reclamações ──────────────────────────────────────────────
export function openReviewModalForOrder(pedidoId, mode = 'all') {
  const pedido = ordersCache.get(String(pedidoId));
  const select = document.getElementById('reviewTarget');
  if (!select || !pedido) return;

  clearFormError('reviewError');
  const pendingProducts = getPendingProductsForOrder(pedido);
  const producerPending = Boolean(pedido.produtor) && !pedido.avaliacoes_feitas?.produtor;

  const opts = [];
  if (mode === 'produto' || mode === 'all') {
    pendingProducts.forEach(it => {
      opts.push(`<option value="produto:${it.produto}">Produto: ${escapeHtml(it.nome_produto)}</option>`);
    });
  }
  if ((mode === 'produtor' || mode === 'all') && producerPending) {
    opts.push(
      `<option value="produtor:${pedido.produtor}">Produtor: ${escapeHtml(pedido.produtor_nome)}</option>`
    );
  }

  if (opts.length === 0) {
    showToast('Todos os itens desta compra já foram avaliados.', 'info');
    return;
  }

  select.innerHTML = opts.join('');
  const targetGroup = document.getElementById('reviewTargetGroup');
  if (targetGroup) targetGroup.style.display = 'block';

  document.getElementById('reviewEditId').value = '';
  document.getElementById('reviewOrderId').value = String(pedidoId);
  document.getElementById('reviewComment').value = '';

  const titleEl = document.getElementById('reviewModalTitle');
  if (titleEl) {
    if (mode === 'produto') titleEl.textContent = 'Avaliar Produto';
    else if (mode === 'produtor') titleEl.textContent = 'Avaliar Produtor';
    else titleEl.textContent = 'Avaliar Compra';
  }

  const ctxEl = document.getElementById('reviewOrderContext');
  if (ctxEl) {
    ctxEl.textContent = `Pedido ${pedido.numero_publico || `#${pedido.id}`} — ${pedido.produtor_nome}`;
  }

  const submitBtn = document.getElementById('btnSubmitReview');
  if (submitBtn) submitBtn.textContent = 'Enviar Avaliação';

  const defaultRadio = document.querySelector('input[name="reviewNota"][value="5"]');
  if (defaultRadio) defaultRadio.checked = true;

  openModal('reviewModalOverlay');
}

export function openEditReviewModal(reviewId) {
  const rev = myReviewsCache.get(String(reviewId));
  if (!rev) return;

  clearFormError('reviewError');
  const targetGroup = document.getElementById('reviewTargetGroup');
  if (targetGroup) targetGroup.style.display = 'none';

  document.getElementById('reviewEditId').value = String(rev.id);
  document.getElementById('reviewOrderId').value = rev.pedido ? String(rev.pedido) : '';
  document.getElementById('reviewComment').value = rev.comentario || '';

  const titleEl = document.getElementById('reviewModalTitle');
  if (titleEl) {
    titleEl.textContent = rev.produto ? 'Editar Avaliação do Produto' : 'Editar Avaliação do Produtor';
  }

  const ctxEl = document.getElementById('reviewOrderContext');
  if (ctxEl) {
    const targetName = rev.produto_nome || rev.produtor_nome || '';
    const orderInfo = rev.pedido_numero ? ` • Pedido ${rev.pedido_numero}` : '';
    ctxEl.textContent = `${targetName}${orderInfo}`;
  }

  const submitBtn = document.getElementById('btnSubmitReview');
  if (submitBtn) submitBtn.textContent = 'Salvar Alterações';

  const radio = document.querySelector(`input[name="reviewNota"][value="${rev.nota}"]`);
  if (radio) radio.checked = true;

  openModal('reviewModalOverlay');
}

export async function deleteMyReview(reviewId) {
  if (!confirm('Tem certeza de que deseja excluir esta avaliação?')) return;
  const res = await apiFetch(`/avaliacoes/${reviewId}/`, { method: 'DELETE' });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  showToast('Avaliação excluída com sucesso.', 'info');
  await loadMyReviews(1);
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

export function openComplaintModalForOrder(pedidoId) {
  const pedido = ordersCache.get(String(pedidoId));
  document.getElementById('complaintOrderId').value = String(pedidoId);
  const label = document.getElementById('complaintOrderLabel');
  if (label) {
    label.textContent = pedido
      ? `Pedido ${pedido.numero_publico} — ${pedido.produtor_nome}`
      : `Pedido #${pedidoId}`;
  }
  document.getElementById('complaintSubject').value = '';
  document.getElementById('complaintDescription').value = '';
  openModal('complaintModalOverlay');
}

export async function submitReview(payload, editId = null) {
  const isEdit = Boolean(editId);
  const endpoint = isEdit ? `/avaliacoes/${editId}/` : '/avaliacoes/';
  const method = isEdit ? 'PATCH' : 'POST';
  const body = isEdit ? { nota: payload.nota, comentario: payload.comentario } : payload;

  const res = await apiFetch(endpoint, {
    method,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }

  showToast(
    isEdit ? 'Avaliação atualizada com sucesso!' : 'Avaliação enviada com sucesso! Obrigado pelo feedback.',
    'success'
  );
  closeModal('reviewModalOverlay');

  if (currentOrdersTab === 'avaliacoes') {
    await loadMyReviews(1);
  } else {
    await loadMyOrders(currentOrdersPage, true);
  }
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

export async function submitComplaint(payload) {
  const res = await apiFetch('/reclamacoes/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }
  showToast('Reclamação registrada. Nossa moderação analisará o caso.', 'info');
  closeModal('complaintModalOverlay');
}

// ── Gerenciador de Endereços (CRUD completo + ViaCEP + tratamento de erro) ─
export function resetAddressForm() {
  const form = document.getElementById('addressForm');
  if (form) form.reset();
  const editId = document.getElementById('addrEditId');
  if (editId) editId.value = '';
  const rotulo = document.getElementById('addrRotulo');
  if (rotulo) rotulo.value = 'Casa';
  const title = document.getElementById('addressFormTitle');
  if (title) title.textContent = 'Adicionar Novo Endereço';
  const saveBtn = document.getElementById('btnSaveAddress');
  if (saveBtn) saveBtn.textContent = 'Salvar Endereço';
  const cancelBtn = document.getElementById('btnCancelAddressEdit');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const statusEl = document.getElementById('addrCepStatus');
  if (statusEl) statusEl.textContent = '';
  clearFormError('addressError');
}

export function openEditAddress(id) {
  const addr = addressesCache.get(String(id));
  if (!addr) return;
  clearFormError('addressError');
  document.getElementById('addrEditId').value = String(addr.id);
  document.getElementById('addrRotulo').value = addr.rotulo || 'Casa';
  document.getElementById('addrCep').value = addr.cep || '';
  document.getElementById('addrLogradouro').value = addr.logradouro || '';
  document.getElementById('addrNumero').value = addr.numero || '';
  document.getElementById('addrComplemento').value = addr.complemento || '';
  document.getElementById('addrBairro').value = addr.bairro || '';
  document.getElementById('addrCidade').value = addr.cidade || '';
  document.getElementById('addrEstado').value = addr.estado || '';

  const title = document.getElementById('addressFormTitle');
  if (title) title.textContent = `Editar Endereço: ${addr.rotulo}`;
  const saveBtn = document.getElementById('btnSaveAddress');
  if (saveBtn) saveBtn.textContent = 'Salvar Alterações';
  const cancelBtn = document.getElementById('btnCancelAddressEdit');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  document.getElementById('addrRotulo')?.focus();
}

export async function loadAddresses() {
  const list = document.getElementById('addressesList');
  if (!list) return;
  list.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch('/enderecos/');
    if (!res.ok) throw new Error('Não foi possível carregar seus endereços.');
    const addrs = await res.json();

    addressesCache.clear();
    addrs.forEach(a => addressesCache.set(String(a.id), a));

    if (addrs.length === 0) {
      list.innerHTML = '<p class="text-muted">Nenhum endereço cadastrado ainda.</p>';
      return;
    }

    list.innerHTML = addrs
      .map(
        a => `
      <div class="address-item">
        <div>
          <strong>${escapeHtml(a.rotulo)}</strong>
          <p>${escapeHtml(a.logradouro)}, ${escapeHtml(a.numero)}${a.complemento ? ` (${escapeHtml(a.complemento)})` : ''}</p>
          <span class="text-muted">${escapeHtml(a.bairro)}, ${escapeHtml(a.cidade)}/${escapeHtml(a.estado)} — CEP ${escapeHtml(a.cep)}</span>
        </div>
        <div style="display: flex; gap: var(--space-2); flex-shrink: 0;">
          <button type="button" class="btn btn--outline btn--sm btnEditAddress" data-id="${a.id}">${renderIcon('edit', 14)} Editar</button>
          <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteAddress" data-id="${a.id}">${renderIcon('trash-2', 14)} Excluir</button>
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    list.innerHTML = `
      <div class="auth-error">
        <p>${escapeHtml(err.message || 'Erro ao carregar endereços.')}</p>
        <button type="button" class="btn btn--outline btn--sm btnRetryAddresses" style="margin-top: 8px;">Tentar novamente</button>
      </div>
    `;
  }
}

export async function createAddress(payload, editId = null) {
  const isEdit = Boolean(editId);
  const res = await apiFetch(isEdit ? `/enderecos/${editId}/` : '/enderecos/', {
    method: isEdit ? 'PATCH' : 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseError(res);
    throw new Error(err);
  }
  showToast(isEdit ? 'Endereço atualizado com sucesso!' : 'Endereço cadastrado com sucesso!', 'success');
  resetAddressForm();
  await loadAddresses();
  window.dispatchEvent(new CustomEvent('fv:addresses-updated'));
}

export async function deleteAddress(id) {
  const res = await apiFetch(`/enderecos/${id}/`, { method: 'DELETE' });
  if (!res.ok) {
    showToast('Erro ao remover endereço.', 'error');
    return;
  }
  showToast('Endereço removido.', 'info');
  await loadAddresses();
  window.dispatchEvent(new CustomEvent('fv:addresses-updated'));
}

export async function fetchViaCEP(cepClean) {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch (_) {
    return null;
  }
}
