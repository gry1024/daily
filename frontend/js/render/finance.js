import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';

// 生成 sparkline SVG
function sparkline(prices, width = 220, height = 64) {
  if (!prices || prices.length < 2) {
    return `<div style="height:64px;display:flex;align-items:center;justify-content:center;color:var(--fg-tertiary);font-size:0.867rem">数据收集中…</div>`;
  }
  const ys = prices.map(p => p);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const pad = 4;
  const points = ys.map((y, i) => {
    const px = (i / (ys.length - 1)) * (width - 2 * pad) + pad;
    const py = height - pad - ((y - min) / range) * (height - 2 * pad);
    return [px, py];
  });
  const linePath = points.map((p, i) => i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`).join(' ');
  const areaPath = linePath + ` L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  const trend = ys[ys.length - 1] >= ys[0] ? 'up' : 'down';
  const lastY = points[points.length - 1][1];
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:64px">
    <path class="sparkline-area ${trend}" d="${areaPath}"/>
    <path class="sparkline-line ${trend}" d="${linePath}"/>
    <circle cx="${width - pad}" cy="${lastY}" r="3" fill="currentColor" class="${trend}" style="color:var(--accent-blue)"/>
  </svg>`;
}

function fmtDate(s) {
  if (!s) return '';
  return s.slice(5);  // MM-DD
}

function renderQuoteCard(symbol, q, history) {
  const watched = store.saved.has('finance_watch', symbol);
  if (!q) {
    return `
      <div class="stat-card quote-card" style="position:relative;opacity:0.5">
        <div class="stat-label">${symbol}</div>
        <div style="margin-top:8px;color:var(--fg-tertiary);font-size:0.867rem">加载失败</div>
      </div>`;
  }
  const arr = (history || []).map(p => p.price).filter(x => x != null);
  const upClass = (q.change_pct || 0) >= 0 ? 'up' : 'down';
  return `
    <div class="stat-card quote-card clickable" data-symbol="${symbol}" style="position:relative;cursor:pointer">
      <div class="card-actions" style="position:absolute;top:6px;right:6px;z-index:2">
        <button class="action-btn ${watched ? 'active' : ''}" data-watch="${symbol}" title="关注">${ICON_STAR}</button>
      </div>
      <div class="stat-label">${escapeHTML(symbol)}</div>
      <div class="stat-value" style="font-size:1.5rem">${q.price?.toFixed?.(2) ?? q.price}</div>
      <div class="stat-delta ${upClass}" style="font-size:0.867rem">${(q.change_pct || 0) >= 0 ? '+' : ''}${q.change_pct?.toFixed?.(2) ?? q.change_pct}%</div>
      ${sparkline(arr)}
    </div>`;
}

function renderStatsCard(quotes) {
  const up = quotes.filter(q => q && q.price && (q.change_pct || 0) > 0).length;
  const down = quotes.filter(q => q && q.price && (q.change_pct || 0) < 0).length;
  const watched = store.saved.list('finance_watch').length;
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">追踪品种</div>
        <div class="stat-value">${quotes.filter(q => q?.price).length}/5</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日上涨</div>
        <div class="stat-value" style="color:var(--success)">${up}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日下跌</div>
        <div class="stat-value" style="color:var(--danger)">${down}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已关注</div>
        <div class="stat-value">${watched}</div>
      </div>
    </div>
  `;
}

function showQuoteDetail(symbol) {
  // 异步拉详情并显示
  api.get(`/finance/quote/${encodeURIComponent(symbol)}?days=30`).then(d => {
    const rt = d.real_time;
    const hist = d.history || [];
    const arr = hist.map(p => p.price);
    const first = hist[0]?.price || rt?.price;
    const last = rt?.price || hist[hist.length-1]?.price;
    const totalReturn = first && last ? ((last - first) / first * 100) : 0;
    const max = arr.length ? Math.max(...arr) : null;
    const min = arr.length ? Math.min(...arr) : null;

    const content = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">
        <div style="text-align:center;padding:16px;background:var(--bg);border-radius:var(--radius)">
          <div style="font-size:0.733rem;color:var(--fg-tertiary);letter-spacing:0.04em">最新价</div>
          <div style="font-family:var(--font-serif);font-size:1.867rem;margin-top:4px">${rt?.price?.toFixed?.(2) ?? '—'}</div>
        </div>
        <div style="text-align:center;padding:16px;background:var(--bg);border-radius:var(--radius)">
          <div style="font-size:0.733rem;color:var(--fg-tertiary);letter-spacing:0.04em">30 天涨跌</div>
          <div style="font-family:var(--font-serif);font-size:1.867rem;margin-top:4px;color:${totalReturn >= 0 ? 'var(--success)' : 'var(--danger)'}">${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%</div>
        </div>
        <div style="text-align:center;padding:16px;background:var(--bg);border-radius:var(--radius)">
          <div style="font-size:0.733rem;color:var(--fg-tertiary);letter-spacing:0.04em">30 天区间</div>
          <div style="font-family:var(--font-sans);font-size:0.867rem;margin-top:8px">
            <div>高 ${max?.toFixed?.(2) ?? '—'}</div>
            <div>低 ${min?.toFixed?.(2) ?? '—'}</div>
          </div>
        </div>
      </div>
      <h3>📈 30 天走势</h3>
      ${sparkline(arr, 600, 180)}
      ${arr.length < 2 ? '<p style="color:var(--fg-tertiary);font-size:0.867rem;margin-top:8px">数据收集中，每天凌晨 cron 会写入</p>' : ''}

      ${hist.length > 0 ? `
        <h3>📋 历史价格</h3>
        <table style="width:100%;font-size:0.867rem;border-collapse:collapse;margin-top:8px">
          <thead><tr style="border-bottom:1px solid var(--divider-subtle);text-align:left">
            <th style="padding:8px 0;color:var(--fg-tertiary);font-weight:500">日期</th>
            <th style="padding:8px 8px;color:var(--fg-tertiary);font-weight:500;text-align:right">价格</th>
            <th style="padding:8px 0;color:var(--fg-tertiary);font-weight:500;text-align:right">日涨跌</th>
          </tr></thead>
          <tbody>
            ${hist.slice().reverse().slice(0, 10).map((p, i, arr) => {
              const prev = arr[i+1];
              const pct = prev && p.price && prev.price ? ((p.price - prev.price) / prev.price * 100) : 0;
              return `<tr style="border-bottom:1px solid var(--divider-subtle)">
                <td style="padding:6px 0">${escapeHTML(p.date)}</td>
                <td style="padding:6px 8px;text-align:right;font-family:var(--mono)">${p.price?.toFixed?.(2) ?? '—'}</td>
                <td style="padding:6px 0;text-align:right;color:${pct >= 0 ? 'var(--success)' : 'var(--danger)'};font-family:var(--mono)">${i === arr.length - 1 ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : ''}
    `;
    showDetail({
      title: `${symbol} 行情详情`,
      badges: rt ? [
        `<span class="badge ${(rt.change_pct || 0) >= 0 ? 'badge-success' : 'badge-3'}">${(rt.change_pct || 0) >= 0 ? '+' : ''}${rt.change_pct?.toFixed?.(2) ?? rt.change_pct}%</span>`,
      ] : [],
      meta: rt ? `
        <span>📅 数据更新：${new Date().toLocaleString('zh-CN', { hour12: false })}</span>
        <span>📊 历史 ${hist.length} 个交易日</span>
      ` : '<span style="color:var(--fg-tertiary)">数据源暂时不可用</span>',
      content,
      actions: [
        {
          label: store.saved.has('finance_watch', symbol) ? '✓ 已关注' : '关注',
          icon: ICON_STAR,
          primary: !store.saved.has('finance_watch', symbol),
          onClick: () => {
            const added = store.saved.toggle('finance_watch', symbol);
            toast[added ? 'success' : 'info'](added ? '★ 已关注' : '已取消');
            renderFinance(_container);
            return 'close';
          },
        },
        {
          label: '在搜索引擎查看',
          onClick: () => { window.open(`https://www.bing.com/search?q=${encodeURIComponent(symbol + ' 行情')}`, '_blank'); return 'close'; },
        },
      ],
    });
  }).catch(e => toast.error('加载失败：' + e.message));
}

