import { api, API_BASE } from '../api.js';
import { escapeHTML } from '../app.js';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' });
}

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function renderSection(s) {
  // 根据不同模块，items 可能是 list / {words, phrases} / {quotes, news}
  let body = '';
  if (s.module === 'english' && s.items && typeof s.items === 'object') {
    const ws = s.items.words || [];
    const ps = s.items.phrases || [];
    body = `<div class="dual-col" style="grid-template-columns: 1fr 1fr;">
      <div>
        <h3 style="font-family:var(--font-serif);font-size:1.067rem;margin-bottom:8px;color:var(--fg-secondary)">单词 (${ws.length})</h3>
        ${ws.slice(0, 8).map(w => `<div class="word-card">
          <div class="word-head"><span class="word-text">${escapeHTML(w.word)}</span></div>
          <div class="word-def">${escapeHTML(w.definition || '')}</div>
        </div>`).join('')}
      </div>
      <div>
        <h3 style="font-family:var(--font-serif);font-size:1.067rem;margin-bottom:8px;color:var(--fg-secondary)">短语 (${ps.length})</h3>
        ${ps.slice(0, 6).map(p => `<div class="phrase-card">
          <div style="font-family:var(--font-serif);font-size:1.067rem;color:var(--fg);margin-bottom:4px">${escapeHTML(p.phrase)}</div>
          <div class="word-def">${escapeHTML(p.meaning_zh || '')}</div>
        </div>`).join('')}
      </div>
    </div>`;
  } else if (s.module === 'finance' && s.items && typeof s.items === 'object') {
    const qs = s.items.quotes || [];
    const ns = s.items.news || [];
    body = `
      ${qs.length ? `<div class="stats-grid">${qs.map(q => `
        <div class="stat-card quote-card">
          <div class="stat-label">${escapeHTML(q.symbol)}</div>
          <div class="stat-value">${q.price?.toFixed?.(2) || q.price}</div>
          <div class="stat-delta ${q.change_pct >= 0 ? 'up' : 'down'}">${q.change_pct >= 0 ? '+' : ''}${q.change_pct?.toFixed?.(2) || q.change_pct}%</div>
        </div>
      `).join('')}</div>` : ''}
      ${ns.length ? `<h3 style="font-family:var(--font-serif);font-size:1.067rem;margin:24px 0 8px;color:var(--fg-secondary)">要闻</h3>` +
        ns.map(n => `<div class="list-item">
          <div class="list-item-title">${escapeHTML(n.title_zh || '')}</div>
          <div class="list-item-summary">${escapeHTML(n.summary_zh || '')}</div>
          <div class="list-item-meta">
            ${n.affects ? `<span class="badge badge-2">${escapeHTML(n.affects)}</span>` : ''}
            <span>${escapeHTML(n.source || '')}</span>
          </div>
        </div>`).join('') : ''}
    `;
  } else {
    const items = Array.isArray(s.items) ? s.items : [];
    body = items.map(it => `<div class="list-item">
      <div class="list-item-title">${escapeHTML(it.title_zh || it.title || it.question_zh || it.question_en || it.phrase || it.word || '')}</div>
      ${it.summary_zh || it.one_line_zh || it.summary || it.definition || it.description || it.note || it.requirements ? `<div class="list-item-summary">${escapeHTML(it.summary_zh || it.one_line_zh || it.summary || it.definition || it.description || it.note || it.requirements || '')}</div>` : ''}
      <div class="list-item-meta">
        ${it.importance ? `<span class="badge badge-${it.importance}">${'★'.repeat(it.importance)}</span>` : ''}
        ${it.relevance_score ? `<span class="badge badge-2">相关 ${it.relevance_score}/5</span>` : ''}
        ${it.category ? `<span class="badge">${escapeHTML(it.category)}</span>` : ''}
        ${it.source ? `<span>${escapeHTML(it.source)}</span>` : ''}
        ${it.symbol ? `<span class="badge">${escapeHTML(it.symbol)}</span>` : ''}
        ${it.full_name ? `<span class="badge">${escapeHTML(it.language || '?')}</span>` : ''}
        ${it.stars_today ? `<span>+${it.stars_today} ⭐ today</span>` : ''}
        ${it.publish_date ? `<span>${escapeHTML(it.publish_date)}</span>` : ''}
        ${it.event_date ? `<span>📅 ${escapeHTML(it.event_date)}</span>` : ''}
        ${it.expire_date ? `<span>⏰ 至 ${escapeHTML(it.expire_date)}</span>` : ''}
        ${it.difficulty ? `<span class="badge">${escapeHTML(it.difficulty)}</span>` : ''}
      </div>
    </div>`).join('');
  }

  return `<div class="section-card">
    <h2>${escapeHTML(s.title)}</h2>
    ${body || '<div class="empty-state"><div class="empty-state-desc">暂无新增内容</div></div>'}
  </div>`;
}

export async function renderToday(container) {
  const data = await api.get('/today');
  const since = data.since ? ` · 数据截止 ${fmtDate(data.since)}` : '';
  document.getElementById('today-date').textContent = `最新一轮汇总${since}`;
  if (!data.sections || !data.sections.length) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <div class="empty-state-title">今日暂无新增</div>
      <div class="empty-state-desc">凌晨 5:00 的抓取任务还没跑过，或者全部模块均无更新。<br>请等待明天或去各模块单独浏览。</div>
    </div>`;
    return;
  }
  container.innerHTML = data.sections.map(renderSection).join('');
}
