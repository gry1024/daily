import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const ICON_SAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

const CATS = [
  { v: '', label: '全部' },
  { v: 'product', label: '产品' },
  { v: 'funding', label: '融资' },
  { v: 'research', label: '研究' },
  { v: 'opinion', label: '观点' },
];

const TIERS = { 1: '官方', 2: '权威媒体', 3: '聚合' };

let currentFilter = { cat: '', minImportance: 1 };

function renderStats(items, savedIds, readIds) {
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">最近 7 天</div>
        <div class="stat-value">${items.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已收藏</div>
        <div class="stat-value" style="color:var(--warning)">${savedIds.size}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已读</div>
        <div class="stat-value" style="color:var(--success)">${readIds.size}</div>
      </div>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="filter-bar">
      ${CATS.map(c => `<button class="filter-chip ${currentFilter.cat === c.v ? 'active' : ''}" data-cat="${c.v}">${c.label}</button>`).join('')}
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${currentFilter.minImportance === 1 ? 'active' : ''}" data-imp="1">全部</button>
      <button class="filter-chip ${currentFilter.minImportance === 2 ? 'active' : ''}" data-imp="2">≥ 2 星</button>
      <button class="filter-chip ${currentFilter.minImportance === 3 ? 'active' : ''}" data-imp="3">3 星</button>
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip" id="news-view-saved">★ 仅收藏</button>
    </div>
  `;
}

function renderItem(n) {
  const isSaved = store.saved.has('news', n.url);
  const isRead = store.seen.has('news', n.url);
  const stars = '★'.repeat(n.importance || 0);
  return `
    <div class="list-item card-with-actions" data-url="${escapeHTML(n.url)}" style="position:relative">
      <div class="card-actions">
        <button class="action-btn ${isSaved ? 'active' : ''}" data-action="save" data-url="${escapeHTML(n.url)}" title="收藏">${ICON_SAVE}</button>
        <button class="action-btn ${isRead ? 'active' : ''}" data-action="read" data-url="${escapeHTML(n.url)}" title="标记已读">${ICON_CHECK}</button>
      </div>
      ${isRead ? '<span class="item-status" style="color:var(--success)">✓ 已读</span>' : ''}
      <div class="list-item-title" style="padding-right:80px">${escapeHTML(n.title_zh || n.raw_title || '')}</div>
      <div class="list-item-summary">${escapeHTML(n.summary_zh || '')}</div>
      <div class="list-item-meta">
        <span class="badge badge-${n.importance || 1}">${stars}</span>
        ${n.category ? `<span class="badge">${escapeHTML(n.category)}</span>` : ''}
        ${n.sentiment ? `<span class="badge">${escapeHTML(n.sentiment)}</span>` : ''}
        <span>${escapeHTML(n.source || '')}</span>
        ${n.publish_date ? `<span>${escapeHTML(n.publish_date)}</span>` : ''}
      </div>
    </div>
  `;
}

function bindEvents(container) {
  container.querySelectorAll('.list-item').forEach(card => {
    const url = card.dataset.url;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.action-btn')) return;
      // 标记已读
      store.seen.add('news', url);
      // 找这条数据
      const n = JSON.parse(card.dataset.json || '{}');
      if (!n.url) return;
      showDetail({
        title: n.title_zh || n.raw_title,
        badges: [
          `<span class="badge badge-${n.importance || 1}">${'★'.repeat(n.importance || 0)}</span>`,
          n.category ? `<span class="badge">${escapeHTML(n.category)}</span>` : '',
        ],
        meta: `
          <span>${escapeHTML(n.source || '')}</span>
          ${n.publish_date ? `<span>${escapeHTML(n.publish_date)}</span>` : ''}
          ${n.sentiment ? `<span>${escapeHTML(n.sentiment)}</span>` : ''}
        `,
        content: `
          ${n.summary_zh ? `<p style="font-size:1.067rem;line-height:1.8;color:var(--fg)">${escapeHTML(n.summary_zh)}</p>` : ''}
          ${n.raw_content ? `<details style="margin-top:16px"><summary style="cursor:pointer;color:var(--fg-secondary)">原文摘要</summary><p style="margin-top:8px;color:var(--fg-tertiary);font-size:0.867rem">${escapeHTML(n.raw_content.slice(0, 1000))}${n.raw_content.length > 1000 ? '...' : ''}</p></details>` : ''}
          <p style="margin-top:24px"><a href="${escapeHTML(n.url)}" target="_blank" rel="noopener" style="color:var(--accent-blue)">查看原文 →</a></p>
        `,
        actions: [
          {
            label: store.saved.has('news', url) ? '✓ 已收藏' : '收藏',
            icon: ICON_SAVE,
            primary: !store.saved.has('news', url),
            onClick: () => {
              const added = store.saved.toggle('news', url);
              toast[added ? 'success' : 'info'](added ? '✓ 已收藏' : '已取消');
              renderNews(container);
            },
          },
          {
            label: '打开原文',
            icon: ICON_LINK,
            onClick: () => { window.open(n.url, '_blank'); return 'close'; },
          },
        ],
      });
      // 重新渲染以更新已读状态
      setTimeout(() => renderNews(container), 100);
    });
  });

  container.querySelectorAll('[data-action="save"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const added = store.saved.toggle('news', b.dataset.url);
      b.classList.toggle('active', added);
      toast[added ? 'success' : 'info'](added ? '✓ 已收藏' : '已取消');
    });
  });
  container.querySelectorAll('[data-action="read"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const had = store.seen.has('news', b.dataset.url);
      store.seen.toggle('news', b.dataset.url);
      b.classList.toggle('active', !had);
      toast.info(had ? '标记未读' : '✓ 已读');
    });
  });
}

export async function renderNews(container, opts = {}) {
  const showSavedOnly = opts.savedOnly || false;
  container.innerHTML = `
    <div class="news-stats"></div>
    <div class="news-filters"></div>
    <div id="news-list"></div>
  `;
  try {
    const params = new URLSearchParams({ days: 7, min_importance: currentFilter.minImportance, limit: 80 });
    if (currentFilter.cat) params.set('category', currentFilter.cat);
    const data = await api.get('/news?' + params);
    let items = data.items;

    const savedIds = new Set(store.saved.list('news').map(([url]) => url));
    const readIds = new Set(store.seen.list('news').map(([url]) => url));

    if (showSavedOnly) {
      items = items.filter(n => savedIds.has(n.url));
    }

    // 把每条数据存到 dataset 方便 modal 打开
    container.querySelector('.news-stats').innerHTML = renderStats(items, savedIds, readIds);
    container.querySelector('.news-filters').innerHTML = renderFilters();
    const listEl = container.querySelector('#news-list');
    listEl.innerHTML = items.length ? items.map(n => renderItem(n)).join('') :
      `<div class="empty-state"><div class="empty-state-title">暂无相关新闻</div><div class="empty-state-desc">换个筛选试试</div></div>`;

    // 存数据供 modal 用
    container.querySelectorAll('.list-item').forEach((card, i) => {
      card.dataset.json = JSON.stringify(items[i]);
    });

    bindEvents(container);

    container.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.cat = b.dataset.cat; renderNews(container); });
    });
    container.querySelectorAll('[data-imp]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.minImportance = +b.dataset.imp; renderNews(container); });
    });
    container.querySelector('#news-view-saved')?.addEventListener('click', () => {
      renderNews(container, { savedOnly: !showSavedOnly });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
