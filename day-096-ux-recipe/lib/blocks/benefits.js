// 選ばれる理由（benefits）。札と文章の位置をそろえ、各項目の違いを目で追えるようにする。
import { each, ico, multi, sec, txt } from '../render-kit.js';
import { pickIcon } from '../icon-pick.js';

export const css = `
.uxr-page .uxr-benefits .uxr-h2{text-align:left}
.uxr-page .uxr-benefits .uxr-ben-title{margin:0}
.uxr-page .uxr-benefits .uxr-ben-text{color:var(--uxr-muted);font-size:.9375rem}

/* v0: アイコン＋角丸バッジ。項目数が2〜4で変わっても端数が浮かない列組にする */
.uxr-page .uxr-benefits.uxr-v0 .uxr-h2{text-align:center}
.uxr-page .uxr-benefits.uxr-v0 .uxr-ben-list{display:grid;gap:16px}
.uxr-page .uxr-benefits.uxr-v0 .uxr-ben-item{display:flex;flex-direction:column;gap:12px;padding:24px 22px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-benefits.uxr-v0 .uxr-ben-body{display:grid;gap:8px}
.uxr-page[data-theme="crisp"] .uxr-benefits.uxr-v0 .uxr-ben-item{border-top:3px solid var(--uxr-accent)}
.uxr-page[data-theme="lively"] .uxr-benefits .uxr-ico-badge{border:2px solid var(--uxr-ink);box-shadow:2px 2px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v0 .uxr-ben-item{background:transparent;border:0;border-top:1px solid var(--uxr-line);border-radius:0;box-shadow:none;padding:22px 4px 12px}
.uxr-page[data-theme="calm"] .uxr-benefits .uxr-ico-badge{background:transparent;border:1px solid var(--uxr-accent-line)}

/* v1: 大きな番号（01…）＋区切り線。活字の大きさと余白だけで静かな説得力を作る */
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-list{display:grid;border-top:1px solid var(--uxr-line)}
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-item{display:grid;grid-template-columns:46px minmax(0,1fr);gap:12px;align-items:start;padding:22px 0;border-bottom:1px solid var(--uxr-line)}
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-num{font-family:var(--uxr-font-head);font-size:clamp(1.65rem,5.2cqw,2.35rem);font-weight:var(--uxr-head-weight);font-variant-numeric:tabular-nums;line-height:1.05;color:var(--uxr-accent-text);letter-spacing:-.01em}
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-body{display:grid;gap:6px;padding-top:2px}
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v1 .uxr-ben-list{border-top-width:2px}
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v1 .uxr-ben-item{border-bottom-width:2px}

/* 番号は見出しに添え、文章が長くなっても札の横幅を一定に保つ。 */
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item{display:flex;align-items:center;gap:clamp(14px,3cqw,26px);padding-block:20px}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item + .uxr-ben-item{border-top:1px solid var(--uxr-line)}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ico-badge{width:64px;height:64px;border-radius:var(--uxr-radius-sm)}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ico-badge .uxr-ico{width:30px;height:30px}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-body{flex:1;min-width:0;display:grid;gap:4px}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-num{color:var(--uxr-accent-text);font-size:.8125rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.08em}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-title{font-size:1.1875rem}

@container uxr (min-width:600px){
  /* 2件は2列、3件は3列、4件は2×2に組むことで1件だけ取り残される崩れを防ぐ */
  .uxr-page .uxr-benefits.uxr-v0 .uxr-ben-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))}
  .uxr-page .uxr-benefits.uxr-v0 .uxr-ben-list:has(>:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
  .uxr-page .uxr-benefits.uxr-v1 .uxr-ben-item{grid-template-columns:76px minmax(0,1fr);gap:24px;padding:26px 0}
}
`;

export function render(block, ctx) {
  const v = block.variant;
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const entries = each(ctx, block, 'items');
  const rows = entries.map(({ item, i }, idx) => {
    const title = txt(ctx, block, `items.${i}.title`, { tag: 'h3', cls: 'uxr-h3 uxr-ben-title' });
    const text = multi(ctx, block, `items.${i}.text`, { cls: 'uxr-ben-text' });
    if (!title && !text) return '';
    const num = String(idx + 1).padStart(2, '0');
    const number = `<span class="uxr-ben-num" aria-hidden="true">${num}</span>`;
    const body = `<div class="uxr-ben-body">${v === 2 ? number : ''}${title}${text}</div>`;
    const description = [item.title, item.text].join(' ');
    const mark = v === 1 ? number
      : `<span class="uxr-ico-badge" aria-hidden="true">${ico(pickIcon(description, i))}</span>`;
    return `<li class="uxr-ben-item">${mark}${body}</li>`;
  }).filter(Boolean).join('');
  const tag = v === 1 ? 'ol' : 'ul';
  const list = rows ? `<${tag} class="uxr-ben-list">${rows}</${tag}>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
