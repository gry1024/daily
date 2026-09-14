// 应用入口：路由、主题、侧边栏、模块调度
import { api } from './api.js';
import { renderToday } from './render/today.js';
import { renderQuant } from './render/quant.js';
import { renderNews } from './render/news.js';
import { renderArxiv } from './render/arxiv.js';
import { renderSchool } from './render/school.js';
import { renderLeetcode } from './render/leetcode.js';
import { renderEnglish } from './render/english.js';
import { renderFinance } from './render/finance.js';
import { renderGithub } from './render/github.js';
import { renderDeals } from './render/deals.js';

const ROUTES = {
  today: { title: '今日', render: renderToday, meta: '最新一轮所有模块新增内容' },
  quant: { title: 'Quant 每日一题', render: renderQuant, meta: '红宝书 / 绿宝书每日一题' },
  news: { title: 'AI News', render: renderNews, meta: 'AI 行业每日新闻' },
  arxiv: { title: 'Arxiv 论文', render: renderArxiv, meta: '量化 / LLM / agent 方向每日筛选' },
  school: { title: 'School Info', render: renderSchool, meta: '北大 / 信科 / AIIC 通知与活动' },
  leetcode: { title: 'LeetCode Hot 100', render: renderLeetcode, meta: '每日一题 + 完整题解' },
  english: { title: 'English', render: renderEnglish, meta: '10 词 + 5 短语 · CET-6 ~ 雅思' },
  finance: { title: 'Finance Daily', render: renderFinance, meta: 'XAUUSD / BTCUSD 等关键行情 + 要闻' },
  github: { title: 'GitHub Trending', render: renderGithub, meta: '当日热门项目' },
  deals: { title: '羊毛 Deals', render: renderDeals, meta: '学生福利 / 免费额度 / 限时活动' },
};

// —— 主题 ——
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}
function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const saved = localStorage.getItem('theme');
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) applyTheme(e.matches ? 'dark' : 'light');
  });
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
}

// —— 路由 ——
function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'today';
  return ROUTES[hash] ? hash : 'today';
}

function showView(route) {
  // 隐藏所有 view
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  const view = document.getElementById(`view-${route}`);
  if (view) view.hidden = false;

  // 侧边栏 active
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));

  // 滚动到顶
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function loadRoute(route) {
  showView(route);
  const cfg = ROUTES[route];
  const view = document.getElementById(`view-${route}`);
  const metaEl = view.querySelector('.module-meta');
  if (metaEl) metaEl.textContent = cfg.meta;
  const content = view.querySelector('.view-content');

  // skeleton
  content.innerHTML = '<div class="skeleton skeleton-line" style="width:60%"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line" style="width:80%"></div>';
  try {
    await cfg.render(content);
  } catch (e) {
    console.error(`[${route}] render error:`, e);
    content.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// —— 启动 ——
function init() {
  initTheme();
  document.getElementById('refresh-btn').addEventListener('click', () => {
    api.clearCache();
    loadRoute(getRoute());
  });

  window.addEventListener('hashchange', () => loadRoute(getRoute()));
  if (!window.location.hash) window.location.hash = '#today';
  loadRoute(getRoute());
}

document.addEventListener('DOMContentLoaded', init);

// 暴露工具给 render 模块
export { escapeHTML };
