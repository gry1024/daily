import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { toast } from '../toast.js';
import { openProblemPage } from '../problem-view.js';

function diffClass(d) {
  return d === 'easy' ? 'diff-easy' : d === 'medium' ? 'diff-medium' : 'diff-hard';
}

function renderStatsCard(stats, solvedCount) {
  const pct = stats.total ? Math.round((solvedCount / stats.total) * 100) : 0;
  const streak = store.getStreak('leetcode');
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">累计掌握</div>
        <div class="stat-value">${solvedCount}<span style="font-size:0.933rem;color:var(--fg-tertiary);margin-left:4px">/ ${stats.total}</span></div>
        <div class="progress-bar success"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">连续刷题</div>
        <div class="stat-value" style="color:${streak > 0 ? 'var(--accent-blue)' : 'var(--fg-secondary)'}">${streak}<span style="font-size:0.933rem">天</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">难度分布</div>
        <div style="margin-top:6px;font-family:var(--font-sans);font-size:0.8rem">
          ${stats.by_difficulty.map(d => `<span class="badge ${diffClass(d.difficulty)}">${d.difficulty} ${d.n}</span>`).join(' ')}
        </div>
      </div>
    </div>
  `;
}

function renderFilters(stats) {
  return `
    <div class="filter-bar">
      <button class="filter-chip ${currentFilter.difficulty === '' ? 'active' : ''}" data-fdiff="">全部</button>
      <button class="filter-chip ${currentFilter.difficulty === 'easy' ? 'active' : ''}" data-fdiff="easy"><span class="diff-easy">Easy</span></button>
      <button class="filter-chip ${currentFilter.difficulty === 'medium' ? 'active' : ''}" data-fdiff="medium"><span class="diff-medium">Medium</span></button>
      <button class="filter-chip ${currentFilter.difficulty === 'hard' ? 'active' : ''}" data-fdiff="hard"><span class="diff-hard">Hard</span></button>
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${currentFilter.tag === '' ? 'active' : ''}" data-ftag="">热门标签</button>
      ${stats.top_tags.slice(0, 8).map(t => `<button class="filter-chip ${currentFilter.tag === t.tag ? 'active' : ''}" data-ftag="${escapeHTML(t.tag)}">${escapeHTML(t.tag)}</button>`).join('')}
    </div>
  `;
}

function renderQuestion(q, isSolved) {
  const tagHtml = (q.tags || '').split(',').filter(Boolean).slice(0, 5).map(t =>
    `<span class="badge">${escapeHTML(t.trim())}</span>`).join('');
  // 取 description 摘要
  const summary = q.description_md
    ? q.description_md.replace(/[*_`#]/g, '').slice(0, 120).trim() + '...'
    : '';
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer">
      <div class="q-meta">
        <span class="badge">Hot 100 #${q.order_in_hot100 || q.lc_id}</span>
        <span class="badge ${diffClass(q.difficulty)}">${escapeHTML(q.difficulty || '')}</span>
        ${tagHtml}
        ${isSolved ? '<span class="item-status" style="color:var(--success)">✓ 已掌握</span>' : ''}
      </div>
      <div class="q-body" style="font-weight:500">${escapeHTML(q.title_zh || q.title_en || '')}</div>
      ${summary ? `<div class="q-body-en" style="color:var(--fg-secondary);font-size:0.9rem;margin-top:6px">${escapeHTML(summary)}</div>` : ''}
      <div class="q-actions" style="margin-top:14px;color:var(--accent-blue);font-size:0.9rem;font-family:var(--font-sans)">
        👉 点击卡片打开完整题目（描述 + 示例 + 约束 + 3 个提示 + 题解）
      </div>
    </div>
  `;
}

let currentFilter = { difficulty: '', tag: '' };
let _container = null;

async function renderQuestionCardWithClick(container, q) {
  const isSolved = store.completed.has('leetcode', q.id);
  container.querySelector('.q-current').innerHTML = renderQuestion(q, isSolved);
  container.querySelector('.q-card').addEventListener('click', async () => {
    await openProblemPage({
      module: 'leetcode',
      qid: q.id,
      onSolve: () => {
        renderStats(container);
        renderQuestionCardWithClick(container, q);
      },
      onNext: async () => {
        try {
          const params = new URLSearchParams({ exclude: q.id });
          if (currentFilter.difficulty) params.set('difficulty', currentFilter.difficulty);
          if (currentFilter.tag) params.set('tag', currentFilter.tag);
          const r = await api.get(`/leetcode/random?${params}`);
          if (r.question) {
            await renderQuestionCardWithClick(container, r.question);
          } else {
            toast.info('当前筛选下无题');
          }
        } catch (e) {
          toast.error('换题失败');
        }
      },
    });
  });
}

async function renderStats(container) {
  const stats = await api.get('/leetcode/stats');
  const solvedCount = new Set(store.completed.list('leetcode').map(([id]) => +id)).size;
  container.querySelector('.lc-stats').innerHTML = renderStatsCard(stats, solvedCount);
}

export async function renderLeetcode(container) {
  _container = container;
  container.innerHTML = `
    <div class="lc-stats"></div>
    <div class="lc-filters"></div>
    <div class="q-current"></div>
    <div class="q-related"></div>
  `;
  try {
    const [data, stats] = await Promise.all([
      api.get('/leetcode/today'),
      api.get('/leetcode/stats'),
    ]);
    container.querySelector('.lc-filters').innerHTML = renderFilters(stats);
    await renderStats(container);

    if (!data || !data.question) {
      container.querySelector('.q-current').innerHTML = `<div class="empty-state">今日题尚未发布</div>`;
      return;
    }
    await renderQuestionCardWithClick(container, data.question);

    container.querySelectorAll('[data-fdiff]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.difficulty = b.dataset.fdiff; renderLeetcode(container); });
    });
    container.querySelectorAll('[data-ftag]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.tag = b.dataset.ftag; renderLeetcode(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
