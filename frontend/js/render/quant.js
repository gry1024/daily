import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

// markdown 渲染：段落、**粗体**、`代码`、```fenced```、列表、换行
function md(text) {
  if (!text) return '';
  let s = escapeHTML(text);
  // fenced code
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code}</code></pre>`);
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  // lists
  s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  // paragraphs / line breaks
  s = s.replace(/\n\n+/g, '</p><p>');
  s = s.replace(/\n/g, '<br>');
  return `<p>${s}</p>`;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_BAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg>';

let currentFilter = { source: '', difficulty: '' };

async function loadStats() {
  const [stats, all] = await Promise.all([
    api.get('/quant/stats'),
    api.get('/quant/list?limit=200'),
  ]);
  const solvedSet = new Set(store.completed.list('quant').map(([id]) => +id));
  const totalSolved = solvedSet.size;
  const streak = store.getStreak('quant');
  const todaySolved = solvedSet.has(+todayId());

  return { stats, all, totalSolved, streak, todaySolved };
}

function todayId() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

function renderStatsCard(s) {
  const pct = s.stats.total ? Math.round((s.totalSolved / s.stats.total) * 100) : 0;
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">今日</div>
        <div class="stat-value" style="font-size:1.4rem;color:${s.todaySolved ? 'var(--success)' : 'var(--fg-secondary)'}">${s.todaySolved ? '✓ 已答' : '未答'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">累计掌握</div>
        <div class="stat-value">${s.totalSolved}<span style="font-size:0.933rem;color:var(--fg-tertiary);margin-left:4px">/ ${s.stats.total}</span></div>
        <div class="progress-bar success"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">连续天数</div>
        <div class="stat-value" style="color:${s.streak > 0 ? 'var(--accent-blue)' : 'var(--fg-secondary)'}">${s.streak} <span style="font-size:0.933rem">天</span></div>
      </div>
    </div>
  `;
}

function renderQuestion(q, isSolved) {
  const tagHtml = (q.tags || '').split(',').filter(Boolean).map(t =>
    `<span class="badge">${escapeHTML(t.trim())}</span>`).join('');
  const starHtml = '★'.repeat(q.difficulty || 0) + '☆'.repeat(5 - (q.difficulty || 0));
  return `
    <div class="q-card" data-qid="${q.id}">
      <div class="q-meta">
        <span class="badge">${escapeHTML(q.source || '')}</span>
        <span class="badge" title="难度">${starHtml}</span>
        ${tagHtml}
        ${isSolved ? '<span class="item-status"><span style="color:var(--success)">✓ 已掌握</span></span>' : ''}
      </div>
      <div class="q-body">${escapeHTML(q.question_zh || '')}</div>
      ${q.question_en && q.question_en !== q.question_zh ? `<div class="q-body-en">${escapeHTML(q.question_en)}</div>` : ''}
      <div class="q-actions" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary q-action-reveal" data-action="reveal">${ICON_EYE} 看解析</button>
        <button class="btn q-action-solve" data-action="solve" ${isSolved ? 'disabled' : ''}>${ICON_CHECK} ${isSolved ? '已掌握' : '标记掌握'}</button>
        <button class="btn q-action-next" data-action="next">${ICON_REFRESH} 换一题</button>
      </div>
    </div>
  `;
}

function bindQuestionEvents(container, currentQ) {
  container.querySelectorAll('.q-card').forEach(card => {
    const qid = +card.dataset.qid;
    card.querySelector('.q-action-reveal').addEventListener('click', async () => {
      try {
        const d = await api.get(`/quant/${qid}/reveal`);
        showDetail({
          title: `答案 · ${currentQ.question_zh?.slice(0, 60)}`,
          badges: [`<span class="badge">${escapeHTML(currentQ.source || '')}</span>`],
          meta: `<span>难度 ${'★'.repeat(currentQ.difficulty||0)}</span><span>${escapeHTML(currentQ.tags || '')}</span>`,
          content: `
            <h3>答案</h3>
            <p style="font-size:1.067rem">${escapeHTML(d.answer || '（暂无）')}</p>
            <h3>解析</h3>
            ${md(d.solution || '')}
          `,
          actions: [
            {
              label: store.completed.has('quant', qid) ? '✓ 已掌握' : '标记掌握',
              icon: ICON_CHECK,
              onClick: () => {
                const was = store.completed.has('quant', qid);
                if (was) { store.completed.remove('quant', qid); toast.info('已取消'); }
                else { store.completed.add('quant', qid); toast.success('✓ 已掌握'); }
                render(container);
              },
            },
          ],
        });
      } catch (e) {
        toast.error('解析加载失败');
      }
    });

    card.querySelector('.q-action-solve').addEventListener('click', () => {
      if (!store.completed.has('quant', qid)) {
        store.completed.add('quant', qid);
        toast.success('✓ 已掌握');
        render(container);
      }
    });

    card.querySelector('.q-action-next').addEventListener('click', async () => {
      try {
        const params = new URLSearchParams({ exclude: qid });
        if (currentFilter.source) params.set('source', currentFilter.source);
        if (currentFilter.difficulty) params.set('difficulty', currentFilter.difficulty);
        const r = await api.get(`/quant/random?${params}`);
        if (r.question) {
          currentQ = r.question;
          await renderQuestionCard(container, currentQ);
        } else {
          toast.info('当前筛选下无题，试试改一下');
        }
      } catch (e) {
        toast.error('换题失败');
      }
    });
  });
}

