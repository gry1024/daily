import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const TYPES = [
  { v: '', label: '全部' },
  { v: 'notice', label: '通知' },
  { v: 'lecture', label: '讲座' },
  { v: 'contest', label: '比赛' },
  { v: 'admission', label: '招生' },
  { v: 'scholarship', label: '奖学金' },
  { v: 'exchange', label: '交换' },
];

const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

let currentType = '';
let relevantOnly = false;

function renderStats(items, goingIds) {
  const upcoming = items.filter(i => i.event_date && new Date(i.event_date) >= new Date(new Date().toISOString().slice(0,10))).length;
  const expired = items.filter(i => i.expire_date && i.expire_date < new Date().toISOString().slice(0,10)).length;
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">未来 7 天</div>
        <div class="stat-value" style="color:var(--accent-blue)">${upcoming}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">标记"我去"</div>
        <div class="stat-value">${goingIds.size}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已过期</div>
        <div class="stat-value" style="color:var(--fg-tertiary)">${expired}</div>
      </div>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="filter-bar">
      ${TYPES.map(t => `<button class="filter-chip ${currentType === t.v ? 'active' : ''}" data-type="${t.v}">${t.label}</button>`).join('')}
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${relevantOnly ? 'active' : ''}" data-rel="1">仅高相关</button>
    </div>
  `;
}

function renderItem(e) {
  const expired = e.expire_date && e.expire_date < new Date().toISOString().slice(0,10);
  const isGoing = store.saved.has('school', e.url);
  const stars = '★'.repeat(e.relevance || 0);
  return `
    <div class="list-item card-with-actions ${expired ? 'is-dim' : ''}" data-url="${escapeHTML(e.url)}" style="position:relative">
      <div class="card-actions">
        <button class="action-btn ${isGoing ? 'active' : ''}" data-action="going" data-url="${escapeHTML(e.url)}" title="我要去">${ICON_CHECK}</button>
        <button class="action-btn" data-action="calendar" data-url="${escapeHTML(e.url)}" title="加到日历">${ICON_CAL}</button>
      </div>
      ${isGoing ? '<span class="item-status" style="color:var(--accent-blue)">✓ 我要去</span>' : ''}
      <div class="list-item-title" style="padding-right:80px">
        ${expired ? '<span class="badge badge-expired">已过期</span> ' : ''}
        ${e.event_date ? `<span class="badge" style="margin-right:8px">📅 ${escapeHTML(e.event_date)}</span>` : ''}
        ${escapeHTML(e.title || '')}
      </div>
      <div class="list-item-summary">${escapeHTML(e.summary || '')}</div>
      <div class="list-item-meta">
        ${e.relevance ? `<span class="badge badge-${Math.min(3, e.relevance)}">${stars}</span>` : ''}
        ${e.event_type ? `<span class="badge">${escapeHTML(e.event_type)}</span>` : ''}
        ${e.location ? `<span>📍 ${escapeHTML(e.location)}</span>` : ''}
        ${e.source ? `<span>${escapeHTML(e.source)}</span>` : ''}
        ${e.expire_date ? `<span>⏰ 至 ${escapeHTML(e.expire_date)}</span>` : ''}
      </div>
    </div>
  `;
}

function escapeICS(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function generateICS(items) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AutoTreehole//Daily//ZH\r\n';
  items.forEach(e => {
    const start = (e.event_date || todayStr()).replace(/-/g, '');
    const end = e.expire_date ? e.expire_date.replace(/-/g, '') : start;
    ics += `BEGIN:VEVENT\r\n`;
    ics += `UID:${e.id}@autotreehole.cn\r\n`;
    ics += `DTSTAMP:${now}\r\n`;
    ics += `DTSTART;VALUE=DATE:${start}\r\n`;
    if (end !== start) ics += `DTEND;VALUE=DATE:${end}\r\n`;
    ics += `SUMMARY:${escapeICS(e.title)}\r\n`;
    ics += `DESCRIPTION:${escapeICS(e.summary || '')}\r\n`;
    if (e.location) ics += `LOCATION:${escapeICS(e.location)}\r\n`;
    if (e.url) ics += `URL:${e.url}\r\n`;
    ics += `END:VEVENT\r\n`;
  });
  ics += 'END:VCALENDAR\r\n';
  return ics;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function downloadICS(items) {
  const ics = generateICS(items);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autotreehole-events-${todayStr()}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindEvents(container, upcomingCache) {
  container.querySelectorAll('.list-item').forEach(card => {
    const url = card.dataset.url;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.action-btn')) return;
      const ev = JSON.parse(card.dataset.json || '{}');
      showDetail({
        title: ev.title,
        badges: [
          ev.relevance ? `<span class="badge badge-${Math.min(3, ev.relevance)}">★${ev.relevance}</span>` : '',
          ev.event_type ? `<span class="badge">${escapeHTML(ev.event_type)}</span>` : '',
        ],
        meta: `
          ${ev.event_date ? `<span>📅 ${escapeHTML(ev.event_date)}</span>` : ''}
          ${ev.expire_date ? `<span>⏰ 截止 ${escapeHTML(ev.expire_date)}</span>` : ''}
          ${ev.location ? `<span>📍 ${escapeHTML(ev.location)}</span>` : ''}
          ${ev.source ? `<span>${escapeHTML(ev.source)}</span>` : ''}
        `,
        content: `
          ${ev.summary ? `<p style="font-size:1.067rem;line-height:1.8">${escapeHTML(ev.summary)}</p>` : ''}
          ${ev.url ? `<p style="margin-top:16px"><a href="${escapeHTML(ev.url)}" target="_blank" rel="noopener" style="color:var(--accent-blue)">查看原文 →</a></p>` : ''}
        `,
        actions: [
          {
            label: store.saved.has('school', url) ? '✓ 我要去' : '我要去',
            icon: ICON_CHECK,
            primary: !store.saved.has('school', url),
            onClick: () => {
              const added = store.saved.toggle('school', url);
              toast[added ? 'success' : 'info'](added ? '✓ 我要去' : '已取消');
              renderSchool(container);
            },
          },
          {
            label: '加入日历 (.ics)',
            icon: ICON_CAL,
            onClick: () => {
              downloadICS([ev]);
              toast.success('已下载 .ics，导入到系统日历');
              return false;
            },
          },
        ],
      });
    });
  });

  container.querySelectorAll('[data-action="going"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const added = store.saved.toggle('school', b.dataset.url);
      b.classList.toggle('active', added);
      toast[added ? 'success' : 'info'](added ? '✓ 我要去' : '已取消');
    });
  });

  container.querySelectorAll('[data-action="calendar"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = b.closest('.list-item');
      const ev = JSON.parse(card.dataset.json || '{}');
      downloadICS([ev]);
      toast.success('已下载 .ics');
    });
  });

  // 顶部"全部加日历"按钮
  const exportAll = container.querySelector('#export-all-cal');
  if (exportAll) {
    exportAll.addEventListener('click', () => {
      downloadICS(upcomingCache);
      toast.success(`已下载 ${upcomingCache.length} 个活动的 .ics`);
    });
  }
}

export async function renderSchool(container) {
  container.innerHTML = `
    <div class="school-stats"></div>
    <div class="school-filters"></div>
    <div id="school-upcoming"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:24px">
      <h2 style="font-family:var(--font-serif);font-size:1.4rem">近期通知</h2>
      <button class="btn btn-sm" id="export-all-cal">${ICON_CAL} 全部加入日历</button>
    </div>
    <div id="school-list"></div>
  `;
  try {
    // 未来 7 天
    const up = await api.get('/school/upcoming?days=7');
    const list = await api.get('/school?days=14');
    let items = list.items;
    if (currentType) items = items.filter(i => i.event_type === currentType);
    if (relevantOnly) items = items.filter(i => (i.relevance || 0) >= 2);

    const goingIds = new Set(store.saved.list('school').map(([url]) => url));
    const upcomingEvents = (up.items || []).filter(i => new Date(i.event_date) >= new Date(new Date().toISOString().slice(0,10)));

    container.querySelector('.school-stats').innerHTML = renderStats(items, goingIds);
    container.querySelector('.school-filters').innerHTML = renderFilters();

    const upEl = container.querySelector('#school-upcoming');
    if (upcomingEvents.length) {
      upEl.innerHTML = `
        <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin:24px 0 12px">未来 7 天活动</h2>
        ${upcomingEvents.map(e => renderItem(e)).join('')}
      `;
    } else {
      upEl.innerHTML = '';
    }

    const listEl = container.querySelector('#school-list');
    listEl.innerHTML = items.length ? items.map(e => renderItem(e)).join('') :
      `<div class="empty-state"><div class="empty-state-title">暂无相关通知</div></div>`;

    container.querySelectorAll('.list-item').forEach((card, i) => {
      const idx = Array.from(card.parentElement.children).indexOf(card);
      const allItems = [...(upcomingEvents || []), ...items];
      const item = allItems[idx];
      if (item) card.dataset.json = JSON.stringify(item);
    });

    bindEvents(container, upcomingEvents);

    container.querySelectorAll('[data-type]').forEach(b => {
      b.addEventListener('click', () => { currentType = b.dataset.type; renderSchool(container); });
    });
    container.querySelectorAll('[data-rel]').forEach(b => {
      b.addEventListener('click', () => { relevantOnly = !relevantOnly; renderSchool(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
