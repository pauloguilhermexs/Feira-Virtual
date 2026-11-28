/**
 * Painel Dedicado do Produtor Rural: Visão Geral (com vendas concluídas), Meus Produtos (paginado + preview),
 * Minhas Propriedades (preview), Pedidos Recebidos, Avaliação de Clientes e Avaliações (paginado + média do servidor).
 */
import { apiFetch, parseError } from './api.js?v=20261121a';
import { statusLabels } from './orders.js?v=20261121a';
import {
  clearFormError,
  closeModal,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatUnitLabel,
  openModal,
  renderBrandLogoHtml,
  renderIcon,
  renderPaginationBar,
  renderStars,
  safeUrl,
  showFormError,
  showToast,
} from './ui.js?v=20261121a';

let producerProductsCache = [];
let producerOrdersCache = new Map();
let producerCategoriesCache = [];
let currentProducerOrderStatus = '';
let currentProducerProductsPage = 1;
let currentPropertyPhotoUrl = '';
let currentEditingProductPhotoUrl = '';
let tempProdPreviewObjectUrl = null;
let tempPropPreviewObjectUrl = null;

const CULTIVO_LABELS = {
  ORGANICO_CERTIFICADO: { label: 'Orgânico', cls: 'badge--cultivo-organico' },
  AGROECOLOGICO: { label: 'Agroecológico', cls: 'badge--cultivo-agro' },
  CONVENCIONAL: { label: 'Convencional', cls: 'badge--cultivo-conv' },
};

async function syncProducerStatusBanner() {
  const badge = document.getElementById('producerStatusBadge');
  const warn = document.getElementById('producerStatusWarning');
  const titleEl = document.getElementById('producerWorkspaceTitle');
  try {
    const res = await apiFetch('/perfil/produtor/');
    if (!res.ok) return null;
    const p = await res.json();
    if (titleEl && p.nome_propriedade) {
      titleEl.textContent = p.nome_propriedade;
    }
    if (badge) {
      badge.textContent = `Status: ${p.status}`;
      badge.className = `badge ${p.status === 'APROVADO' ? 'badge--success' : 'badge--outline'}`;
    }
    if (warn) {
      if (p.status === 'PENDENTE' || p.status === 'SUSPENSO') {
        warn.textContent =
          p.status === 'PENDENTE'
            ? 'Seu cadastro de produtor está PENDENTE de aprovação. Você pode cadastrar seus produtos e atualizar sua propriedade, mas eles só aparecerão no catálogo público após a aprovação do administrador.'
            : 'Seu perfil de produtor está SUSPENSO. Seus produtos não aparecem no catálogo público até que o administrador reative sua conta.';
        warn.style.display = 'block';
      } else {
        warn.textContent = '';
        warn.style.display = 'none';
      }
    }
    return p;
  } catch (_) {
    return null;
  }
}

