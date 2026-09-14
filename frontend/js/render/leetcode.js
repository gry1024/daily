import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

function md(text) {
  if (!text) return '';
  let s = escapeHTML(text);
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code class="lang-${lang || ''}">${code}</code></pre>`);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  s = s.replace(/\n\n+/g, '</p><p>');
  s = s.replace(/\n/g, '<br>');
  return `<p>${s}</p>`;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

let currentFilter = { difficulty: '', tag: '' };

function renderStatsCard(stats, solvedCount) {
  const pct = stats.total ? Math.round((solvedCount / stats.total) * 100) : 0;
  const streak = store.getStreak('leetcode');
  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">累计掌握</div>
        <div class="stat-value">${solvedCount}<span style="font-size:0.933rem;color:var(--fg-tertiary);margin-left:4px">/ ${stats.total}</span></div>
        <div class="progress-bar success"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">连续刷题</div>
        <div class="stat-value" style="color:${streak > 0 ? 'var(--accent-blue)' : 'var(--fg-secondary)'}">${streak}<span style="font-size:0.933rem">天</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">难度分布</div>
        <div style="margin-top:6px;font-family:var(--font-sans);font-size:0.8rem">
          ${stats.by_difficulty.map(d => {
            const cls = d.difficulty === 'easy' ? 'diff-easy' : d.difficulty === 'medium' ? 'diff-medium' : 'diff-hard';
            return `<span class="badge ${cls}">${d.difficulty} ${d.n}</span>`;
          }).join(' ')}
        </div>
      </div>
    </div>
  `;
}

function renderFilters(stats) {
  return `
    <div class="filter-bar">
      <button class="filter-chip ${currentFilter.difficulty === '' ? 'active' : ''}" data-fdiff="">全部</button>
      <button class="filter-chip ${currentFilter.difficulty === 'easy' ? 'active' : ''}" data-fdiff="easy"><span class="diff-easy">Easy</span></button>
      <button class="filter-chip ${currentFilter.difficulty === 'medium' ? 'active' : ''}" data-fdiff="medium"><span class="diff-medium">Medium</span></button>
      <button class="filter-chip ${currentFilter.difficulty === 'hard' ? 'active' : ''}" data-fdiff="hard"><span class="diff-hard">Hard</span></button>
      <span style="margin:0 4px;color:var(--fg-tertiary)">·</span>
      <button class="filter-chip ${currentFilter.tag === '' ? 'active' : ''}" data-ftag="">热门标签</button>
      ${stats.top_tags.slice(0, 8).map(t => `<button class="filter-chip ${currentFilter.tag === t.tag ? 'active' : ''}" data-ftag="${escapeHTML(t.tag)}">${escapeHTML(t.tag)}</button>`).join('')}
    </div>
  `;
}

function diffClass(d) {
  return d === 'easy' ? 'diff-easy' : d === 'medium' ? 'diff-medium' : 'diff-hard';
}

function renderQuestion(q, isSolved) {
  const tagHtml = (q.tags || '').split(',').filter(Boolean).slice(0, 5).map(t =>
    `<span class="badge">${escapeHTML(t.trim())}</span>`).join('');
  return `
    <div class="q-card" data-qid="${q.id}">
      <div class="q-meta">
        <span class="badge">Hot 100 #${q.order_in_hot100 || q.lc_id}</span>
        <span class="badge ${diffClass(q.difficulty)}">${escapeHTML(q.difficulty || '')}</span>
        ${tagHtml}
        ${isSolved ? '<span class="item-status">✓ 已掌握</span>' : ''}
      </div>
      <div class="q-body">${escapeHTML(q.title_zh || q.title_en || '')}</div>
      <div class="q-body-en">${escapeHTML(q.title_en || '')} · <a href="${escapeHTML(q.url)}" target="_blank" rel="noopener">LeetCode ↗</a></div>
      <div class="q-actions" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary q-action-reveal">${ICON_EYE} 看题解</button>
        <button class="btn q-action-solve" ${isSolved ? 'disabled' : ''}>${ICON_CHECK} ${isSolved ? '已掌握' : '标记掌握'}</button>
        <button class="btn q-action-next">${ICON_REFRESH} 换一题</button>
      </div>
    </div>
  `;
}

