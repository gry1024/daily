import { api } from '../api.js';
import { escapeHTML } from '../app.js';
import { store } from '../state.js';
import { showDetail } from '../detail-panel.js';
import { toast } from '../toast.js';

const ICON_AUDIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
const ICON_REVIEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const ICON_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

let currentMode = localStorage.getItem('english_mode') || 'list'; // list | flashcard | review

function setMode(m) {
  currentMode = m;
  localStorage.setItem('english_mode', m);
}

// TTS
let _voice = null;
function getVoice() {
  if (_voice) return _voice;
  const voices = window.speechSynthesis?.getVoices?.() || [];
  // 优先英文女声
  _voice = voices.find(v => v.lang.startsWith('en') && /female|samantha|victoria|karen/i.test(v.name))
    || voices.find(v => v.lang.startsWith('en-US'))
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];
  return _voice;
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { _voice = null; getVoice(); };
}

function speak(text, lang = 'en-US') {
  if (!window.speechSynthesis) {
    toast.error('当前浏览器不支持语音');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.85;
  const v = getVoice();
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

// ============== Stats ==============
function renderStats(words, phrases) {
  const knownWords = Object.keys(store.notes.get('english_words') || {}).filter(k => store.notes.get('english_words')[k] === 'known').length;
  const reviewWords = Object.keys(store.notes.get('english_words') || {}).filter(k => store.notes.get('english_words')[k] === 'review').length;
  const vocab = store.saved.list('vocab').length;
  const streak = store.getStreak('english');

  return `
    <div class="stat-group">
      <div class="stat-card">
        <div class="stat-label">今日生词</div>
        <div class="stat-value">${words.length}</div>
        <div class="stat-label" style="margin-top:4px">+ ${phrases.length} 短语</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已掌握</div>
        <div class="stat-value" style="color:var(--success)">${knownWords}</div>
        <div class="stat-label" style="margin-top:4px">待复习 ${reviewWords}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">生词本</div>
        <div class="stat-value">${vocab}</div>
        <div class="stat-label" style="margin-top:4px">${streak} 天连击</div>
      </div>
    </div>
  `;
}

function renderModeBar() {
  return `
    <div class="filter-bar">
      <button class="filter-chip ${currentMode === 'list' ? 'active' : ''}" data-mode="list">列表</button>
      <button class="filter-chip ${currentMode === 'flashcard' ? 'active' : ''}" data-mode="flashcard">闪卡</button>
      <button class="filter-chip ${currentMode === 'review' ? 'active' : ''}" data-mode="review">复习队列</button>
    </div>
  `;
}

// ============== 详情 Modal ==============
function showWordDetail(w) {
  const status = store.notes.get('english_words', w.id);
  const isVocab = store.saved.has('vocab', w.id);
  const content = `
    <div style="text-align:center;padding:20px;background:var(--bg);border-radius:var(--radius);margin-bottom:24px">
      <div style="font-family:var(--font-serif);font-size:2.4rem;font-weight:500;letter-spacing:-0.02em">${escapeHTML(w.word)}</div>
      ${w.phonetic ? `<div style="font-family:var(--mono);color:var(--fg-tertiary);margin-top:4px">${escapeHTML(w.phonetic)}</div>` : ''}
      <button class="btn btn-sm" data-speak="${escapeHTML(w.word)}" style="margin-top:12px">🔊 朗读</button>
    </div>
    ${w.definition ? `<h3>📖 释义</h3><p style="font-size:1.067rem">${escapeHTML(w.definition)}</p>` : ''}
    ${w.example ? `<h3>💬 例句</h3><p style="font-family:var(--font-sans);background:var(--bg);padding:12px;border-radius:var(--radius);border-left:3px solid var(--accent-blue)">${escapeHTML(w.example)}</p>` : ''}
    ${w.collocations ? `<h3>🔗 搭配</h3><p>${escapeHTML(w.collocations)}</p>` : ''}
    ${w.synonyms_note ? `<h3>⚖️ 辨析</h3><p>${escapeHTML(w.synonyms_note)}</p>` : ''}
  `;
  showDetail({
    title: w.word,
    badges: [
      w.difficulty ? `<span class="badge">${escapeHTML(w.difficulty)}</span>` : '',
      isVocab ? '<span class="badge" style="background:rgba(255,149,0,0.12);color:var(--warning)">★ 生词本</span>' : '',
    ],
    meta: w.phonetic ? `<span style="font-family:var(--mono)">${escapeHTML(w.phonetic)}</span>` : '',
    content,
    actions: [
      {
        label: status === 'known' ? '✓ 已掌握' : '标记已掌握',
        icon: '✓',
        primary: status !== 'known',
        onClick: () => {
          store.notes.set('english_words', w.id, status === 'known' ? null : 'known');
          toast.success(status === 'known' ? '已取消' : '✓ 已掌握');
          return 'close';
        },
      },
      {
        label: isVocab ? '★ 已加入生词本' : '加入生词本',
        icon: '★',
        onClick: () => {
          const added = store.saved.toggle('vocab', w.id);
          toast[added ? 'success' : 'info'](added ? '★ 已加入' : '已移除');
          return 'close';
        },
      },
    ],
  });
  // 详情打开后绑朗读
  setTimeout(() => {
    document.querySelector('[data-speak]')?.addEventListener('click', () => speak(w.word));
  }, 100);
}

function showPhraseDetail(p) {
  const content = `
    <div style="text-align:center;padding:20px;background:var(--bg);border-radius:var(--radius);margin-bottom:24px">
      <div style="font-family:var(--serif);font-size:1.6rem;font-weight:500">${escapeHTML(p.phrase)}</div>
      <button class="btn btn-sm" data-speak-phrase="${escapeHTML(p.phrase)}" style="margin-top:12px">🔊 朗读</button>
    </div>
    ${p.meaning_zh ? `<h3>中文释义</h3><p style="font-size:1.067rem">${escapeHTML(p.meaning_zh)}</p>` : ''}
    ${p.meaning_en ? `<h3>English</h3><p>${escapeHTML(p.meaning_en)}</p>` : ''}
    ${p.source_sentence ? `<h3>原句</h3><blockquote style="border-left:3px solid var(--divider);padding:12px 16px;color:var(--fg-secondary);font-style:italic;background:var(--bg);border-radius:0 var(--radius) var(--radius) 0">"${escapeHTML(p.source_sentence)}"</blockquote>` : ''}
    ${p.usage_note ? `<h3>用法</h3><p>${escapeHTML(p.usage_note)}</p>` : ''}
    ${p.alternatives ? `<h3>同义表达</h3><p>${escapeHTML(p.alternatives)}</p>` : ''}
    ${p.source_url ? `<p style="margin-top:24px"><a href="${escapeHTML(p.source_url)}" target="_blank" rel="noopener">查看原文 →</a></p>` : ''}
  `;
  showDetail({
    title: p.phrase,
    badges: [`<span class="badge">短语</span>`],
    meta: p.source_url ? `<a href="${escapeHTML(p.source_url)}" target="_blank" rel="noopener">来源</a>` : '',
    content,
    actions: [
      {
        label: '关闭',
        onClick: () => 'close',
      },
    ],
  });
  setTimeout(() => {
    document.querySelector('[data-speak-phrase]')?.addEventListener('click', () => speak(p.phrase));
  }, 100);
}

// ============== 列表模式 ==============
function renderWordListItem(w) {
  const status = store.notes.get('english_words', w.id);
  const isVocab = store.saved.has('vocab', w.id);
  return `
    <div class="word-card" data-wid="${w.id}" data-json='${escapeHTML(JSON.stringify(w).replace(/'/g, "&#39;"))}' style="position:relative;cursor:pointer">
      <div class="word-head">
        <span class="word-text">${escapeHTML(w.word)}</span>
        ${w.phonetic ? `<span class="word-phonetic">${escapeHTML(w.phonetic)}</span>` : ''}
        <button class="audio-btn" data-audio="${escapeHTML(w.word)}" title="朗读">${ICON_AUDIO}</button>
        <span class="badge" style="margin-left:auto">${escapeHTML(w.difficulty || '')}</span>
        <button class="vocab-btn ${isVocab ? 'on' : ''}" data-vocab="${w.id}" title="加入生词本">★</button>
      </div>
      ${w.definition ? `<div class="word-def">${escapeHTML(w.definition)}</div>` : ''}
      ${w.example ? `<div class="word-extra">例：${escapeHTML(w.example)}</div>` : ''}
      ${w.collocations ? `<div class="word-extra">搭配：${escapeHTML(w.collocations)}</div>` : ''}
      ${w.synonyms_note ? `<div class="word-extra">辨析：${escapeHTML(w.synonyms_note)}</div>` : ''}
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="btn btn-sm ${status === 'known' ? 'btn-primary' : ''}" data-status="known" data-wid="${w.id}">${status === 'known' ? '✓ 已掌握' : '已掌握'}</button>
        <button class="btn btn-sm ${status === 'review' ? 'btn-primary' : ''}" data-status="review" data-wid="${w.id}">${status === 'review' ? '✓ 待复习' : '待复习'}</button>
      </div>
    </div>
  `;
}

function renderPhraseListItem(p) {
  return `
    <div class="phrase-card" data-pid="${p.id}" data-json='${escapeHTML(JSON.stringify(p).replace(/'/g, "&#39;"))}' style="cursor:pointer">
      <div class="word-head">
        <span class="word-text" style="font-size:1.067rem">${escapeHTML(p.phrase)}</span>
        <button class="audio-btn" data-audio="${escapeHTML(p.phrase)}" title="朗读">${ICON_AUDIO}</button>
      </div>
      ${p.meaning_zh ? `<div class="word-def">${escapeHTML(p.meaning_zh)}</div>` : ''}
      ${p.meaning_en ? `<div class="word-extra">${escapeHTML(p.meaning_en)}</div>` : ''}
      ${p.source_sentence ? `<div class="word-extra" style="font-style:italic;border-left:2px solid var(--divider);padding-left:8px;margin:8px 0">"${escapeHTML(p.source_sentence)}"</div>` : ''}
      ${p.usage_note ? `<div class="word-extra">用法：${escapeHTML(p.usage_note)}</div>` : ''}
      ${p.alternatives ? `<div class="word-extra">同义：${escapeHTML(p.alternatives)}</div>` : ''}
      ${p.source_url ? `<div style="margin-top:6px"><a href="${escapeHTML(p.source_url)}" target="_blank" rel="noopener" style="font-size:0.8rem">来源 ↗</a></div>` : ''}
    </div>
  `;
}

function bindListEvents(container) {
  // 整张卡点击 → 详情 modal
  container.querySelectorAll('.word-card[data-wid]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = card.dataset.wid;
      const w = JSON.parse(card.dataset.json || '{}');
      showWordDetail(w);
    });
  });
  container.querySelectorAll('.phrase-card[data-pid]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;  // 允许来源链接点击
      const p = JSON.parse(card.dataset.json || '{}');
      showPhraseDetail(p);
    });
  });

  container.querySelectorAll('.audio-btn').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.audio); });
  });
  container.querySelectorAll('.vocab-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.vocab;
      const added = store.saved.toggle('vocab', id);
      b.classList.toggle('on', added);
      toast[added ? 'success' : 'info'](added ? '✓ 加入生词本' : '已移除');
    });
  });
  container.querySelectorAll('[data-status]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const wid = b.dataset.wid;
      const status = b.dataset.status;
      const cur = store.notes.get('english_words', wid);
      store.notes.set('english_words', wid, cur === status ? null : status);
      toast.success(status === 'known' ? '✓ 已掌握' : '已加入待复习');
      render(container);
    });
  });
}

