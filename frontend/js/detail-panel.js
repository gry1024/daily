// 详情面板：点击卡片后弹出富详情
// 用法：
//   import { showDetail } from '../js/detail-panel.js';
//   showDetail({ title, content, actions, meta, badges, ... });

let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  overlay.innerHTML = `
    <div class="detail-panel" role="dialog" aria-modal="true">
      <header class="detail-header">
        <div class="detail-badges"></div>
        <h2 class="detail-title"></h2>
        <div class="detail-meta"></div>
        <button class="detail-close" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </header>
      <div class="detail-body"></div>
      <footer class="detail-footer"></footer>
    </div>
  `;
  document.body.appendChild(overlay);

  // 关闭：点击空白 / ESC / 关闭按钮
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
    if (e.target.closest('.detail-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('detail-show')) close();
  });
  return overlay;
}

function close() {
  if (!overlay) return;
  overlay.classList.remove('detail-show');
  document.body.style.overflow = '';
  // 等待动画结束后清空内容
  setTimeout(() => {
    if (overlay) {
      overlay.querySelector('.detail-badges').innerHTML = '';
      overlay.querySelector('.detail-title').textContent = '';
      overlay.querySelector('.detail-meta').innerHTML = '';
      overlay.querySelector('.detail-body').innerHTML = '';
      overlay.querySelector('.detail-footer').innerHTML = '';
    }
  }, 320);
}

function open(opts = {}) {
  const o = ensureOverlay();
  o.querySelector('.detail-title').textContent = opts.title || '';
  o.querySelector('.detail-meta').innerHTML = opts.meta || '';
  o.querySelector('.detail-badges').innerHTML = (opts.badges || []).join('');

  const body = o.querySelector('.detail-body');
  if (typeof opts.content === 'string') body.innerHTML = opts.content;
  else if (opts.content instanceof Node) {
    body.innerHTML = '';
    body.appendChild(opts.content);
  } else body.innerHTML = '';

  const footer = o.querySelector('.detail-footer');
  footer.innerHTML = '';
  (opts.actions || []).forEach(a => {
    const btn = document.createElement('button');
    btn.className = `btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''} ${a.size === 'sm' ? 'btn-sm' : ''}`;
    btn.textContent = a.label;
    if (a.icon) btn.innerHTML = `<span class="btn-icon">${a.icon}</span>${a.label}`;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (a.onClick) {
        const result = await a.onClick(btn);
        if (result === 'close') close();
        else if (result?.close) close();
      }
    });
    footer.appendChild(btn);
  });

  o.classList.add('detail-show');
  document.body.style.overflow = 'hidden';
}

export const showDetail = open;
export const closeDetail = close;
