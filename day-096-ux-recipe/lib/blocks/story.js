// 想い・ストーリー（story）。160字を読みやすい行長で組むことで、書き手の温度が静かに伝わるようにする。
import { multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-story .uxr-story-head{display:grid;gap:12px}
.uxr-page .uxr-story .uxr-h2{margin:0}
.uxr-page .uxr-story .uxr-story-rule{display:block;width:36px;height:2px;background:var(--uxr-accent)}
.uxr-page .uxr-story .uxr-story-body{display:grid;gap:18px;max-width:36em}
.uxr-page .uxr-story .uxr-story-text{line-height:1.95;letter-spacing:.025em;color:var(--uxr-ink)}
.uxr-page .uxr-story .uxr-story-who{display:flex;align-items:baseline;justify-content:flex-end;gap:8px;font-size:.9375rem;color:var(--uxr-muted)}
.uxr-page .uxr-story .uxr-story-dash{color:var(--uxr-accent-text);flex:none}

/* v0: 文章。見出しと本文の呼吸を取り、広い幅では雑誌のコラムのように2段で組む */
.uxr-page .uxr-story.uxr-v0 .uxr-story-wrap{display:grid;gap:22px;max-width:680px;margin-inline:auto}
.uxr-page[data-theme="calm"] .uxr-story.uxr-v0 .uxr-story-text{letter-spacing:.04em}

/* v1: 引用風。角丸を歪ませない内側の太い縦線（calmは背景なし左線）と大きめ文字で想いを際立たせる */
.uxr-page .uxr-story.uxr-v1 .uxr-story-wrap{display:grid;gap:20px;max-width:720px;margin-inline:auto}
.uxr-page .uxr-story.uxr-v1 .uxr-story-quote{position:relative;display:grid;gap:18px;padding:24px 22px 24px 34px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow);overflow:hidden}
.uxr-page .uxr-story.uxr-v1 .uxr-story-quote::before{content:"";position:absolute;left:14px;top:22px;bottom:22px;width:4px;border-radius:999px;background:var(--uxr-accent)}
.uxr-page .uxr-story.uxr-v1 .uxr-story-text{font-size:clamp(1.0625rem,3cqw,1.25rem);line-height:1.92;letter-spacing:.03em;max-width:32em}
.uxr-page .uxr-story.uxr-v1 .uxr-story-who{justify-content:flex-start;padding-top:4px}
.uxr-page[data-theme="crisp"] .uxr-story.uxr-v1 .uxr-story-quote::before{left:0;top:0;bottom:0;width:5px;border-radius:0}
.uxr-page[data-theme="lively"] .uxr-story.uxr-v1 .uxr-story-quote::before{width:5px}
.uxr-page[data-theme="calm"] .uxr-story.uxr-v1 .uxr-story-quote{background:transparent;border:0;border-left:3px solid var(--uxr-accent);border-radius:0;box-shadow:none;padding:8px 0 8px 24px}
.uxr-page[data-theme="calm"] .uxr-story.uxr-v1 .uxr-story-quote::before{display:none}
.uxr-page[data-theme="calm"] .uxr-story.uxr-v1 .uxr-story-text{font-family:var(--uxr-font-head);letter-spacing:.05em}

@container uxr (min-width:680px){
  .uxr-page .uxr-story.uxr-v0 .uxr-story-wrap{max-width:none}
  .uxr-page .uxr-story.uxr-v0 .uxr-story-wrap:has(.uxr-story-head){grid-template-columns:minmax(0,.78fr) minmax(0,1.42fr);gap:36px;align-items:start}
  .uxr-page .uxr-story.uxr-v1 .uxr-story-quote{padding:32px 34px 32px 46px}
  .uxr-page .uxr-story.uxr-v1 .uxr-story-quote::before{left:18px;top:26px;bottom:26px;width:5px}
  .uxr-page[data-theme="crisp"] .uxr-story.uxr-v1 .uxr-story-quote::before{left:0;top:0;bottom:0;width:5px}
  .uxr-page[data-theme="calm"] .uxr-story.uxr-v1 .uxr-story-quote{border-left-width:3px;padding:12px 0 12px 32px}
}
`;

export function render(block, ctx) {
  const v = block.variant;
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const text = multi(ctx, block, 'text', { cls: 'uxr-story-text' });
  const whoName = txt(ctx, block, 'who', { cls: 'uxr-story-who-name' });
  if (!heading && !text && !whoName) return sec(ctx, block, '');
  const head = heading ? `<div class="uxr-story-head">${heading}<i class="uxr-story-rule" aria-hidden="true"></i></div>` : '';
  if (v === 1) {
    const quote = text ? `<blockquote>${text}</blockquote>` : '';
    const who = whoName ? `<figcaption class="uxr-story-who"><span class="uxr-story-dash" aria-hidden="true">—</span>${whoName}</figcaption>` : '';
    const figure = quote || who ? `<figure class="uxr-story-quote">${quote}${who}</figure>` : '';
    return sec(ctx, block, `<div class="uxr-story-wrap">${heading}${figure}</div>`);
  }
  const who = whoName ? `<p class="uxr-story-who"><span class="uxr-story-dash" aria-hidden="true">—</span>${whoName}</p>` : '';
  const body = text || who ? `<div class="uxr-story-body">${text}${who}</div>` : '';
  return sec(ctx, block, `<div class="uxr-story-wrap">${head}${body}</div>`);
}
