import { api } from '../api.js';
import { escapeHTML } from '../app.js';

export async function renderGithub(container) {
  const data = await api.get('/github/trending?days=3&limit=30');
  if (!data.items.length) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3"/></svg>
      <div class="empty-state-title">今日 GitHub 趋势尚未抓取</div>
      <div class="empty-state-desc">等待凌晨 5:00 cron</div>
    </div>`;
    return;
  }
  container.innerHTML = `
    <div class="flash info">展示过去 3 天内出现在 GitHub Trending 的项目，去重后按最新排名排序</div>
    ${data.items.map(r => `<div class="list-item">
      <div class="list-item-title"><a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">${escapeHTML(r.full_name)}</a></div>
      ${r.brief_zh ? `<div class="list-item-summary" style="font-weight:500;color:var(--fg)">${escapeHTML(r.brief_zh)}</div>` : ''}
      ${r.description && r.description !== r.brief_zh ? `<div class="list-item-summary">${escapeHTML(r.description)}</div>` : ''}
      <div class="list-item-meta">
        ${r.language ? `<span class="badge">${escapeHTML(r.language)}</span>` : ''}
        ${r.tags ? r.tags.split(',').filter(Boolean).slice(0, 4).map(t => `<span class="badge">${escapeHTML(t.trim())}</span>`).join('') : ''}
        ${r.stars_today ? `<span style="color:var(--accent-blue)">+${r.stars_today} ⭐ today</span>` : ''}
        <span>${r.stars_total?.toLocaleString?.() || r.stars_total || 0} ⭐ total</span>
      </div>
    </div>`).join('')}
  `;
}
