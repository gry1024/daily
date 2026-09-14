// 状态层：localStorage 抽象
// 用法：
//   import { store } from '../js/state.js';
//   store.saved.has('arxiv', '2401.12345')
//   store.saved.toggle('arxiv', '2401.12345')
//   store.completed.add('quant', 5)   // 加上第 5 题
//   store.history.push('news', item)   // 记录阅读历史

const KEY = 'autotreehole_daily_v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}
function writeAll(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('localStorage write failed', e); }
}
function getSection(state, name) {
  state[name] = state[name] || {};
  return state[name];
}

// 通用 set
function setSet(name, key) {
  return {
    has(mod, id) {
      const s = getSection(readAll(), name);
      const set = s[mod] || (s[mod] = {});
      return !!set[id];
    },
    add(mod, id) {
      const state = readAll();
      const s = getSection(state, name);
      const set = s[mod] || (s[mod] = {});
      if (!set[id]) { set[id] = Date.now(); writeAll(state); }
    },
    remove(mod, id) {
      const state = readAll();
      const s = getSection(state, name);
      const set = s[mod] || (s[mod] = {});
      if (set[id]) { delete set[id]; writeAll(state); }
    },
    toggle(mod, id) {
      if (this.has(mod, id)) { this.remove(mod, id); return false; }
      this.add(mod, id); return true;
    },
    list(mod) {
      const s = getSection(readAll(), name);
      return Object.entries(s[mod] || {});
    },
    all() {
      const s = getSection(readAll(), name);
      return s;
    },
  };
}

// 列表（用于 history / notes 等）
function setList(name) {
  return {
    push(mod, item, maxLen = 500) {
      const state = readAll();
      const s = getSection(state, name);
      const list = s[mod] || (s[mod] = []);
      list.unshift({ ...item, _ts: Date.now() });
      if (list.length > maxLen) list.length = maxLen;
      writeAll(state);
    },
    list(mod, limit = null) {
      const s = getSection(readAll(), name);
      const list = s[mod] || [];
      return limit ? list.slice(0, limit) : list;
    },
    clear(mod) {
      const state = readAll();
      const s = getSection(state, name);
      delete s[mod];
      writeAll(state);
    },
  };
}

// 单值映射（用于 notes / 偏好）
function setMap(name) {
  return {
    get(mod, key) {
      const s = getSection(readAll(), name);
      const m = s[mod] || (s[mod] = {});
      return m[key];
    },
    set(mod, key, value) {
      const state = readAll();
      const s = getSection(state, name);
      const m = s[mod] || (s[mod] = {});
      m[key] = value;
      writeAll(state);
    },
    remove(mod, key) {
      const state = readAll();
      const s = getSection(state, name);
      const m = s[mod] || (s[mod] = {});
      delete m[key];
      writeAll(state);
    },
  };
}

// 数字计数器（如 streak、solved count）
function setCounter(name) {
  return {
    get(mod) {
      const s = getSection(readAll(), name);
      return s[mod] || 0;
    },
    inc(mod, by = 1) {
      const state = readAll();
      const s = getSection(state, name);
      s[mod] = (s[mod] || 0) + by;
      writeAll(state);
      return s[mod];
    },
    set(mod, val) {
      const state = readAll();
      const s = getSection(state, name);
      s[mod] = val;
      writeAll(state);
    },
  };
}

// streak 计算（连续 N 天有记录）
function getStreak(mod) {
  const s = getSection(readAll(), 'completed');
  const map = s[mod] || {};
  // 取所有时间戳，转成 YYYY-MM-DD，去重排序
  const days = new Set();
  Object.values(map).forEach(ts => {
    const d = new Date(ts);
    days.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  });
  const sorted = [...days].sort().reverse();
  if (!sorted.length) return 0;
  let streak = 0;
  const today = new Date();
  let cursor = new Date(today);
  // 起始：如果今天没记录，从昨天开始算（允许"今天还没打卡但连续昨天至今"）
  if (!sorted.includes(toDateStr(today))) cursor.setDate(cursor.getDate() - 1);
  while (sorted.includes(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 导出
export const store = {
  saved: setSet('saved'),         // 收藏的文章
  completed: setSet('completed'), // 已完成的题目
  seen: setSet('seen'),           // 已浏览
  reading: setList('reading'),    // 阅读历史
  notes: setMap('notes'),         // 用户笔记
  streakCount: setCounter('streak'), // 自定义计数
  getStreak,
};
