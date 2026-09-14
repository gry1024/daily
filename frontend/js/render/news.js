import { api } from '../api.js';
import { escapeHTML } from '../app.js';

const CATS = [
  { v: '', label: '全部' },
  { v: 'product', label: '产品' },
  { v: 'funding', label: '融资' },
  { v: 'research', label: '研究' },
  { v: 'opinion', label: '观点' },
];

let currentCat = '';
let currentImp = 1;

export async function renderNews(container, reset = true) {
  if (reset) {
    container.innerHTML = `
      <div class="filter-bar">
        ${CATS.map(c => `<button class="filter-chip ${currentCat === c.v ? 'active' : ''}" data-cat="${c.v}">${c.label}</button>`).join('')}
        <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
        <button class="filter-chip ${currentImp === 1 ? 'active' : ''}" data-imp="1">全部重要度</button>
        <button class="filter-chip ${currentImp === 2 ? 'active' : ''}" data-imp="2">2 星以上</button>
        <button class="filter-chip ${currentImp === 3 ? 'active' : ''}" data-imp="3">3 星</button>
      </div>
      <div id="news-list"></div>
    `;
    container.querySelectorAll('.filter-chip[data-cat]').forEach(b => {
      b.addEventListener('click', () => { currentCat = b.dataset.cat; renderNews(container, false); });
    });
    container.querySelectorAll('.filter-chip[data-imp]').forEach(b => {
      b.addEventListener('click', () => { currentImp = +b.dataset.imp; renderNews(container, false); });
    });
  }
  const list = document.getElementById('news-list');
  list.innerHTML = '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>';
  const params = new URLSearchParams({ days: 7, min_importance: currentImp });
  if (currentCat) params.set('category', currentCat);
  const data = await api.get('/news?' + params);
  if (!data.items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-title">今日暂无相关新闻</div><div class="empty-state-desc">试试放宽筛选，或等明天 5:00 抓取</div></div>`;
    return;
  }
  list.innerHTML = data.items.map(n => `
    <div class="list-item">
      <div class="list-item-title"><a href="${escapeHTML(n.url)}" target="_blank" rel="noopener">${escapeHTML(n.title_zh || n.raw_title || '')}</a></div>
      <div class="list-item-summary">${escapeHTML(n.summary_zh || '')}</div>
      <div class="list-item-meta">
        ${n.importance ? `<span class="badge badge-${n.importance}">${'★'.repeat(n.importance)}</span>` : ''}
        ${n.category ? `<span class="badge">${escapeHTML(n.category)}</span>` : ''}
        ${n.sentiment ? `<span class="badge">${escapeHTML(n.sentiment)}</span>` : ''}
        <span>${escapeHTML(n.source || '')}</span>
        ${n.publish_date ? `<span>${escapeHTML(n.publish_date)}</span>` : ''}
      </div>
    </div>
  `).join('');
}