let _container = null;

export async function renderFinance(container) {
  _container = container;
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="fin-stats"></div>
      <button class="btn btn-sm" id="refresh-finance">${ICON_REFRESH} 刷新行情</button>
    </div>
    <div id="fin-quotes" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0;border:1px solid var(--divider-subtle);border-radius:var(--radius);margin:16px 0 24px;background:var(--bg-elevated);overflow:hidden"></div>
    <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">财经要闻</h2>
    <div id="fin-news"></div>
  `;
  try {
    const [quotesRes, historyRes, newsRes] = await Promise.all([
      api.get('/finance/quotes'),
      api.get('/finance/history?days=30'),
      api.get('/finance/news?days=3'),
    ]);

    const SYMBOLS = ['XAUUSD', 'BTCUSD', 'USDCNH', '上证', '纳指'];
    const bySymbol = historyRes.by_symbol || {};
    const quotes = quotesRes.items || [];

    container.querySelector('.fin-stats').innerHTML = renderStatsCard(quotes);
    container.querySelector('#fin-quotes').innerHTML = SYMBOLS.map(s =>
      renderQuoteCard(s, quotes.find(q => q.symbol === s), bySymbol[s] || [])
    ).join('');

    // 绑定点击
    container.querySelectorAll('.quote-card.clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-watch]')) return;
        showQuoteDetail(card.dataset.symbol);
      });
    });
    container.querySelectorAll('[data-watch]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const added = store.saved.toggle('finance_watch', b.dataset.watch);
        b.classList.toggle('active', added);
        toast[added ? 'success' : 'info'](added ? '★ 已关注' : '已取消');
      });
    });

    container.querySelector('#fin-news').innerHTML = (newsRes.items || []).length ? (newsRes.items || []).map(renderNewsItem).join('') :
      `<div class="empty-state-desc">暂无要闻</div>`;

    container.querySelector('#refresh-finance').addEventListener('click', async () => {
      const btn = container.querySelector('#refresh-finance');
      btn.disabled = true;
      btn.innerHTML = `${ICON_REFRESH} 抓取中…`;
      try {
        await api.get('/finance/quotes');  // 触发后端缓存
        await renderFinance(container);
        toast.success('行情已刷新');
      } catch (e) {
        toast.error('刷新失败：' + e.message);
      }
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
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