export async function openProducerPanel(initialTab = 'visao_geral') {
  const storefront = document.getElementById('publicStorefront');
  const prodWs = document.getElementById('producerWorkspace');
  const delivWs = document.getElementById('deliveryWorkspace');
  const adminWs = document.getElementById('adminWorkspace');
  if (storefront) storefront.style.display = 'none';
  if (delivWs) delivWs.style.display = 'none';
  if (adminWs) adminWs.style.display = 'none';
  if (prodWs) prodWs.style.display = 'block';

  syncProducerStatusBanner();
  switchProducerTab(initialTab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function switchProducerTab(tab) {
  const normalized = tab === 'vendas' ? 'avaliacoes' : tab;
  const map = {
    visao_geral: 'producerTabVisao_geral',
    produtos: 'producerTabProdutos',
    propriedade: 'producerTabPropriedade',
    pedidos: 'producerTabPedidos',
    avaliacoes: 'producerTabAvaliacoes',
  };
  Object.entries(map).forEach(([k, id]) => {
    const tabBtn = document.querySelector(`.panel-tab[data-producer-tab="${k}"]`);
    if (tabBtn) {
      tabBtn.classList.toggle('active', k === normalized);
      tabBtn.setAttribute('aria-selected', String(k === normalized));
    }
    document
      .querySelectorAll(`[data-producer-nav="${k}"]`)
      .forEach(el => el.classList.toggle('active', k === normalized));
    const panel = document.getElementById(id);
    if (panel) panel.style.display = k === normalized ? 'block' : 'none';
  });

  if (normalized === 'visao_geral') {
    loadProducerOverview();
  } else if (normalized === 'produtos') {
    loadProducerCategoriesSelect();
    loadProducerProducts(1);
  } else if (normalized === 'propriedade') {
    loadProducerProperty();
  } else if (normalized === 'pedidos') {
    loadProducerOrders(1);
  } else if (normalized === 'avaliacoes') {
    loadProducerReviews(1, 1);
  }
}

// ── Visão Geral do Produtor (com vendas concluídas de /vendas/) ────────────
async function loadProducerOverview() {
  const el = document.getElementById('producerOverviewContent');
  if (!el) return;
  el.innerHTML =
    '<div class="catalog-loading"><div class="spinner"></div><p>Carregando indicadores da propriedade...</p></div>';

  try {
    const [resResumo, resVendas] = await Promise.all([
      apiFetch('/produtor/pedidos/resumo/'),
      apiFetch('/produtor/pedidos/vendas/'),
    ]);
    if (!resResumo.ok) throw new Error('Falha ao carregar visão geral.');
    const r = await resResumo.json();
    const vendas = resVendas.ok ? await resVendas.json() : { pedidos: [] };
    const pedidosConcluidos = (vendas.pedidos || []).slice(0, 10);

    const mediaTexto =
      r.total_avaliacoes_recebidas > 0 && r.media_avaliacoes_recebidas !== null
        ? `${Number(r.media_avaliacoes_recebidas).toFixed(1).replace('.', ',')} (${r.total_avaliacoes_recebidas})`
        : 'Sem avaliações';

    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <span>Meus produtos ativos</span>
          <strong>${Number(r.produtos_ativos) || 0} / ${Number(r.total_produtos) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Pedidos pendentes</span>
          <strong>${Number(r.pedidos_pendentes) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Pedidos em andamento</span>
          <strong>${Number(r.pedidos_em_andamento) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Pedidos concluídos</span>
          <strong>${Number(r.pedidos_concluidos) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Faturamento concluído</span>
          <strong>${formatCurrency(r.faturamento_total)}</strong>
        </div>
        <div class="kpi-card">
          <span>Avaliações recebidas</span>
          <strong>${escapeHtml(mediaTexto)}</strong>
        </div>
      </div>

      <div class="workspace-quick-actions">
        <button type="button" class="btn btn--cta btn--sm" data-producer-nav="produtos">Gerenciar meus produtos</button>
        <button type="button" class="btn btn--primary btn--sm" data-producer-nav="pedidos">Ver pedidos recebidos (${Number(r.pedidos_pendentes) || 0} pendente(s))</button>
        <button type="button" class="btn btn--outline btn--sm" data-producer-nav="propriedade">Editar minha propriedade</button>
        <button type="button" class="btn btn--outline btn--sm" data-producer-nav="avaliacoes">Ver avaliações (${Number(r.total_avaliacoes_recebidas) || 0})</button>
      </div>

      <div class="workspace-card" style="margin-top: var(--space-6);">
        <h2 class="workspace-card__title" style="margin-bottom: var(--space-3);">Vendas Concluídas Recentes (${Number(vendas.quantidade_vendas) || pedidosConcluidos.length})</h2>
        ${
          pedidosConcluidos.length === 0
            ? '<p class="text-muted">Nenhuma venda concluída registrada ainda.</p>'
            : `
            <div class="panel-list">
              ${pedidosConcluidos
                .map(
                  o => `
                <div class="panel-list-item">
                  <div class="panel-list-item__info">
                    <strong>${escapeHtml(o.numero_publico || `#${o.id}`)} • ${escapeHtml(o.cliente_nome || 'Cliente')}</strong>
                    <span class="text-muted">${formatDate(o.concluido_em || o.atualizado_em)} • ${escapeHtml(o.modalidade)} • ${escapeHtml(o.forma_pagamento)}</span>
                  </div>
                  <strong>${formatCurrency(o.total)}</strong>
                </div>
              `
                )
                .join('')}
            </div>
          `
        }
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Meus Produtos (CRUD paginado + Pré-visualização antes de salvar) ───────
async function loadProducerCategoriesSelect() {
  const sel = document.getElementById('prodCategoria');
  if (!sel) return;
  try {
    const res = await apiFetch('/categorias/');
    if (!res.ok) return;
    const data = await res.json();
    producerCategoriesCache = (data.results || data || []).filter(c => c.ativa !== false);
    const current = sel.value;
    sel.innerHTML = producerCategoriesCache
      .map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`)
      .join('');
    if (current) sel.value = current;
  } catch (_) {}
}

export async function loadProducerProducts(page = 1) {
  const list = document.getElementById('producerProductsList');
  const pagEl = document.getElementById('producerProductsPagination');
  if (!list) return;
  currentProducerProductsPage = page;
  list.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  try {
    const res = await apiFetch(`/produtor/produtos/?page=${page}`);
    if (!res.ok) throw new Error('Falha ao carregar seus produtos.');
    const data = await res.json();
    producerProductsCache = data.results || data || [];

    if (producerProductsCache.length === 0) {
      list.innerHTML =
        '<div class="workspace-card empty-state"><p>Você ainda não possui produtos cadastrados.</p></div>';
      return;
    }

    list.innerHTML = producerProductsCache
      .map(p => {
        const customImg = p.imagem ? safeUrl(p.imagem, '') : '';
        const thumbHtml = customImg
          ? `<img src="${escapeHtml(customImg)}" alt="${escapeHtml(p.nome)}" class="panel-thumb" />`
          : `<div class="panel-thumb--logo">${renderBrandLogoHtml(p.nome, 'product-card__img--default')}</div>`;
        const cult = CULTIVO_LABELS[p.tipo_producao] || CULTIVO_LABELS.CONVENCIONAL;
        const statusBadges = p.oculto_moderacao
          ? '<span class="badge status--cancelled">Oculto pela moderação</span>'
          : `<span class="badge ${p.ativo ? 'badge--success' : 'badge--outline'}">${p.ativo ? 'Ativo' : 'Oculto'}</span>`;
        return `
        <div class="panel-list-item">
          ${thumbHtml}
          <div class="panel-list-item__info">
            <strong>${escapeHtml(p.nome)}</strong>
            <span>${formatCurrency(p.preco)} / ${escapeHtml(formatUnitLabel(p.unidade_medida))} • Estoque: ${parseFloat(p.estoque)} • ${escapeHtml(cult.label)}</span>
            ${p.descricao ? `<span class="text-muted">${escapeHtml(p.descricao)}</span>` : ''}
            <div>${statusBadges}</div>
          </div>
          <div class="panel-list-item__actions">
            <button type="button" class="btn btn--outline btn--sm btnEditProdProduct" data-id="${p.id}">Editar</button>
            <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteProdProduct" data-id="${p.id}">Excluir</button>
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, nextPage => loadProducerProducts(nextPage));
  } catch (err) {
    list.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export function updateProductPreview() {
  const preview = document.getElementById('prodPreviewCard');
  if (!preview) return;

  const nome = document.getElementById('prodNome')?.value.trim() || 'Nome do produto';
  const catSel = document.getElementById('prodCategoria');
  const catNome = catSel?.options[catSel.selectedIndex]?.text || 'Categoria';
  const preco = document.getElementById('prodPreco')?.value || '0';
  const unidade = document.getElementById('prodUnidade')?.value || 'UNIDADE';
  const estoque = parseFloat(document.getElementById('prodEstoque')?.value || '0') || 0;
  const tipo = document.getElementById('prodTipo')?.value || 'CONVENCIONAL';
  const desc =
    document.getElementById('prodDescricao')?.value.trim() || 'A descrição do seu produto aparecerá aqui.';
  const fileInput = document.getElementById('prodImagem');

  let imgSrc = currentEditingProductPhotoUrl || '';
  let isDefault = !currentEditingProductPhotoUrl;
  if (fileInput?.files?.length > 0) {
    if (tempProdPreviewObjectUrl) URL.revokeObjectURL(tempProdPreviewObjectUrl);
    tempProdPreviewObjectUrl = URL.createObjectURL(fileInput.files[0]);
    imgSrc = tempProdPreviewObjectUrl;
    isDefault = false;
  }

  const cult = CULTIVO_LABELS[tipo] || CULTIVO_LABELS.CONVENCIONAL;
  const thumbMedia = isDefault
    ? renderBrandLogoHtml(nome, 'product-card__img product-card__img--default')
    : `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(nome)}" class="product-card__img" />`;

  preview.innerHTML = `
    <div class="product-card__thumb">
      ${thumbMedia}
      <div class="product-card__badges">
        <span class="badge badge--cultivo ${cult.cls}">${escapeHtml(cult.label)}</span>
      </div>
      <span class="product-card__stock-tag">${estoque > 0 ? `${estoque} em estoque` : 'Esgotado'}</span>
    </div>
    <span class="product-card__category">${escapeHtml(catNome)}</span>
    <h3 class="product-card__title">${escapeHtml(nome)}</h3>
    <p class="product-card__desc">${escapeHtml(desc)}</p>
    <div class="product-card__action-row">
      <div class="product-card__price-wrap">
        <span class="product-card__price">${formatCurrency(preco)}</span>
        <span class="product-card__unit">/ ${escapeHtml(formatUnitLabel(unidade))}</span>
      </div>
    </div>
  `;
}

export async function openProductForm(productId = null) {
  const wrap = document.getElementById('producerProductFormWrap');
  const form = document.getElementById('producerProductForm');
  const heading = document.getElementById('producerProductFormTitle');
  if (!wrap || !form) return;

  await loadProducerCategoriesSelect();
  clearFormError('producerProductError');
  form.reset();
  currentEditingProductPhotoUrl = '';

  if (productId) {
    const p = producerProductsCache.find(x => String(x.id) === String(productId));
    if (p) {
      if (heading) heading.textContent = `Editar Produto: ${p.nome}`;
      document.getElementById('prodId').value = String(p.id);
      document.getElementById('prodNome').value = p.nome || '';
      document.getElementById('prodCategoria').value = String(p.categoria || '');
      document.getElementById('prodPreco').value = String(p.preco || '');
      document.getElementById('prodUnidade').value = p.unidade_medida || 'UNIDADE';
      document.getElementById('prodEstoque').value = String(p.estoque || '0');
      document.getElementById('prodTipo').value = p.tipo_producao || 'CONVENCIONAL';
      document.getElementById('prodDescricao').value = p.descricao || '';
      document.getElementById('prodAtivo').checked = Boolean(p.ativo);
      currentEditingProductPhotoUrl = p.imagem ? safeUrl(p.imagem, '') : '';
    }
  } else {
    if (heading) heading.textContent = 'Cadastrar Novo Produto';
    document.getElementById('prodId').value = '';
    document.getElementById('prodTipo').value = 'CONVENCIONAL';
    document.getElementById('prodAtivo').checked = true;
  }

  wrap.style.display = 'block';
  updateProductPreview();
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export async function saveProducerProduct() {
  clearFormError('producerProductError');
  const id = document.getElementById('prodId').value;
  const fd = new FormData();
  fd.append('nome', document.getElementById('prodNome').value.trim());
  fd.append('categoria', document.getElementById('prodCategoria').value);
  fd.append('preco', document.getElementById('prodPreco').value.replace(',', '.'));
  fd.append('unidade_medida', document.getElementById('prodUnidade').value);
  fd.append('estoque', document.getElementById('prodEstoque').value.replace(',', '.'));
  fd.append('tipo_producao', document.getElementById('prodTipo').value);
  fd.append('descricao', document.getElementById('prodDescricao').value.trim());
  fd.append('ativo', document.getElementById('prodAtivo').checked ? 'true' : 'false');

  const fileInput = document.getElementById('prodImagem');
  if (fileInput?.files?.length > 0) {
    fd.append('imagem', fileInput.files[0]);
  }

  const endpoint = id ? `/produtor/produtos/${id}/` : '/produtor/produtos/';
  const method = id ? 'PATCH' : 'POST';

  const res = await apiFetch(endpoint, { method, body: fd });
  if (!res.ok) {
    const err = await parseError(res);
    showFormError('producerProductError', err);
    return;
  }

  document.getElementById('producerProductFormWrap').style.display = 'none';
  showToast(id ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!', 'success');
  await loadProducerProducts(currentProducerProductsPage);
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

export async function deleteProducerProduct(id) {
  if (!confirm('Deseja realmente excluir este produto?')) return;
  const res = await apiFetch(`/produtor/produtos/${id}/`, { method: 'DELETE' });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  showToast('Produto excluído.', 'info');
  await loadProducerProducts(1);
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

// ── Pedidos Recebidos, Histórico e Avaliação de Clientes ───────────────────
export function setProducerOrderStatusFilter(statusVal) {
  currentProducerOrderStatus = statusVal;
  document.querySelectorAll('#producerOrderFilters .pill').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.producerStatus || '') === statusVal);
  });
  loadProducerOrders(1);
}

export async function loadProducerOrders(page = 1) {
  const container = document.getElementById('producerOrdersList');
  const pagEl = document.getElementById('producerOrdersPagination');
  if (!container) return;
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  const params = new URLSearchParams({ page: String(page) });
  if (currentProducerOrderStatus) params.set('status', currentProducerOrderStatus);

  try {
    const res = await apiFetch(`/produtor/pedidos/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar pedidos.');
    const data = await res.json();
    const orders = data.results || data || [];

    producerOrdersCache.clear();
    orders.forEach(o => producerOrdersCache.set(String(o.id), o));

    if (orders.length === 0) {
      container.innerHTML =
        '<div class="workspace-card empty-state"><p>Nenhum pedido encontrado neste filtro.</p></div>';
      return;
    }

    container.innerHTML = orders
      .map(o => {
        const st = statusLabels[o.status] || { label: o.status, class: '' };
        let actions = '';
        if (o.status === 'PENDENTE') {
          actions = `
          <button type="button" class="btn btn--primary btn--sm btnProdOrderAction" data-id="${o.id}" data-action="aceitar">${renderIcon('check', 14)} Aceitar</button>
          <button type="button" class="btn btn--outline btn--sm text-danger btnProdOrderAction" data-id="${o.id}" data-action="recusar">${renderIcon('x', 14)} Recusar</button>
        `;
        } else if (o.status === 'ACEITO') {
          actions = `<button type="button" class="btn btn--primary btn--sm btnProdOrderAction" data-id="${o.id}" data-action="status" data-next="EM_PREPARO">Iniciar Preparo</button>`;
        } else if (o.status === 'EM_PREPARO') {
          actions = `<button type="button" class="btn btn--primary btn--sm btnProdOrderAction" data-id="${o.id}" data-action="status" data-next="PRONTO">Marcar Pronto</button>`;
        } else if (o.status === 'PRONTO' && o.modalidade === 'RETIRADA') {
          actions = `<button type="button" class="btn btn--cta btn--sm btnProdOrderAction" data-id="${o.id}" data-action="status" data-next="CONCLUIDO">Confirmar Retirada</button>`;
        } else if (o.status === 'CONCLUIDO') {
          actions = o.cliente_avaliado
            ? '<span class="badge status--completed">Cliente avaliado</span>'
            : `<button type="button" class="btn btn--outline btn--sm btnRateClient" data-id="${o.id}">${renderIcon('star', 14)} Avaliar cliente</button>`;
        }

        return `
        <div class="order-card">
          <div class="order-card__header">
            <div>
              <strong>${escapeHtml(o.numero_publico || `#${o.id}`)}</strong>
              <span class="text-muted">• Cliente: ${escapeHtml(o.cliente_nome || 'Cliente')} • ${formatDate(o.criado_em)}</span>
            </div>
            <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
          </div>
          <div class="order-card__body">
            <p>${o.modalidade === 'ENTREGA' ? 'Entrega em domicílio' : 'Retirada na propriedade'} • Pagamento: ${escapeHtml(o.forma_pagamento)}</p>
            ${o.endereco_entrega ? `<p><strong>Endereço:</strong> ${escapeHtml(o.endereco_entrega)}</p>` : ''}
            ${o.previsao_entrega ? `<p><strong>Previsão:</strong> ${escapeHtml(o.previsao_entrega)}</p>` : ''}
            ${o.observacao ? `<p><strong>Obs.:</strong> ${escapeHtml(o.observacao)}</p>` : ''}
            <ul class="order-items-list">
              ${(o.itens || []).map(it => `<li>${escapeHtml(it.nome_produto)} × ${parseFloat(it.quantidade)} ${escapeHtml(formatUnitLabel(it.unidade_medida))}</li>`).join('')}
            </ul>
          </div>
          <div class="order-card__footer">
            <strong>${formatCurrency(o.total_com_frete || o.total)}</strong>
            <div class="order-card__actions">${actions}</div>
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, nextPage => loadProducerOrders(nextPage));
  } catch (err) {
    container.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function handleProducerOrderAction(orderId, action, nextStatus = '') {
  let endpoint = `/produtor/pedidos/${orderId}/${action}/`;
  let body = {};

  if (action === 'aceitar') {
    const previsao = prompt('Previsão de entrega/retirada (opcional, ex: Amanhã 09h-12h):');
    if (previsao === null) return;
    body = { previsao_entrega: previsao };
  } else if (action === 'recusar') {
    const motivo = prompt('Motivo da recusa:');
    if (motivo === null) return;
    body = { motivo };
  } else if (action === 'status') {
    endpoint = `/produtor/pedidos/${orderId}/status/`;
    body = { status: nextStatus };
  }

  const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  showToast('Status do pedido atualizado!', 'success');
  await loadProducerOrders(1);
}

export function openClientReviewModal(orderId) {
  const pedido = producerOrdersCache.get(String(orderId));
  if (!pedido) return;
  clearFormError('clientReviewError');
  document.getElementById('clientReviewOrderId').value = String(pedido.id);
  const label = document.getElementById('clientReviewOrderLabel');
  if (label) {
    label.textContent = `Pedido ${pedido.numero_publico || `#${pedido.id}`} — Cliente: ${pedido.cliente_nome || 'Cliente'}`;
  }
  document.getElementById('clientReviewComment').value = '';
  const nota5 = document.querySelector('input[name="clientReviewNota"][value="5"]');
  if (nota5) nota5.checked = true;
  openModal('clientReviewModalOverlay');
}

export async function submitClientReview() {
  clearFormError('clientReviewError');
  const pedidoId = Number(document.getElementById('clientReviewOrderId').value);
  const nota = Number(document.querySelector('input[name="clientReviewNota"]:checked')?.value || 5);
  const comentario = document.getElementById('clientReviewComment').value.trim();

  const res = await apiFetch('/produtor/avaliacoes-clientes/', {
    method: 'POST',
    body: JSON.stringify({ pedido: pedidoId, nota, comentario }),
  });
  if (!res.ok) {
    showFormError('clientReviewError', await parseError(res));
    return;
  }

  closeModal('clientReviewModalOverlay');
  showToast('Avaliação do cliente registrada com sucesso!', 'success');
  await loadProducerOrders(1);
}

// ── Avaliações (Recebidas vs. Realizadas, paginadas + média real do servidor) ──
async function loadProducerReviews(pageRec = 1, pageFeitas = 1) {
  const el = document.getElementById('producerReviewsContent');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';

  try {
    const [resResumo, resRec, resFeitas] = await Promise.all([
      apiFetch('/produtor/pedidos/resumo/'),
      apiFetch(`/produtor/avaliacoes/?page=${pageRec}`),
      apiFetch(`/produtor/avaliacoes-clientes/?page=${pageFeitas}`),
    ]);
    const resumo = resResumo.ok ? await resResumo.json() : {};
    const recData = resRec.ok ? await resRec.json() : { results: [] };
    const feitasData = resFeitas.ok ? await resFeitas.json() : { results: [] };
    const recebidas = recData.results || recData || [];
    const feitas = feitasData.results || feitasData || [];

    const totalRecebidas =
      Number(resumo.total_avaliacoes_recebidas ?? recData.count ?? recebidas.length) || 0;
    const totalFeitas = Number(resumo.total_avaliacoes_clientes ?? feitasData.count ?? feitas.length) || 0;
    const mediaSrv =
      totalRecebidas > 0 &&
      resumo.media_avaliacoes_recebidas !== null &&
      resumo.media_avaliacoes_recebidas !== undefined
        ? Number(resumo.media_avaliacoes_recebidas).toFixed(1).replace('.', ',')
        : null;

    el.innerHTML = `
      <div class="kpi-grid" style="margin-bottom: var(--space-5);">
        <div class="kpi-card">
          <span>Avaliações recebidas</span>
          <strong>${totalRecebidas}</strong>
        </div>
        <div class="kpi-card">
          <span>Média recebida</span>
          <strong>${mediaSrv ? `${mediaSrv} / 5` : 'Sem avaliações'}</strong>
        </div>
        <div class="kpi-card">
          <span>Clientes avaliados por você</span>
          <strong>${totalFeitas}</strong>
        </div>
      </div>

      <div class="reviews-split">
        <div class="workspace-card">
          <h2 class="workspace-card__title" style="margin-bottom: var(--space-4);">Avaliações Recebidas dos Clientes (${totalRecebidas})</h2>
          ${
            recebidas.length === 0
              ? '<div class="empty-state"><p>Nenhuma avaliação recebida ainda.</p></div>'
              : recebidas
                  .map(
                    a => `
              <div class="review-card">
                <div class="review-card__top">
                  <strong>${escapeHtml(a.cliente_nome || 'Cliente')}</strong>
                  <span class="badge badge--outline">${a.tipo_avaliacao === 'PRODUTO' ? `Produto: ${escapeHtml(a.produto_nome || '')}` : 'Propriedade'}</span>
                </div>
                <div style="margin-bottom: 4px;">${renderStars(a.nota, 14)} <strong>(${Number(a.nota) || 0}/5)</strong></div>
                ${a.comentario ? `<p style="margin-bottom: 4px;">${escapeHtml(a.comentario)}</p>` : ''}
                <span class="text-muted">${formatDate(a.criado_em)}</span>
              </div>
            `
                  )
                  .join('')
          }
          <div id="producerRecReviewsPagination" class="pagination-wrap"></div>
        </div>

        <div class="workspace-card">
          <h2 class="workspace-card__title" style="margin-bottom: var(--space-4);">Avaliações de Clientes Realizadas (${totalFeitas})</h2>
          ${
            feitas.length === 0
              ? '<div class="empty-state"><p>Você ainda não avaliou nenhum cliente. Após concluir um pedido, clique em "Avaliar cliente" na aba Pedidos recebidos.</p></div>'
              : feitas
                  .map(
                    a => `
              <div class="review-card">
                <div class="review-card__top">
                  <strong>${escapeHtml(a.cliente_nome || 'Cliente')}</strong>
                  <span class="badge badge--outline">Pedido ${escapeHtml(a.pedido_numero || `#${a.pedido}`)}</span>
                </div>
                <div style="margin-bottom: 4px;">${renderStars(a.nota, 14)} <strong>(${Number(a.nota) || 0}/5)</strong></div>
                ${a.comentario ? `<p style="margin-bottom: 4px;">${escapeHtml(a.comentario)}</p>` : ''}
                <span class="text-muted">${formatDate(a.criado_em)}</span>
              </div>
            `
                  )
                  .join('')
          }
          <div id="producerClientReviewsPagination" class="pagination-wrap"></div>
        </div>
      </div>
    `;

    renderPaginationBar(document.getElementById('producerRecReviewsPagination'), recData, pageRec, nextPage =>
      loadProducerReviews(nextPage, pageFeitas)
    );
    renderPaginationBar(
      document.getElementById('producerClientReviewsPagination'),
      feitasData,
      pageFeitas,
      nextPage => loadProducerReviews(pageRec, nextPage)
    );
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Dados da Propriedade Rural + Pré-visualização ──────────────────────────
export function updatePropertyPreview() {
  const card = document.getElementById('propPreviewCard');
  if (!card) return;

  const nome = document.getElementById('propNome')?.value.trim() || 'Nome da propriedade';
  const desc =
    document.getElementById('propDescricao')?.value.trim() ||
    'A apresentação e história da sua propriedade aparecerão aqui.';
  const cidade = document.getElementById('propCidade')?.value.trim() || '';
  const estado = document.getElementById('propEstado')?.value.trim().toUpperCase() || '';
  const local = [cidade, estado].filter(Boolean).join(' / ') || 'Localização da propriedade';
  const chavePix = document.getElementById('propChavePix')?.value.trim() || '';
  const maquininha = Boolean(document.getElementById('propMaquininha')?.checked);
  const dinheiro = Boolean(document.getElementById('propDinheiro')?.checked);
  const fileInput = document.getElementById('propFoto');

  let imgSrc = currentPropertyPhotoUrl || '';
  let isDefault = !currentPropertyPhotoUrl;
  if (fileInput?.files?.length > 0) {
    if (tempPropPreviewObjectUrl) URL.revokeObjectURL(tempPropPreviewObjectUrl);
    tempPropPreviewObjectUrl = URL.createObjectURL(fileInput.files[0]);
    imgSrc = tempPropPreviewObjectUrl;
    isDefault = false;
  }

  const avatarHtml = isDefault
    ? `<div class="producer-card__avatar producer-card__avatar--logo">${renderBrandLogoHtml(nome, 'producer-card__img producer-card__img--default')}</div>`
    : `<div class="producer-card__avatar"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(nome)}" class="producer-card__img" /></div>`;

  card.innerHTML = `
    <div class="producer-card__top">
      ${avatarHtml}
      <div class="producer-card__header">
        <h3>${escapeHtml(nome)}</h3>
        <span class="producer-card__location">${renderIcon('map-pin', 14)} ${escapeHtml(local)}</span>
      </div>
    </div>
    <p class="producer-card__desc">${escapeHtml(desc)}</p>
    <div class="producer-card__footer">
      <div class="producer-card__badges">
        ${chavePix ? '<span class="payment-badge"><img src="/static/assets/pix-icon.webp" alt="" class="pix-brand-icon" width="16" height="16" /> Pix</span>' : ''}
        ${maquininha ? `<span class="payment-badge">${renderIcon('credit-card', 14)} Cartão</span>` : ''}
        ${dinheiro ? `<span class="payment-badge">${renderIcon('banknote', 14)} Dinheiro</span>` : ''}
      </div>
    </div>
  `;
}

async function loadProducerProperty() {
  try {
    const p = await syncProducerStatusBanner();
    if (!p) return;

    document.getElementById('propNome').value = p.nome_propriedade || '';
    document.getElementById('propDescricao').value = p.descricao || '';
    document.getElementById('propEndereco').value = p.endereco_propriedade || '';
    document.getElementById('propCidade').value = p.cidade || '';
    document.getElementById('propEstado').value = p.estado || '';
    document.getElementById('propChavePix').value = p.chave_pix || '';
    document.getElementById('propMaquininha').checked = Boolean(p.possui_maquininha);
    document.getElementById('propDinheiro').checked = Boolean(p.aceita_dinheiro);

    const previewSlot = document.getElementById('propFotoPreviewSlot');
    const previewText = document.getElementById('propFotoPreviewText');
    currentPropertyPhotoUrl = p.foto_propriedade ? safeUrl(p.foto_propriedade, '') : '';
    if (previewSlot && previewText) {
      if (currentPropertyPhotoUrl) {
        previewSlot.classList.add('property-photo-preview__slot--photo');
        previewSlot.innerHTML = `<img src="${escapeHtml(currentPropertyPhotoUrl)}" alt="Foto atual da propriedade" />`;
        previewText.textContent =
          'Foto atual da propriedade cadastrada. Selecione outro arquivo acima se quiser substituí-la.';
      } else {
        previewSlot.classList.remove('property-photo-preview__slot--photo');
        previewSlot.innerHTML = renderBrandLogoHtml('Imagem da propriedade', 'producer-card__img--default');
        previewText.textContent =
          'Usando logo padrão da Feira Virtual (envie uma foto para personalizar sua propriedade).';
      }
    }
    updatePropertyPreview();
  } catch (_) {}
}

export async function saveProducerProperty() {
  clearFormError('producerPropertyError');
  const fd = new FormData();
  fd.append('nome_propriedade', document.getElementById('propNome').value.trim());
  fd.append('descricao', document.getElementById('propDescricao').value.trim());
  fd.append('endereco_propriedade', document.getElementById('propEndereco').value.trim());
  fd.append('cidade', document.getElementById('propCidade').value.trim());
  fd.append('estado', document.getElementById('propEstado').value.trim().toUpperCase());
  fd.append('chave_pix', document.getElementById('propChavePix').value.trim());
  fd.append('possui_maquininha', document.getElementById('propMaquininha').checked ? 'true' : 'false');
  fd.append('aceita_dinheiro', document.getElementById('propDinheiro').checked ? 'true' : 'false');

  const foto = document.getElementById('propFoto');
  if (foto?.files?.length > 0) {
    fd.append('foto_propriedade', foto.files[0]);
  }

  const res = await apiFetch('/perfil/produtor/', { method: 'PATCH', body: fd });
  if (!res.ok) {
    showFormError('producerPropertyError', await parseError(res));
    return;
  }
  if (foto) foto.value = '';
  await loadProducerProperty();
  showToast('Dados da propriedade atualizados com sucesso!', 'success');
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}