// ============== 闪卡模式 ==============
let flashIndex = 0;
let flashFlipped = false;

function renderFlashcardMode(container, words, phrases) {
  if (!words.length) {
    return '<div class="empty-state">暂无今日词</div>';
  }
  const item = words[flashIndex % words.length];
  flashFlipped = false;

  return `
    <div style="text-align:center;margin-bottom:16px">
      <span class="badge" style="margin-right:8px">${escapeHTML(item.difficulty || '')}</span>
      <span style="color:var(--fg-tertiary);font-family:var(--font-sans);font-size:0.867rem">${flashIndex + 1} / ${words.length}</span>
    </div>
    <div class="flashcard" id="flash-card">
      <div class="flashcard-front">
        <div class="flashcard-word">${escapeHTML(item.word)}</div>
        ${item.phonetic ? `<div class="flashcard-phonetic">${escapeHTML(item.phonetic)}</div>` : ''}
        <button class="audio-btn" data-audio="${escapeHTML(item.word)}" title="朗读" style="margin:12px auto;display:block">${ICON_AUDIO}</button>
        <div class="flashcard-hint">点击卡片查看释义</div>
      </div>
      <div class="flashcard-back">
        ${item.definition ? `<div class="word-def" style="font-size:1.067rem;margin-bottom:12px">${escapeHTML(item.definition)}</div>` : ''}
        ${item.example ? `<div class="word-extra" style="margin-bottom:8px">📖 ${escapeHTML(item.example)}</div>` : ''}
        ${item.collocations ? `<div class="word-extra" style="margin-bottom:8px">🔗 ${escapeHTML(item.collocations)}</div>` : ''}
        ${item.synonyms_note ? `<div class="word-extra" style="margin-bottom:8px">⚖️ ${escapeHTML(item.synonyms_note)}</div>` : ''}
      </div>
    </div>
    <div class="flashcard-controls">
      <button class="btn" id="flash-prev">← 上一张</button>
      <button class="btn" id="flash-speak">${ICON_AUDIO} 朗读</button>
      <button class="btn" id="flip-known">${ICON_CHECK} 已掌握</button>
      <button class="btn" id="flip-review">${ICON_REVIEW} 需复习</button>
      <button class="btn btn-primary" id="flash-next">下一张 →</button>
    </div>
    <div style="text-align:center;margin-top:24px">
      <button class="btn btn-sm" id="exit-flashcard">返回列表</button>
    </div>
  `;
}

