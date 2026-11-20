// 選ばれる理由（benefits）。アイコン・番号・左右交互の3つの語り口で、強みを分かりやすく並べる。
import { each, ico, multi, sec, txt } from '../render-kit.js';

const BENEFIT_ICONS = ['check', 'heart', 'shield', 'clock', 'spark', 'leaf'];

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
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v0 .uxr-ico-badge{border:2px solid var(--uxr-ink);box-shadow:2px 2px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v0 .uxr-ben-item{background:transparent;border:0;border-top:1px solid var(--uxr-line);border-radius:0;box-shadow:none;padding:22px 4px 12px}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v0 .uxr-ico-badge{background:transparent;border:1px solid var(--uxr-accent-line)}

/* v1: 大きな番号（01…）＋区切り線。活字の大きさと余白だけで静かな説得力を作る */
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-list{display:grid;border-top:1px solid var(--uxr-line)}
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-item{display:grid;grid-template-columns:46px minmax(0,1fr);gap:12px;align-items:start;padding:22px 0;border-bottom:1px solid var(--uxr-line)}
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-num{font-family:var(--uxr-font-head);font-size:clamp(1.65rem,5.2cqw,2.35rem);font-weight:var(--uxr-head-weight);font-variant-numeric:tabular-nums;line-height:1.05;color:var(--uxr-accent-text);letter-spacing:-.01em}
.uxr-page .uxr-benefits.uxr-v1 .uxr-ben-body{display:grid;gap:6px;padding-top:2px}
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v1 .uxr-ben-list{border-top-width:2px}
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v1 .uxr-ben-item{border-bottom-width:2px}

/* v2: 左右交互。写真の代わりに層を重ねた図形と番号見出しでリズムを作り、狭い幅では素直に縦へ積む */
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-list{display:grid;gap:28px}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item{display:grid;gap:16px;align-items:center}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-visual{position:relative;display:grid;place-items:center;min-height:136px;padding:22px;border-radius:var(--uxr-radius);background:linear-gradient(135deg,var(--uxr-accent-soft) 0%,var(--uxr-surface) 100%);border:var(--uxr-card-border);overflow:hidden}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-visual::before{content:"";position:absolute;right:-24px;bottom:-28px;width:128px;height:128px;border-radius:50%;background:var(--uxr-accent-soft);border:1px solid var(--uxr-accent-line);opacity:.85;pointer-events:none}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-visual::after{content:"";position:absolute;left:12px;top:16px;bottom:16px;width:4px;border-radius:999px;background:var(--uxr-accent);pointer-events:none}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-emblem{position:relative;z-index:1;display:grid;place-items:center;width:64px;height:64px;border-radius:var(--uxr-radius-sm);background:var(--uxr-surface);border:var(--uxr-card-border);box-shadow:var(--uxr-shadow);color:var(--uxr-accent-text)}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-emblem .uxr-ico{width:30px;height:30px}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-tag{position:absolute;left:26px;top:14px;z-index:1;display:inline-flex;align-items:center;gap:8px;font-family:var(--uxr-font-head);font-size:.8125rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.08em;color:var(--uxr-accent-text)}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-tag::after{content:"";display:inline-block;width:18px;height:1px;background:var(--uxr-accent-line)}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-body{display:grid;gap:8px}
.uxr-page .uxr-benefits.uxr-v2 .uxr-ben-title{font-size:1.1875rem}
.uxr-page[data-theme="crisp"] .uxr-benefits.uxr-v2 .uxr-ben-visual::before{border-radius:var(--uxr-radius-sm);width:92px;height:92px;right:-16px;bottom:-16px}
.uxr-page[data-theme="crisp"] .uxr-benefits.uxr-v2 .uxr-ben-visual::after{left:0;top:0;bottom:0;border-radius:0}
.uxr-page[data-theme="crisp"] .uxr-benefits.uxr-v2 .uxr-ben-tag{left:18px}
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v2 .uxr-ben-visual{background:var(--uxr-accent-soft);box-shadow:var(--uxr-shadow)}
.uxr-page[data-theme="lively"] .uxr-benefits.uxr-v2 .uxr-ben-visual::before{background:var(--uxr-surface);border:2px solid var(--uxr-ink);opacity:1}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v2 .uxr-ben-visual{background:var(--uxr-surface);border-color:var(--uxr-line)}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v2 .uxr-ben-visual::before{inset:10px;width:auto;height:auto;right:10px;bottom:10px;border-radius:0;background:none;border:1px solid var(--uxr-accent-line);opacity:1}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v2 .uxr-ben-visual::after{display:none}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v2 .uxr-ben-tag{left:18px}
.uxr-page[data-theme="calm"] .uxr-benefits.uxr-v2 .uxr-ben-emblem{background:var(--uxr-surface2);border-color:var(--uxr-accent-line);box-shadow:none}

@container uxr (min-width:600px){
  /* 2件は2列、3件は3列、4件は2×2に組むことで1件だけ取り残される崩れを防ぐ */
  .uxr-page .uxr-benefits.uxr-v0 .uxr-ben-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))}
  .uxr-page .uxr-benefits.uxr-v0 .uxr-ben-list:has(>:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
  .uxr-page .uxr-benefits.uxr-v1 .uxr-ben-item{grid-template-columns:76px minmax(0,1fr);gap:24px;padding:26px 0}
  .uxr-page .uxr-benefits.uxr-v2 .uxr-ben-list{gap:36px}
  .uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:32px}
  .uxr-page .uxr-benefits.uxr-v2 .uxr-ben-visual{min-height:176px}
  .uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item:nth-child(even) .uxr-ben-visual{order:2}
  .uxr-page .uxr-benefits.uxr-v2 .uxr-ben-item:nth-child(even) .uxr-ben-body{order:1}
}
`;

export function render(block, ctx) {
  const v = block.variant;
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const entries = each(ctx, block, 'items');
  const rows = entries.map(({ i }, idx) => {
    const title = txt(ctx, block, `items.${i}.title`, { tag: 'h3', cls: 'uxr-h3 uxr-ben-title' });
    const text = multi(ctx, block, `items.${i}.text`, { cls: 'uxr-ben-text' });
    if (!title && !text) return '';
    const body = `<div class="uxr-ben-body">${title}${text}</div>`;
    const num = String(idx + 1).padStart(2, '0');
    const iconName = BENEFIT_ICONS[idx % BENEFIT_ICONS.length];
    if (v === 1) {
      return `<li class="uxr-ben-item"><span class="uxr-ben-num" aria-hidden="true">${num}</span>${body}</li>`;
    }
    if (v === 2) {
      return `<li class="uxr-ben-item"><div class="uxr-ben-visual" aria-hidden="true"><span class="uxr-ben-tag">${num}</span><span class="uxr-ben-emblem">${ico(iconName)}</span></div>${body}</li>`;
    }
    return `<li class="uxr-ben-item"><span class="uxr-ico-badge" aria-hidden="true">${ico(iconName)}</span>${body}</li>`;
  }).filter(Boolean).join('');
  const tag = v === 1 ? 'ol' : 'ul';
  const list = rows ? `<${tag} class="uxr-ben-list">${rows}</${tag}>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