async function renderQuestionCard(container, q) {
  const isSolved = store.completed.has('quant', q.id);
  container.querySelector('.q-current').innerHTML = renderQuestion(q, isSolved);
  bindQuestionEvents(container.querySelector('.q-current'), q);
  // 加载同标签推荐
  if (q.tags) {
    const firstTag = q.tags.split(',')[0].trim();
    api.get(`/quant/list?tag=${encodeURIComponent(firstTag)}&limit=6`)
      .then(r => {
        const others = r.items.filter(it => it.id !== q.id).slice(0, 4);
        const box = container.querySelector('.q-related');
        if (!box) return;
        if (!others.length) { box.innerHTML = ''; return; }
        box.innerHTML = `
          <h3 style="font-family:var(--font-serif);font-size:1.067rem;margin-top:32px;margin-bottom:8px;color:var(--fg-secondary)">同标签题推荐</h3>
          ${others.map(it => `
            <div class="list-item card-with-actions" data-rid="${it.id}" style="position:relative">
              ${store.completed.has('quant', it.id) ? '<span class="item-status">✓</span>' : ''}
              <div class="list-item-title">${escapeHTML(it.question_zh)}</div>
              <div class="list-item-meta">
                <span class="badge">${escapeHTML(it.source)}</span>
                <span class="badge">难度 ${'★'.repeat(it.difficulty||0)}</span>
                <span>${escapeHTML((it.tags || '').split(',').slice(0,3).join(' · '))}</span>
              </div>
            </div>
          `).join('')}
        `;
        box.querySelectorAll('[data-rid]').forEach(el => {
          el.addEventListener('click', async () => {
            const r = await api.get(`/quant/random?exclude=${el.dataset.rid}`);
            if (r.question) {
              const q = r.question;
              container.querySelector('.q-current').innerHTML = renderQuestion(q, store.completed.has('quant', q.id));
              bindQuestionEvents(container.querySelector('.q-current'), q);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
        });
      })
      .catch(() => {});
  }
}

function renderHistory(history) {
  if (!history.items.length) return '';
  return `
    <details class="history-section" style="margin-top:32px">
      <summary style="cursor:pointer;font-family:var(--font-serif);font-size:1.067rem;color:var(--fg-secondary);padding:8px 0;list-style:none">
        最近 ${history.count} 天出题记录
      </summary>
      <div style="margin-top:12px">
        ${history.items.map(it => `
          <div class="list-item card-with-actions" data-rid="${it.id}" style="position:relative">
            ${store.completed.has('quant', it.id) ? '<span class="item-status">✓</span>' : ''}
            <div class="list-item-title" style="font-size:0.933rem">${escapeHTML(it.question_zh || '')}</div>
            <div class="list-item-meta">
              <span>${escapeHTML(it.date)}</span>
              <span class="badge">${escapeHTML(it.source)}</span>
              <span class="badge">难度 ${'★'.repeat(it.difficulty||0)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function renderFilters(stats) {
  const sources = stats.by_source.map(s => s.source);
  return `
    <div class="filter-bar">
      <button class="filter-chip ${currentFilter.source === '' ? 'active' : ''}" data-fsource="">全部来源</button>
      ${sources.map(s => `<button class="filter-chip ${currentFilter.source === s ? 'active' : ''}" data-fsource="${escapeHTML(s)}">${escapeHTML(s)} (${stats.by_source.find(x => x.source === s).n})</button>`).join('')}
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${currentFilter.difficulty === '' ? 'active' : ''}" data-fdiff="">全部难度</button>
      ${[1,2,3,4,5].map(d => `<button class="filter-chip ${currentFilter.difficulty === d ? 'active' : ''}" data-fdiff="${d}">${'★'.repeat(d)}</button>`).join('')}
    </div>
  `;
}

let _container = null;

async function render(container) {
  _container = container;
  container.innerHTML = `
    <div class="q-stats"></div>
    <div class="q-filters"></div>
    <div class="q-current"></div>
    <div class="q-related"></div>
    <div class="q-history"></div>
  `;
  try {
    const [data, history, statsData] = await Promise.all([
      api.get('/quant/today'),
      api.get('/quant/history?days=30'),
      api.get('/quant/stats'),
    ]);
    if (!data || !data.question) {
      container.querySelector('.q-current').innerHTML = `<div class="empty-state">今日题尚未发布</div>`;
      return;
    }
    const s = {
      stats: statsData,
      totalSolved: new Set(store.completed.list('quant').map(([id]) => +id)).size,
      streak: store.getStreak('quant'),
      todaySolved: store.completed.has('quant', data.question.id),
    };
    container.querySelector('.q-stats').innerHTML = renderStatsCard(s);
    container.querySelector('.q-filters').innerHTML = renderFilters(statsData);
    await renderQuestionCard(container, data.question);
    container.querySelector('.q-history').innerHTML = renderHistory(history);

    // 绑定筛选
    container.querySelectorAll('[data-fsource]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.source = b.dataset.fsource; render(container); });
    });
    container.querySelectorAll('[data-fdiff]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.difficulty = b.dataset.fdiff; render(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}

export async function renderQuant(container) {
  await render(container);
}