function bindFlashcardEvents(container, words) {
  const card = container.querySelector('#flash-card');
  if (!card) return;
  card.addEventListener('click', () => {
    card.classList.toggle('flipped');
    flashFlipped = !flashFlipped;
    // 翻到背面时自动朗读
    if (flashFlipped && words[flashIndex % words.length]) {
      setTimeout(() => speak(words[flashIndex % words.length].word), 200);
    }
  });
  container.querySelector('#flash-prev')?.addEventListener('click', () => {
    flashIndex = (flashIndex - 1 + words.length) % words.length;
    renderFlash(container);
  });
  container.querySelector('#flash-next')?.addEventListener('click', () => {
    flashIndex = (flashIndex + 1) % words.length;
    renderFlash(container);
  });
  container.querySelector('#flash-speak')?.addEventListener('click', () => {
    const w = words[flashIndex % words.length];
    if (w) speak(w.word);
  });
  container.querySelector('#flip-known')?.addEventListener('click', () => {
    const w = words[flashIndex % words.length];
    if (w) {
      store.notes.set('english_words', w.id, 'known');
      toast.success('✓ 已掌握');
      flashIndex++;
      renderFlash(container);
    }
  });
  container.querySelector('#flip-review')?.addEventListener('click', () => {
    const w = words[flashIndex % words.length];
    if (w) {
      store.notes.set('english_words', w.id, 'review');
      toast.info('已加入复习');
      flashIndex++;
      renderFlash(container);
    }
  });
  container.querySelector('#exit-flashcard')?.addEventListener('click', () => {
    setMode('list');
    renderEnglish(container);
  });
  container.querySelector('#flash-card .audio-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const w = words[flashIndex % words.length];
    if (w) speak(w.word);
  });
}

