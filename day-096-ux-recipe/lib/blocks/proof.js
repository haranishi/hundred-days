// 実績の数字（proof）。大きな数字を主役にし、8文字の長い表記でも狭い幅で折り返して崩れないようにする。
import { each, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-proof .uxr-h2{text-align:center}
.uxr-page .uxr-proof .uxr-proof-num{font-size:clamp(1.375rem,5cqw,2.35rem);line-height:1.18;letter-spacing:-.01em;overflow-wrap:anywhere;word-break:break-word}
.uxr-page .uxr-proof .uxr-proof-label{margin-top:8px;font-size:.875rem;line-height:1.5;color:var(--uxr-muted)}

/* v0: 横ならび（仕切り線つき）。狭い幅は2×nで揃え、3件の最後の1件は全幅にして空白を作らない */
.uxr-page .uxr-proof.uxr-v0 .uxr-proof-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--uxr-line);border-bottom:1px solid var(--uxr-line)}
.uxr-page .uxr-proof.uxr-v0 .uxr-proof-item{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:22px 12px}
.uxr-page .uxr-proof.uxr-v0 .uxr-proof-item:nth-child(even){border-left:1px solid var(--uxr-line)}
.uxr-page .uxr-proof.uxr-v0 .uxr-proof-item:nth-child(n+3){border-top:1px solid var(--uxr-line)}
.uxr-page .uxr-proof.uxr-v0 .uxr-proof-item:last-child:nth-child(odd){grid-column:1/-1;border-left:0}
.uxr-page[data-theme="lively"] .uxr-proof.uxr-v0 .uxr-proof-list{border-top-width:2px;border-bottom-width:2px}
.uxr-page[data-theme="lively"] .uxr-proof.uxr-v0 .uxr-proof-item:nth-child(even){border-left-width:2px}
.uxr-page[data-theme="lively"] .uxr-proof.uxr-v0 .uxr-proof-item:nth-child(n+3){border-top-width:2px}
.uxr-page[data-theme="calm"] .uxr-proof.uxr-v0 .uxr-proof-num{font-family:var(--uxr-font-head);font-weight:600}

/* v1: カード。大きな角丸でも枠線が歪まないよう、カード内の装飾バーで強調色を添える */
.uxr-page .uxr-proof.uxr-v1 .uxr-proof-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.uxr-page .uxr-proof.uxr-v1 .uxr-proof-item{position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:22px 14px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow);overflow:hidden}
.uxr-page .uxr-proof.uxr-v1 .uxr-proof-item::before{content:"";display:block;width:28px;height:3px;margin-bottom:12px;border-radius:999px;background:var(--uxr-accent)}
.uxr-page .uxr-proof.uxr-v1 .uxr-proof-item:last-child:nth-child(odd){grid-column:1/-1}
.uxr-page[data-theme="crisp"] .uxr-proof.uxr-v1 .uxr-proof-item::before{position:absolute;inset:0 0 auto;width:auto;height:3px;margin:0;border-radius:0}
.uxr-page[data-theme="lively"] .uxr-proof.uxr-v1 .uxr-proof-item::before{width:34px;height:4px}
.uxr-page[data-theme="calm"] .uxr-proof.uxr-v1 .uxr-proof-item::before{position:absolute;inset:0 0 auto;width:auto;height:2px;margin:0;border-radius:0}
.uxr-page[data-theme="calm"] .uxr-proof.uxr-v1 .uxr-proof-num{font-family:var(--uxr-font-head);font-weight:600}

@container uxr (min-width:640px){
  .uxr-page .uxr-proof .uxr-proof-list:has(>:nth-child(4)) .uxr-proof-num{font-size:clamp(1.35rem,3.4cqw,2rem)}
  .uxr-page .uxr-proof.uxr-v0 .uxr-proof-list{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}
  .uxr-page .uxr-proof.uxr-v0 .uxr-proof-item{padding:26px 18px;border-top:0;border-left:1px solid var(--uxr-line)}
  .uxr-page .uxr-proof.uxr-v0 .uxr-proof-item:first-child{border-left:0}
  .uxr-page .uxr-proof.uxr-v0 .uxr-proof-item:last-child:nth-child(odd){grid-column:auto;border-left:1px solid var(--uxr-line)}
  .uxr-page .uxr-proof.uxr-v0 .uxr-proof-item:only-child{border-left:0}
  .uxr-page[data-theme="lively"] .uxr-proof.uxr-v0 .uxr-proof-item:not(:first-child){border-left-width:2px}
  .uxr-page .uxr-proof.uxr-v1 .uxr-proof-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:16px}
  .uxr-page .uxr-proof.uxr-v1 .uxr-proof-item{padding:26px 16px}
  .uxr-page .uxr-proof.uxr-v1 .uxr-proof-item:last-child:nth-child(odd){grid-column:auto}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const rows = each(ctx, block, 'items').map(({ i }) => {
    const num = txt(ctx, block, `items.${i}.num`, { tag: 'p', cls: 'uxr-num uxr-proof-num' });
    const label = txt(ctx, block, `items.${i}.label`, { tag: 'p', cls: 'uxr-proof-label' });
    if (!num && !label) return '';
    return `<li class="uxr-proof-item">${num}${label}</li>`;
  }).filter(Boolean).join('');
  const list = rows ? `<ul class="uxr-proof-list">${rows}</ul>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
