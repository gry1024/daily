import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const CATS = [
  { v: '', label: '全部' },
  { v: 'quant', label: '量化' },
  { v: 'llm', label: 'LLM' },
  { v: 'agent', label: 'Agent' },
  { v: 'multimodal', label: '多模态' },
];

let currentCat = '';
const VENUE_HINTS = {
  // arxiv category prefix → 期刊 / 会议
  'cs.LG': 'ICML/NeurIPS',
  'cs.CL': 'ACL/EMNLP',
  'cs.CV': 'CVPR/ICCV',
  'cs.AI': 'AAAI/IJCAI',
  'cs.IR': 'SIGIR',
  'stat.ML': 'AISTATS',
  'q-fin.ST': 'Quant',
};

function guessVenue(cat, contribs) {
  // 简单尝试从 abstract 或 contribution 找会议名
  for (const k of Object.keys(VENUE_HINTS)) {
    if (cat && cat.includes(k)) return VENUE_HINTS[k];
  }
  return null;
}

function renderStats(items) {
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">最近 14 天</div>
        <div class="stat-value">${items.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">高相关 (5 星)</div>
        <div class="stat-value" style="color:var(--accent-blue)">${items.filter(i => i.relevance_score >= 5).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">收藏</div>
        <div class="stat-value" style="color:var(--warning)">${store.saved.list('arxiv').length}</div>
      </div>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="filter-bar">
      ${CATS.map(c => `<button class="filter-chip ${currentCat === c.v ? 'active' : ''}" data-cat="${c.v}">${c.label}</button>`).join('')}
    </div>
  `;
}

function renderItem(p) {
  const isSaved = store.saved.has('arxiv', p.arxiv_id);
  return `
    <div class="list-item card-with-actions" data-aid="${escapeHTML(p.arxiv_id)}" style="position:relative">
      <div class="card-actions">
        <button class="action-btn ${isSaved ? 'active' : ''}" data-action="save" data-aid="${escapeHTML(p.arxiv_id)}" title="收藏">★</button>
      </div>
      ${isSaved ? '<span class="item-status saved">★ 收藏</span>' : ''}
      <div class="list-item-title" style="padding-right:60px"><a href="${escapeHTML(p.abs_url)}" target="_blank" rel="noopener">${escapeHTML(p.title)}</a></div>
      ${p.one_line_zh ? `<div class="list-item-summary" style="font-weight:500;color:var(--fg)">${escapeHTML(p.one_line_zh)}</div>` : ''}
      <div class="list-item-meta">
        ${p.relevance_score ? `<span class="badge badge-${Math.min(3, p.relevance_score)}">相关 ${p.relevance_score}/5</span>` : ''}
        ${p.category ? `<span class="badge">${escapeHTML(p.category)}</span>` : ''}
        ${p.published ? `<span>${escapeHTML(p.published)}</span>` : ''}
        ${p.abs_url ? `<a href="${escapeHTML(p.abs_url)}" target="_blank" rel="noopener">abs</a>` : ''}
        ${p.pdf_url ? `<a href="${escapeHTML(p.pdf_url)}" target="_blank" rel="noopener">pdf</a>` : ''}
      </div>
    </div>
  `;
}

function bindEvents(container) {
  container.querySelectorAll('.list-item').forEach(card => {
    const aid = card.dataset.aid;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.action-btn')) return;
      const p = JSON.parse(card.dataset.json || '{}');
      // 加载完整详情
      const detail = await api.get(`/arxiv/${aid}`);
      const merged = { ...p, ...detail };
      const venue = guessVenue(merged.category, merged.contributions);
      const authors = (merged.authors || []).slice(0, 6).map(escapeHTML).join(', ') + (merged.authors && merged.authors.length > 6 ? ` 等 ${merged.authors.length} 人` : '');

      showDetail({
        title: merged.title,
        badges: [
          merged.relevance_score ? `<span class="badge badge-${Math.min(3, merged.relevance_score)}">相关 ${merged.relevance_score}/5</span>` : '',
          merged.category ? `<span class="badge">${escapeHTML(merged.category)}</span>` : '',
          venue ? `<span class="badge" style="background:rgba(255,59,48,0.1);color:var(--danger)">${venue}</span>` : '',
        ],
        meta: `
          ${merged.published ? `<span>📅 ${escapeHTML(merged.published)}</span>` : ''}
          ${authors ? `<span>👥 ${authors}</span>` : ''}
          ${merged.abs_url ? `<a href="${escapeHTML(merged.abs_url)}" target="_blank" rel="noopener">arXiv ↗</a>` : ''}
        `,
        content: `
          ${merged.one_line_zh ? `<p style="font-size:1.067rem;color:var(--fg);font-family:var(--font-serif);line-height:1.7;padding:12px 16px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--accent-blue)">${escapeHTML(merged.one_line_zh)}</p>` : ''}
          <h3>Abstract</h3>
          <p>${escapeHTML(merged.abstract || '（暂无）')}</p>
          ${merged.contributions ? `<h3>核心贡献</h3><div style="font-family:var(--font-sans);line-height:1.8">${escapeHTML(merged.contributions).replace(/\n/g, '<br>')}</div>` : ''}
          ${merged.pdf_url ? `<h3>资源</h3><ul><li><a href="${escapeHTML(merged.pdf_url)}" target="_blank" rel="noopener">📄 PDF</a></li><li><a href="${escapeHTML(merged.abs_url)}" target="_blank" rel="noopener">🔗 arXiv 摘要页</a></li><li><a href="https://www.google.com/search?q=%22${encodeURIComponent(merged.title)}%22" target="_blank" rel="noopener">🔍 Google 搜索</a></li><li><a href="https://scholar.google.com/scholar?q=${encodeURIComponent(merged.title)}" target="_blank" rel="noopener">📚 Google Scholar</a></li></ul>` : ''}
        `,
        actions: [
          {
            label: store.saved.has('arxiv', aid) ? '✓ 已收藏' : '收藏',
            primary: !store.saved.has('arxiv', aid),
            onClick: () => {
              const added = store.saved.toggle('arxiv', aid);
              toast[added ? 'success' : 'info'](added ? '★ 已收藏' : '已取消');
              renderArxiv(container);
            },
          },
          {
            label: '复制 BibTeX',
            onClick: () => {
              const bib = `@article{${merged.arxiv_id.replace('.','_')},\n  title={${merged.title}},\n  author={${(merged.authors || []).join(' and ')}},\n  journal={arXiv preprint arXiv:${merged.arxiv_id}},\n  year={${merged.published ? merged.published.slice(0,4) : '2026'}}\n}`;
              navigator.clipboard.writeText(bib).then(() => toast.success('已复制 BibTeX')).catch(() => toast.error('复制失败'));
            },
          },
          {
            label: '打开 PDF',
            onClick: () => { window.open(merged.pdf_url, '_blank'); return 'close'; },
          },
        ],
      });
    });
  });

  container.querySelectorAll('[data-action="save"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const added = store.saved.toggle('arxiv', b.dataset.aid);
      b.classList.toggle('active', added);
      toast[added ? 'success' : 'info'](added ? '★ 已收藏' : '已取消');
    });
  });
}

export async function renderArxiv(container) {
  container.innerHTML = `
    <div class="arxiv-stats"></div>
    <div class="arxiv-filters"></div>
    <div id="arxiv-list"></div>
  `;
  try {
    const params = new URLSearchParams({ days: 14, min_relevance: 3, limit: 80 });
    if (currentCat) params.set('category', currentCat);
    const data = await api.get('/arxiv?' + params);
    const items = data.items;

    container.querySelector('.arxiv-stats').innerHTML = renderStats(items);
    container.querySelector('.arxiv-filters').innerHTML = renderFilters();
    const listEl = container.querySelector('#arxiv-list');
    listEl.innerHTML = items.length ? items.map(p => renderItem(p)).join('') :
      `<div class="empty-state"><div class="empty-state-title">暂无相关论文</div><div class="empty-state-desc">换分类或时间窗试试</div></div>`;

    container.querySelectorAll('.list-item').forEach((card, i) => {
      card.dataset.json = JSON.stringify(items[i]);
    });

    bindEvents(container);

    container.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => { currentCat = b.dataset.cat; renderArxiv(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
