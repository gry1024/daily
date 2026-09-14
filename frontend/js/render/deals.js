import { api } from '../api.js';
import { escapeHTML } from '../app.js';

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

function daysLeft(expire) {
  if (!expire) return null;
  const today = new Date().toISOString().slice(0, 10);
  const diff = (new Date(expire) - new Date(today)) / 86400000;
  return Math.max(0, Math.floor(diff));
}

export async function renderDeals(container, reset = true) {
  if (reset) {
    container.innerHTML = `
      <div class="filter-bar">
        ${CATS.map(c => `<button class="filter-chip ${currentCat === c.v ? 'active' : ''}" data-cat="${c.v}">${c.label}</button>`).join('')}
      </div>
      <div id="deals-list"></div>
    `;
    container.querySelectorAll('.filter-chip').forEach(b => {
      b.addEventListener('click', () => { currentCat = b.dataset.cat; renderDeals(container, false); });
    });
  }
  const list = document.getElementById('deals-list');
  list.innerHTML = '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>';
  const params = new URLSearchParams({ active_only: 'true' });
  if (currentCat) params.set('category', currentCat);
  const data = await api.get('/deals?' + params);
  if (!data.items.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-title">今日暂无羊毛</div>
      <div class="empty-state-desc">每天凌晨 5:00 抓取 · 过期的会自动下架</div>
    </div>`;
    return;
  }
  list.innerHTML = data.items.map(d => {
    const dl = daysLeft(d.expire_date);
    return `<div class="list-item">
      <div class="list-item-title">
        <a href="${escapeHTML(d.url)}" target="_blank" rel="noopener">${escapeHTML(d.title || '')}</a>
        ${dl !== null ? `<span class="badge ${dl <= 3 ? 'badge-warning' : 'badge-success'}" style="margin-left:8px">${dl === 0 ? '今天截止' : dl + ' 天后截止'}</span>` : ''}
      </div>
      ${d.note ? `<div class="list-item-summary">${escapeHTML(d.note)}</div>` : ''}
      <div class="list-item-meta">
        ${d.category ? `<span class="badge">${escapeHTML(d.category)}</span>` : ''}
        ${d.requirements ? `<span>条件：${escapeHTML(d.requirements)}</span>` : ''}
        <span>${escapeHTML(d.source || '')}</span>
        ${d.publish_date ? `<span>发布 ${escapeHTML(d.publish_date)}</span>` : ''}
        ${d.expire_date ? `<span>⏰ 至 ${escapeHTML(d.expire_date)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}
