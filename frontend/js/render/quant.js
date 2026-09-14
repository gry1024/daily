import { api } from '../api.js';
import { escapeHTML } from '../app.js';

function md(text) {
  // 极简 markdown：保留段落、**粗体**、`代码`、换行
  if (!text) return '';
  let s = escapeHTML(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\n\n+/g, '</p><p>');
  s = s.replace(/\n/g, '<br>');
  return `<div class="markdown-body"><p>${s}</p></div>`;
}

export async function renderQuant(container) {
  const data = await api.get('/quant/today');
  if (!data || !data.question) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <div class="empty-state-title">今日题尚未发布</div>
      <div class="empty-state-desc">请等待凌晨 5:00 的 cron 自动选题。</div>
    </div>`;
    return;
  }
  const q = data.question;
  container.innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span class="badge">${escapeHTML(q.source || '')}</span>
        <span class="badge">难度 ${q.difficulty}/5</span>
        ${q.tags ? q.tags.split(',').filter(Boolean).map(t => `<span class="badge">${escapeHTML(t.trim())}</span>`).join('') : ''}
      </div>
      <div class="q-body">${escapeHTML(q.question_zh || '')}</div>
      ${q.question_en ? `<div class="q-body-en">${escapeHTML(q.question_en)}</div>` : ''}
      <button class="btn q-reveal-btn" id="quant-reveal">展开答案与解析</button>
      <div class="q-solution" id="quant-solution" hidden></div>
    </div>
    <div class="flash info" style="margin-top:16px">
      题库循环展示，36 天一轮换。题目可换但当日题每日固定。
    </div>
  `;
  document.getElementById('quant-reveal').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = '加载中…';
    try {
      const d = await api.get(`/quant/${q.id}/reveal`);
      const sol = document.getElementById('quant-solution');
      sol.innerHTML = `
        <h3 style="font-family:var(--font-serif);font-size:1.133rem;margin-bottom:8px;color:var(--fg)">答案</h3>
        <div class="markdown-body"><p>${escapeHTML(d.answer || '（暂无）')}</p></div>
        <h3 style="font-family:var(--font-serif);font-size:1.133rem;margin:24px 0 8px;color:var(--fg)">解析</h3>
        ${md(d.solution)}
      `;
      sol.hidden = false;
      e.target.style.display = 'none';
    } catch (err) {
      e.target.disabled = false;
      e.target.textContent = '展开答案与解析';
      alert('答案加载失败：' + err.message);
    }
  });
}