function renderFlash(container) {
  api.get('/english/today').then(data => {
    container.querySelector('.eng-content').innerHTML = renderFlashcardMode(container, data.words || [], data.phrases || []);
    bindFlashcardEvents(container, data.words || []);
  });
}

// ============== 复习队列模式 ==============
function renderReviewMode(container, allKnown, allReview) {
  const reviewWords = Object.entries(allReview).filter(([id, _]) => store.notes.get('english_words', +id) === 'review');
  if (!reviewWords.length) {
    return '<div class="empty-state" style="background:var(--bg-elevated);border:1px solid var(--divider-subtle);border-radius:var(--radius)"><div class="empty-state-title">✓ 暂无待复习</div><div class="empty-state-desc">所有已标"待复习"的词都已复习完。回列表继续标新词吧。</div></div>';
  }
  return `
    <div style="margin-bottom:16px;font-family:var(--font-serif);color:var(--fg-secondary)">待复习 <strong>${reviewWords.length}</strong> 词</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${reviewWords.map(([id, _]) => `<div class="flashcard" data-rwid="${id}" style="padding:24px;text-align:left">
        <div class="word-text" style="font-size:1.4rem">已标"待复习" #${id}</div>
        <div class="flashcard-hint">点击标记为"已掌握"或继续"待复习"</div>
      </div>`).join('')}
    </div>
  `;
}

