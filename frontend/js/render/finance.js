import { api } from '../api.js';
import { escapeHTML } from '../app.js';

export async function renderFinance(container) {
  const [quotes, news] = await Promise.all([
    api.get('/finance/quotes'),
    api.get('/finance/news?days=3'),
  ]);

  const quoteCards = (quotes.items || []).map(q => `
    <div class="stat-card quote-card">
      <div class="stat-label">${escapeHTML(q.symbol)}</div>
      <div class="stat-value">${q.price?.toFixed?.(2) ?? q.price}</div>
      <div class="stat-delta ${q.change_pct >= 0 ? 'up' : 'down'}">${q.change_pct >= 0 ? '+' : ''}${q.change_pct?.toFixed?.(2) ?? q.change_pct}%</div>
    </div>
  `).join('');

  container.innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:16px">今日行情</h2>
    ${quoteCards ? `<div class="stats-grid">${quoteCards}</div>` : '<div class="empty-state-desc">今日行情尚未抓取</div>'}

    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin:32px 0 12px">财经要闻</h2>
    ${news.items.length ? news.items.map(n => `<div class="list-item">
      <div class="list-item-title"><a href="${escapeHTML(n.url)}" target="_blank" rel="noopener">${escapeHTML(n.title_zh || '')}</a></div>
      <div class="list-item-summary">${escapeHTML(n.summary_zh || '')}</div>
      <div class="list-item-meta">
        ${n.affects ? `<span class="badge badge-2">${escapeHTML(n.affects)}</span>` : ''}
        ${n.importance ? `<span class="badge badge-${Math.min(3, n.importance)}">${'★'.repeat(Math.min(3, n.importance))}</span>` : ''}
        <span>${escapeHTML(n.source || '')}</span>
        ${n.publish_date ? `<span>${escapeHTML(n.publish_date)}</span>` : ''}
      </div>
    </div>`).join('') : '<div class="empty-state-desc">暂无要闻</div>'}
  `;
}
