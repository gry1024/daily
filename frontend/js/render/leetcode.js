import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { toast } from '../toast.js';
import { openProblemPage } from '../problem-view.js';

function diffClass(d) {
  return d === 'easy' ? 'diff-easy' : d === 'medium' ? 'diff-medium' : 'diff-hard';
}

function renderStats(dailyQuestion, totalQ, solvedCount) {
  const streak = store.getStreak('leetcode');
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">今日一题</div>
        <div class="stat-value" style="color:var(--accent-blue);font-size:1.4rem">${dailyQuestion ? `LC ${dailyQuestion.lc_id}` : '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已掌握</div>
        <div class="stat-value">${solvedCount}<span style="font-size:0.933rem;color:var(--fg-tertiary);margin-left:4px">/ ${totalQ}</span></div>
        <div class="progress-bar success"><div class="progress-bar-fill" style="width:${Math.round(solvedCount/totalQ*100)}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">连击</div>
        <div class="stat-value">${streak}<span style="font-size:0.933rem"> 天</span></div>
      </div>
    </div>
  `;
}

function renderDailyPick(q) {
  const tagHtml = (q.tags || '').split(',').filter(Boolean).slice(0, 5).map(t =>
    `<span class="badge">${escapeHTML(t.trim())}</span>`).join('');
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer;position:relative;border:2px solid var(--accent-blue);background:rgba(0,113,227,0.02)">
      <div style="position:absolute;top:0;left:0;background:var(--accent-blue);color:#fff;font-size:0.733rem;padding:2px 10px;border-radius:0 0 var(--radius) 0;letter-spacing:0.04em">⭐ 今日一题</div>
      <div class="card-actions" style="position:absolute;top:8px;right:8px;z-index:2">
        <button class="vocab-btn ${store.completed.has('leetcode', q.id) ? 'on' : ''}" data-mark-solved="${q.id}" title="标记掌握">
          ${store.completed.has('leetcode', q.id) ? '✓ 已掌握' : '○ 标记'}
        </button>
      </div>
      <div class="q-meta" style="margin-top:20px;padding-right:90px">
        <span class="badge">Hot 100 #${q.order_in_hot100 || q.lc_id}</span>
        <span class="badge ${diffClass(q.difficulty)}">${escapeHTML(q.difficulty)}</span>
        ${tagHtml}
      </div>
      <div class="q-body" style="font-weight:500;font-size:1.067rem">${escapeHTML(q.title_zh || q.title_en || '')}</div>
      <div class="q-body-en" style="color:var(--fg-secondary);font-size:0.9rem">${escapeHTML(q.title_en || '')}</div>
      <div class="q-actions" style="margin-top:12px;color:var(--accent-blue);font-size:0.867rem;font-family:var(--font-sans)">
        👉 点击查看完整描述 / 示例 / 约束 / 提示 / 题解
      </div>
    </div>
  `;
}

function renderFilters(stats) {
  return `
    <div class="filter-bar">
      <span style="color:var(--fg-secondary);font-size:0.867rem">难度：</span>
      <button class="filter-chip ${currentFilter.difficulty === '' ? 'active' : ''}" data-fdiff="">全部</button>
      <button class="filter-chip ${currentFilter.difficulty === 'easy' ? 'active' : ''}" data-fdiff="easy"><span class="diff-easy">Easy</span> (${stats.by_difficulty.find(d => d.difficulty === 'easy')?.n || 0})</button>
      <button class="filter-chip ${currentFilter.difficulty === 'medium' ? 'active' : ''}" data-fdiff="medium"><span class="diff-medium">Medium</span> (${stats.by_difficulty.find(d => d.difficulty === 'medium')?.n || 0})</button>
      <button class="filter-chip ${currentFilter.difficulty === 'hard' ? 'active' : ''}" data-fdiff="hard"><span class="diff-hard">Hard</span> (${stats.by_difficulty.find(d => d.difficulty === 'hard')?.n || 0})</button>
      <span style="margin:0 8px;color:var(--fg-tertiary)">·</span>
      <span style="color:var(--fg-secondary);font-size:0.867rem">标签：</span>
      <button class="filter-chip ${currentFilter.tag === '' ? 'active' : ''}" data-ftag="">热门</button>
      ${stats.top_tags.slice(0, 8).map(t =>
        `<button class="filter-chip ${currentFilter.tag === t.tag ? 'active' : ''}" data-ftag="${escapeHTML(t.tag)}">${escapeHTML(t.tag)} (${t.n})</button>`
      ).join('')}
    </div>
  `;
}

function renderBankCard(q) {
  const tagHtml = (q.tags || '').split(',').filter(Boolean).slice(0, 3).map(t =>
    `<span class="badge">${escapeHTML(t.trim())}</span>`).join('');
  const isSolved = store.completed.has('leetcode', q.id);
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer;position:relative;padding:14px 18px">
      <div class="card-actions" style="position:absolute;top:6px;right:6px;z-index:2">
        <button class="action-btn ${isSolved ? 'active' : ''}" data-mark-solved="${q.id}" title="标记掌握">
          ${isSolved ? '✓' : '○'}
        </button>
      </div>
      <div class="q-meta">
        <span class="badge">#${q.order_in_hot100 || q.lc_id}</span>
        <span class="badge ${diffClass(q.difficulty)}">${escapeHTML(q.difficulty)}</span>
        ${tagHtml}
      </div>
      <div class="q-body" style="font-weight:500;font-size:0.933rem;padding-right:24px">${escapeHTML(q.title_zh || q.title_en || '')}</div>
    </div>
  `;
}

let currentFilter = { difficulty: '', tag: '' };
let _dailyQuestion = null;

function openLeetcodeProblem(qid, refresh) {
  openProblemPage({
    module: 'leetcode',
    qid,
    onSolve: refresh,
    onNext: async () => {
      try {
        const res = await api.get(`/leetcode/random?exclude=${qid}`, { cache: false });
        if (res.question) {
          openLeetcodeProblem(res.question.id, refresh);
        } else {
          toast.info('没有更多可换的题了');
        }
      } catch (e) {
        toast.error(`换题失败：${e.message}`);
      }
    },
  });
}

async function render(container) {
  container.innerHTML = `
    <div class="q-stats"></div>
    <div class="q-daily"></div>
    <div class="q-bank-filters"></div>
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin:32px 0 12px;color:var(--fg)">📚 完整题库（Hot 100）</h2>
    <div class="q-bank-list"></div>
  `;
  try {
    const [today, stats, browse] = await Promise.all([
      api.get('/leetcode/today'),
      api.get('/leetcode/stats'),
      api.get('/leetcode/list?limit=200'),
    ]);
    _dailyQuestion = today.question || null;
    let allQs = browse.items || [];
    const solvedCount = new Set(store.completed.list('leetcode').map(([id]) => +id)).size;

    container.querySelector('.q-stats').innerHTML = renderStats(_dailyQuestion, stats.total, solvedCount);
    container.querySelector('.q-daily').innerHTML = _dailyQuestion
      ? renderDailyPick(_dailyQuestion)
      : '<div class="empty-state">今日题尚未发布</div>';

    container.querySelector('.q-bank-filters').innerHTML = renderFilters(stats);

    bindEvents(container, allQs);
    filterAndRender(container, allQs);
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}

function filterAndRender(container, allQs) {
  let items = allQs;
  if (currentFilter.difficulty) items = items.filter(q => q.difficulty === currentFilter.difficulty);
  if (currentFilter.tag) items = items.filter(q => q.tags && q.tags.split(',').map(t => t.trim()).includes(currentFilter.tag));
  const listEl = container.querySelector('.q-bank-list');
  listEl.innerHTML = items.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:10px">${items.map(renderBankCard).join('')}</div>`
    : `<div class="empty-state">无匹配题目</div>`;

  listEl.querySelectorAll('.problem-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark-solved]')) return;
      openLeetcodeProblem(+card.dataset.qid, () => render(_container));
    });
  });
  listEl.querySelectorAll('[data-mark-solved]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +b.dataset.markSolved;
      if (store.completed.has('leetcode', id)) {
        store.completed.remove('leetcode', id);
        toast.info('已取消');
      } else {
        store.completed.add('leetcode', id);
        toast.success('✓ 已掌握');
      }
      render(_container);
    });
  });
}

let _container = null;
function bindEvents(container, allQs) {
  container.querySelectorAll('[data-fdiff]').forEach(b => {
    b.addEventListener('click', () => {
      currentFilter.difficulty = b.dataset.fdiff || '';
      filterAndRender(container, allQs);
    });
  });
  container.querySelectorAll('[data-ftag]').forEach(b => {
    b.addEventListener('click', () => {
      currentFilter.tag = b.dataset.ftag || '';
      filterAndRender(container, allQs);
    });
  });

  const dailyCard = container.querySelector('.q-daily .problem-card');
  if (dailyCard) {
    dailyCard.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark-solved]')) return;
      openLeetcodeProblem(+dailyCard.dataset.qid, () => render(container));
    });
    dailyCard.querySelector('[data-mark-solved]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +e.currentTarget.dataset.markSolved;
      if (store.completed.has('leetcode', id)) {
        store.completed.remove('leetcode', id);
        toast.info('已取消');
      } else {
        store.completed.add('leetcode', id);
        toast.success('✓ 已掌握');
      }
      render(container);
    });
  }
}

export async function renderLeetcode(container) {
  _container = container;
  await render(container);
}
