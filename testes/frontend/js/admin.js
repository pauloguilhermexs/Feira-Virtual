/**
 * Painel Administrativo Dedicado (#adminWorkspace):
 * Dashboard com KPIs e fila de pendências, Produtos (pesquisa/filtro/edição/moderação/exclusão),
 * Produtores, Clientes, Categorias, Pedidos, Avaliações (paginadas), Reclamações e Usuários.
 */
import { apiFetch, parseError } from './api.js?v=20261121a';
import { authState } from './auth.js?v=20261121a';
import { statusLabels } from './orders.js?v=20261121a';
import {
  clearFormError,
  closeModal,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatUnitLabel,
  openModal,
  renderPaginationBar,
  renderStars,
  showFormError,
  showToast,
} from './ui.js?v=20261121a';

let adminCategoriesCache = [];
let adminProductsCache = [];
let adminProducersFilterCache = [];
let currentAdminTab = 'indicadores';
let pendingDeleteAction = null;

export function openAdminPanel(initialTab = 'indicadores') {
  const storefront = document.getElementById('publicStorefront');
  const prodWs = document.getElementById('producerWorkspace');
  const delivWs = document.getElementById('deliveryWorkspace');
  const adminWs = document.getElementById('adminWorkspace');
  const bar = document.getElementById('adminStorefrontBar');

  if (storefront) storefront.style.display = 'none';
  if (prodWs) prodWs.style.display = 'none';
  if (delivWs) delivWs.style.display = 'none';
  if (bar) bar.style.display = 'none';
  if (adminWs) adminWs.style.display = 'block';

  switchAdminTab(initialTab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function openAdminStorefrontPreview() {
  const storefront = document.getElementById('publicStorefront');
  const adminWs = document.getElementById('adminWorkspace');
  const bar = document.getElementById('adminStorefrontBar');
  const clientBanner = document.getElementById('clientWelcomeBanner');
  const hero = document.getElementById('heroSection');
  const trust = document.getElementById('trustBarSection');
  const how = document.getElementById('como-funciona');

  if (adminWs) adminWs.style.display = 'none';
  if (clientBanner) clientBanner.style.display = 'none';
  if (hero) hero.style.display = 'block';
  if (trust) trust.style.display = 'block';
  if (how) how.style.display = 'block';
  if (bar) bar.style.display = 'block';
  if (storefront) storefront.style.display = 'block';

  document.querySelectorAll('[data-admin-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.adminNav === 'vitrine');
  });
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function switchAdminTab(tab) {
  currentAdminTab = tab;
  const tabs = [
    'indicadores',
    'produtos',
    'produtores',
    'clientes',
    'categorias',
    'pedidos',
    'avaliacoes',
    'reclamacoes',
    'usuarios',
  ];
  tabs.forEach(t => {
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    const btn = document.querySelector(`.panel-tab[data-admin-tab="${t}"]`);
    if (btn) {
      btn.classList.toggle('active', t === tab);
      btn.setAttribute('aria-selected', String(t === tab));
    }
    document
      .querySelectorAll(`[data-admin-nav="${t}"]`)
      .forEach(el => el.classList.toggle('active', t === tab));
    const panel = document.getElementById(`adminTab${cap}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });

  if (tab === 'indicadores') loadAdminIndicators();
  else if (tab === 'produtos') loadAdminProducts(1);
  else if (tab === 'produtores') loadAdminProducers(1);
  else if (tab === 'clientes') loadAdminClients(1);
  else if (tab === 'categorias') loadAdminCategories();
  else if (tab === 'pedidos') loadAdminOrders(1);
  else if (tab === 'avaliacoes') loadAdminReviews(1, 1);
  else if (tab === 'reclamacoes') loadAdminComplaints(1);
  else if (tab === 'usuarios') loadAdminUsers(1);
}

const USER_TYPE_LABELS = {
  CLIENTE: 'Clientes',
  PRODUTOR: 'Produtores',
  ENTREGADOR: 'Entregadores',
  ADMIN: 'Administradores',
};

const PRODUCER_STATUS_LABELS = {
  PENDENTE: 'Pendentes',
  APROVADO: 'Aprovados',
  SUSPENSO: 'Suspensos',
};

function renderStatsTable(title, entries, labelMap) {
  const keys = Object.keys(entries || {});
  const rows =
    keys.length > 0
      ? keys
          .map(
            k => `
      <tr>
        <td>${escapeHtml(labelMap[k]?.label || labelMap[k] || k)}</td>
        <td class="admin-stat-num"><strong>${Number(entries[k]) || 0}</strong></td>
      </tr>
    `
          )
          .join('')
      : '<tr><td colspan="2" class="text-muted">Sem registros</td></tr>';
  return `
    <div class="admin-stat-card">
      <h4>${escapeHtml(title)}</h4>
      <table class="admin-stat-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadAdminIndicators() {
  const el = document.getElementById('adminIndicatorsContent');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch('/admin/indicadores/');
    if (!res.ok) throw new Error('Acesso restrito a administradores.');
    const d = await res.json();
    const pendentes = Number(d.produtores_por_status?.PENDENTE) || 0;
    const reclamAbertas = Number(d.reclamacoes_abertas) || 0;

    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Faturamento Total</span><strong>${formatCurrency(d.faturamento_total)}</strong></div>
        <div class="kpi-card"><span>Vendas Concluídas</span><strong>${Number(d.vendas_concluidas) || 0}</strong></div>
        <div class="kpi-card"><span>Produtos Ativos</span><strong>${Number(d.produtos_ativos) || 0}</strong></div>
        <div class="kpi-card"><span>Avaliações Registradas</span><strong>${Number(d.total_avaliacoes) || 0}</strong></div>
        <div class="kpi-card"><span>Reclamações Abertas</span><strong>${reclamAbertas}</strong></div>
      </div>

      <div class="admin-pending-grid">
        <div class="admin-pending-card ${pendentes === 0 ? 'admin-pending-card--ok' : ''}">
          <div>
            <h4>Produtores aguardando aprovação</h4>
            <p class="text-muted">${pendentes > 0 ? `${pendentes} cadastro(s) aguardando moderação.` : 'Nenhum cadastro pendente no momento.'}</p>
          </div>
          <button type="button" class="btn btn--outline btn--sm" data-admin-nav="produtores">Gerenciar</button>
        </div>
        <div class="admin-pending-card ${reclamAbertas === 0 ? 'admin-pending-card--ok' : ''}">
          <div>
            <h4>Reclamações em aberto</h4>
            <p class="text-muted">${reclamAbertas > 0 ? `${reclamAbertas} ocorrência(s) aguardando resposta.` : 'Todas as reclamações foram atendidas.'}</p>
          </div>
          <button type="button" class="btn btn--outline btn--sm" data-admin-nav="reclamacoes">Moderar</button>
        </div>
      </div>

      <div class="admin-stats-grid">
        ${renderStatsTable('Usuários por tipo', d.usuarios_por_tipo, USER_TYPE_LABELS)}
        ${renderStatsTable('Produtores por status', d.produtores_por_status, PRODUCER_STATUS_LABELS)}
        ${renderStatsTable('Pedidos por status', d.pedidos_por_status, statusLabels)}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Produtos (Pesquisa, Filtros paginados, Edição, Moderação, Exclusão) ────
async function fetchAllProducersForFilter() {
  const all = [];
  let page = 1;
  while (page <= 10) {
    const res = await apiFetch(`/admin/produtores/?page=${page}`);
    if (!res.ok) break;
    const data = await res.json();
    const list = data.results || data || [];
    all.push(...list);
    if (!data.next) break;
    page += 1;
  }
  return all;
}

async function populateAdminProductFilterOptions() {
  const catFilter = document.getElementById('adminProdCatFilter');
  const prodFilter = document.getElementById('adminProdProducerFilter');
  const editCat = document.getElementById('adminEditProdCategoria');

  try {
    const [resCat, produtores] = await Promise.all([apiFetch('/categorias/'), fetchAllProducersForFilter()]);
    if (resCat.ok) {
      const dataCat = await resCat.json();
      adminCategoriesCache = dataCat.results || dataCat || [];
      if (catFilter) {
        const cur = catFilter.value;
        catFilter.innerHTML =
          '<option value="">Todas as categorias</option>' +
          adminCategoriesCache.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
        catFilter.value = cur;
      }
      if (editCat) {
        const curEdit = editCat.value;
        editCat.innerHTML = adminCategoriesCache
          .map(c => `<option value="${c.id}">${escapeHtml(c.nome)}${c.ativa ? '' : ' (inativa)'}</option>`)
          .join('');
        if (curEdit) editCat.value = curEdit;
      }
    }
    adminProducersFilterCache = produtores;
    if (prodFilter) {
      const cur = prodFilter.value;
      prodFilter.innerHTML =
        '<option value="">Todos os produtores</option>' +
        adminProducersFilterCache
          .map(p => `<option value="${p.id}">${escapeHtml(p.nome_propriedade)}</option>`)
          .join('');
      prodFilter.value = cur;
    }
  } catch (_) {}
}

export async function loadAdminProducts(page = 1) {
  const el = document.getElementById('adminProductsList');
  const pagEl = document.getElementById('adminProductsPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  await populateAdminProductFilterOptions();

  const search = document.getElementById('adminProdSearch')?.value.trim() || '';
  const categoria = document.getElementById('adminProdCatFilter')?.value || '';
  const produtor = document.getElementById('adminProdProducerFilter')?.value || '';
  const ativo = document.getElementById('adminProdStatusFilter')?.value || '';

  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  if (categoria) params.set('categoria', categoria);
  if (produtor) params.set('produtor', produtor);
  if (ativo) params.set('ativo', ativo);

  try {
    const res = await apiFetch(`/admin/produtos/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar produtos.');
    const data = await res.json();
    const list = data.results || data || [];
    adminProductsCache = list;

    if (list.length === 0) {
      el.innerHTML =
        '<div class="empty-state"><p>Nenhum produto encontrado com os filtros aplicados.</p></div>';
      return;
    }

    el.innerHTML = list
      .map(p => {
        let statusBadge = `<span class="badge ${p.ativo ? 'badge--success' : 'badge--outline'}">${p.ativo ? 'Visível' : 'Oculto'}</span>`;
        if (p.excluido_em) {
          statusBadge = '<span class="badge status--cancelled">Desativado (histórico)</span>';
        } else if (p.oculto_moderacao) {
          statusBadge = '<span class="badge status--cancelled">Oculto pela moderação</span>';
        }
        const isHidden = !p.ativo || Boolean(p.oculto_moderacao);
        return `
        <div class="panel-list-item">
          <div class="panel-list-item__info">
            <strong>${escapeHtml(p.nome)}</strong>
            <span>
              ${escapeHtml(p.produtor_nome || 'Produtor')} • ${escapeHtml(p.categoria_nome || 'Sem categoria')}
              • ${formatCurrency(p.preco)} / ${escapeHtml(formatUnitLabel(p.unidade_medida))} • Estoque: ${parseFloat(p.estoque)}
            </span>
            <span>${statusBadge}</span>
          </div>
          <div class="panel-list-item__actions">
            <button type="button" class="btn btn--outline btn--sm btnEditAdminProduct" data-id="${p.id}">Editar</button>
            ${
              !isHidden
                ? `<button type="button" class="btn btn--outline btn--sm btnAdminAction" data-resource="produtos" data-tab="produtos" data-id="${p.id}" data-action="ocultar">Ocultar</button>`
                : `<button type="button" class="btn btn--primary btn--sm btnAdminAction" data-resource="produtos" data-tab="produtos" data-id="${p.id}" data-action="reexibir">Reexibir</button>`
            }
            <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteAdminEntity"
              data-resource="produtos" data-tab="produtos" data-kind="produto"
              data-id="${p.id}" data-label="${escapeHtml(p.nome)}">Excluir</button>
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, p => loadAdminProducts(p));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function openAdminProductEdit(productId) {
  const wrap = document.getElementById('adminProductEditWrap');
  const form = document.getElementById('adminProductEditForm');
  if (!wrap || !form) return;

  clearFormError('adminProductEditError');
  if (adminCategoriesCache.length === 0) {
    await populateAdminProductFilterOptions();
  }
  const p = adminProductsCache.find(x => String(x.id) === String(productId));
  if (!p) return;

  document.getElementById('adminEditProdId').value = String(p.id);
  document.getElementById('adminEditProdNome').value = p.nome || '';
  document.getElementById('adminEditProdCategoria').value = String(p.categoria || '');
  document.getElementById('adminEditProdPreco').value = p.preco ?? '';
  document.getElementById('adminEditProdUnidade').value = p.unidade_medida || 'UNIDADE';
  document.getElementById('adminEditProdEstoque').value = p.estoque ?? 0;
  document.getElementById('adminEditProdTipo').value = p.tipo_producao || 'CONVENCIONAL';
  document.getElementById('adminEditProdDesc').value = p.descricao || '';
  document.getElementById('adminEditProdAtivo').checked = Boolean(p.ativo) && !p.oculto_moderacao;

  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export async function saveAdminProductEdit() {
  clearFormError('adminProductEditError');
  const id = document.getElementById('adminEditProdId').value;
  if (!id) return;

  const ativoMarcado = document.getElementById('adminEditProdAtivo').checked;
  const payload = {
    nome: document.getElementById('adminEditProdNome').value.trim(),
    categoria: Number(document.getElementById('adminEditProdCategoria').value),
    preco: document.getElementById('adminEditProdPreco').value,
    unidade_medida: document.getElementById('adminEditProdUnidade').value,
    estoque: document.getElementById('adminEditProdEstoque').value,
    tipo_producao: document.getElementById('adminEditProdTipo').value,
    descricao: document.getElementById('adminEditProdDesc').value.trim(),
    ativo: ativoMarcado,
    oculto_moderacao: !ativoMarcado,
  };

  const res = await apiFetch(`/admin/produtos/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    showFormError('adminProductEditError', await parseError(res));
    return;
  }

  document.getElementById('adminProductEditWrap').style.display = 'none';
  showToast('Produto atualizado pelo administrador!', 'success');
  await loadAdminProducts(1);
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

// ── Produtores ─────────────────────────────────────────────────────────────
export async function loadAdminProducers(page = 1) {
  const el = document.getElementById('adminProducersList');
  const pagEl = document.getElementById('adminProducersPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  const search = document.getElementById('adminProducerSearch')?.value.trim() || '';
  const statusVal = document.getElementById('adminProducerStatusFilter')?.value || '';
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  if (statusVal) params.set('status', statusVal);

  try {
    const res = await apiFetch(`/admin/produtores/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar produtores.');
    const data = await res.json();
    const list = data.results || data || [];

    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Nenhum produtor encontrado.</p></div>';
      return;
    }

    el.innerHTML = list
      .map(p => {
        const deactivatedBadge = p.excluido_em
          ? ' <span class="badge status--cancelled">Desativado</span>'
          : '';
        return `
        <div class="panel-list-item">
          <div class="panel-list-item__info">
            <strong>${escapeHtml(p.nome_propriedade)}</strong>
            <span>
              ${escapeHtml(p.cidade || '-')}/${escapeHtml(p.estado || '-')}
              • @${escapeHtml(p.usuario_username || '-')} (${escapeHtml(p.usuario_email || '-')})
            </span>
            <span class="text-muted">
              ${Number(p.total_produtos) || 0} produto(s) • ${Number(p.total_pedidos) || 0} pedido(s) • ${Number(p.total_avaliacoes) || 0} avaliação(ões)
              • <span class="badge badge--outline">${escapeHtml(p.status)}</span>${deactivatedBadge}
            </span>
          </div>
          <div class="panel-list-item__actions">
            <button type="button" class="btn btn--outline btn--sm btnAdminProducerDetail" data-id="${p.id}">Detalhes</button>
            ${
              p.status !== 'APROVADO'
                ? `<button type="button" class="btn btn--primary btn--sm btnAdminAction" data-resource="produtores" data-tab="produtores" data-id="${p.id}" data-action="aprovar">Aprovar</button>`
                : ''
            }
            ${
              p.status !== 'SUSPENSO'
                ? `<button type="button" class="btn btn--outline btn--sm btnAdminAction" data-resource="produtores" data-tab="produtores" data-id="${p.id}" data-action="suspender">Suspender</button>`
                : ''
            }
            <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteAdminEntity"
              data-resource="produtores" data-tab="produtores" data-kind="produtor"
              data-id="${p.id}" data-label="${escapeHtml(p.nome_propriedade)}">Excluir</button>
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, p => loadAdminProducers(p));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function openAdminProducerDetails(producerId) {
  const titleEl = document.getElementById('adminDetailTitle');
  const bodyEl = document.getElementById('adminDetailBody');
  if (!bodyEl) return;

  if (titleEl) titleEl.textContent = 'Detalhes do Produtor';
  bodyEl.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  openModal('adminDetailModalOverlay');

  try {
    const res = await apiFetch(`/admin/produtores/${producerId}/detalhes/`);
    if (!res.ok) throw new Error(await parseError(res));
    const { produtor: p, produtos } = await res.json();

    if (titleEl) titleEl.textContent = `Produtor: ${p.nome_propriedade}`;
    bodyEl.innerHTML = `
      <div class="admin-detail-grid">
        <div class="admin-detail-kv"><span>Status</span><strong>${escapeHtml(p.status)}${p.excluido_em ? ' (Desativado)' : ''}</strong></div>
        <div class="admin-detail-kv"><span>Localização</span><strong>${escapeHtml(p.cidade || '-')}/${escapeHtml(p.estado || '-')}</strong></div>
        <div class="admin-detail-kv"><span>Usuário / E-mail</span><strong>@${escapeHtml(p.usuario_username || '-')} (${escapeHtml(p.usuario_email || '-')})</strong></div>
        <div class="admin-detail-kv"><span>Resumo</span><strong>${Number(p.total_produtos) || 0} produto(s) • ${Number(p.total_pedidos) || 0} pedido(s) • ${Number(p.total_avaliacoes) || 0} avaliação(ões)</strong></div>
      </div>
      ${p.descricao ? `<p class="detail-desc">${escapeHtml(p.descricao)}</p>` : ''}
      <div class="admin-detail-section">
        <h4>Produtos vinculados (${produtos.length})</h4>
        ${
          produtos.length === 0
            ? '<p class="text-muted">Nenhum produto cadastrado por este produtor.</p>'
            : `<div class="panel-list">${produtos
                .map(
                  it => `
            <div class="panel-list-item">
              <div class="panel-list-item__info">
                <strong>${escapeHtml(it.nome)}</strong>
                <span>${escapeHtml(it.categoria_nome || '')} • ${formatCurrency(it.preco)} • Estoque: ${parseFloat(it.estoque)}</span>
              </div>
              <span class="badge ${it.excluido_em ? 'status--cancelled' : it.ativo ? 'badge--success' : 'badge--outline'}">
                ${it.excluido_em ? 'Desativado' : it.ativo ? 'Ativo' : 'Oculto'}
              </span>
            </div>
          `
                )
                .join('')}</div>`
        }
      </div>
    `;
  } catch (err) {
    bodyEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Clientes ───────────────────────────────────────────────────────────────
export async function loadAdminClients(page = 1) {
  const el = document.getElementById('adminClientsList');
  const pagEl = document.getElementById('adminClientsPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  const search = document.getElementById('adminClientSearch')?.value.trim() || '';
  const isActive = document.getElementById('adminClientStatusFilter')?.value || '';
  const params = new URLSearchParams({ tipo: 'CLIENTE', page: String(page) });
  if (search) params.set('search', search);
  if (isActive) params.set('is_active', isActive);

  try {
    const res = await apiFetch(`/admin/usuarios/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar clientes.');
    const data = await res.json();
    const list = data.results || data || [];

    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Nenhum cliente encontrado.</p></div>';
      return;
    }

    el.innerHTML = list
      .map(u => {
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
        const statusBadge = u.excluido_em
          ? '<span class="badge status--cancelled">Desativado</span>'
          : `<span class="badge ${u.is_active ? 'badge--success' : 'badge--outline'}">${u.is_active ? 'Ativo' : 'Bloqueado'}</span>`;
        return `
        <div class="panel-list-item">
          <div class="panel-list-item__info">
            <strong>${escapeHtml(fullName)} <span class="text-muted">(@${escapeHtml(u.username)})</span></strong>
            <span>${escapeHtml(u.email || '-')}${u.telefone ? ` • ${escapeHtml(u.telefone)}` : ''}</span>
            <span class="text-muted">
              ${Number(u.total_pedidos) || 0} pedido(s) • ${Number(u.total_avaliacoes) || 0} avaliação(ões) • ${statusBadge}
            </span>
          </div>
          <div class="panel-list-item__actions">
            <button type="button" class="btn btn--outline btn--sm btnAdminClientDetail" data-id="${u.id}">Detalhes</button>
            ${
              u.is_active
                ? `<button type="button" class="btn btn--outline btn--sm btnAdminAction" data-resource="usuarios" data-tab="clientes" data-id="${u.id}" data-action="bloquear">Bloquear</button>`
                : `<button type="button" class="btn btn--primary btn--sm btnAdminAction" data-resource="usuarios" data-tab="clientes" data-id="${u.id}" data-action="reativar">Reativar</button>`
            }
            <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteAdminEntity"
              data-resource="usuarios" data-tab="clientes" data-kind="cliente"
              data-id="${u.id}" data-label="${escapeHtml(fullName)}">Excluir</button>
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, p => loadAdminClients(p));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function openAdminClientDetails(userId) {
  const titleEl = document.getElementById('adminDetailTitle');
  const bodyEl = document.getElementById('adminDetailBody');
  if (!bodyEl) return;

  if (titleEl) titleEl.textContent = 'Detalhes do Cliente';
  bodyEl.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  openModal('adminDetailModalOverlay');

  try {
    const res = await apiFetch(`/admin/usuarios/${userId}/detalhes/`);
    if (!res.ok) throw new Error(await parseError(res));
    const { usuario: u, pedidos, avaliacoes } = await res.json();
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;

    if (titleEl) titleEl.textContent = `Cliente: ${fullName}`;
    bodyEl.innerHTML = `
      <div class="admin-detail-grid">
        <div class="admin-detail-kv"><span>Usuário</span><strong>@${escapeHtml(u.username)} (${escapeHtml(u.tipo)})</strong></div>
        <div class="admin-detail-kv"><span>E-mail</span><strong>${escapeHtml(u.email || '-')}</strong></div>
        <div class="admin-detail-kv"><span>Telefone</span><strong>${escapeHtml(u.telefone || 'Não informado')}</strong></div>
        <div class="admin-detail-kv"><span>Status</span><strong>${u.excluido_em ? 'Desativado (histórico)' : u.is_active ? 'Ativo' : 'Bloqueado'}</strong></div>
      </div>

      <div class="admin-detail-section">
        <h4>Pedidos realizados (${pedidos.length})</h4>
        ${
          pedidos.length === 0
            ? '<p class="text-muted">Nenhum pedido realizado por este cliente.</p>'
            : `<div class="panel-list">${pedidos
                .map(p => {
                  const st = statusLabels[p.status] || { label: p.status, class: '' };
                  return `
              <div class="panel-list-item">
                <div class="panel-list-item__info">
                  <strong>${escapeHtml(p.numero_publico || `#${p.id}`)} • ${formatCurrency(p.total_com_frete)}</strong>
                  <span class="text-muted">Produtor: ${escapeHtml(p.produtor_nome)} • ${formatDate(p.criado_em)}</span>
                </div>
                <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
              </div>
            `;
                })
                .join('')}</div>`
        }
      </div>

      <div class="admin-detail-section">
        <h4>Avaliações realizadas (${avaliacoes.length})</h4>
        ${
          avaliacoes.length === 0
            ? '<p class="text-muted">Nenhuma avaliação registrada por este cliente.</p>'
            : avaliacoes
                .map(
                  a => `
            <div class="review-card">
              <div class="review-card__top">
                <strong>${escapeHtml(a.produto_nome || a.produtor_nome || 'Avaliação')}</strong>
                <span>${renderStars(a.nota, 14)} (${Number(a.nota) || 0}/5)</span>
              </div>
              ${a.comentario ? `<p>${escapeHtml(a.comentario)}</p>` : ''}
              <span class="text-muted">${formatDate(a.criado_em)}${a.pedido_numero ? ` • Pedido ${escapeHtml(a.pedido_numero)}` : ''}</span>
            </div>
          `
                )
                .join('')
        }
      </div>
    `;
  } catch (err) {
    bodyEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Categorias (CRUD Admin) ───────────────────────────────────────────────
export async function loadAdminCategories() {
  const el = document.getElementById('adminCategoriesList');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch('/categorias/');
    if (!res.ok) throw new Error('Falha ao carregar categorias.');
    const data = await res.json();
    adminCategoriesCache = data.results || data || [];

    if (adminCategoriesCache.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Nenhuma categoria cadastrada.</p></div>';
      return;
    }

    el.innerHTML = adminCategoriesCache
      .map(
        c => `
      <div class="panel-list-item">
        <div class="panel-list-item__info">
          <strong>${escapeHtml(c.nome)}</strong>
          <span>${escapeHtml(c.descricao || 'Sem descrição')} • <span class="badge ${c.ativa ? 'badge--success' : 'badge--outline'}">${c.ativa ? 'Ativa' : 'Inativa'}</span></span>
        </div>
        <div class="panel-list-item__actions">
          <button type="button" class="btn btn--outline btn--sm btnEditAdminCat" data-id="${c.id}">Editar</button>
          <button type="button" class="btn btn--outline btn--sm btnToggleAdminCat" data-id="${c.id}" data-ativa="${c.ativa ? '0' : '1'}">${c.ativa ? 'Desativar' : 'Ativar'}</button>
          <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteAdminCat" data-id="${c.id}" data-label="${escapeHtml(c.nome)}">Excluir</button>
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export function openAdminCategoryForm(catId = null) {
  const wrap = document.getElementById('adminCategoryFormWrap');
  const form = document.getElementById('adminCategoryForm');
  if (!wrap || !form) return;
  clearFormError('adminCategoryError');
  form.reset();

  if (catId) {
    const c = adminCategoriesCache.find(x => String(x.id) === String(catId));
    if (c) {
      document.getElementById('adminCatId').value = String(c.id);
      document.getElementById('adminCatNome').value = c.nome || '';
      document.getElementById('adminCatDesc').value = c.descricao || '';
      document.getElementById('adminCatAtiva').checked = Boolean(c.ativa);
    }
  } else {
    document.getElementById('adminCatId').value = '';
    document.getElementById('adminCatAtiva').checked = true;
  }
  wrap.style.display = 'block';
}

export async function saveAdminCategory() {
  clearFormError('adminCategoryError');
  const id = document.getElementById('adminCatId').value;
  const payload = {
    nome: document.getElementById('adminCatNome').value.trim(),
    descricao: document.getElementById('adminCatDesc').value.trim(),
    ativa: document.getElementById('adminCatAtiva').checked,
  };
  const endpoint = id ? `/categorias/${id}/` : '/categorias/';
  const method = id ? 'PATCH' : 'POST';

  const res = await apiFetch(endpoint, { method, body: JSON.stringify(payload) });
  if (!res.ok) {
    showFormError('adminCategoryError', await parseError(res));
    return;
  }
  document.getElementById('adminCategoryFormWrap').style.display = 'none';
  showToast(id ? 'Categoria atualizada!' : 'Categoria criada!', 'success');
  await loadAdminCategories();
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

export async function toggleAdminCategory(id, ativa) {
  const res = await apiFetch(`/categorias/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ ativa }),
  });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  showToast(ativa ? 'Categoria ativada.' : 'Categoria desativada.', 'success');
  await loadAdminCategories();
  window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
}

export function deleteAdminCategory(id, label = '') {
  const cat = adminCategoriesCache.find(x => String(x.id) === String(id));
  openAdminDeleteConfirm('categorias', id, label || cat?.nome || `#${id}`, 'categorias', 'categoria');
}

// ── Pedidos ────────────────────────────────────────────────────────────────
export async function loadAdminOrders(page = 1) {
  const el = document.getElementById('adminOrdersList');
  const pagEl = document.getElementById('adminOrdersPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  const statusFilter = document.getElementById('adminOrderStatusFilter')?.value || '';
  const params = new URLSearchParams({ page: String(page) });
  if (statusFilter) params.set('status', statusFilter);

  try {
    const res = await apiFetch(`/admin/pedidos/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar pedidos.');
    const data = await res.json();
    const list = data.results || data || [];

    if (list.length === 0) {
      el.innerHTML =
        '<div class="empty-state"><p>Nenhum pedido encontrado para o filtro selecionado.</p></div>';
      return;
    }

    el.innerHTML = list
      .map(o => {
        const st = statusLabels[o.status] || { label: o.status, class: '' };
        return `
        <div class="panel-list-item">
          <div class="panel-list-item__info">
            <strong>${escapeHtml(o.numero_publico || `#${o.id}`)} • ${formatCurrency(o.total_com_frete || o.total)}</strong>
            <span>Produtor: <strong>${escapeHtml(o.produtor_nome || '-')}</strong> • Cliente: ${escapeHtml(o.cliente_nome || '-')}</span>
            <span class="text-muted">${formatDate(o.criado_em)} • ${escapeHtml(o.modalidade)} • ${escapeHtml(o.forma_pagamento)}</span>
          </div>
          <div class="panel-list-item__actions">
            <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, p => loadAdminOrders(p));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Avaliações (com paginação independente para ambas as listas) ───────────
export async function loadAdminReviews(pageAv = 1, pageCli = 1) {
  const el = document.getElementById('adminReviewsContent');
  const pagAv = document.getElementById('adminReviewsPagination');
  const elCli = document.getElementById('adminClientReviewsContent');
  const pagCli = document.getElementById('adminClientReviewsPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagAv) pagAv.innerHTML = '';
  if (elCli) elCli.innerHTML = '';
  if (pagCli) pagCli.innerHTML = '';

  try {
    const [resAv, resCli] = await Promise.all([
      apiFetch(`/admin/avaliacoes/?page=${pageAv}`),
      apiFetch(`/admin/avaliacoes-clientes/?page=${pageCli}`),
    ]);
    if (!resAv.ok) throw new Error('Falha ao carregar avaliações.');
    const dataAv = await resAv.json();
    const listAv = dataAv.results || dataAv || [];
    const dataCli = resCli.ok ? await resCli.json() : { results: [] };
    const listCli = dataCli.results || dataCli || [];

    el.innerHTML = `
      <div class="review-history-section">
        <h4 class="review-history-section__title">Avaliações feitas por Clientes (${dataAv.count ?? listAv.length})</h4>
        ${
          listAv.length === 0
            ? '<p class="text-muted">Nenhuma avaliação de produto ou produtor registrada ainda.</p>'
            : listAv
                .map(
                  a => `
            <div class="review-card">
              <div class="review-card__top">
                <strong>
                  <span class="badge badge--outline">${a.tipo_avaliacao === 'PRODUTO' ? 'Produto' : 'Produtor'}</span>
                  ${escapeHtml(a.produto_nome || a.produtor_nome || '-')}
                </strong>
                <span>${renderStars(a.nota, 14)} (${Number(a.nota) || 0}/5)</span>
              </div>
              <p>${a.comentario ? escapeHtml(a.comentario) : '<span class="text-muted">Sem comentário.</span>'}</p>
              <span class="text-muted">
                Cliente: ${escapeHtml(a.cliente_nome || '-')}
                ${a.pedido_numero ? ` • Pedido ${escapeHtml(a.pedido_numero)}` : ''}
                • ${formatDate(a.criado_em)}
              </span>
            </div>
          `
                )
                .join('')
        }
      </div>
    `;
    renderPaginationBar(pagAv, dataAv, pageAv, p => loadAdminReviews(p, pageCli));

    if (elCli) {
      elCli.innerHTML = `
        <div class="review-history-section">
          <h4 class="review-history-section__title">Avaliações de Clientes feitas por Produtores (${dataCli.count ?? listCli.length})</h4>
          ${
            listCli.length === 0
              ? '<p class="text-muted">Nenhuma avaliação recíproca registrada até o momento.</p>'
              : listCli
                  .map(
                    a => `
              <div class="review-card">
                <div class="review-card__top">
                  <strong>Cliente: ${escapeHtml(a.cliente_nome || '-')}</strong>
                  <span>${renderStars(a.nota, 14)} (${Number(a.nota) || 0}/5)</span>
                </div>
                <p>${a.comentario ? escapeHtml(a.comentario) : '<span class="text-muted">Sem comentário.</span>'}</p>
                <span class="text-muted">
                  Produtor: ${escapeHtml(a.produtor_nome || '-')}
                  ${a.pedido_numero ? ` • Pedido ${escapeHtml(a.pedido_numero)}` : ''}
                  • ${formatDate(a.criado_em)}
                </span>
              </div>
            `
                  )
                  .join('')
          }
        </div>
      `;
      renderPaginationBar(pagCli, dataCli, pageCli, p => loadAdminReviews(pageAv, p));
    }
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function loadAdminComplaints(page = 1) {
  const el = document.getElementById('adminComplaintsList');
  const pagEl = document.getElementById('adminComplaintsPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  try {
    const res = await apiFetch(`/admin/reclamacoes/?page=${page}`);
    if (!res.ok) throw new Error('Falha ao carregar reclamações.');
    const data = await res.json();
    const list = data.results || data || [];
    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Nenhuma reclamação cadastrada.</p></div>';
      return;
    }

    el.innerHTML = list
      .map(
        r => `
      <div class="order-card" data-complaint-id="${r.id}">
        <div class="order-card__header">
          <strong>#${r.id} — ${escapeHtml(r.assunto)}</strong>
          <span class="badge badge--outline">Pedido #${r.pedido}</span>
        </div>
        <p>${escapeHtml(r.descricao)}</p>
        <div class="form-group" style="margin-top: 8px;">
          <select class="form-select adminComplaintStatus" data-id="${r.id}">
            <option value="ABERTA" ${r.status === 'ABERTA' ? 'selected' : ''}>Aberta</option>
            <option value="EM_ANALISE" ${r.status === 'EM_ANALISE' ? 'selected' : ''}>Em análise</option>
            <option value="RESOLVIDA" ${r.status === 'RESOLVIDA' ? 'selected' : ''}>Resolvida</option>
          </select>
        </div>
        <div class="form-group">
          <textarea class="form-input adminComplaintReply" data-id="${r.id}" rows="2" placeholder="Resposta da moderação...">${escapeHtml(r.resposta_admin || '')}</textarea>
        </div>
        <button type="button" class="btn btn--primary btn--sm btnSaveComplaint" data-id="${r.id}">Salvar Moderação</button>
      </div>
    `
      )
      .join('');
    renderPaginationBar(pagEl, data, page, p => loadAdminComplaints(p));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function loadAdminUsers(page = 1) {
  const el = document.getElementById('adminUsersList');
  const pagEl = document.getElementById('adminUsersPagination');
  if (!el) return;
  el.innerHTML = '<div class="catalog-loading"><div class="spinner"></div></div>';
  if (pagEl) pagEl.innerHTML = '';

  const search = document.getElementById('adminUserSearch')?.value.trim() || '';
  const tipo = document.getElementById('adminUserTypeFilter')?.value || '';
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  if (tipo) params.set('tipo', tipo);

  try {
    const res = await apiFetch(`/admin/usuarios/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar usuários.');
    const data = await res.json();
    const list = data.results || data || [];

    if (list.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Nenhum usuário encontrado.</p></div>';
      return;
    }

    const currentUserId = Number(authState.user?.id || 0);
    el.innerHTML = list
      .map(u => {
        const isSelf = currentUserId && Number(u.id) === currentUserId;
        const statusBadge = u.excluido_em
          ? '<span class="badge status--cancelled">Desativado</span>'
          : `<span class="badge ${u.is_active ? 'badge--success' : 'badge--outline'}">${u.is_active ? 'Ativo' : 'Bloqueado'}</span>`;
        return `
        <div class="panel-list-item">
          <div class="panel-list-item__info">
            <strong>${escapeHtml(u.username)} <span class="badge badge--outline">${escapeHtml(u.tipo)}</span></strong>
            <span>${escapeHtml(u.email || '-')} • ${statusBadge}</span>
          </div>
          <div class="panel-list-item__actions">
            <button type="button" class="btn btn--outline btn--sm btnAdminClientDetail" data-id="${u.id}">Detalhes</button>
            ${
              !isSelf
                ? u.is_active
                  ? `<button type="button" class="btn btn--outline btn--sm btnAdminAction" data-resource="usuarios" data-tab="usuarios" data-id="${u.id}" data-action="bloquear">Bloquear</button>`
                  : `<button type="button" class="btn btn--primary btn--sm btnAdminAction" data-resource="usuarios" data-tab="usuarios" data-id="${u.id}" data-action="reativar">Reativar</button>`
                : '<span class="text-muted">Sua conta</span>'
            }
            ${
              !isSelf
                ? `
              <button type="button" class="btn btn--outline btn--sm text-danger btnDeleteAdminEntity"
                data-resource="usuarios" data-tab="usuarios" data-kind="usuário"
                data-id="${u.id}" data-label="${escapeHtml(u.username)}">Excluir</button>
            `
                : ''
            }
          </div>
        </div>
      `;
      })
      .join('');
    renderPaginationBar(pagEl, data, page, p => loadAdminUsers(p));
  } catch (err) {
    el.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function handleAdminAction(resource, id, action, targetTab = null) {
  const res = await apiFetch(`/admin/${resource}/${id}/${action}/`, { method: 'POST' });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  showToast('Ação administrativa aplicada!', 'success');
  switchAdminTab(targetTab || currentAdminTab || resource);
  if (resource === 'produtos' || resource === 'produtores') {
    window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
  }
}

// ── Modal Visual de Confirmação para Exclusão / Desativação Administrativa ──
export function openAdminDeleteConfirm(resource, id, label, tab = null, kind = 'registro') {
  pendingDeleteAction = {
    resource,
    id: Number(id),
    label: String(label || `#${id}`),
    tab: tab || currentAdminTab || resource,
    kind,
  };

  const titleEl = document.getElementById('adminConfirmTitle');
  const msgEl = document.getElementById('adminConfirmMessage');
  const hintEl = document.getElementById('adminConfirmHint');

  const article = kind === 'categoria' ? 'a' : 'o';
  if (titleEl) titleEl.textContent = `Confirmar exclusão de ${kind}`;
  if (msgEl)
    msgEl.textContent = `Tem certeza de que deseja excluir ${article} ${kind} "${pendingDeleteAction.label}"?`;
  if (hintEl) {
    hintEl.textContent =
      resource === 'categorias'
        ? 'Categorias com produtos vinculados não podem ser excluídas fisicamente; nesse caso, desative a categoria.'
        : 'Se existirem pedidos, avaliações ou vínculos históricos, o registro será desativado logicamente (ocultado da plataforma) preservando todo o histórico.';
  }

  openModal('adminConfirmModalOverlay');
}

export async function confirmAdminDelete() {
  if (!pendingDeleteAction) return;
  const { resource, id, tab } = pendingDeleteAction;
  const proceedBtn = document.getElementById('btnProceedAdminConfirm');
  if (proceedBtn) proceedBtn.disabled = true;

  try {
    const endpoint = resource === 'categorias' ? `/categorias/${id}/` : `/admin/${resource}/${id}/`;
    const res = await apiFetch(endpoint, { method: 'DELETE' });
    if (!res.ok) {
      showToast(await parseError(res), 'error');
      return;
    }

    let msg = 'Registro excluído com sucesso.';
    let tone = 'success';
    if (res.status !== 204) {
      try {
        const data = await res.json();
        if (data?.detail) msg = data.detail;
        if (data?.acao === 'desativado') tone = 'info';
      } catch (_) {}
    }

    closeModal('adminConfirmModalOverlay');
    pendingDeleteAction = null;
    showToast(msg, tone);
    switchAdminTab(tab);
    window.dispatchEvent(new CustomEvent('fv:catalog-updated'));
  } finally {
    if (proceedBtn) proceedBtn.disabled = false;
  }
}

export async function saveAdminComplaint(id) {
  const statusEl = document.querySelector(`.adminComplaintStatus[data-id="${id}"]`);
  const replyEl = document.querySelector(`.adminComplaintReply[data-id="${id}"]`);
  const res = await apiFetch(`/admin/reclamacoes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: statusEl?.value,
      resposta_admin: replyEl?.value.trim() || '',
    }),
  });
  if (!res.ok) {
    showToast(await parseError(res), 'error');
    return;
  }
  showToast('Reclamação atualizada!', 'success');
}
