import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { toast } from '../toast.js';

const MODULE_ICONS = {
  quant: '📊',
  news: '📰',
  arxiv: '📄',
  school: '🎓',
  leetcode: '💻',
  english: '🇬🇧',
  finance: '💰',
  github: '⭐',
  deals: '🎁',
};

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
  let body = '';
  if (s.module === 'english' && s.items && typeof s.items === 'object') {
    const ws = s.items.words || [];
    const ps = s.items.phrases || [];
    body = `<div class="dual-col" style="grid-template-columns: 1fr 1fr;">
      <div>
        <h4 style="font-family:var(--font-serif);font-size:1rem;margin-bottom:8px;color:var(--fg-secondary)">单词 (${ws.length})</h4>
        ${ws.slice(0, 6).map(w => `<div class="word-card">
          <div class="word-head"><span class="word-text">${escapeHTML(w.word)}</span></div>
          <div class="word-def">${escapeHTML(w.definition || '')}</div>
        </div>`).join('')}
      </div>
      <div>
        <h4 style="font-family:var(--font-serif);font-size:1rem;margin-bottom:8px;color:var(--fg-secondary)">短语 (${ps.length})</h4>
        ${ps.slice(0, 4).map(p => `<div class="phrase-card">
          <div style="font-family:var(--font-serif);font-size:1rem;color:var(--fg);margin-bottom:4px">${escapeHTML(p.phrase)}</div>
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
          <div class="stat-value">${q.price?.toFixed?.(2) ?? q.price}</div>
          <div class="stat-delta ${q.change_pct >= 0 ? 'up' : 'down'}">${q.change_pct >= 0 ? '+' : ''}${q.change_pct?.toFixed?.(2) ?? q.change_pct}%</div>
        </div>
      `).join('')}</div>` : ''}
      ${ns.length ? `<h4 style="font-family:var(--font-serif);font-size:1rem;margin:16px 0 8px;color:var(--fg-secondary)">要闻</h4>` +
        ns.slice(0, 4).map(n => `<div class="list-item">
          <div class="list-item-title">${escapeHTML(n.title_zh || '')}</div>
        </div>`).join('') : ''}
    `;
  } else {
    const items = Array.isArray(s.items) ? s.items : [];
    body = items.slice(0, 6).map(it => {
      const title = it.title_zh || it.title || it.question_zh || it.question_en || it.phrase || it.word || it.full_name || '';
      const meta1 = it.importance ? `<span class="badge badge-${it.importance}">${'★'.repeat(it.importance)}</span>` : '';
      const meta2 = it.relevance_score ? `<span class="badge badge-2">相关 ${it.relevance_score}/5</span>` : '';
      const meta3 = it.category ? `<span class="badge">${escapeHTML(it.category)}</span>` : '';
      const meta4 = it.source ? `<span>${escapeHTML(it.source)}</span>` : '';
      const meta5 = it.symbol ? `<span class="badge">${escapeHTML(it.symbol)}</span>` : '';
      const meta6 = it.language ? `<span class="badge">${escapeHTML(it.language)}</span>` : '';
      const meta7 = it.stars_today ? `<span style="color:var(--accent-blue)">+${it.stars_today} ⭐ today</span>` : '';
      const meta8 = it.expire_date ? `<span>⏰ 至 ${escapeHTML(it.expire_date)}</span>` : '';
      const meta9 = it.difficulty ? `<span class="badge">${escapeHTML(it.difficulty)}</span>` : '';
      const meta10 = it.publish_date ? `<span>${escapeHTML(it.publish_date)}</span>` : '';
      return `<div class="list-item">
        <div class="list-item-title">${escapeHTML(title)}</div>
        ${it.summary_zh || it.one_line_zh || it.description || it.note || it.summary ? `<div class="list-item-summary">${escapeHTML(it.summary_zh || it.one_line_zh || it.description || it.note || it.summary || '')}</div>` : ''}
        <div class="list-item-meta">
          ${meta1}${meta2}${meta3}${meta4}${meta5}${meta6}${meta7}${meta8}${meta9}${meta10}
        </div>
      </div>`;
    }).join('');
  }

  return `<div class="section-card">
    <h2><span style="margin-right:8px">${MODULE_ICONS[s.module] || '📌'}</span>${escapeHTML(s.title)}</h2>
    ${body || '<div class="empty-state-desc">暂无内容</div>'}
  </div>`;
}

function renderJumpNav(sections) {
  return `<div class="filter-bar" style="margin-bottom:16px">
    ${sections.map(s => `<a class="filter-chip" href="#${s.module}" style="text-decoration:none">${MODULE_ICONS[s.module] || '📌'} ${escapeHTML(s.title.split(' ')[0])}</a>`).join('')}
    <button class="filter-chip" id="today-mark-read">✓ 全部标已读</button>
  </div>`;
}

export async function renderToday(container) {
  container.innerHTML = `<div class="today-jump"></div><div id="today-sections"></div>`;
  try {
    const data = await api.get('/today');
    const since = data.since ? `数据截止 ${fmtDate(data.since)}` : '';
    document.getElementById('today-date').textContent = `· ${since}`;
    container.querySelector('.today-jump').innerHTML = renderJumpNav(data.sections || []);
    container.querySelector('#today-sections').innerHTML = (data.sections || []).length ?
      (data.sections || []).map(renderSection).join('') :
      `<div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <div class="empty-state-title">今日暂无新增</div>
        <div class="empty-state-desc">凌晨 5:00 的抓取任务还没跑过，或者全部模块均无更新。</div>
      </div>`;

    container.querySelector('#today-mark-read')?.addEventListener('click', () => {
      // 把所有 section items 加入 seen
      let count = 0;
      (data.sections || []).forEach(s => {
        const items = Array.isArray(s.items) ? s.items : (s.items?.quotes || s.items?.news || []);
        items.forEach(it => {
          if (it.url && !store.seen.has('today', it.url)) {
            store.seen.add('today', it.url);
            count++;
          }
          if (it.symbol && !store.seen.has('today_finance', it.symbol)) {
            store.seen.add('today_finance', it.symbol);
            count++;
          }
        });
      });
      toast.success(`已标记 ${count} 项为已读`);
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
