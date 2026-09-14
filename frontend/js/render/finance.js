import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

// 简单 SVG sparkline
function sparkline(prices, width = 120, height = 32) {
  if (!prices || prices.length < 2) return '';
  const xs = prices.map((_, i) => i);
  const ys = prices.map(p => p);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const pad = 2;
  const points = xs.map((x, i) => {
    const px = (x / (xs.length - 1)) * (width - 2 * pad) + pad;
    const py = height - pad - ((ys[i] - min) / range) * (height - 2 * pad);
    return [px, py];
  });
  const linePath = points.map((p, i) => i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`).join(' ');
  const areaPath = linePath + ` L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  const trend = ys[ys.length - 1] >= ys[0] ? 'up' : 'down';
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <path class="sparkline-area ${trend}" d="${areaPath}"/>
    <path class="sparkline-line ${trend}" d="${linePath}"/>
  </svg>`;
}

function renderQuoteCard(symbol, data, historyPrices) {
  const watched = store.saved.has('finance_watch', symbol);
  const q = (data || []).find(x => x.symbol === symbol);
  if (!q) return '';
  const upClass = q.change_pct >= 0 ? 'up' : 'down';
  const arr = (historyPrices || []).map(p => p.price).filter(x => x != null);
  return `
    <div class="stat-card quote-card" data-symbol="${symbol}" style="position:relative">
      <div class="card-actions" style="position:absolute;top:6px;right:6px">
        <button class="action-btn ${watched ? 'active' : ''}" data-watch="${symbol}" title="关注">${ICON_STAR}</button>
      </div>
      <div class="stat-label">${symbol}</div>
      <div class="stat-value" style="font-size:1.5rem">${q.price?.toFixed?.(2) ?? q.price}</div>
      <div class="stat-delta ${upClass}" style="font-size:0.867rem">${q.change_pct >= 0 ? '+' : ''}${q.change_pct?.toFixed?.(2) ?? q.change_pct}%</div>
      ${sparkline(arr)}
    </div>
  `;
}

function renderStatsCard(quotes, history) {
  // 计算总涨跌
  const up = quotes.filter(q => (q.change_pct || 0) > 0).length;
  const down = quotes.filter(q => (q.change_pct || 0) < 0).length;
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">追踪品种</div>
        <div class="stat-value">${quotes.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日上涨</div>
        <div class="stat-value" style="color:var(--success)">${up}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日下跌</div>
        <div class="stat-value" style="color:var(--danger)">${down}</div>
      </div>
    </div>
  `;
}

function renderNewsItem(n) {
  return `
    <div class="list-item card-with-actions" data-url="${escapeHTML(n.url)}" style="position:relative">
      <div class="list-item-title"><a href="${escapeHTML(n.url)}" target="_blank" rel="noopener">${escapeHTML(n.title_zh || '')}</a></div>
      <div class="list-item-summary">${escapeHTML(n.summary_zh || '')}</div>
      <div class="list-item-meta">
        ${n.affects ? `<span class="badge badge-2">${escapeHTML(n.affects)}</span>` : ''}
        ${n.importance ? `<span class="badge badge-${Math.min(3, n.importance)}">★${n.importance}</span>` : ''}
        <span>${escapeHTML(n.source || '')}</span>
        ${n.publish_date ? `<span>${escapeHTML(n.publish_date)}</span>` : ''}
      </div>
    </div>
  `;
}

export async function renderFinance(container) {
  container.innerHTML = `
    <div class="fin-stats"></div>
    <div id="fin-quotes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;border:1px solid var(--divider-subtle);border-radius:var(--radius);margin:16px 0 24px;background:var(--bg-elevated);overflow:hidden"></div>
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">财经要闻</h2>
    <div id="fin-news"></div>
  `;
  try {
    const [quotes, history, news] = await Promise.all([
      api.get('/finance/quotes'),
      api.get('/finance/history?days=30'),
      api.get('/finance/news?days=3'),
    ]);

    const SYMBOLS = ['XAUUSD', 'BTCUSD', 'USDCNH', '上证', '纳指'];
    const bySymbol = history.by_symbol || {};

    container.querySelector('.fin-stats').innerHTML = renderStatsCard(quotes.items, bySymbol);
    container.querySelector('#fin-quotes').innerHTML = SYMBOLS.map(s =>
      renderQuoteCard(s, quotes.items, bySymbol[s] || [])
    ).join('');

    container.querySelector('#fin-news').innerHTML = (news.items || []).length ? (news.items || []).map(renderNewsItem).join('') :
      `<div class="empty-state-desc">暂无要闻</div>`;

    // 关注按钮
    container.querySelectorAll('[data-watch]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const added = store.saved.toggle('finance_watch', b.dataset.watch);
        b.classList.toggle('active', added);
        toast[added ? 'success' : 'info'](added ? '★ 已关注' : '已取消关注');
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
