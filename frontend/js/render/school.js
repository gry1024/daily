import { api } from '../api.js';
import { escapeHTML } from '../app.js';

const TYPES = [
  { v: '', label: '全部' },
  { v: 'notice', label: '通知' },
  { v: 'lecture', label: '讲座' },
  { v: 'contest', label: '比赛' },
  { v: 'admission', label: '招生' },
  { v: 'scholarship', label: '奖学金' },
  { v: 'exchange', label: '交换' },
];

let currentType = '';
let relevantOnly = false;

export async function renderSchool(container, reset = true) {
  if (reset) {
    container.innerHTML = `
      <div id="school-upcoming"></div>
      <div class="filter-bar" style="margin-top:32px">
        ${TYPES.map(t => `<button class="filter-chip ${currentType === t.v ? 'active' : ''}" data-type="${t.v}">${t.label}</button>`).join('')}
        <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
        <button class="filter-chip ${relevantOnly ? 'active' : ''}" data-rel="1">仅高相关</button>
      </div>
      <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin:24px 0 12px">近期通知</h2>
      <div id="school-list"></div>
    `;
    container.querySelectorAll('.filter-chip[data-type]').forEach(b => {
      b.addEventListener('click', () => { currentType = b.dataset.type; renderSchool(container, false); });
    });
    container.querySelectorAll('.filter-chip[data-rel]').forEach(b => {
      b.addEventListener('click', () => { relevantOnly = !relevantOnly; renderSchool(container, false); });
    });
  }
  // 未来 7 天
  try {
    const up = await api.get('/school/upcoming?days=7');
    const upBox = document.getElementById('school-upcoming');
    if (up.items.length) {
      upBox.innerHTML = `
        <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">未来 7 天活动</h2>
        ${up.items.map(e => `<div class="list-item">
          <div class="list-item-title">${e.event_date ? `<span class="badge" style="margin-right:8px">📅 ${escapeHTML(e.event_date)}</span>` : ''}${escapeHTML(e.title || '')}</div>
          ${e.summary ? `<div class="list-item-summary">${escapeHTML(e.summary)}</div>` : ''}
          <div class="list-item-meta">
            ${e.event_type ? `<span class="badge">${escapeHTML(e.event_type)}</span>` : ''}
            ${e.location ? `<span>📍 ${escapeHTML(e.location)}</span>` : ''}
            ${e.source ? `<span>${escapeHTML(e.source)}</span>` : ''}
            ${e.url ? `<a href="${escapeHTML(e.url)}" target="_blank" rel="noopener">查看 →</a>` : ''}
          </div>
        </div>`).join('')}
      `;
    } else {
      upBox.innerHTML = '';
    }
  } catch (e) {
    document.getElementById('school-upcoming').innerHTML = '';
  }

  const list = document.getElementById('school-list');
  list.innerHTML = '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>';
  const params = new URLSearchParams({ days: 14 });
  if (currentType) params.set('event_type', currentType);
  if (relevantOnly) params.set('relevant_only', 'true');
  const data = await api.get('/school?' + params);
  if (!data.items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-desc">暂无相关通知</div></div>`;
    return;
  }
  list.innerHTML = data.items.map(e => {
    const expired = e.expire_date && e.expire_date < new Date().toISOString().slice(0,10);
    return `<div class="list-item ${expired ? 'is-dim' : ''}">
      <div class="list-item-title">
        ${expired ? '<span class="badge badge-expired">已过期</span> ' : ''}${escapeHTML(e.title || '')}
      </div>
      ${e.summary ? `<div class="list-item-summary">${escapeHTML(e.summary)}</div>` : ''}
      <div class="list-item-meta">
        ${e.event_type ? `<span class="badge">${escapeHTML(e.event_type)}</span>` : ''}
        ${e.event_date ? `<span>📅 ${escapeHTML(e.event_date)}</span>` : ''}
        ${e.expire_date ? `<span>⏰ 至 ${escapeHTML(e.expire_date)}</span>` : ''}
        ${e.source ? `<span>${escapeHTML(e.source)}</span>` : ''}
        ${e.url ? `<a href="${escapeHTML(e.url)}" target="_blank" rel="noopener">查看 →</a>` : ''}
      </div>
    </div>`;
  }).join('');
}
