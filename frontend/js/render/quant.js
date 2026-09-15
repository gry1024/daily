import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { toast } from '../toast.js';
import { openProblemPage } from '../problem-view.js';

const CAT_ICON = {
  probability: '🎲',
  brain_teaser: '🧩',
  math: '🔢',
  stats: '📊',
  stochastic: '🎰',
};

function diffBadge(d) {
  if (d === 'Easy') return 'badge-success';
  if (d === 'Hard' || d === 'Very Hard') return 'badge-3';
  return '';
}

function renderStats(questions, totalQ) {
  const solvedSet = new Set(store.completed.list('quant').map(([id]) => +id));
  const solvedToday = questions.filter(q => solvedSet.has(q.id)).length;
  const streak = store.getStreak('quant');

  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">今日 5 题</div>
        <div class="stat-value">${solvedToday}/5</div>
        <div class="stat-label" style="margin-top:4px">已掌握 ${solvedSet.size}/${totalQ}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">题库总量</div>
        <div class="stat-value">${totalQ}</div>
        <div class="stat-label" style="margin-top:4px;font-size:0.8rem">5 大类 · 30 题</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">连击</div>
        <div class="stat-value">${streak}<span style="font-size:0.933rem"> 天</span></div>
      </div>
    </div>
  `;
}

function renderFilters(stats) {
  return `
    <div class="filter-bar">
      <span style="color:var(--fg-secondary);font-size:0.867rem">难度：</span>
      <button class="filter-chip ${currentFilter.difficulty === '' ? 'active' : ''}" data-fdiff="">全部</button>
      ${stats.by_difficulty.map(d =>
        `<button class="filter-chip ${currentFilter.difficulty === d.difficulty_label ? 'active' : ''}" data-fdiff="${d.difficulty_label}">${d.difficulty_label} (${d.n})</button>`
      ).join('')}
      <span style="margin:0 8px;color:var(--fg-tertiary)">·</span>
      <span style="color:var(--fg-secondary);font-size:0.867rem">类别：</span>
      <button class="filter-chip ${currentFilter.category === '' ? 'active' : ''}" data-fcat="">全部</button>
      ${['probability', 'brain_teaser', 'math', 'stats', 'stochastic'].map(c =>
        `<button class="filter-chip ${currentFilter.category === c ? 'active' : ''}" data-fcat="${c}">${CAT_ICON[c]} ${c}</button>`
      ).join('')}
    </div>
  `;
}

function renderQuestionCard(q, position, total) {
  const cat = q.category || 'probability';
  const icon = CAT_ICON[cat] || '🎲';
  const isSolved = store.completed.has('quant', q.id);
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer;position:relative">
      <div class="card-actions" style="position:absolute;top:8px;right:8px;z-index:2">
        <button class="vocab-btn ${isSolved ? 'on' : ''}" data-mark-solved="${q.id}" title="标记掌握" style="${isSolved ? 'background:rgba(52,199,89,0.12);color:var(--success)' : ''}">
          ${isSolved ? '✓ 已掌握' : '○ 标记'}
        </button>
      </div>
      <div class="q-meta">
        <span class="badge">${position}/${total}</span>
        <span class="badge">${icon} ${escapeHTML(cat)}</span>
        <span class="badge ${diffBadge(q.difficulty_label)}">${escapeHTML(q.difficulty_label || 'Medium')}</span>
        ${q.sub_category ? `<span class="badge">${escapeHTML(q.sub_category)}</span>` : ''}
        ${q.source ? `<span class="badge">${escapeHTML(q.source)}</span>` : ''}
      </div>
      <div class="q-body" style="font-weight:500;padding-right:100px">${escapeHTML(q.question_zh || q.question_en || '')}</div>
      <div class="q-actions" style="margin-top:12px;color:var(--accent-blue);font-size:0.867rem;font-family:var(--font-sans)">
        👉 点击查看：题目 / 解析 / 背后模型 / 类似题 / 关键洞察
      </div>
    </div>
  `;
}

