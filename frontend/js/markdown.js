// Markdown 渲染：marked.js + DOMPurify + highlight.js
// 用法：renderMarkdown(text) -> 安全的 HTML 字符串

import { escapeHTML } from './app.js';

let _initialized = false;

function init() {
  if (_initialized) return !!window.marked;
  if (!window.marked) return false;
  _initialized = true;
  return true;
}

// 手动代码高亮（绕过 marked v12 的 highlight option 兼容性问题）
function highlightCodeBlocks(html) {
  if (!window.hljs || !html) return html;
  // 匹配 <pre><code class="language-X">...</code></pre>
  return html.replace(
    /<pre><code(?:\s+class="(?:language-)?([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (match, lang, code) => {
      try {
        // 解码实体
        const decoded = code
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"');
        const result = (lang && window.hljs.getLanguage && window.hljs.getLanguage(lang))
          ? window.hljs.highlight(decoded, { language: lang })
          : window.hljs.highlightAuto(decoded);
        return `<pre><code class="hljs language-${result.language || lang || 'plaintext'}">${result.value}</code></pre>`;
      } catch (e) {
        return match;
      }
    }
  );
}

export function renderMarkdown(text) {
  if (!text) return '';
  if (!init()) {
    return `<pre>${escapeHTML(text)}</pre>`;
  }

  let html;
  try {
    html = window.marked.parse(String(text), {
      gfm: true,
      breaks: true,
    });
  } catch (e) {
    console.warn('marked parse failed', e);
    return `<pre>${escapeHTML(text)}</pre>`;
  }

  // 手动应用代码高亮
  html = highlightCodeBlocks(html);

  // DOMPurify 净化
  if (window.DOMPurify) {
    html = window.DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel'],
      ADD_TAGS: [],
    });
  }
  return html;
}

if (typeof window !== 'undefined') {
  window.__md = renderMarkdown;
}
