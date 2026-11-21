// こんなお悩み（pain）。共感から解決への橋渡しまでを、自然な視線の流れで見せる。
import { each, ico, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-pain .uxr-h2{text-align:center}
.uxr-page .uxr-pain .uxr-pain-list{display:grid;gap:12px}

/* v0: 丸いチェックの行。読みやすさを保つため行幅を抑え、チェック印を1行目の高さへ揃える */
.uxr-page .uxr-pain.uxr-v0 .uxr-pain-list{max-width:640px;margin-inline:auto}
.uxr-page .uxr-pain.uxr-v0 .uxr-pain-item{display:flex;align-items:flex-start;gap:14px;padding:15px 18px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius-sm);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-pain.uxr-v0 .uxr-pain-mark{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;margin-top:1px;border-radius:50%;background:var(--uxr-accent-soft);color:var(--uxr-accent-text)}
.uxr-page .uxr-pain.uxr-v0 .uxr-pain-mark .uxr-ico{width:16px;height:16px}
.uxr-page .uxr-pain.uxr-v0 .uxr-pain-text{flex:1;min-width:0;font-weight:500}
.uxr-page[data-theme="crisp"] .uxr-pain.uxr-v0 .uxr-pain-mark{background:var(--uxr-accent);color:var(--uxr-accent-ink)}
.uxr-page[data-theme="lively"] .uxr-pain.uxr-v0 .uxr-pain-mark{border:2px solid var(--uxr-ink);background:var(--uxr-accent);color:var(--uxr-accent-ink)}
.uxr-page[data-theme="calm"] .uxr-pain.uxr-v0 .uxr-pain-list{gap:0;border-top:1px solid var(--uxr-line)}
.uxr-page[data-theme="calm"] .uxr-pain.uxr-v0 .uxr-pain-item{padding:16px 6px;background:transparent;border:0;border-bottom:1px solid var(--uxr-line);border-radius:0;box-shadow:none}
.uxr-page[data-theme="calm"] .uxr-pain.uxr-v0 .uxr-pain-mark{background:transparent;border:1px solid var(--uxr-accent-line)}

/* v1: 2列のカード（引用符の飾り）。心の声を拾い上げる佇まいにする */
.uxr-page .uxr-pain.uxr-v1 .uxr-pain-list{gap:16px}
.uxr-page .uxr-pain.uxr-v1 .uxr-pain-item{position:relative;display:flex;flex-direction:column;gap:4px;padding:18px 20px 20px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-pain.uxr-v1 .uxr-pain-item::before{content:"\\201C";display:block;font-family:Georgia,"Hiragino Mincho ProN",serif;font-size:2.6rem;line-height:1;height:.55em;color:var(--uxr-accent-line);user-select:none}
.uxr-page .uxr-pain.uxr-v1 .uxr-pain-text{font-weight:500}
.uxr-page .uxr-pain.uxr-v1 .uxr-pain-lead{max-width:none;border-radius:var(--uxr-radius)}
.uxr-page[data-theme="lively"] .uxr-pain.uxr-v1 .uxr-pain-item::before{color:var(--uxr-accent-text)}

/* 結論の帯（lead）。下向き矢印で悩みから解決へ視線をつなぐ */
.uxr-page .uxr-pain .uxr-pain-bridge{display:grid;justify-items:center;gap:12px;margin-top:24px}
.uxr-page .uxr-pain .uxr-pain-bridge:first-child{margin-top:0}
.uxr-page .uxr-pain .uxr-pain-arrow{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--uxr-accent-soft);color:var(--uxr-accent-text)}
.uxr-page .uxr-pain .uxr-pain-arrow .uxr-ico{width:18px;height:18px;transform:rotate(90deg)}
.uxr-page .uxr-pain .uxr-pain-lead{width:100%;max-width:640px;padding:18px 22px;border-radius:var(--uxr-radius-sm);background:var(--uxr-accent-soft);border:1px solid var(--uxr-accent-line);color:var(--uxr-ink);font-size:1.0625rem;font-weight:700;text-align:center}
.uxr-page[data-theme="lively"] .uxr-pain .uxr-pain-arrow{border:2px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-pain .uxr-pain-lead{border:2px solid var(--uxr-ink);box-shadow:3px 3px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-pain .uxr-pain-arrow{background:transparent;border:1px solid var(--uxr-accent-line)}
.uxr-page[data-theme="calm"] .uxr-pain .uxr-pain-lead{font-family:var(--uxr-font-head);font-weight:600;letter-spacing:.04em}

@container uxr (min-width:560px){
  .uxr-page .uxr-pain.uxr-v1 .uxr-pain-list{grid-template-columns:repeat(2,minmax(0,1fr))}
  /* 奇数件の最後の1枚を横幅いっぱいにし、右側に空白の穴を残さない */
  .uxr-page .uxr-pain.uxr-v1 .uxr-pain-item:last-child:nth-child(odd){grid-column:1/-1}
}
`;

export function render(block, ctx) {
  const v = block.variant;
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const rows = each(ctx, block, 'items').map(({ i }) => {
    const text = txt(ctx, block, `items.${i}.text`, { cls: 'uxr-pain-text' });
    if (!text) return '';
    if (v === 1) return `<li class="uxr-pain-item">${text}</li>`;
    return `<li class="uxr-pain-item"><span class="uxr-pain-mark" aria-hidden="true">${ico('check')}</span>${text}</li>`;
  }).filter(Boolean).join('');
  const list = rows ? `<ul class="uxr-pain-list">${rows}</ul>` : '';
  const lead = multi(ctx, block, 'lead', { cls: 'uxr-pain-lead' });
  const arrow = list ? `<div class="uxr-pain-arrow" aria-hidden="true">${ico('arrow')}</div>` : '';
  const bridge = lead ? `<div class="uxr-pain-bridge">${arrow}${lead}</div>` : '';
  return sec(ctx, block, `${heading}${list}${bridge}`);
}
