// Toast 通知系统
// 用法：toast.show('已保存', 'success')

const el = (() => {
  let div = document.getElementById('toast-root');
  if (!div) {
    div = document.createElement('div');
    div.id = 'toast-root';
    document.body.appendChild(div);
  }
  return div;
})();

function icon(type) {
  return {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  }[type] || '';
}

function show(msg, type = 'info', duration = 2200) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icon(type)}</span><span class="toast-msg">${msg}</span>`;
  el.appendChild(t);
  // 触发动画
  requestAnimationFrame(() => t.classList.add('toast-show'));
  setTimeout(() => {
    t.classList.remove('toast-show');
    t.classList.add('toast-hide');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

export const toast = {
  success: (m, d) => show(m, 'success', d),
  error: (m, d) => show(m, 'error', d),
  info: (m, d) => show(m, 'info', d),
  show,
};
