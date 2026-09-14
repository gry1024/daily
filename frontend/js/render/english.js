import { api } from '../api.js';
import { escapeHTML } from '../app.js';

const STORAGE = 'english_vocab';

function loadVocab() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { return {}; }
}
function saveVocab(v) { localStorage.setItem(STORAGE, JSON.stringify(v)); }
function toggleVocab(id) {
  const v = loadVocab();
  v[id] = v[id] ? !v[id] : true;
  if (!v[id]) delete v[id];
  saveVocab(v);
}

export async function renderEnglish(container) {
  const data = await api.get('/english/today');
  const vocab = loadVocab();
  if ((!data.words || !data.words.length) && (!data.phrases || !data.phrases.length)) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10"/></svg>
      <div class="empty-state-title">今日英语尚未发布</div>
      <div class="empty-state-desc">10 词 + 5 短语 · CET-6 ~ 雅思</div>
    </div>`;
    return;
  }
  const words = (data.words || []).map(w => `
    <div class="word-card" data-id="${w.id}">
      <div class="word-head">
        <span class="word-text">${escapeHTML(w.word)}</span>
        ${w.phonetic ? `<span class="word-phonetic">${escapeHTML(w.phonetic)}</span>` : ''}
        <span class="badge" style="margin-left:auto">${escapeHTML(w.difficulty || '')}</span>
        <button class="vocab-btn ${vocab[w.id] ? 'on' : ''}" title="加入生词本" data-vocab="${w.id}">★</button>
      </div>
      ${w.definition ? `<div class="word-def">${escapeHTML(w.definition)}</div>` : ''}
      ${w.example ? `<div class="word-extra">例：${escapeHTML(w.example)}</div>` : ''}
      ${w.collocations ? `<div class="word-extra">搭配：${escapeHTML(w.collocations)}</div>` : ''}
      ${w.synonyms_note ? `<div class="word-extra">辨析：${escapeHTML(w.synonyms_note)}</div>` : ''}
    </div>
  `).join('');

  const phrases = (data.phrases || []).map(p => `
    <div class="phrase-card" data-id="${p.id}">
      <div class="word-text" style="font-size:1.067rem">${escapeHTML(p.phrase)}</div>
      ${p.meaning_zh ? `<div class="word-def">${escapeHTML(p.meaning_zh)}</div>` : ''}
      ${p.meaning_en ? `<div class="word-extra">${escapeHTML(p.meaning_en)}</div>` : ''}
      ${p.source_sentence ? `<div class="word-extra" style="font-style:italic;border-left:2px solid var(--divider);padding-left:8px;margin:8px 0">"${escapeHTML(p.source_sentence)}"</div>` : ''}
      ${p.usage_note ? `<div class="word-extra">用法：${escapeHTML(p.usage_note)}</div>` : ''}
      ${p.alternatives ? `<div class="word-extra">同义：${escapeHTML(p.alternatives)}</div>` : ''}
      ${p.source_url ? `<div style="margin-top:6px"><a href="${escapeHTML(p.source_url)}" target="_blank" rel="noopener" style="font-size:0.8rem">来源 ↗</a></div>` : ''}
    </div>
  `).join('');

  container.innerHTML = `
    <div class="flash info">难度按 CET-6 (583) → 雅思递进 · 仅展示知识点，不出题</div>
    <div class="dual-col">
      <div>
        <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">单词 (${(data.words || []).length})</h2>
        ${words || '<div class="empty-state-desc">暂无</div>'}
      </div>
      <div>
        <h2 style="font-family:var(--font-serif);font-size:1.4rem;margin-bottom:12px">短语 (${(data.phrases || []).length})</h2>
        ${phrases || '<div class="empty-state-desc">暂无</div>'}
      </div>
    </div>
    <style>
      .vocab-btn { background: none; border: 1px solid var(--divider); border-radius: 50%; width: 28px; height: 28px; font-size: 14px; color: var(--fg-tertiary); cursor: pointer; transition: all .15s; }
      .vocab-btn:hover { border-color: var(--warning); color: var(--warning); }
      .vocab-btn.on { background: var(--warning); color: #fff; border-color: var(--warning); }
    </style>
  `;
  container.querySelectorAll('.vocab-btn').forEach(b => {
    b.addEventListener('click', () => {
      toggleVocab(b.dataset.vocab);
      b.classList.toggle('on');
    });
  });
}