function bindReviewEvents(container, wordsMap) {
  container.querySelectorAll('[data-rwid]').forEach(el => {
    el.addEventListener('click', () => {
      const wid = +el.dataset.rwid;
      const w = wordsMap[wid];
      if (!w) return;
      // 直接进入闪卡模式 + 定位到该词
      const words = Object.values(wordsMap);
      flashIndex = words.findIndex(x => x.id === wid);
      setMode('flashcard');
      renderEnglish(container);
    });
  });
}

// ============== 主入口 ==============
export async function renderEnglish(container) {
  container.innerHTML = `
    <div class="eng-stats"></div>
    <div class="eng-modebar"></div>
    <div class="eng-content"></div>
  `;
  try {
    const data = await api.get('/english/today');
    const words = data.words || [];
    const phrases = data.phrases || [];

    container.querySelector('.eng-stats').innerHTML = renderStats(words, phrases);
    container.querySelector('.eng-modebar').innerHTML = renderModeBar();

    if (currentMode === 'list') {
      container.querySelector('.eng-content').innerHTML = `
        <div class="dual-col">
          <div>
            <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">单词 (${words.length})</h2>
            ${words.map(renderWordListItem).join('') || '<div class="empty-state-desc">暂无</div>'}
          </div>
          <div>
            <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">短语 (${phrases.length})</h2>
            ${phrases.map(renderPhraseListItem).join('') || '<div class="empty-state-desc">暂无</div>'}
          </div>
        </div>
      `;
      bindListEvents(container);
    } else if (currentMode === 'flashcard') {
      renderFlash(container);
      return;
    } else if (currentMode === 'review') {
      const allKnown = store.notes.get('english_words') || {};
      const reviewWords = Object.entries(allKnown).filter(([_, s]) => s === 'review');
      const wordsMap = {};
      words.forEach(w => wordsMap[w.id] = w);
      container.querySelector('.eng-content').innerHTML = renderReviewMode(container, allKnown, allKnown);
      bindReviewEvents(container, wordsMap);
    }

    container.querySelectorAll('[data-mode]').forEach(b => {
      b.addEventListener('click', () => { setMode(b.dataset.mode); renderEnglish(container); });
    });
  } catch (e) {
    container.innerHTML = `<div class="flash error">加载失败：${escapeHTML(e.message)}</div>`;
  }
}
