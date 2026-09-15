// 题目详情页：点击每日一题后的完整问题视图
// 类似 LeetCode 的题目详情：题目 + 示例 + 约束 + 渐进提示 + 题解 + 同类题

import { escapeHTML } from './app.js';
import { renderMarkdown } from './markdown.js';
import { showDetail } from './detail-panel.js';
import { toast } from './toast.js';
import { store } from './state.js';
import { api } from './api.js';

const ICON_HINT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 3 2 5 3 6 1 1 1 2 1 3h6c0-1 0-2 1-3 1-1 3-3 3-6a7 7 0 0 0-7-7z"/></svg>';
const ICON_SOLUTION = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const ICON_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

let _overlay = null;

function ensureOverlay() {
  if (_overlay) return _overlay;
  _overlay = document.createElement('div');
  _overlay.className = 'problem-overlay';
  _overlay.innerHTML = `<div class="problem-panel">
    <header class="problem-header">
      <div class="problem-header-main">
        <div class="problem-badges"></div>
        <h1 class="problem-title"></h1>
        <div class="problem-meta"></div>
      </div>
      <div class="problem-header-actions">
        <button class="icon-btn problem-close" title="关闭">×</button>
      </div>
    </header>
    <div class="problem-body"></div>
    <footer class="problem-footer"></footer>
  </div>`;
  document.body.appendChild(_overlay);
  _overlay.addEventListener('click', (e) => {
    if (e.target === _overlay || e.target.closest('.problem-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _overlay.classList.contains('show')) close();
  });
  return _overlay;
}

function close() {
  if (!_overlay) return;
  _overlay.classList.remove('show');
  document.body.style.overflow = '';
}

function renderHintBtns(hintsRaw, module, qid, hintsShown) {
  if (!hintsRaw) return '';
  // 解析 hints_md 为 3 段
  const parts = hintsRaw.split('|HINT_').slice(1);
  const hints = [1, 2, 3].map(n => {
    const p = parts.find(x => x.startsWith(n + '|'));
    return p ? p.slice(2).trim() : '';
  });
  if (!hints.some(Boolean)) return '';
  return `
    <div class="hint-section">
      <h3>💡 提示 <span style="color:var(--fg-tertiary);font-size:0.867rem;font-weight:400">（渐进展开，1 → 2 → 3）</span></h3>
      ${[1,2,3].map(n => {
        if (!hints[n-1]) return '';
        const visible = hintsShown.has(n);
        const next = hints[n-1 === 3 ? null : n];
        return `<div class="hint-card ${visible ? 'shown' : 'hidden'}">
          <div class="hint-header" data-hint-toggle="${n}">
            <span class="hint-num">提示 ${n}</span>
            <span class="hint-toggle">${visible ? '隐藏' : '显示'}</span>
          </div>
          ${visible ? `<div class="hint-body markdown-body">${renderMarkdown(hints[n-1])}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderMyAnswer(qid, module, actualAnswer) {
  if (!actualAnswer || actualAnswer.length > 200) return '';  // 文字答案太长的跳过
  return `
    <div class="my-answer-section">
      <h3>✏️ 我的答案</h3>
      <p style="color:var(--fg-secondary);font-size:0.867rem;margin-bottom:8px">在 LeetCode 里这是代码编辑器。这里是文字答案题，输入你的答案点检查。</p>
      <textarea id="my-answer" placeholder="输入你的答案..." style="width:100%;min-height:80px;padding:10px;border:1px solid var(--divider);border-radius:var(--radius-sm);background:var(--bg-elevated);color:var(--fg);font-family:var(--font-sans);font-size:0.933rem;resize:vertical"></textarea>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" id="check-answer">✓ 检查答案</button>
        <button class="btn btn-sm" id="reveal-answer">💡 直接看答案</button>
      </div>
      <div id="answer-feedback" style="margin-top:12px"></div>
    </div>
  `;
}

function renderSolution(module, qid, data) {
  if (!data.solution_md) return '';
  return `
    <div class="solution-section" style="margin-top:24px">
      <h3>📝 官方题解 <span style="color:var(--fg-tertiary);font-size:0.867rem;font-weight:400">（点击展开）</span></h3>
      <details>
        <summary style="cursor:pointer;color:var(--accent-blue);padding:8px 0">点击查看完整题解（含思路/代码/复杂度）</summary>
        <div class="markdown-body" style="margin-top:16px;padding:16px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--accent-blue)">
          ${renderMarkdown(data.solution_md)}
        </div>
      </details>
    </div>
  `;
}

function renderAnswer(module, qid, data) {
  if (!data.answer) return '';
  return `
    <div class="answer-section" style="margin-top:16px">
      <h3>✅ 参考答案</h3>
      <div style="padding:14px 18px;background:linear-gradient(135deg, var(--bg) 0%, rgba(0,113,227,0.06) 100%);border-radius:var(--radius);font-family:var(--mono);font-size:1.133rem;color:var(--accent-blue);border-left:3px solid var(--accent-blue)">
        ${escapeHTML(data.answer)}
      </div>
    </div>
  `;
}

function renderModelSection(data) {
  if (!data.model_name && !data.model_description_md) return '';
  return `
    <div class="model-section" style="margin-top:24px;padding:18px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--success)">
      <h3 style="margin-bottom:12px">🎓 背后模型</h3>
      ${data.model_name ? `<div style="font-family:var(--font-serif);font-size:1.067rem;font-weight:500;color:var(--fg);margin-bottom:8px">${escapeHTML(data.model_name)}</div>` : ''}
      ${data.model_description_md ? `<div class="markdown-body" style="font-size:0.933rem">${renderMarkdown(data.model_description_md)}</div>` : ''}
    </div>
  `;
}

function renderVariations(md) {
  if (!md) return '';
  return `
    <div class="variations-section" style="margin-top:24px">
      <h3>🔀 类似题变种</h3>
      <div class="markdown-body" style="font-size:0.933rem">${renderMarkdown(md)}</div>
    </div>
  `;
}

function renderInsights(md) {
  if (!md) return '';
  return `
    <div class="insights-section" style="margin-top:24px;padding:16px 20px;background:rgba(255,149,0,0.04);border-radius:var(--radius);border-left:3px solid var(--warning)">
      <h3 style="margin-bottom:12px">💡 关键洞察</h3>
      <div class="markdown-body" style="font-size:0.933rem">${renderMarkdown(md)}</div>
    </div>
  `;
}

function renderRelated(items) {
  if (!items || !items.length) return '';
  return `
    <div class="related-section" style="margin-top:24px">
      <h3>🔗 同类题（${escapeHTML(items.category || '')}）</h3>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        ${items.items.map(it => `
          <div class="list-item related-item" data-rid="${it.id}" style="cursor:pointer">
            <div class="list-item-title" style="font-size:0.933rem">${escapeHTML(it.question_zh || '')}</div>
            <div class="list-item-meta">
              <span class="badge ${it.difficulty_label === 'Easy' ? 'badge-success' : it.difficulty_label === 'Medium' ? '' : 'badge-3'}">${escapeHTML(it.difficulty_label || '')}</span>
              ${it.sub_category ? `<span class="badge">${escapeHTML(it.sub_category)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderConstraints(md) {
  if (!md) return '';
  return `<div class="constraints-section" style="margin-top:16px">
    <h3>📏 约束</h3>
    <div class="markdown-body" style="padding:12px 16px;background:var(--bg);border-radius:var(--radius);font-size:0.933rem">${renderMarkdown(md)}</div>
  </div>`;
}

function renderExamples(md) {
  if (!md) return '';
  return `<div class="examples-section" style="margin-top:16px">
    <h3>📋 示例</h3>
    <div class="markdown-body" style="font-size:0.933rem">${renderMarkdown(md)}</div>
  </div>`;
}

function renderProblem(md) {
  if (!md) return '';
  return `<div class="problem-statement">
    <div class="markdown-body" style="font-size:1rem;line-height:1.85">${renderMarkdown(md)}</div>
  </div>`;
}

export async function openProblemPage({ module, qid, onSolve, onNext }) {
  // module: 'quant' | 'leetcode'
  const o = ensureOverlay();
  const titleEl = o.querySelector('.problem-title');
  const badgesEl = o.querySelector('.problem-badges');
  const metaEl = o.querySelector('.problem-meta');
  const bodyEl = o.querySelector('.problem-body');
  const footerEl = o.querySelector('.problem-footer');

  bodyEl.innerHTML = '<div style="padding:60px;text-align:center"><div class="spinner"></div></div>';
  o.classList.add('show');
  document.body.style.overflow = 'hidden';

  let data, related;
  try {
    const base = module === 'quant' ? '/quant' : '/leetcode';
    data = await api.get(`${base}/${qid}`);
    related = await api.get(`${base}/${qid}/related`);
  } catch (e) {
    bodyEl.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
    return;
  }

  // 标题 + meta
  titleEl.textContent = data.title_zh || data.title_en || data.question_zh || '';

  // badges
  const badges = [];
  if (module === 'leetcode') {
    badges.push(`<span class="badge Hot 100">Hot 100 #${data.order_in_hot100 || data.lc_id}</span>`);
    if (data.difficulty) {
      const cls = `diff-${data.difficulty}`;
      badges.push(`<span class="badge ${cls}">${escapeHTML(data.difficulty)}</span>`);
    }
  } else {
    if (data.source) badges.push(`<span class="badge">${escapeHTML(data.source)}</span>`);
    if (data.difficulty) {
      const stars = '★'.repeat(data.difficulty) + '☆'.repeat(5 - data.difficulty);
      badges.push(`<span class="badge">难度 ${stars}</span>`);
    }
  }
  if (data.tags) {
    data.tags.split(',').filter(Boolean).slice(0, 5).forEach(t => {
      badges.push(`<span class="badge">${escapeHTML(t.trim())}</span>`);
    });
  }
  const isSolved = store.completed.has(module, qid);
  if (isSolved) badges.push('<span class="badge badge-success">✓ 已掌握</span>');
  badgesEl.innerHTML = badges.join(' ');

  // meta
  metaEl.innerHTML = `
    ${data.url ? `<a href="${escapeHTML(data.url)}" target="_blank" rel="noopener" style="font-size:0.867rem">🔗 原题链接</a>` : ''}
    ${data.complexity ? `<span style="color:var(--fg-tertiary);font-size:0.867rem">⏱ ${escapeHTML(data.complexity)}</span>` : ''}
  `;

  // body
  const isQuant = module === 'quant';
  bodyEl.innerHTML = `
    <div style="max-width:920px;margin:0 auto;padding:32px 40px">
      ${renderProblem(isQuant ? data.problem_md : data.description_md)}
      ${renderExamples(data.examples_md)}
      ${renderConstraints(data.constraints_md)}
      ${renderMyAnswer(qid, module, isQuant ? data.answer : null)}
      <div id="hint-mount"></div>
      ${isQuant ? renderModelSection(data) : ''}
      ${renderSolution(module, qid, data)}
      ${isQuant ? renderAnswer(module, qid, data) : ''}
      ${isQuant && data.insights_md ? renderInsights(data.insights_md) : ''}
      ${isQuant && data.variations_md ? renderVariations(data.variations_md) : ''}
      ${renderRelated(related)}
    </div>
  `;

  // 渐进提示状态（用 localStorage）
  const hintKey = `${module}_hint_${qid}`;
  const hintsShown = new Set(JSON.parse(localStorage.getItem(hintKey) || '[]'));
  const hintMount = bodyEl.querySelector('#hint-mount');

  function renderHintSection() {
    hintMount.innerHTML = renderHintBtns(data.hints_md, module, qid, hintsShown);
    hintMount.querySelectorAll('[data-hint-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const n = +el.dataset.hintToggle;
        if (hintsShown.has(n)) hintsShown.delete(n); else hintsShown.add(n);
        localStorage.setItem(hintKey, JSON.stringify([...hintsShown]));
        renderHintSection();
      });
    });
  }
  renderHintSection();

  // 答案检查
  bodyEl.querySelector('#check-answer')?.addEventListener('click', () => {
    const myAns = bodyEl.querySelector('#my-answer').value.trim();
    const feedback = bodyEl.querySelector('#answer-feedback');
    if (!myAns) {
      toast.error('先输入答案');
      return;
    }
    const correct = (data.answer || '').trim().toLowerCase().replace(/\s+/g, '');
    const mine = myAns.toLowerCase().replace(/\s+/g, '');
    if (correct && mine === correct) {
      feedback.innerHTML = `<div class="flash success">✓ 正确！答案：${escapeHTML(data.answer)}</div>`;
      if (!isSolved) {
        store.completed.add(module, qid);
        toast.success('✓ 已加入"已掌握"');
        // 更新 badges
        badgesEl.innerHTML = badgesEl.innerHTML.replace(/<span class="badge badge-success">.*?<\/span>/g, '') +
          '<span class="badge badge-success">✓ 已掌握</span>';
      }
      onSolve && onSolve();
    } else if (correct) {
      feedback.innerHTML = `<div class="flash error">不对哦。参考答案：<strong>${escapeHTML(data.answer)}</strong></div>`;
    } else {
      feedback.innerHTML = `<div class="flash info">这道题是代码题，输入无效。直接看答案或题解。</div>`;
    }
  });

  bodyEl.querySelector('#reveal-answer')?.addEventListener('click', () => {
    const feedback = bodyEl.querySelector('#answer-feedback');
    feedback.innerHTML = `<div class="flash info">参考答案：<strong>${escapeHTML(data.answer)}</strong></div>`;
  });

  // 同类题点击 → 加载新题
  bodyEl.querySelectorAll('.related-item').forEach(el => {
    el.addEventListener('click', async () => {
      const rid = +el.dataset.rid;
      await openProblemPage({ module, qid: rid, onSolve, onNext });
    });
  });

  // footer actions
  footerEl.innerHTML = `
    <button class="btn ${isSolved ? '' : 'btn-primary'}" id="mark-solved">
      ${isSolved ? '✓ 已掌握' : '标记已掌握'}
    </button>
    <button class="btn" id="next-question">${ICON_REFRESH} 换一题</button>
    <button class="btn" id="back-to-list">${ICON_LIST} 返回列表</button>
  `;

  footerEl.querySelector('#mark-solved').addEventListener('click', () => {
    if (store.completed.has(module, qid)) {
      store.completed.remove(module, qid);
      toast.info('已取消');
    } else {
      store.completed.add(module, qid);
      toast.success('✓ 已掌握');
    }
    if (onSolve) onSolve();
    // 刷新 footer 文字
    const btn = footerEl.querySelector('#mark-solved');
    btn.textContent = store.completed.has(module, qid) ? '✓ 已掌握' : '标记已掌握';
    btn.classList.toggle('btn-primary', !store.completed.has(module, qid));
  });

  footerEl.querySelector('#next-question').addEventListener('click', () => {
    if (onNext) onNext();
  });

  footerEl.querySelector('#back-to-list').addEventListener('click', close);
}

export { close as closeProblem };
