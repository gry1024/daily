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

function renderStats(dailyQuestion, totalQ, allByCat) {
  const solvedSet = new Set(store.completed.list('quant').map(([id]) => +id));
  const streak = store.getStreak('quant');
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">今日一题</div>
        <div class="stat-value" style="color:var(--accent-blue);font-size:1.4rem">${dailyQuestion ? '✓ 已选' : '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已掌握</div>
        <div class="stat-value">${solvedSet.size}<span style="font-size:0.933rem;color:var(--fg-tertiary);margin-left:4px">/ ${totalQ}</span></div>
        <div class="progress-bar success"><div class="progress-bar-fill" style="width:${Math.round(solvedSet.size/totalQ*100)}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">连击</div>
        <div class="stat-value">${streak}<span style="font-size:0.933rem"> 天</span></div>
      </div>
    </div>
  `;
}

function renderDailyPick(q) {
  const cat = q.category || 'probability';
  const icon = CAT_ICON[cat] || '🎲';
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer;position:relative;border:2px solid var(--accent-blue);background:rgba(0,113,227,0.02)">
      <div style="position:absolute;top:0;left:0;background:var(--accent-blue);color:#fff;font-size:0.733rem;padding:2px 10px;border-radius:0 0 var(--radius) 0;letter-spacing:0.04em">⭐ 今日一题</div>
      <div class="card-actions" style="position:absolute;top:8px;right:8px;z-index:2">
        <button class="vocab-btn ${store.completed.has('quant', q.id) ? 'on' : ''}" data-mark-solved="${q.id}" title="标记掌握">
          ${store.completed.has('quant', q.id) ? '✓ 已掌握' : '○ 标记'}
        </button>
      </div>
      <div class="q-meta" style="margin-top:20px;padding-right:90px">
        <span class="badge">${icon} ${escapeHTML(cat)}</span>
        <span class="badge ${diffBadge(q.difficulty_label)}">${escapeHTML(q.difficulty_label || 'Medium')}</span>
        ${q.sub_category ? `<span class="badge">${escapeHTML(q.sub_category)}</span>` : ''}
        ${q.source ? `<span class="badge">${escapeHTML(q.source)}</span>` : ''}
      </div>
      <div class="q-body" style="font-weight:500;font-size:1.067rem">${escapeHTML(q.question_zh || q.question_en || '')}</div>
      <div class="q-actions" style="margin-top:12px;color:var(--accent-blue);font-size:0.867rem;font-family:var(--font-sans)">
        👉 点击查看完整解析 / 背后模型 / 类似题 / 关键洞察
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

function renderBankCard(q) {
  const cat = q.category || 'probability';
  const icon = CAT_ICON[cat] || '🎲';
  const isSolved = store.completed.has('quant', q.id);
  return `
    <div class="q-card problem-card" data-qid="${q.id}" style="cursor:pointer;position:relative;padding:14px 18px">
      <div class="card-actions" style="position:absolute;top:6px;right:6px;z-index:2">
        <button class="action-btn ${isSolved ? 'active' : ''}" data-mark-solved="${q.id}" title="标记掌握">
          ${isSolved ? '✓' : '○'}
        </button>
      </div>
      <div class="q-meta">
        <span class="badge">${icon} ${escapeHTML(cat)}</span>
        <span class="badge ${diffBadge(q.difficulty_label)}">${escapeHTML(q.difficulty_label)}</span>
        ${q.sub_category ? `<span class="badge">${escapeHTML(q.sub_category)}</span>` : ''}
      </div>
      <div class="q-body" style="font-weight:500;font-size:0.933rem;padding-right:24px">${escapeHTML(q.question_zh || '')}</div>
    </div>
  `;
}

let currentFilter = { difficulty: '', category: '' };
let _dailyQuestion = null;

async function render(container) {
  container.innerHTML = `
    <div class="q-stats"></div>
    <div class="q-daily"></div>
    <div class="q-bank-filters"></div>
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin:32px 0 12px;color:var(--fg)">📚 完整题库</h2>
    <div class="q-bank-list"></div>
  `;
  try {
    const [today, stats, browse] = await Promise.all([
      api.get('/quant/today'),
      api.get('/quant/stats'),
      api.get('/quant/list?limit=200'),
    ]);
    _dailyQuestion = today.questions?.[0] || null;
    let allQs = browse.items || [];

    container.querySelector('.q-stats').innerHTML = renderStats(_dailyQuestion, stats.total, {});
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
  if (currentFilter.difficulty) items = items.filter(q => q.difficulty_label === currentFilter.difficulty);
  if (currentFilter.category) items = items.filter(q => q.category === currentFilter.category);
  const listEl = container.querySelector('.q-bank-list');
  listEl.innerHTML = items.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:10px">${items.map(renderBankCard).join('')}</div>`
    : `<div class="empty-state">无匹配题目</div>`;
  // 重新绑事件（filter 后 DOM 变了）
  listEl.querySelectorAll('.problem-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark-solved]')) return;
      openProblemPage({ module: 'quant', qid: +card.dataset.qid, onSolve: () => render(_container) });
    });
  });
  listEl.querySelectorAll('[data-mark-solved]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +b.dataset.markSolved;
      if (store.completed.has('quant', id)) {
        store.completed.remove('quant', id);
        toast.info('已取消');
      } else {
        store.completed.add('quant', id);
        api.post(`/quant/${id}/solve`).catch(() => {});
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
  container.querySelectorAll('[data-fcat]').forEach(b => {
    b.addEventListener('click', () => {
      currentFilter.category = b.dataset.fcat || '';
      filterAndRender(container, allQs);
    });
  });

  // 每日一题卡片
  const dailyCard = container.querySelector('.q-daily .problem-card');
  if (dailyCard) {
    dailyCard.addEventListener('click', (e) => {
      if (e.target.closest('[data-mark-solved]')) return;
      openProblemPage({ module: 'quant', qid: +dailyCard.dataset.qid, onSolve: () => render(container) });
    });
    dailyCard.querySelector('[data-mark-solved]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +e.currentTarget.dataset.markSolved;
      if (store.completed.has('quant', id)) {
        store.completed.remove('quant', id);
        toast.info('已取消');
      } else {
        store.completed.add('quant', id);
        api.post(`/quant/${id}/solve`).catch(() => {});
        toast.success('✓ 已掌握');
      }
      render(container);
    });
  }
}

export async function renderQuant(container) {
  _container = container;
  await render(container);
}
