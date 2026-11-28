/**
 * Painel Dedicado do Entregador: Visão Geral, Entregas Disponíveis, Minhas Entregas, Histórico, Ganhos e Veículo.
 */
import { apiFetch, parseError } from './api.js?v=20261121a';
import { statusLabels } from './orders.js?v=20261121a';
import {
  clearFormError,
  escapeHtml,
  formatCurrency,
  formatDate,
  renderPaginationBar,
  showFormError,
  showToast,
} from './ui.js?v=20261121a';

let currentDeliveryTab = 'visao_geral';
let currentDeliveryGroup = '';

function mapsSearchUrl(address) {
  if (!address || typeof address !== 'string') return '';
  const cleaned = address.trim();
  if (!cleaned || cleaned.toLowerCase().includes('disponível após aceitar')) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleaned)}`;
}

function renderDeliveryCard(o, mode) {
  const st = statusLabels[o.status] || { label: o.status, class: '' };
  const origemLabel = o.local_retirada || o.produtor_nome || 'Propriedade do produtor';
  const origemMap = mapsSearchUrl(o.local_retirada || '');
  const destinoAddr = o.endereco_entrega || o.endereco_resumido || 'Endereço não informado';
  const destinoMap = mapsSearchUrl(destinoAddr);
  const frete = formatCurrency(o.taxa_entrega);
  const totalPedido = formatCurrency(o.total_com_frete || o.total);

  let actionHtml = '';
  if (mode === 'disponiveis') {
    actionHtml = `
      <button type="button" class="btn btn--cta btn--sm btnDeliveryAction" data-id="${o.id}" data-action="aceitar">
        Aceitar entrega
      </button>
    `;
  } else if (mode === 'minhas') {
    if (o.status === 'PRONTO') {
      actionHtml = `
        <button type="button" class="btn btn--primary btn--sm btnDeliveryAction" data-id="${o.id}" data-action="saiu-para-entrega">
          Retirar e sair para entrega
        </button>
      `;
    } else if (o.status === 'EM_ENTREGA') {
      actionHtml = `
        <button type="button" class="btn btn--cta btn--sm btnDeliveryAction" data-id="${o.id}" data-action="confirmar">
          Confirmar entrega concluída
        </button>
      `;
    } else if (['ACEITO', 'EM_PREPARO'].includes(o.status)) {
      actionHtml = `<span class="text-muted">Aguardando produtor concluir o preparo para retirada</span>`;
    } else if (o.status === 'CONCLUIDO' && o.concluido_em) {
      actionHtml = `<span class="badge status--completed">Entregue em ${formatDate(o.concluido_em)}</span>`;
    }
  } else if (mode === 'historico') {
    if (o.concluido_em) {
      actionHtml = `<span class="text-muted">Concluído em ${formatDate(o.concluido_em)}</span>`;
    } else {
      actionHtml = `<span class="text-muted">Atualizado em ${formatDate(o.atualizado_em)}</span>`;
    }
  }

  return `
    <article class="delivery-card">
      <div class="delivery-card__head">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <strong>${escapeHtml(o.numero_publico || `#${o.id}`)}</strong>
            <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
          </div>
          <span class="text-muted">Pedido criado em ${formatDate(o.criado_em)}</span>
        </div>
        <div class="delivery-freight-pill">
          <span>Valor do frete</span>
          <strong>${frete}</strong>
        </div>
      </div>

      <div class="delivery-route">
        <div class="delivery-route__stop delivery-route__stop--origin">
          <span class="delivery-route__tag">Retirada (Origem)</span>
          <strong>${escapeHtml(o.produtor_nome || 'Produtor')}</strong>
          <span class="delivery-route__addr">${escapeHtml(origemLabel)}</span>
          ${origemMap ? `<a href="${escapeHtml(origemMap)}" target="_blank" rel="noopener noreferrer" class="delivery-map-link">Abrir retirada no mapa</a>` : ''}
        </div>
        <div class="delivery-route__stop delivery-route__stop--dest">
          <span class="delivery-route__tag">${mode === 'disponiveis' ? 'Entrega (Região de destino)' : 'Entrega (Destino completo)'}</span>
          <strong>${mode === 'disponiveis' ? escapeHtml(o.endereco_resumido || 'Destino local') : escapeHtml(o.cliente_nome || 'Cliente')}</strong>
          <span class="delivery-route__addr">${escapeHtml(destinoAddr)}</span>
          ${destinoMap ? `<a href="${escapeHtml(destinoMap)}" target="_blank" rel="noopener noreferrer" class="delivery-map-link">${mode === 'disponiveis' ? 'Ver região no mapa' : 'Abrir destino no mapa'}</a>` : ''}
        </div>
      </div>

      <div class="delivery-card__meta">
        <span><strong>Pagamento:</strong> ${escapeHtml(o.forma_pagamento)}</span>
        <span><strong>Total do pedido:</strong> ${totalPedido}</span>
        ${o.previsao_entrega ? `<span><strong>Previsão:</strong> ${escapeHtml(o.previsao_entrega)}</span>` : ''}
        ${o.observacao ? `<span><strong>Obs.:</strong> ${escapeHtml(o.observacao)}</span>` : ''}
      </div>

      <div class="delivery-card__footer">
        <span class="text-muted">${(o.itens || []).length} item(ns) no pedido</span>
        <div class="order-card__actions">${actionHtml}</div>
      </div>
    </article>
  `;
}

export function openDeliveryPanel(initialTab = 'visao_geral') {
  const storefront = document.getElementById('publicStorefront');
  const prodWs = document.getElementById('producerWorkspace');
  const delivWs = document.getElementById('deliveryWorkspace');
  const adminWs = document.getElementById('adminWorkspace');
  if (storefront) storefront.style.display = 'none';
  if (prodWs) prodWs.style.display = 'none';
  if (adminWs) adminWs.style.display = 'none';
  if (delivWs) delivWs.style.display = 'block';

  switchDeliveryTab(initialTab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function switchDeliveryTab(tab) {
  currentDeliveryTab = tab;
  const map = {
    visao_geral: 'deliveryTabVisao_geral',
    disponiveis: 'deliveryTabDisponiveis',
    minhas: 'deliveryTabMinhas',
    historico: 'deliveryTabHistorico',
    ganhos: 'deliveryTabGanhos',
    veiculo: 'deliveryTabVeiculo',
  };
  Object.entries(map).forEach(([k, id]) => {
    const tabBtn = document.querySelector(`.panel-tab[data-delivery-tab="${k}"]`);
    if (tabBtn) {
      tabBtn.classList.toggle('active', k === tab);
      tabBtn.setAttribute('aria-selected', String(k === tab));
    }
    document
      .querySelectorAll(`[data-delivery-nav="${k}"]`)
      .forEach(el => el.classList.toggle('active', k === tab));
    const el = document.getElementById(id);
    if (el) el.style.display = k === tab ? 'block' : 'none';
  });

  if (tab === 'visao_geral') loadDeliveryOverview();
  else if (tab === 'disponiveis')
    loadDeliveries('disponiveis', 'deliveryAvailableList', 'deliveryAvailablePagination', 1);
  else if (tab === 'minhas') loadDeliveries('minhas', 'deliveryMineList', 'deliveryMinePagination', 1);
  else if (tab === 'historico')
    loadDeliveries('historico', 'deliveryHistoryList', 'deliveryHistoryPagination', 1);
  else if (tab === 'ganhos') loadDeliveryEarnings(1);
  else if (tab === 'veiculo') loadDeliveryVehicle();
}

export function setDeliveryMineGroup(group) {
  currentDeliveryGroup = group;
  document.querySelectorAll('#deliveryMineFilters .pill').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.deliveryGroup || '') === group);
  });
  loadDeliveries('minhas', 'deliveryMineList', 'deliveryMinePagination', 1);
}

export function refreshCurrentDeliveryTab() {
  switchDeliveryTab(currentDeliveryTab);
}

async function loadDeliveryOverview() {
  const el = document.getElementById('deliveryOverviewContent');
  if (!el) return;
  el.innerHTML =
    '<div class="catalog-loading"><div class="spinner"></div><p>Carregando resumo operacional...</p></div>';

  try {
    const [resResumo, resDisp] = await Promise.all([
      apiFetch('/entregas/resumo/'),
      apiFetch('/entregas/?escopo=disponiveis&page=1'),
    ]);
    if (!resResumo.ok) throw new Error('Falha ao carregar resumo do entregador.');
    const r = await resResumo.json();
    const dispData = resDisp.ok ? await resDisp.json() : { results: [] };
    const dispList = (dispData.results || []).slice(0, 3);

    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <span>Entregas disponíveis</span>
          <strong>${Number(r.disponiveis) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Aguardando retirada</span>
          <strong>${Number(r.aceitas_aguardando_retirada) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Em andamento</span>
          <strong>${Number(r.em_andamento) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Entregas concluídas</span>
          <strong>${Number(r.concluidas) || 0}</strong>
        </div>
        <div class="kpi-card">
          <span>Ganhos acumulados (fretes)</span>
          <strong>${formatCurrency(r.ganhos_concluidos)}</strong>
        </div>
        <div class="kpi-card">
          <span>Fretes em andamento</span>
          <strong>${formatCurrency(r.ganhos_previstos)}</strong>
        </div>
      </div>

      <div class="workspace-quick-actions">
        <button type="button" class="btn btn--cta btn--sm" data-delivery-nav="disponiveis">Ver entregas disponíveis (${Number(r.disponiveis) || 0})</button>
        <button type="button" class="btn btn--primary btn--sm" data-delivery-nav="minhas">Acompanhar minhas entregas</button>
        <button type="button" class="btn btn--outline btn--sm" data-delivery-nav="historico">Consultar histórico</button>
      </div>

      <div style="margin-top: var(--space-6);">
        <h2 class="workspace-card__title" style="margin-bottom: var(--space-4);">Oportunidades de entrega disponíveis agora</h2>
        ${
          dispList.length === 0
            ? '<div class="workspace-card empty-state"><p>Nenhuma entrega disponível no momento.</p></div>'
            : `<div class="orders-list">${dispList.map(o => renderDeliveryCard(o, 'disponiveis')).join('')}</div>`
        }
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadDeliveries(escopo, containerId, paginationId, page = 1) {
  const el = document.getElementById(containerId);
  const pagEl = document.getElementById(paginationId);
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  const params = new URLSearchParams({ escopo, page: String(page) });
  if (escopo === 'minhas' && currentDeliveryGroup) {
    params.set('grupo', currentDeliveryGroup);
  }

  try {
    const res = await apiFetch(`/entregas/?${params.toString()}`);
    if (!res.ok) throw new Error('Erro ao carregar entregas.');
    const data = await res.json();
    const list = data.results || data || [];

    if (list.length === 0) {
      const emptyMsg =
        escopo === 'disponiveis'
          ? 'Nenhuma entrega disponível no momento.'
          : escopo === 'historico'
            ? 'Nenhuma entrega finalizada ou cancelada no histórico ainda.'
            : 'Você não possui entregas nesta categoria.';
      el.innerHTML = `<div class="workspace-card empty-state"><p>${emptyMsg}</p></div>`;
      return;
    }

    el.innerHTML = list.map(o => renderDeliveryCard(o, escopo)).join('');
    renderPaginationBar(pagEl, data, page, nextPage =>
      loadDeliveries(escopo, containerId, paginationId, nextPage)
    );
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadDeliveryEarnings(page = 1) {
  const el = document.getElementById('deliveryEarningsContent');
  const pagEl = document.getElementById('deliveryEarningsPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  try {
    const [resResumo, resHist] = await Promise.all([
      apiFetch('/entregas/resumo/'),
      apiFetch(`/entregas/?escopo=historico&page=${page}`),
    ]);
    if (!resResumo.ok) throw new Error('Erro ao consultar ganhos.');
    const r = await resResumo.json();
    const histData = resHist.ok ? await resHist.json() : { results: [] };
    const concluidas = (histData.results || []).filter(o => o.status === 'CONCLUIDO');

    el.innerHTML = `
      <div class="kpi-grid" style="margin-bottom: var(--space-5);">
        <div class="kpi-card">
          <span>Fretes concluídos acumulados</span>
          <strong>${formatCurrency(r.ganhos_concluidos)}</strong>
        </div>
        <div class="kpi-card">
          <span>Fretes previstos (em andamento)</span>
          <strong>${formatCurrency(r.ganhos_previstos)}</strong>
        </div>
        <div class="kpi-card">
          <span>Total de entregas concluídas</span>
          <strong>${Number(r.concluidas) || 0}</strong>
        </div>
      </div>

      <div class="workspace-card">
        <h2 class="workspace-card__title" style="margin-bottom: var(--space-3);">Extrato de Fretes Concluídos</h2>
        ${
          concluidas.length === 0
            ? '<div class="empty-state"><p>Nenhuma entrega concluída registrada nesta página.</p></div>'
            : `
            <div class="panel-list">
              ${concluidas
                .map(
                  o => `
                <div class="panel-list-item">
                  <div class="panel-list-item__info">
                    <strong>${escapeHtml(o.numero_publico || `#${o.id}`)} • ${escapeHtml(o.produtor_nome)}</strong>
                    <span>Destino: ${escapeHtml(o.endereco_resumido || o.endereco_entrega || '-')}</span>
                    <span class="text-muted">Concluída em ${formatDate(o.concluido_em || o.atualizado_em)}</span>
                  </div>
                  <div class="panel-list-item__actions">
                    <strong>${formatCurrency(o.taxa_entrega)}</strong>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
        }
      </div>
    `;
    renderPaginationBar(pagEl, histData, page, nextPage => loadDeliveryEarnings(nextPage));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function handleDeliveryAction(orderId, action) {
  const res = await apiFetch(`/entregas/${orderId}/${action}/`, { method: 'POST' });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  const msgs = {
    aceitar: 'Entrega aceita! O endereço completo já está liberado em Minhas entregas.',
    'saiu-para-entrega': 'Status atualizado: saiu para entrega!',
    confirmar: 'Entrega concluída com sucesso!',
  };
  showToast(msgs[action] || 'Entrega atualizada com sucesso!', 'success');
  if (action === 'aceitar') {
    switchDeliveryTab('minhas');
  } else {
    refreshCurrentDeliveryTab();
  }
}

export async function loadDeliveryVehicle() {
  clearFormError('deliveryVehicleError');
  try {
    const res = await apiFetch('/perfil/entregador/');
    if (!res.ok) throw new Error('Não foi possível carregar os dados do seu veículo.');
    const d = await res.json();
    document.getElementById('delivVeiculo').value = d.veiculo || '';
    document.getElementById('delivPlaca').value = d.placa || '';
    document.getElementById('delivArea').value = d.area_atuacao || '';
  } catch (err) {
    showFormError(
      'deliveryVehicleError',
      err.message || 'Erro ao carregar dados do veículo. Tente atualizar o painel.'
    );
  }
}

export async function saveDeliveryVehicle() {
  clearFormError('deliveryVehicleError');
  const payload = {
    veiculo: document.getElementById('delivVeiculo').value.trim(),
    placa: document.getElementById('delivPlaca').value.trim().toUpperCase(),
    area_atuacao: document.getElementById('delivArea').value.trim(),
  };
  const res = await apiFetch('/perfil/entregador/', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    showFormError('deliveryVehicleError', await parseError(res));
    return;
  }
  showToast('Dados do veículo salvos!', 'success');
}
