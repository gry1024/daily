import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const CATS = [
  { v: '', label: '全部' },
  { v: 'cloud', label: '云服务' },
  { v: 'ai_api', label: 'AI 大模型' },
  { v: 'devtool', label: '开发工具' },
  { v: 'edu', label: '教育学习' },
  { v: 'hosting', label: '建站' },
  { v: 'misc', label: '其他' },
];

let currentCat = '';
let showActiveOnly = true;

function daysLeft(expire) {
  if (!expire) return null;
  const today = new Date().toISOString().slice(0, 10);
  const diff = (new Date(expire) - new Date(today)) / 86400000;
  return Math.max(0, Math.floor(diff));
}

function countdownClass(dl) {
  if (dl === null || dl === undefined) return '';
  if (dl <= 1) return 'urgent';
  return '';
}

function renderItem(d) {
  const dl = daysLeft(d.expire_date);
  const claimed = store.saved.has('deals_claimed', d.url);
  const expired = dl === 0;
  let countdownHtml = '';
  if (dl !== null) {
    let txt, cls;
    if (expired) { txt = '已过期'; cls = 'expired'; }
    else if (dl === 0) { txt = '今天截止'; cls = 'urgent'; }
    else if (dl === 1) { txt = '明天截止'; cls = 'urgent'; }
    else if (dl <= 7) { txt = `${dl} 天后截止`; cls = 'urgent'; }
    else { txt = `${dl} 天后截止`; cls = ''; }
    countdownHtml = `<span class="countdown ${cls}">${txt}</span>`;
  }
  return `
    <div class="list-item card-with-actions" data-url="${escapeHTML(d.url)}" data-json='${escapeHTML(JSON.stringify(d).replace(/'/g, "&#39;"))}' style="position:relative;cursor:pointer">
      <div class="card-actions">
        <button class="action-btn ${claimed ? 'active' : ''}" data-action="claim" data-url="${escapeHTML(d.url)}" title="已领取">✓</button>
      </div>
      ${claimed ? '<span class="item-status" style="color:var(--success)">✓ 已领取</span>' : ''}
      <div class="list-item-title" style="padding-right:60px"><a href="${escapeHTML(d.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHTML(d.title || '')}</a> ${countdownHtml}</div>
      ${d.note ? `<div class="list-item-summary">${escapeHTML(d.note)}</div>` : ''}
      <div class="list-item-meta">
        ${d.category ? `<span class="badge">${escapeHTML(d.category)}</span>` : ''}
        ${d.requirements ? `<span>条件：${escapeHTML(d.requirements)}</span>` : ''}
        <span>${escapeHTML(d.source || '')}</span>
        ${d.publish_date ? `<span>发布 ${escapeHTML(d.publish_date)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderStats(items, claimedCount) {
  const urgent = items.filter(d => {
    const dl = daysLeft(d.expire_date);
    return dl !== null && dl <= 7 && dl > 0;
  }).length;
  const expired = items.filter(d => daysLeft(d.expire_date) === 0).length;
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">有效羊毛</div>
        <div class="stat-value">${items.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">即将过期 (7天内)</div>
        <div class="stat-value" style="color:var(--warning)">${urgent}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已领取</div>
        <div class="stat-value" style="color:var(--success)">${claimedCount}</div>
      </div>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="filter-bar">
      ${CATS.map(c => `<button class="filter-chip ${currentCat === c.v ? 'active' : ''}" data-cat="${c.v}">${c.label}</button>`).join('')}
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${showActiveOnly ? 'active' : ''}" data-active="1">仅有效</button>
      <button class="filter-chip ${!showActiveOnly ? 'active' : ''}" data-active="0">含过期</button>
    </div>
  `;
}

function showDealDetail(d) {
  const dl = daysLeft(d.expire_date);
  const claimed = store.saved.has('deals_claimed', d.url);
  showDetail({
    title: d.title,
    badges: [
      d.category ? `<span class="badge">${escapeHTML(d.category)}</span>` : '',
      dl !== null && dl <= 7 && dl > 0 ? '<span class="badge" style="background:rgba(255,149,0,0.12);color:var(--warning)">⏰ 即将过期</span>' : '',
      claimed ? '<span class="badge badge-success">✓ 已领取</span>' : '',
    ],
    meta: `
      ${d.expire_date ? `<span>截止：${escapeHTML(d.expire_date)}（${dl} 天）</span>` : '<span style="color:var(--fg-tertiary)">无截止</span>'}
      ${d.source ? `<span>来源：${escapeHTML(d.source)}</span>` : ''}
    `,
    content: `
      ${d.note ? `<p style="font-size:1.067rem;line-height:1.8">${escapeHTML(d.note)}</p>` : ''}
      ${d.requirements ? `<h3>领取条件</h3><p>${escapeHTML(d.requirements)}</p>` : ''}
      ${d.publish_date ? `<p style="color:var(--fg-tertiary);font-size:0.867rem">发布于 ${escapeHTML(d.publish_date)}</p>` : ''}
      ${d.url ? `<p style="margin-top:16px"><a href="${escapeHTML(d.url)}" target="_blank" rel="noopener" style="color:var(--accent-blue);font-weight:500">立即领取 →</a></p>` : ''}
    `,
    actions: [
      {
        label: claimed ? '✓ 已领取' : '标记已领取',
        icon: '✓',
        primary: !claimed,
        onClick: () => {
          const added = store.saved.toggle('deals_claimed', d.url);
          toast[added ? 'success' : 'info'](added ? '✓ 已标记领取' : '已取消');
          return 'close';
        },
      },
      {
        label: '打开链接',
        onClick: () => { window.open(d.url, '_blank'); return 'close'; },
      },
    ],
  });
}

function bindEvents(container) {
  // 整张卡点击 → 详情
  container.querySelectorAll('.list-item[data-url]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.action-btn') || e.target.closest('a')) return;
      try {
        const d = JSON.parse(card.dataset.json || '{}');
        showDealDetail(d);
      } catch {}
    });
  });
  container.querySelectorAll('[data-action="claim"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const added = store.saved.toggle('deals_claimed', b.dataset.url);
      b.classList.toggle('active', added);
      toast[added ? 'success' : 'info'](added ? '✓ 已标记领取' : '已取消');
    });
  });
}

export async function renderDeals(container) {
  container.innerHTML = `
    <div class="deals-stats"></div>
    <div class="deals-filters"></div>
    <div id="deals-list"></div>
  `;
  try {
    const params = new URLSearchParams({ active_only: showActiveOnly });
    if (currentCat) params.set('category', currentCat);
    const data = await api.get('/deals?' + params);
    const items = (data.items || []).sort((a, b) => {
      const da = a.expire_date ? new Date(a.expire_date).getTime() : Infinity;
      const db = b.expire_date ? new Date(b.expire_date).getTime() : Infinity;
      return da - db;
    });
    const claimedCount = store.saved.list('deals_claimed').length;

    container.querySelector('.deals-stats').innerHTML = renderStats(items, claimedCount);
    container.querySelector('.deals-filters').innerHTML = renderFilters();
    container.querySelector('#deals-list').innerHTML = items.length ? items.map(renderItem).join('') :
      `<div class="empty-state"><div class="empty-state-title">今日暂无羊毛</div><div class="empty-state-desc">过期会自动下架</div></div>`;

    bindEvents(container);

    container.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => { currentCat = b.dataset.cat; renderDeals(container); });
    });
    container.querySelectorAll('[data-active]').forEach(b => {
      b.addEventListener('click', () => { showActiveOnly = b.dataset.active === '1'; renderDeals(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
