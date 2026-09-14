import { api } from '../api.js';
import { escapeHTML } from '../app.js';

function md(text) {
  if (!text) return '';
  let s = escapeHTML(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  s = s.replace(/\n\n+/g, '</p><p>');
  s = s.replace(/\n/g, '<br>');
  return `<div class="markdown-body"><p>${s}</p></div>`;
}

export async function renderLeetcode(container) {
  const data = await api.get('/leetcode/today');
  if (!data || !data.question) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 4l-4 8 4 8M16 4l4 8-4 8"/></svg>
      <div class="empty-state-title">今日题尚未发布</div>
      <div class="empty-state-desc">100 题循环展示，每天 1 题</div>
    </div>`;
    return;
  }
  const q = data.question;
  const detail = await api.get(`/leetcode/${q.id}`);
  container.innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span class="badge">Hot 100 #${q.order_in_hot100 || q.lc_id}</span>
        <span class="badge">${escapeHTML(q.difficulty || '')}</span>
        ${q.tags ? q.tags.split(',').filter(Boolean).slice(0, 5).map(t => `<span class="badge">${escapeHTML(t.trim())}</span>`).join('') : ''}
      </div>
      <div class="q-body">${escapeHTML(q.title_zh || q.title_en || '')}</div>
      <div class="q-body-en">${escapeHTML(q.title_en || '')} · <a href="${escapeHTML(q.url)}" target="_blank" rel="noopener">LeetCode ↗</a></div>
      <button class="btn q-reveal-btn" id="lc-reveal">展开题解</button>
      <div class="q-solution" id="lc-solution" hidden></div>
    </div>
  `;
  document.getElementById('lc-reveal').addEventListener('click', (e) => {
    const sol = document.getElementById('lc-solution');
    sol.innerHTML = `
      ${detail.complexity ? `<div class="flash info" style="margin-bottom:12px">复杂度：${escapeHTML(detail.complexity)}</div>` : ''}
      ${md(detail.solution_md)}
    `;
    sol.hidden = false;
    e.target.style.display = 'none';
  });
}
