// お客様の声（voices）。引用の読みやすさ（行間・字間）を最優先にし、頭文字の丸で人の温度を添える。
import { each, esc, initial, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-voices .uxr-h2{text-align:center}
.uxr-page .uxr-voices .uxr-voices-list{display:grid;gap:16px}
.uxr-page .uxr-voices .uxr-voice{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:18px;padding:22px 22px 24px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow);overflow:hidden}
.uxr-page .uxr-voices .uxr-voice-body{display:grid;gap:4px}
.uxr-page .uxr-voices .uxr-voice-body::before{content:"\\201C";display:block;font-family:Georgia,"Hiragino Mincho ProN",serif;font-size:2.8rem;line-height:1;height:.55em;color:var(--uxr-accent-line);user-select:none}
.uxr-page .uxr-voices .uxr-voice-quote{font-size:.96875rem;line-height:1.88;letter-spacing:.025em;color:var(--uxr-ink)}
.uxr-page .uxr-voices .uxr-voice-foot{display:flex;align-items:center;gap:12px;padding-top:14px;border-top:1px solid var(--uxr-line)}
.uxr-page .uxr-voices .uxr-voice-avatar{display:inline-grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:var(--uxr-accent-soft);border:1px solid var(--uxr-accent-line);color:var(--uxr-accent-text);font-family:var(--uxr-font-head);font-size:.9375rem;font-weight:700}
.uxr-page .uxr-voices .uxr-voice-who{font-size:.875rem;line-height:1.5;color:var(--uxr-muted);min-width:0}

.uxr-page[data-theme="lively"] .uxr-voices .uxr-voice-body::before{color:var(--uxr-accent-text)}
.uxr-page[data-theme="lively"] .uxr-voices .uxr-voice-avatar{border:2px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-voices .uxr-voice-avatar{background:transparent}
.uxr-page[data-theme="calm"] .uxr-voices .uxr-voice-quote{font-family:var(--uxr-font-head);letter-spacing:.04em}

/* v1: 大きな引用。最初の1件を主役として広げ、角丸でも枠が歪まない内側の縦バーで強調する */
.uxr-page .uxr-voices.uxr-v1 .uxr-h2{text-align:left}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child{padding:26px 24px 26px 32px}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child::before{content:"";position:absolute;left:14px;top:22px;bottom:22px;width:4px;border-radius:999px;background:var(--uxr-accent)}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child .uxr-voice-body::before{font-size:3.4rem;color:var(--uxr-accent)}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child .uxr-voice-quote{font-size:clamp(1.125rem,3.4cqw,1.375rem);line-height:1.88;letter-spacing:.03em}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child .uxr-voice-avatar{width:42px;height:42px;font-size:1.0625rem}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:not(:first-child){padding:20px;background:var(--uxr-surface);box-shadow:none}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:not(:first-child) .uxr-voice-body::before{font-size:2.2rem}
.uxr-page .uxr-voices.uxr-v1 .uxr-voice:not(:first-child) .uxr-voice-quote{font-size:.9375rem;line-height:1.8}
.uxr-page[data-theme="crisp"] .uxr-voices.uxr-v1 .uxr-voice:first-child::before{left:0;top:0;bottom:0;width:4px;border-radius:0}
.uxr-page[data-theme="calm"] .uxr-voices.uxr-v1 .uxr-voice:first-child::before{left:0;top:0;bottom:0;width:3px;border-radius:0}

@container uxr (min-width:600px){
  .uxr-page .uxr-voices.uxr-v0 .uxr-voices-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,215px),1fr));gap:18px}
  .uxr-page .uxr-voices.uxr-v0 .uxr-voice:only-child{max-width:600px;margin-inline:auto;width:100%}
  .uxr-page .uxr-voices.uxr-v1 .uxr-voices-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child{grid-column:1/-1;padding:32px 36px 32px 44px}
  .uxr-page .uxr-voices.uxr-v1 .uxr-voice:first-child::before{left:18px;top:26px;bottom:26px}
  .uxr-page[data-theme="crisp"] .uxr-voices.uxr-v1 .uxr-voice:first-child::before,
  .uxr-page[data-theme="calm"] .uxr-voices.uxr-v1 .uxr-voice:first-child::before{left:0;top:0;bottom:0}
  /* 合計2件のとき、2件目だけが左半分に残らないよう全幅に揃える */
  .uxr-page .uxr-voices.uxr-v1 .uxr-voice:nth-child(2):last-child{grid-column:1/-1}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const cards = each(ctx, block, 'items').map(({ item, i }) => {
    const quote = multi(ctx, block, `items.${i}.quote`, { cls: 'uxr-voice-quote' });
    const who = txt(ctx, block, `items.${i}.who`, { cls: 'uxr-voice-who' });
    if (!quote && !who) return '';
    const body = quote ? `<blockquote class="uxr-voice-body">${quote}</blockquote>` : '';
    const foot = who
      ? `<figcaption class="uxr-voice-foot"><span class="uxr-voice-avatar" aria-hidden="true">${esc(initial(item.who))}</span>${who}</figcaption>`
      : '';
    return `<figure class="uxr-voice">${body}${foot}</figure>`;
  }).filter(Boolean).join('');
  const list = cards ? `<div class="uxr-voices-list">${cards}</div>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
