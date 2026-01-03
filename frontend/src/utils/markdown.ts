import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const md = new MarkdownIt({
  html: false,       // 关键：不允许原始 HTML，避免 XSS
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  },
});

// 自定义 fence：给代码块加“复制代码”按钮
const defaultFence =
  md.renderer.rules.fence ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = token.info ? token.info.trim() : "";
  const lang = info.split(/\s+/g)[0] || "";
  const code = token.content || "";

  const highlighted =
    options.highlight?.(code, lang, "") ?? escapeHtml(code);

  const encoded = encodeURIComponent(code);

  return `
<div class="relative my-3">
  <div class="absolute right-2 top-2 flex items-center gap-2">
    <span class="text-xs text-gray-400">${escapeHtml(lang || "")}</span>
    <button class="copy-code rounded-md border border-gray-200 bg-white/80 px-2 py-1 text-xs text-gray-700 hover:bg-white" 
            data-code="${encoded}"
            type="button">
      复制代码
    </button>
  </div>
  <pre class="hljs overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6"><code class="hljs">${highlighted}</code></pre>
</div>
`.trim();
};

export function renderMarkdown(text: string) {
  return md.render(text || "");
}