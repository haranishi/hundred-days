// 保証・安心（guarantee）。v0=盾のアイコンと帯、v1=円形のシールと説明。
import { each, ico, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-guarantee:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-guarantee .uxr-guar-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.uxr-page .uxr-guarantee .uxr-guar-chip{display:inline-flex;align-items:center;gap:5px;padding:.3em .85em;border-radius:999px;background:var(--uxr-surface);border:1px solid var(--uxr-accent-line);color:var(--uxr-accent-text);font-size:.8125rem;font-weight:700;line-height:1.45}
.uxr-page .uxr-guarantee .uxr-guar-chip .uxr-ico{width:14px;height:14px}

/* v0: 薄い強調地と上下の線で「安心の帯」として独立させる */
.uxr-page .uxr-guarantee.uxr-v0{background:var(--uxr-accent-soft);border-top:1px solid var(--uxr-accent-line);border-bottom:1px solid var(--uxr-accent-line)}
.uxr-page .uxr-guarantee.uxr-v0 .uxr-inner{padding-block:40px}
.uxr-page .uxr-guarantee.uxr-v0 .uxr-guar-band{display:grid;gap:18px;align-items:start}
.uxr-page .uxr-guarantee.uxr-v0 .uxr-guar-crest{display:grid;place-items:center;width:58px;height:58px;border-radius:calc(var(--uxr-radius)*.65);background:var(--uxr-surface);border:1.5px solid var(--uxr-accent-line);color:var(--uxr-accent-text);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-guarantee.uxr-v0 .uxr-guar-crest .uxr-ico{width:30px;height:30px}
.uxr-page .uxr-guarantee.uxr-v0 .uxr-h2{margin-bottom:10px}
.uxr-page .uxr-guarantee.uxr-v0 .uxr-guar-text{color:var(--uxr-ink);max-width:42em}

/* v1: 印章のように見出しを収めた円形シールと、寄り添う説明 */
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-panel{display:grid;gap:24px;justify-items:center;align-items:center;padding:28px 22px}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-seal{position:relative;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:192px;height:192px;padding:24px 20px;border-radius:50%;background:var(--uxr-accent-soft);border:2px solid var(--uxr-accent);color:var(--uxr-accent-text);text-align:center}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-seal::before{content:"";position:absolute;inset:7px;border-radius:50%;border:1.5px dashed var(--uxr-accent-line);pointer-events:none}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-seal .uxr-ico{width:24px;height:24px}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-seal-title{font-size:.9375rem;line-height:1.32;color:var(--uxr-accent-text);margin:0}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-copy{display:grid;gap:4px;min-width:0;width:100%;text-align:center}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-text{color:var(--uxr-ink)}
.uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-chips{justify-content:center}

.uxr-page[data-theme="lively"] .uxr-guarantee.uxr-v0{border-block:1px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-guarantee.uxr-v0 .uxr-guar-crest{border:2px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-guarantee.uxr-v1 .uxr-guar-seal{border-color:var(--uxr-ink);box-shadow:4px 4px 0 var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-guarantee.uxr-v1 .uxr-guar-seal::before{border-color:var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-guarantee .uxr-guar-chip{border:1.5px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-guarantee.uxr-v1 .uxr-guar-seal::before{border-style:solid;border-width:1px}

@container uxr (min-width:600px){
  .uxr-page .uxr-guarantee.uxr-v0 .uxr-guar-band{grid-template-columns:auto 1fr;gap:24px;align-items:center}
  .uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-panel{grid-template-columns:auto 1fr;gap:32px;padding:34px 36px;justify-items:start}
  .uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-copy{text-align:left}
  .uxr-page .uxr-guarantee.uxr-v1 .uxr-guar-chips{justify-content:flex-start}
}
`;

export function render(block, ctx) {
  const text = multi(ctx, block, 'text', { cls: 'uxr-guar-text' });
  const chipItems = each(ctx, block, 'items').map(({ i }) => {
    const t = txt(ctx, block, `items.${i}.text`);
    return t ? `<li class="uxr-guar-chip">${ico('check')}${t}</li>` : '';
  }).filter(Boolean).join('');
  const chips = chipItems ? `<ul class="uxr-guar-chips">${chipItems}</ul>` : '';

  if (block.variant === 1) {
    const title = txt(ctx, block, 'title', { tag: 'h2', cls: 'uxr-h2 uxr-guar-seal-title' });
    // 書き出しで中身がすべて空のときは、盾だけの空シールを残さず畳む
    if (!title && !text && !chips) return sec(ctx, block, '');
    const seal = `<div class="uxr-guar-seal">${ico('shield')}${title}</div>`;
    const copy = text || chips ? `<div class="uxr-guar-copy">${text}${chips}</div>` : '';
    return sec(ctx, block, `<div class="uxr-card uxr-guar-panel">${seal}${copy}</div>`);
  }

  const title = txt(ctx, block, 'title', { tag: 'h2', cls: 'uxr-h2' });
  if (!title && !text && !chips) return sec(ctx, block, '');
  const crest = `<div class="uxr-guar-crest" aria-hidden="true">${ico('shield')}</div>`;
  const body = title || text || chips ? `<div class="uxr-guar-body">${title}${text}${chips}</div>` : '';
  return sec(ctx, block, `<div class="uxr-guar-band">${crest}${body}</div>`);
}
