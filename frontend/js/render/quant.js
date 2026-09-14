import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { toast } from '../toast.js';
import { openProblemPage } from '../problem-view.js';

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

function renderTodayCard(q, isSolved) {
  const tagHtml = (q.tags || '').split(',').filter(Boolean).map(t =>
    `<span class="badge">${escapeHTML(t.trim())}</span>`).join('');
  const starHtml = '★'.repeat(q.difficulty || 0) + '☆'.repeat(5 - (q.difficulty || 0));
  // 取 problem_md 摘要（前 100 字）
  const summary = q.problem_md
    ? q.problem_md.replace(/[*_`#]/g, '').slice(0, 120).trim() + '...'
    : q.question_zh;
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer">
      <div class="q-meta">
        <span class="badge">${escapeHTML(q.source || '')}</span>
        <span class="badge" title="难度">${starHtml}</span>
        ${tagHtml}
        ${isSolved ? '<span class="item-status" style="color:var(--success)">✓ 已掌握</span>' : ''}
      </div>
      <div class="q-body" style="font-weight:500">${escapeHTML(q.question_zh)}</div>
      ${summary && summary !== q.question_zh ? `<div class="q-body-en" style="color:var(--fg-secondary);font-size:0.9rem;margin-top:6px">${escapeHTML(summary)}</div>` : ''}
      <div class="q-actions" style="margin-top:14px;color:var(--accent-blue);font-size:0.9rem;font-family:var(--font-sans)">
        👉 点击卡片打开完整题目（题目 + 示例 + 约束 + 提示 + 题解）
      </div>
    </div>
  `;
}

function renderFilters(stats) {
  return `
    <div class="filter-bar">
      <button class="filter-chip currentCat === '' ? 'active' : ''" data-fsource="">全部来源</button>
      ${stats.by_source.map(s => `<button class="filter-chip" data-fsource="${escapeHTML(s.source)}">${escapeHTML(s.source)} (${s.n})</button>`).join('')}
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${currentFilter.difficulty === '' ? 'active' : ''}" data-fdiff="">全部难度</button>
      ${[1,2,3,4,5].map(d => `<button class="filter-chip ${currentFilter.difficulty === d ? 'active' : ''}" data-fdiff="${d}">${'★'.repeat(d)}</button>`).join('')}
    </div>
  `;
}

let currentFilter = { source: '', difficulty: '' };
let _container = null;

async function renderTodayCardWithClick(container, q) {
  const isSolved = store.completed.has('quant', q.id);
  container.querySelector('.q-current').innerHTML = renderTodayCard(q, isSolved);
  // 整张卡点击 → 打开完整题目页
  container.querySelector('.q-card').addEventListener('click', async () => {
    await openProblemPage({
      module: 'quant',
      qid: q.id,
      onSolve: () => {
        // 重新渲染顶部 stats
        renderStats(container);
        renderTodayCardWithClick(container, q);
      },
      onNext: async () => {
        // 换一题
        try {
          const params = new URLSearchParams({ exclude: q.id });
          if (currentFilter.source) params.set('source', currentFilter.source);
          if (currentFilter.difficulty) params.set('difficulty', currentFilter.difficulty);
          const r = await api.get(`/quant/random?${params}`);
          if (r.question) {
            await renderTodayCardWithClick(container, r.question);
          } else {
            toast.info('当前筛选下无题，试试改一下');
          }
        } catch (e) {
          toast.error('换题失败');
        }
      },
    });
  });
}

async function renderStats(container) {
  const stats = await api.get('/quant/stats');
  const solvedCount = new Set(store.completed.list('quant').map(([id]) => +id)).size;
  const streak = store.getStreak('quant');
  const todaySolved = store.completed.has('quant', _container._todayQid);
  container.querySelector('.q-stats').innerHTML = renderStatsCard({
    stats, totalSolved: solvedCount, streak, todaySolved,
  });
}

async function render(container) {
  _container = container;
  container._todayQid = null;
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

    container.querySelector('.q-filters').innerHTML = renderFilters(statsData);
    await renderStats(container);

    if (!data || !data.question) {
      container.querySelector('.q-current').innerHTML = `<div class="empty-state">今日题尚未发布</div>`;
      return;
    }
    container._todayQid = data.question.id;
    await renderTodayCardWithClick(container, data.question);

    // 历史
    container.querySelector('.q-history').innerHTML = `
      <details style="margin-top:32px">
        <summary style="cursor:pointer;font-family:var(--font-serif);font-size:1.067rem;color:var(--fg-secondary);padding:8px 0;list-style:none">
          最近 ${history.count} 天出题记录
        </summary>
        <div style="margin-top:12px">
          ${history.items.map(it => `
            <div class="list-item" data-rid="${it.id}" style="cursor:pointer">
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
    container.querySelectorAll('.q-history [data-rid]').forEach(el => {
      el.addEventListener('click', async () => {
        await renderTodayCardWithClick(container, { id: +el.dataset.rid });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

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
