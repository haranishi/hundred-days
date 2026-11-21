// メニュー・料金（menu）。v0=点線でつなぐ一覧、v1=値段を大きく見せるカード。
import { each, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-menu:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-menu .uxr-menu-foot{margin-top:20px}

/* v0: お店の品書きのように名前と値段を点線でつなぎ、狭い幅でも折り返しで崩さない */
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-list{display:grid;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent)}
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-item{padding:16px 0;border-bottom:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent)}
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-name{flex:0 1 auto;min-width:0}
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-dots{flex:1 1 18px;min-width:14px;border-bottom:2px dotted color-mix(in srgb,var(--uxr-muted) 42%,transparent);transform:translateY(-4px)}
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-price{flex:0 1 auto;margin-left:auto;text-align:right;font-size:1.0625rem;color:var(--uxr-accent-text)}
.uxr-page .uxr-menu.uxr-v0 .uxr-menu-note{margin-top:6px;line-height:1.65}

/* v1: 件数が増えても崩れない自動グリッドで、値段を視線の中心に据える */
.uxr-page .uxr-menu.uxr-v1 .uxr-menu-cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.uxr-page .uxr-menu.uxr-v1 .uxr-menu-card{display:flex;flex-direction:column;gap:10px}
.uxr-page .uxr-menu.uxr-v1 .uxr-menu-card-price{font-size:clamp(1.4rem,5cqw,1.75rem);line-height:1.2;color:var(--uxr-accent-text)}
.uxr-page .uxr-menu.uxr-v1 .uxr-menu-card-note{margin-top:auto;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent);line-height:1.65}

.uxr-page[data-theme="lively"] .uxr-menu.uxr-v0 .uxr-menu-dots{border-bottom-color:color-mix(in srgb,var(--uxr-ink) 45%,transparent)}
.uxr-page[data-theme="calm"] .uxr-menu.uxr-v0 .uxr-menu-item{padding:20px 0}
.uxr-page[data-theme="calm"] .uxr-menu.uxr-v1 .uxr-menu-card-price{font-weight:700}

@container uxr (min-width:560px){
  /* 4件のとき3+1の端数にせず2×2で安定させる */
  .uxr-page .uxr-menu.uxr-v1 .uxr-menu-cards:has(> :nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const foot = txt(ctx, block, 'foot', { tag: 'p', cls: 'uxr-note uxr-menu-foot' });
  const items = each(ctx, block, 'items');

  if (block.variant === 1) {
    const cards = items.map(({ i }) => {
      const name = txt(ctx, block, `items.${i}.name`, { tag: 'h3', cls: 'uxr-h3 uxr-menu-card-name' });
      const price = txt(ctx, block, `items.${i}.price`, { tag: 'p', cls: 'uxr-price uxr-menu-card-price' });
      const note = txt(ctx, block, `items.${i}.note`, { tag: 'p', cls: 'uxr-note uxr-menu-card-note' });
      return `<li class="uxr-card uxr-menu-card">${name}${price}${note}</li>`;
    }).join('');
    const list = cards ? `<ul class="uxr-menu-cards">${cards}</ul>` : '';
    return sec(ctx, block, `${heading}${list}${foot}`);
  }

  const rows = items.map(({ i }) => {
    const name = txt(ctx, block, `items.${i}.name`, { tag: 'h3', cls: 'uxr-h3 uxr-menu-name' });
    const price = txt(ctx, block, `items.${i}.price`, { cls: 'uxr-price uxr-menu-price' });
    const note = txt(ctx, block, `items.${i}.note`, { tag: 'p', cls: 'uxr-note uxr-menu-note' });
    // 名前と値段の両方が出るときだけ点線を挟み、片方だけの項目で余計な線を出さない
    const dots = name && price ? '<i class="uxr-menu-dots" aria-hidden="true"></i>' : '';
    const row = name || price ? `<div class="uxr-menu-row">${name}${dots}${price}</div>` : '';
    return `<li class="uxr-menu-item">${row}${note}</li>`;
  }).join('');
  const list = rows ? `<ul class="uxr-menu-list">${rows}</ul>` : '';
  return sec(ctx, block, `${heading}${list}${foot}`);
}
