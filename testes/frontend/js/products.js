/**
 * Catálogo de Produtos, Filtros, Busca, Paginação, Detalhes e Vitrine de Produtores.
 */
import { apiFetch } from './api.js?v=20261121a';
import { addToCart } from './cart.js?v=20261121a';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatUnitLabel,
  getUnitStep,
  openModal,
  renderBrandLogoHtml,
  renderIcon,
  renderPaginationBar,
  renderProductSkeletons,
  renderStars,
  safeUrl,
} from './ui.js?v=20261121a';

export const catalogState = {
  categories: [],
  selectedCategory: '',
  searchQuery: '',
  selectedProductionType: '',
  ordering: 'nome',
  selectedProducer: null,
  selectedProducerName: '',
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
};

export async function loadCategories() {
  const container = document.getElementById('categoryPills');
  if (!container) return;

  try {
    const res = await apiFetch('/categorias/');
    if (res.ok) {
      const data = await res.json();
      catalogState.categories = data.results || data || [];
      renderCategoryPills();
    }
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

export function renderCategoryPills() {
  const container = document.getElementById('categoryPills');
  if (!container) return;

  const allPill = `
    <button type="button" class="pill ${!catalogState.selectedCategory ? 'active' : ''}" data-category="" role="tab" aria-selected="${!catalogState.selectedCategory}">
      Todas as categorias
    </button>
  `;

  const pills = catalogState.categories
    .filter(c => c.ativa !== false)
    .map(c => {
      const active = catalogState.selectedCategory === String(c.id);
      return `
        <button type="button" class="pill ${active ? 'active' : ''}" data-category="${c.id}" role="tab" aria-selected="${active}">
          ${escapeHtml(c.nome)}
        </button>
      `;
    })
    .join('');

  container.innerHTML = allPill + pills;
}

function renderActiveProducerFilter() {
  const wrap = document.getElementById('activeProducerFilter');
  if (!wrap) return;
  if (!catalogState.selectedProducer) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="active-filter-chip">
      <span>Filtrando produtor: <strong>${escapeHtml(catalogState.selectedProducerName)}</strong></span>
      <button type="button" class="btn-clear-chip" id="btnClearProducerFilter" aria-label="Remover filtro de produtor">✕</button>
    </div>
  `;
}

export async function loadProducts(page = 1) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  catalogState.currentPage = page;
  renderActiveProducerFilter();
  renderProductSkeletons(grid, 6);

  const params = new URLSearchParams({ page: String(page) });
  if (catalogState.selectedCategory) params.set('categoria', catalogState.selectedCategory);
  if (catalogState.searchQuery) params.set('search', catalogState.searchQuery);
  if (catalogState.selectedProductionType) params.set('tipo_producao', catalogState.selectedProductionType);
  if (catalogState.selectedProducer) params.set('produtor', String(catalogState.selectedProducer));
  if (catalogState.ordering) params.set('ordering', catalogState.ordering);

  try {
    const res = await apiFetch(`/produtos/?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar catálogo');

    const data = await res.json();
    const products = data.results || data || [];
    catalogState.totalCount = data.count ?? products.length;
    catalogState.totalPages = Math.ceil(catalogState.totalCount / 20) || 1;

    renderProductsGrid(products);
    updateHeroProductRating(products);
    renderPagination();
  } catch (_) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="empty-state__icon" aria-hidden="true">${renderIcon('alert-triangle', 26)}</span>
        <p>Não foi possível carregar os produtos no momento.</p>
      </div>
    `;
  }
}

const typeBadges = {
  ORGANICO_CERTIFICADO: '<span class="badge badge--cultivo badge--cultivo-organico">Orgânico</span>',
  AGROECOLOGICO: '<span class="badge badge--cultivo badge--cultivo-agro">Agroecológico</span>',
  CONVENCIONAL: '<span class="badge badge--cultivo badge--cultivo-conv">Convencional</span>',
};

const PIX_BADGE_HTML =
  '<span class="payment-badge"><img src="/static/assets/pix-icon.webp" alt="" class="pix-brand-icon" width="16" height="16" /> Pix</span>';

function renderProducerAvatarHtml(p) {
  const customUrl = p?.foto_propriedade ? safeUrl(p.foto_propriedade, '') : '';
  const nome = p?.nome_propriedade || 'Propriedade Rural';
  if (customUrl) {
    return `
      <div class="producer-card__avatar">
        <img src="${escapeHtml(customUrl)}" alt="Propriedade ${escapeHtml(nome)}" class="producer-card__img" loading="lazy" />
      </div>
    `;
  }
  return `
    <div class="producer-card__avatar producer-card__avatar--logo">
      ${renderBrandLogoHtml(`Logo Feira Virtual — ${nome}`, 'producer-card__img producer-card__img--default')}
    </div>
  `;
}

function hasValidRating(p) {
  if (!p) return false;
  const total = Number(p.total_avaliacoes) || 0;
  const media = p.nota_media !== null && p.nota_media !== undefined ? Number(p.nota_media) : NaN;
  return total > 0 && Number.isFinite(media) && media > 0;
}

function renderRatingBadgeHtml(p, extraClass = '') {
  if (!hasValidRating(p)) return '';
  const mediaNum = Number(p.nota_media);
  const mediaStr = mediaNum.toFixed(1).replace('.', ',');
  const total = Number(p.total_avaliacoes);
  const label = total === 1 ? '1 avaliação' : `${total} avaliações`;
  const cls = ['product-rating-badge', extraClass].filter(Boolean).join(' ');
  return `
    <span class="${cls}" aria-label="Avaliação ${mediaStr} de 5 (${label})" title="Nota ${mediaStr} de 5 (${label})">
      <span class="product-rating-badge__star" aria-hidden="true">${renderIcon('star-filled', 14, 'product-rating-badge__icon')}</span>
      <strong class="product-rating-badge__score">${mediaStr}</strong>
      <span class="product-rating-badge__count">(${total})</span>
    </span>
  `;
}

function formatRatingSummaryHtml(p) {
  if (!hasValidRating(p)) return '';
  const mediaNum = Number(p.nota_media);
  const mediaStr = mediaNum.toFixed(1).replace('.', ',');
  const total = Number(p.total_avaliacoes);
  const label = total === 1 ? '1 avaliação' : `${total} avaliações`;
  return `
    <div class="rating-summary-inline" aria-label="Nota média ${mediaStr} de 5 com ${label}">
      ${renderStars(mediaNum, 15)}
      <strong>${mediaStr}</strong>
      <span class="text-muted">(${label})</span>
    </div>
  `;
}

function updateHeroProductRating(products) {
  const header = document.getElementById('heroProductHeader');
  if (header) {
    const legacyBadge = header.querySelector('.product-card-hero__badge');
    if (legacyBadge) legacyBadge.remove();
  }

  const metaRow = document.getElementById('heroProductMetaRow');
  if (!metaRow) return;

  const existing = metaRow.querySelector('.product-rating-badge');
  if (existing) existing.remove();

  if (!Array.isArray(products) || products.length === 0) return;
  const heroProd =
    products.find(p =>
      String(p.nome || '')
        .toLowerCase()
        .includes('alface')
    ) || products[0];

  if (hasValidRating(heroProd)) {
    const temp = document.createElement('div');
    temp.innerHTML = renderRatingBadgeHtml(heroProd, 'product-rating-badge--sm');
    if (temp.firstElementChild) metaRow.appendChild(temp.firstElementChild);
  }
}

function renderProductsGrid(products) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="empty-state__icon" aria-hidden="true">${renderIcon('search', 26)}</span>
        <p>Nenhum produto encontrado com os filtros selecionados.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products
    .map(p => {
      const semEstoque = parseFloat(p.estoque) <= 0;
      const produtorNome = p.produtor_nome || 'Produtor Parceiro';
      const customImgUrl = p.imagem ? safeUrl(p.imagem, '') : '';
      const thumbMedia = customImgUrl
        ? `<img src="${escapeHtml(customImgUrl)}" alt="${escapeHtml(p.nome)}" class="product-card__img" loading="lazy" />`
        : renderBrandLogoHtml(p.nome, 'product-card__img product-card__img--default');
      const ratingBadgeHtml = renderRatingBadgeHtml(p);
      const unidadeLabel = formatUnitLabel(p.unidade_medida);

      return `
      <article class="product-card ${semEstoque ? 'card--out-of-stock' : ''}">
        <div class="product-card__thumb btnProductDetail" data-id="${p.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${escapeHtml(p.nome)}">
          ${thumbMedia}
          <div class="product-card__badges">
            ${typeBadges[p.tipo_producao] || ''}
          </div>
          <span class="product-card__stock-tag">
            ${semEstoque ? 'Esgotado' : `${parseFloat(p.estoque)} em estoque`}
          </span>
        </div>

        <div class="product-card__meta-row">
          <span class="product-card__category">${escapeHtml(p.categoria_nome || 'Feira')}</span>
          ${ratingBadgeHtml}
        </div>
        <h3 class="product-card__title btnProductDetail" data-id="${p.id}" role="button" tabindex="0">
          ${escapeHtml(p.nome)}
        </h3>
        <p class="product-card__producer">
          <button type="button" class="btn-link-inline btnProducerDetail" data-id="${p.produtor}">${escapeHtml(produtorNome)}</button>
        </p>
        <p class="product-card__desc">${escapeHtml(p.descricao || 'Produto fresco da agricultura familiar.')}</p>

        <div class="product-card__action-row">
          <div class="product-card__price-wrap">
            <span class="product-card__price">${formatCurrency(p.preco)}</span>
            <span class="product-card__unit">/ ${escapeHtml(unidadeLabel)}</span>
          </div>
          <button
            type="button"
            class="btn btn--primary btn--sm btnAddToCart"
            data-id="${p.id}"
            data-unit="${escapeHtml(p.unidade_medida)}"
            data-stock="${parseFloat(p.estoque)}"
            ${semEstoque ? 'disabled' : ''}>
            ${semEstoque ? 'Esgotado' : `${renderIcon('plus', 14)} Adicionar`}
          </button>
        </div>
      </article>
    `;
    })
    .join('');
}

function renderPagination() {
  const container = document.getElementById('paginationControls');
  if (!container) return;

  if (catalogState.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="pagination">
      <button type="button" class="btn btn--outline btn--sm" id="btnPrevPage" ${catalogState.currentPage <= 1 ? 'disabled' : ''}>
        ${renderIcon('chevron-left', 15)} Anterior
      </button>
      <span class="pagination__info">Página ${catalogState.currentPage} de ${catalogState.totalPages} (${catalogState.totalCount} itens)</span>
      <button type="button" class="btn btn--outline btn--sm" id="btnNextPage" ${catalogState.currentPage >= catalogState.totalPages ? 'disabled' : ''}>
        Próxima ${renderIcon('chevron-right', 15)}
      </button>
    </div>
  `;
}

// ── Detalhe do Produto e do Produtor (com paginação de avaliações) ─────────
export async function openProductDetail(productId, avPage = 1) {
  const body = document.getElementById('productDetailBody');
  if (!body) return;

  if (avPage === 1) {
    body.innerHTML =
      '<div class="catalog-loading"><div class="spinner"></div><p>Carregando detalhes...</p></div>';
    openModal('productDetailModalOverlay');
  }

  try {
    const [resProd, resAv] = await Promise.all([
      apiFetch(`/produtos/${productId}/`),
      apiFetch(`/avaliacoes/?produto=${productId}&page=${avPage}`),
    ]);
    if (!resProd.ok) throw new Error('Produto não encontrado.');
    const p = await resProd.json();
    const avData = resAv.ok ? await resAv.json() : { results: [] };
    const avaliacoes = avData.results || [];
    const semEstoque = parseFloat(p.estoque) <= 0;
    const customImgUrl = p.imagem ? safeUrl(p.imagem, '') : '';
    const detailMedia = customImgUrl
      ? `<img src="${escapeHtml(customImgUrl)}" alt="${escapeHtml(p.nome)}" />`
      : renderBrandLogoHtml(p.nome, 'product-card__img--default');
    const unidadeLabel = formatUnitLabel(p.unidade_medida);

    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-img-wrap">
          ${detailMedia}
        </div>
        <div class="detail-info">
          <div class="detail-badges">
            ${typeBadges[p.tipo_producao] || ''}
            <span class="badge badge--outline">${escapeHtml(p.categoria_nome || '')}</span>
          </div>
          <h3>${escapeHtml(p.nome)}</h3>
          ${formatRatingSummaryHtml(p)}
          <p class="text-muted">
            Produzido por:
            <button type="button" class="btn-link-inline btnProducerDetail" data-id="${p.produtor}">${escapeHtml(p.produtor_nome)}</button>
          </p>
          <p class="detail-desc">${escapeHtml(p.descricao || 'Colhido diretamente pelo produtor familiar.')}</p>
          <div class="detail-price-row">
            <div>
              <strong class="detail-price">${formatCurrency(p.preco)}</strong>
              <span class="text-muted">/ ${escapeHtml(unidadeLabel)}</span>
            </div>
            <span class="text-muted">Disponível: ${parseFloat(p.estoque)}</span>
          </div>
          <div class="detail-buy-row">
            <input type="number" id="detailProductQty" class="form-input" value="${Math.min(getUnitStep(p.unidade_medida).min, parseFloat(p.estoque) || getUnitStep(p.unidade_medida).min)}" min="${getUnitStep(p.unidade_medida).min}" max="${parseFloat(p.estoque) || getUnitStep(p.unidade_medida).min}" step="${getUnitStep(p.unidade_medida).step}" aria-label="Quantidade" ${semEstoque ? 'disabled' : ''} />
            <button type="button" class="btn btn--cta btn--lg" id="btnDetailAddToCart" data-id="${p.id}" ${semEstoque ? 'disabled' : ''}>
              ${semEstoque ? 'Esgotado' : 'Adicionar ao Carrinho'}
            </button>
          </div>
        </div>
      </div>

      <div class="detail-reviews">
        <h4>${renderIcon('star-filled', 16, 'icon--star-filled')} Avaliações de Clientes (${Number(p.total_avaliacoes) || avData.count || avaliacoes.length})</h4>
        ${
          avaliacoes.length === 0
            ? '<p class="text-muted">Ainda não há avaliações para este produto.</p>'
            : avaliacoes
                .map(
                  a => `
            <div class="review-item">
              <div class="review-item__head">
                <strong>${escapeHtml(a.cliente_nome || 'Cliente')}</strong>
                <span>${renderStars(a.nota, 14)} (${Number(a.nota) || 0}/5)</span>
              </div>
              ${a.comentario ? `<p>${escapeHtml(a.comentario)}</p>` : '<p class="text-muted">Sem comentário.</p>'}
              <span class="text-muted">${formatDate(a.criado_em)}</span>
            </div>
          `
                )
                .join('')
        }
        <div id="productReviewsPagination" class="pagination-wrap"></div>
      </div>
    `;

    renderPaginationBar(document.getElementById('productReviewsPagination'), avData, avPage, nextPage =>
      openProductDetail(productId, nextPage)
    );

    document.getElementById('btnDetailAddToCart')?.addEventListener('click', () => {
      const { min } = getUnitStep(p.unidade_medida);
      const qty = parseFloat(document.getElementById('detailProductQty')?.value || String(min)) || min;
      addToCart(p.id, qty);
    });
  } catch (err) {
    body.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

export async function openProducerDetail(producerId, avPage = 1) {
  const body = document.getElementById('producerDetailBody');
  if (!body) return;

  if (avPage === 1) {
    body.innerHTML =
      '<div class="catalog-loading"><div class="spinner"></div><p>Carregando produtor...</p></div>';
    openModal('producerDetailModalOverlay');
  }

  try {
    const [resProd, resAv] = await Promise.all([
      apiFetch(`/produtores/${producerId}/`),
      apiFetch(`/avaliacoes/?produtor=${producerId}&page=${avPage}`),
    ]);
    if (!resProd.ok) throw new Error('Produtor não encontrado.');
    const p = await resProd.json();
    const avData = resAv.ok ? await resAv.json() : { results: [] };
    const avaliacoes = avData.results || [];

    body.innerHTML = `
      <div class="producer-detail-head">
        ${renderProducerAvatarHtml(p)}
        <div>
          <h3>${escapeHtml(p.nome_propriedade)}</h3>
          <p class="producer-card__location">${renderIcon('map-pin', 14)} ${escapeHtml(p.cidade_uf || 'Agricultura Familiar Local')}</p>
          ${formatRatingSummaryHtml(p)}
        </div>
      </div>
      <p class="detail-desc">${escapeHtml(p.descricao || 'Produção rural familiar direta.')}</p>
      <div class="producer-card__badges" style="margin-bottom: var(--space-4);">
        ${p.aceita_pix ? PIX_BADGE_HTML : ''}
        ${p.possui_maquininha ? `<span class="payment-badge">${renderIcon('credit-card', 14)} Cartão</span>` : ''}
        ${p.aceita_dinheiro ? `<span class="payment-badge">${renderIcon('banknote', 14)} Dinheiro</span>` : ''}
        <span class="badge badge--produtos">${p.total_produtos || 0} produto(s) ativo(s)</span>
      </div>

      <button type="button" class="btn btn--primary btn--full" id="btnFilterByProducer" data-id="${p.id}" data-name="${escapeHtml(p.nome_propriedade)}">
        Ver produtos deste produtor no catálogo
      </button>

      <div class="detail-reviews">
        <h4>${renderIcon('star-filled', 16, 'icon--star-filled')} Avaliações da Propriedade (${Number(p.total_avaliacoes) || avData.count || avaliacoes.length})</h4>
        ${
          avaliacoes.length === 0
            ? '<p class="text-muted">Ainda não há avaliações registradas para este produtor.</p>'
            : avaliacoes
                .map(
                  a => `
            <div class="review-item">
              <div class="review-item__head">
                <strong>${escapeHtml(a.cliente_nome || 'Cliente')}</strong>
                <span>${renderStars(a.nota, 14)} (${Number(a.nota) || 0}/5)</span>
              </div>
              ${a.comentario ? `<p>${escapeHtml(a.comentario)}</p>` : '<p class="text-muted">Sem comentário.</p>'}
              <span class="text-muted">${formatDate(a.criado_em)}</span>
            </div>
          `
                )
                .join('')
        }
        <div id="producerReviewsPagination" class="pagination-wrap"></div>
      </div>
    `;

    renderPaginationBar(document.getElementById('producerReviewsPagination'), avData, avPage, nextPage =>
      openProducerDetail(producerId, nextPage)
    );
  } catch (err) {
    body.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
  }
}

// ── Vitrine dos Produtores (com paginação) ─────────────────────────────────
export async function loadProducers(page = 1) {
  const container = document.getElementById('producerShowcase');
  const pagEl = document.getElementById('producersPagination');
  if (!container) return;
  if (pagEl) pagEl.innerHTML = '';

  try {
    const res = await apiFetch(`/produtores/?page=${page}`);
    if (!res.ok) throw new Error('Falha ao carregar produtores.');

    const data = await res.json();
    const produtores = data.results || data || [];
    if (produtores.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">${renderIcon('wheat', 26)}</span>
          <p>Nenhum produtor aprovado cadastrado ainda.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = produtores
      .map(p => {
        const ratingBadgeHtml = renderRatingBadgeHtml(p, 'product-rating-badge--sm');
        return `
        <article class="producer-card">
          <div class="producer-card__top">
            ${renderProducerAvatarHtml(p)}
            <div class="producer-card__header">
              <h3>${escapeHtml(p.nome_propriedade)}</h3>
              <span class="producer-card__location">${renderIcon('map-pin', 14)} ${escapeHtml(p.cidade_uf || p.cidade || 'Região')}</span>
            </div>
          </div>
          <p class="producer-card__desc">${escapeHtml(p.descricao || 'Produção familiar local e sustentável.')}</p>
          <div class="producer-card__footer">
            <div class="producer-card__badges">
              ${ratingBadgeHtml}
              ${p.aceita_pix ? PIX_BADGE_HTML : ''}
              ${p.possui_maquininha ? `<span class="payment-badge">${renderIcon('credit-card', 14)} Cartão</span>` : ''}
              ${p.aceita_dinheiro ? `<span class="payment-badge">${renderIcon('banknote', 14)} Dinheiro</span>` : ''}
              <span class="badge badge--produtos">${Number(p.total_produtos) || 0} produto(s)</span>
            </div>
            <button type="button" class="btn btn--outline btn--sm btnProducerDetail" data-id="${p.id}">
              Ver propriedade e produtos
            </button>
          </div>
        </article>
      `;
      })
      .join('');

    renderPaginationBar(pagEl, data, page, nextPage => loadProducers(nextPage));
  } catch (_) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">${renderIcon('alert-triangle', 26)}</span>
        <p>Não foi possível carregar os produtores no momento.</p>
      </div>
    `;
  }
}