function bindQuestionEvents(container, currentQ) {
  const card = container.querySelector('.q-card');
  if (!card) return;
  const qid = +card.dataset.qid;

  card.querySelector('.q-action-reveal').addEventListener('click', async () => {
    try {
      const d = await api.get(`/leetcode/${qid}`);
      showDetail({
        title: `题解 · ${d.title_zh || d.title_en}`,
        badges: [
          `<span class="badge ${diffClass(d.difficulty)}">${escapeHTML(d.difficulty)}</span>`,
          `<span class="badge">Hot #${d.order_in_hot100}</span>`,
        ],
        meta: `
          <a href="${escapeHTML(d.url)}" target="_blank" rel="noopener">LeetCode ↗</a>
          ${d.complexity ? `<span>${escapeHTML(d.complexity)}</span>` : ''}
          ${d.tags ? `<span>${escapeHTML(d.tags.split(',').slice(0, 3).join(' · '))}</span>` : ''}
        `,
        content: `
          ${d.solution_md ? md(d.solution_md) : '<p style="color:var(--fg-tertiary)">此题暂无题解，欢迎提交 PR 补充。</p>'}
          ${d.complexity ? `<h3>复杂度</h3><p>${escapeHTML(d.complexity)}</p>` : ''}
          <h3>参考</h3>
          <ul>
            <li><a href="${escapeHTML(d.url)}" target="_blank" rel="noopener">LeetCode 题目页</a></li>
            <li><a href="https://leetcode.cn/problems/${d.lc_id}/" target="_blank" rel="noopener">LeetCode 中国站</a></li>
          </ul>
        `,
        actions: [
          {
            label: '复制题目',
            icon: ICON_LINK,
            onClick: () => {
              const txt = `LeetCode ${d.lc_id}. ${d.title_en}\n${d.title_zh}\n${d.url}`;
              navigator.clipboard.writeText(txt).then(() => toast.success('已复制')).catch(() => toast.error('复制失败'));
            },
          },
          {
            label: store.completed.has('leetcode', qid) ? '✓ 已掌握' : '标记掌握',
            icon: ICON_CHECK,
            primary: !store.completed.has('leetcode', qid),
            onClick: () => {
              const was = store.completed.has('leetcode', qid);
              if (was) { store.completed.remove('leetcode', qid); toast.info('已取消'); }
              else { store.completed.add('leetcode', qid); toast.success('✓ 已掌握'); }
              render(container);
            },
          },
        ],
      });
    } catch (e) {
      toast.error('题解加载失败');
    }
  });

  card.querySelector('.q-action-solve').addEventListener('click', () => {
    if (!store.completed.has('leetcode', qid)) {
      store.completed.add('leetcode', qid);
      toast.success('✓ 已掌握');
      render(container);
    }
  });

  card.querySelector('.q-action-next').addEventListener('click', async () => {
    try {
      const params = new URLSearchParams({ exclude: qid });
      if (currentFilter.difficulty) params.set('difficulty', currentFilter.difficulty);
      if (currentFilter.tag) params.set('tag', currentFilter.tag);
      const r = await api.get(`/leetcode/random?${params}`);
      if (r.question) {
        await renderQuestionCard(container, r.question);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        toast.info('当前筛选下无题，试试改一下');
      }
    } catch (e) {
      toast.error('换题失败');
    }
  });
}

async function renderQuestionCard(container, q) {
  const isSolved = store.completed.has('leetcode', q.id);
  container.querySelector('.q-current').innerHTML = renderQuestion(q, isSolved);
  bindQuestionEvents(container, q);

  // 同标签推荐
  if (q.tags) {
    const firstTag = q.tags.split(',')[0].trim();
    api.get(`/leetcode/list?tag=${encodeURIComponent(firstTag)}&limit=6`)
      .then(r => {
        const others = r.items.filter(it => it.id !== q.id).slice(0, 4);
        const box = container.querySelector('.q-related');
        if (!box) return;
        if (!others.length) { box.innerHTML = ''; return; }
        box.innerHTML = `
          <h3 style="font-family:var(--font-serif);font-size:1.067rem;margin-top:32px;margin-bottom:8px;color:var(--fg-secondary)">同标签题</h3>
          ${others.map(it => `
            <div class="list-item card-with-actions" data-rid="${it.id}" style="position:relative">
              ${store.completed.has('leetcode', it.id) ? '<span class="item-status">✓</span>' : ''}
              <div class="list-item-title" style="font-size:0.933rem">${escapeHTML(it.title_zh || it.title_en)}</div>
              <div class="list-item-meta">
                <span class="badge ${diffClass(it.difficulty)}">${escapeHTML(it.difficulty)}</span>
                <span>#${it.order_in_hot100}</span>
              </div>
            </div>
          `).join('')}
        `;
        box.querySelectorAll('[data-rid]').forEach(el => {
          el.addEventListener('click', async () => {
            const r = await api.get(`/leetcode/random?exclude=${el.dataset.rid}`);
            if (r.question) {
              await renderQuestionCard(container, r.question);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
        });
      }).catch(() => {});
  }
}

export async function renderLeetcode(container) {
  container.innerHTML = `
    <div class="lc-stats"></div>
    <div class="lc-filters"></div>
    <div class="q-current"></div>
    <div class="q-related"></div>
  `;
  try {
    const [data, stats] = await Promise.all([
      api.get('/leetcode/today'),
      api.get('/leetcode/stats'),
    ]);
    if (!data || !data.question) {
      container.querySelector('.q-current').innerHTML = `<div class="empty-state">今日题尚未发布</div>`;
      return;
    }
    const solvedCount = new Set(store.completed.list('leetcode').map(([id]) => +id)).size;
    container.querySelector('.lc-stats').innerHTML = renderStatsCard(stats, solvedCount);
    container.querySelector('.lc-filters').innerHTML = renderFilters(stats);
    await renderQuestionCard(container, data.question);

    container.querySelectorAll('[data-fdiff]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.difficulty = b.dataset.fdiff; renderLeetcode(container); });
    });
    container.querySelectorAll('[data-ftag]').forEach(b => {
      b.addEventListener('click', () => { currentFilter.tag = b.dataset.ftag; renderLeetcode(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
