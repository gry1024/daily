import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

function renderItem(r) {
  const isSaved = store.saved.has('github', r.full_name);
  return `
    <div class="list-item card-with-actions" data-name="${escapeHTML(r.full_name)}" style="position:relative">
      <div class="card-actions">
        <button class="action-btn ${isSaved ? 'active' : ''}" data-action="save" data-name="${escapeHTML(r.full_name)}" title="收藏">${ICON_STAR}</button>
      </div>
      ${isSaved ? '<span class="item-status saved">★ 收藏</span>' : ''}
      <div class="list-item-title" style="padding-right:60px"><a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">${escapeHTML(r.full_name)}</a></div>
      ${r.brief_zh ? `<div class="list-item-summary" style="font-weight:500;color:var(--fg)">${escapeHTML(r.brief_zh)}</div>` : ''}
      ${r.description && r.description !== r.brief_zh ? `<div class="list-item-summary">${escapeHTML(r.description)}</div>` : ''}
      <div class="list-item-meta">
        ${r.language ? `<span class="badge">${escapeHTML(r.language)}</span>` : ''}
        ${r.tags ? r.tags.split(',').filter(Boolean).slice(0, 4).map(t => `<span class="badge">${escapeHTML(t.trim())}</span>`).join('') : ''}
        ${r.stars_today ? `<span style="color:var(--accent-blue)">+${r.stars_today} ⭐ today</span>` : ''}
        <span>${(r.stars_total || 0).toLocaleString()} ⭐ total</span>
        ${r.current_rank ? `<span>#${r.current_rank}</span>` : ''}
      </div>
    </div>
  `;
}

function renderStats(repos) {
  const watched = store.saved.list('github').length;
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">今日上榜</div>
        <div class="stat-value">${repos.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已收藏</div>
        <div class="stat-value" style="color:var(--warning)">${watched}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">热门语言</div>
        <div style="margin-top:6px;font-family:var(--font-sans);font-size:0.8rem">
          ${Object.entries(repos.reduce((acc, r) => { if (r.language) acc[r.language] = (acc[r.language] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([lang, n]) => `<span class="badge">${escapeHTML(lang)} ${n}</span>`).join(' ')}
        </div>
      </div>
    </div>
  `;
}

function bindEvents(container) {
  container.querySelectorAll('.list-item').forEach(card => {
    const name = card.dataset.name;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.action-btn')) return;
      const r = JSON.parse(card.dataset.json || '{}');
      showDetail({
        title: r.full_name,
        badges: [
          r.language ? `<span class="badge">${escapeHTML(r.language)}</span>` : '',
          r.current_rank ? `<span class="badge">#${r.current_rank}</span>` : '',
        ],
        meta: `
          <a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">${escapeHTML(r.url)}</a>
          ${r.stars_today ? `<span style="color:var(--accent-blue)">+${r.stars_today} ⭐ today</span>` : ''}
          <span>${(r.stars_total || 0).toLocaleString()} ⭐</span>
        `,
        content: `
          ${r.brief_zh ? `<p style="font-size:1.067rem;line-height:1.7;padding:12px 16px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--accent-blue)">${escapeHTML(r.brief_zh)}</p>` : ''}
          ${r.description ? `<h3>项目描述</h3><p>${escapeHTML(r.description)}</p>` : ''}
          ${r.tags ? `<h3>标签</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${r.tags.split(',').filter(Boolean).map(t => `<span class="badge">${escapeHTML(t.trim())}</span>`).join('')}</div>` : ''}
          <h3>资源</h3>
          <ul>
            <li><a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">GitHub 项目页</a></li>
            <li><a href="https://github.com/${encodeURIComponent(r.full_name)}/stargazers" target="_blank" rel="noopener">⭐ Star 历史</a></li>
            <li><a href="https://github.com/${encodeURIComponent(r.full_name)}/forks" target="_blank" rel="noopener">🍴 Forks</a></li>
          </ul>
        `,
        actions: [
          {
            label: store.saved.has('github', name) ? '✓ 已收藏' : '收藏',
            primary: !store.saved.has('github', name),
            onClick: () => {
              const added = store.saved.toggle('github', name);
              toast[added ? 'success' : 'info'](added ? '★ 已收藏' : '已取消');
              renderGithub(container);
            },
          },
          {
            label: '克隆链接',
            onClick: () => {
              const url = `git clone https://github.com/${r.full_name}.git`;
              navigator.clipboard.writeText(url).then(() => toast.success('已复制 git clone 命令')).catch(() => toast.error('复制失败'));
            },
          },
        ],
      });
    });
  });

  container.querySelectorAll('[data-action="save"]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const added = store.saved.toggle('github', b.dataset.name);
      b.classList.toggle('active', added);
      toast[added ? 'success' : 'info'](added ? '★ 已收藏' : '已取消');
    });
  });
}

export async function renderGithub(container) {
  container.innerHTML = `
    <div class="gh-stats"></div>
    <div class="filter-bar">
      <button class="filter-chip active" id="gh-view-trending">Trending</button>
      <button class="filter-chip" id="gh-view-saved">★ 仅收藏</button>
    </div>
    <div id="gh-list"></div>
  `;
  try {
    const data = await api.get('/github/trending?days=3&limit=30');
    let repos = data.items;
    const showSavedOnly = container.dataset.savedOnly === 'true';

    if (showSavedOnly) {
      const savedSet = new Set(store.saved.list('github').map(([n]) => n));
      repos = repos.filter(r => savedSet.has(r.full_name));
    }

    container.querySelector('.gh-stats').innerHTML = renderStats(repos);
    container.querySelector('#gh-list').innerHTML = repos.length ? repos.map(renderItem).join('') :
      `<div class="empty-state"><div class="empty-state-title">暂无项目</div></div>`;

    container.querySelectorAll('.list-item').forEach((card, i) => {
      card.dataset.json = JSON.stringify(repos[i]);
    });

    bindEvents(container);

    container.querySelector('#gh-view-trending').addEventListener('click', () => {
      container.dataset.savedOnly = 'false';
      renderGithub(container);
    });
    container.querySelector('#gh-view-saved').addEventListener('click', () => {
      container.dataset.savedOnly = 'true';
      renderGithub(container);
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