let currentFilter = { difficulty: '', category: '' };
let _questions = [];

async function renderList(container) {
  const data = await api.get('/quant/today');

  if (!data.questions || !data.questions.length) {
    container.querySelector('.q-current').innerHTML = `<div class="empty-state">今日题尚未发布</div>`;
    return;
  }
  _questions = data.questions;
  container.querySelector('.q-current').innerHTML = _questions.map((q, i) =>
    renderQuestionCard(q, i + 1, _questions.length)
  ).join('');

  container.querySelectorAll('.problem-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark-solved]')) return;
      const qid = +card.dataset.qid;
      openProblemPage({
        module: 'quant',
        qid,
        onSolve: () => renderList(container),
        onNext: async () => {
          const cur = _questions.find(q => q.id === qid);
          const idx = _questions.indexOf(cur);
          const next = _questions[(idx + 1) % _questions.length];
          await openProblemPage({ module: 'quant', qid: next.id, onSolve: () => renderList(container) });
        },
      });
    });
  });

  container.querySelectorAll('[data-mark-solved]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +b.dataset.markSolved;
      const had = store.completed.has('quant', id);
      if (had) {
        store.completed.remove('quant', id);
        toast.info('已取消');
      } else {
        store.completed.add('quant', id);
        api.post(`/quant/${id}/solve`).catch(() => {});
        toast.success('✓ 已掌握');
      }
      renderList(container);
    });
  });
}

async function render(container) {
  container.innerHTML = `
    <div class="q-stats"></div>
    <div class="q-filters"></div>
    <div class="q-current"></div>
    <div class="q-browse" style="margin-top:32px">
      <details>
        <summary style="cursor:pointer;font-family:var(--font-serif);font-size:1.067rem;color:var(--fg-secondary);padding:8px 0">
          浏览全部题库（按难度 / 类别筛选）
        </summary>
        <div class="q-browse-list" style="margin-top:12px"></div>
      </details>
    </div>
  `;

  try {
    const [stats, browseData] = await Promise.all([
      api.get('/quant/stats'),
      api.get('/quant/list?limit=200'),
    ]);

    container.querySelector('.q-stats').innerHTML = renderStats(_questions, stats.total);
    container.querySelector('.q-filters').innerHTML = renderFilters(stats);

    await renderList(container);

    const allQs = browseData.items || [];
    container.querySelector('.q-browse-list').innerHTML = renderBrowse(allQs);

    container.querySelectorAll('[data-fdiff]').forEach(b => {
      b.addEventListener('click', () => {
        currentFilter.difficulty = b.dataset.fdiff || '';
        render(container);
      });
    });
    container.querySelectorAll('[data-fcat]').forEach(b => {
      b.addEventListener('click', () => {
        currentFilter.category = b.dataset.fcat || '';
        render(container);
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}

function renderBrowse(allQs) {
  let items = allQs;
  if (currentFilter.difficulty) items = items.filter(q => q.difficulty_label === currentFilter.difficulty);
  if (currentFilter.category) items = items.filter(q => q.category === currentFilter.category);
  return items.length ? items.map(q => `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer;margin-bottom:8px">
      <div class="q-meta">
        <span class="badge">${CAT_ICON[q.category] || '🎲'} ${escapeHTML(q.category)}</span>
        <span class="badge ${diffBadge(q.difficulty_label)}">${escapeHTML(q.difficulty_label)}</span>
        ${q.sub_category ? `<span class="badge">${escapeHTML(q.sub_category)}</span>` : ''}
      </div>
      <div class="q-body" style="font-weight:500">${escapeHTML(q.question_zh || '')}</div>
    </div>
  `).join('') : `<div class="empty-state">无匹配题目</div>`;
}

export async function renderQuant(container) {
  await render(container);
}
