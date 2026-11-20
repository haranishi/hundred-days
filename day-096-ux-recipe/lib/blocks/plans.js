// 料金プラン（plans）。v0=広い幅で2〜4列の横ならび、v1=1行1プランの縦ならび。
import { each, esc, ico, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-plans:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-plans .uxr-plan-grid{display:grid;gap:18px;align-items:stretch}
.uxr-page .uxr-plans .uxr-plan{position:relative;display:flex;flex-direction:column;gap:14px;overflow:hidden}
/* おすすめは色だけでなくリボンと太い枠で区別し、全件オンでも重ならない内側帯にする */
.uxr-page .uxr-plans .uxr-plan.is-pick{border:2px solid var(--uxr-accent)}
.uxr-page .uxr-plans .uxr-plan-ribbon{display:flex;align-items:center;justify-content:center;gap:6px;margin:-22px -22px 4px;padding:8px 16px;background:var(--uxr-accent);color:var(--uxr-accent-ink);font-size:.8125rem;font-weight:700;letter-spacing:.06em}
.uxr-page .uxr-plans .uxr-plan-ribbon .uxr-ico{width:15px;height:15px}
.uxr-page .uxr-plans .uxr-plan-head{display:grid;gap:6px}
.uxr-page .uxr-plans .uxr-plan-price{font-size:clamp(1.45rem,5.2cqw,1.85rem);line-height:1.2;color:var(--uxr-accent-text)}
.uxr-page .uxr-plans .uxr-plan-note{font-size:.875rem;line-height:1.6;color:var(--uxr-muted)}
.uxr-page .uxr-plans .uxr-plan-lines{display:grid;gap:8px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent);font-size:.9375rem;line-height:1.6}
.uxr-page .uxr-plans .uxr-plan-lines li{display:flex;align-items:flex-start;gap:8px}
.uxr-page .uxr-plans .uxr-plan-ck{width:1.15em;height:1.15em;margin-top:.22em;color:var(--uxr-accent-text)}
.uxr-page .uxr-plans .uxr-plan-empty{padding-top:14px;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent);font-size:.875rem;color:var(--uxr-muted)}

/* にぎやかテーマではおすすめ帯の下にも黒い区切りを入れ、枠の調子を揃える */
.uxr-page[data-theme="lively"] .uxr-plans .uxr-plan.is-pick{border-color:var(--uxr-ink);box-shadow:5px 5px 0 var(--uxr-accent)}
.uxr-page[data-theme="lively"] .uxr-plans .uxr-plan-ribbon{border-bottom:2px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-plans .uxr-plan-ribbon{letter-spacing:.12em}
.uxr-page[data-theme="calm"] .uxr-plans .uxr-plan-price{font-weight:700}

@container uxr (min-width:600px){
  .uxr-page .uxr-plans.uxr-v0 .uxr-plan-grid{grid-template-columns:repeat(auto-fit,minmax(185px,1fr))}
  /* v1 は広い幅で左に名前と値段、右に箇条書きを並べて1行1プランを読みやすくする */
  .uxr-page .uxr-plans.uxr-v1 .uxr-plan-body{display:grid;grid-template-columns:minmax(180px,.85fr) 1.15fr;gap:24px;align-items:start}
  .uxr-page .uxr-plans.uxr-v1 .uxr-plan-lines,
  .uxr-page .uxr-plans.uxr-v1 .uxr-plan-empty{padding-top:0;padding-left:22px;border-top:0;border-left:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent)}
}
@container uxr (min-width:600px) and (max-width:859px){
  /* 中間幅（768px 等）で4件が3+1の端数にならないよう2×2に組む */
  .uxr-page .uxr-plans.uxr-v0 .uxr-plan-grid:has(> :nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;

function renderLines(ctx, block, i, raw) {
  const rows = String(raw ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!rows.length) {
    // 編集中は空の「含まれるもの」も押して編集できるよう、txt で目印を残す
    return ctx.mode === 'preview' ? txt(ctx, block, `items.${i}.lines`, { tag: 'p', cls: 'uxr-plan-empty' }) : '';
  }
  const dp = ctx.mode === 'preview' ? ` data-path="items.${i}.lines"` : '';
  const lis = rows.map((line) => `<li>${ico('check', 'uxr-plan-ck')}<span>${esc(line)}</span></li>`).join('');
  return `<ul class="uxr-plan-lines"${dp}>${lis}</ul>`;
}

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const items = each(ctx, block, 'items');
  const cards = items.map(({ item, i }) => {
    const ribbon = item.pick ? `<div class="uxr-plan-ribbon">${ico('star')}<span>おすすめ</span></div>` : '';
    const name = txt(ctx, block, `items.${i}.name`, { tag: 'h3', cls: 'uxr-h3 uxr-plan-name' });
    const price = txt(ctx, block, `items.${i}.price`, { tag: 'p', cls: 'uxr-price uxr-plan-price' });
    const note = txt(ctx, block, `items.${i}.note`, { tag: 'p', cls: 'uxr-plan-note' });
    const head = name || price || note ? `<div class="uxr-plan-head">${name}${price}${note}</div>` : '';
    const lines = renderLines(ctx, block, i, item.lines);
    const body = block.variant === 1
      ? (head || lines ? `<div class="uxr-plan-body">${head}${lines}</div>` : '')
      : `${head}${lines}`;
    return `<li class="uxr-card uxr-plan${item.pick ? ' is-pick' : ''}">${ribbon}${body}</li>`;
  }).join('');
  const list = cards ? `<ul class="uxr-plan-grid">${cards}</ul>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
