// API 客户端封装
// 自动适配：本机调试用 127.0.0.1:8001，线上用同源 /daily/api/

const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') {
    return 'http://127.0.0.1:8001/api';
  }
  // 线上：nginx /daily/ 反代到 127.0.0.1:8001
  // 路径前缀从 URL 推断
  const path = window.location.pathname;
  const m = path.match(/^(\/[^/]+\/)/); // 匹配第一个路径段
  const prefix = m ? m[1] : '/daily/';
  return prefix + 'api';
})();

export { API_BASE };

const cache = new Map();
const CACHE_TTL = 60_000; // 60s

async function request(path, opts = {}) {
  const url = API_BASE + path;
  const useCache = opts.cache !== false && (!opts.method || opts.method === 'GET');
  if (useCache && cache.has(url)) {
    const { t, data } = cache.get(url);
    if (Date.now() - t < CACHE_TTL) return data;
    cache.delete(url);
  }
  const resp = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      detail = j.detail || JSON.stringify(j);
    } catch {}
    throw new Error(detail);
  }
  const data = await resp.json();
  if (useCache) cache.set(url, { t: Date.now(), data });
  return data;
}

export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  clearCache: () => cache.clear(),
};
