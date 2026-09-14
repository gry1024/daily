import { api } from '../api.js';
import { escapeHTML } from '../app.js';

const CATS = [
  { v: '', label: '全部' },
  { v: 'quant', label: '量化' },
  { v: 'llm', label: 'LLM' },
  { v: 'agent', label: 'Agent' },
  { v: 'multimodal', label: '多模态' },
];

let currentCat = '';

export async function renderArxiv(container, reset = true) {
  if (reset) {
    container.innerHTML = `
      <div class="filter-bar">
        ${CATS.map(c => `<button class="filter-chip ${currentCat === c.v ? 'active' : ''}" data-cat="${c.v}">${c.label}</button>`).join('')}
      </div>
      <div id="arxiv-list"></div>
    `;
    container.querySelectorAll('.filter-chip').forEach(b => {
      b.addEventListener('click', () => { currentCat = b.dataset.cat; renderArxiv(container, false); });
    });
  }
  const list = document.getElementById('arxiv-list');
  list.innerHTML = '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>';
  const params = new URLSearchParams({ days: 14, min_relevance: 3, limit: 80 });
  if (currentCat) params.set('category', currentCat);
  const data = await api.get('/arxiv?' + params);
  if (!data.items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-title">暂无筛选论文</div><div class="empty-state-desc">试试放宽分类或时间窗</div></div>`;
    return;
  }
  list.innerHTML = data.items.map(p => `
    <div class="list-item">
      <div class="list-item-title">${escapeHTML(p.title || '')}</div>
      ${p.one_line_zh ? `<div class="list-item-summary" style="font-weight:500;color:var(--fg)">${escapeHTML(p.one_line_zh)}</div>` : ''}
      ${p.contributions ? `<div class="list-item-summary">${escapeHTML(p.contributions)}</div>` : ''}
      <div class="list-item-meta">
        ${p.relevance_score ? `<span class="badge badge-2">相关 ${p.relevance_score}/5</span>` : ''}
        ${p.category ? `<span class="badge">${escapeHTML(p.category)}</span>` : ''}
        <span>${escapeHTML(p.published || '')}</span>
        ${p.abs_url ? `<a href="${escapeHTML(p.abs_url)}" target="_blank" rel="noopener">abs</a>` : ''}
        ${p.pdf_url ? `<a href="${escapeHTML(p.pdf_url)}" target="_blank" rel="noopener">pdf</a>` : ''}
        ${p.arxiv_id ? `<span style="color:var(--fg-tertiary)">arXiv:${escapeHTML(p.arxiv_id)}</span>` : ''}
      </div>
    </div>
  `).join('');
}
