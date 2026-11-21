// フッター（footer）。標準の1種。濃い地に反転させてページの結びを引き締める。リンク名は装飾テキストとして出す。
import { each, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-footer:has(> .uxr-inner:empty){display:none}
/* 濃い地（--uxr-ink）に薄い文字（--uxr-bg）で、全4テーマで高いコントラストと落ち着いた締めを作る */
.uxr-page .uxr-footer{background:var(--uxr-ink);color:var(--uxr-bg);border-top:3px solid var(--uxr-accent)}
.uxr-page .uxr-footer .uxr-inner{padding-block:44px 48px;display:grid;gap:20px}
.uxr-page .uxr-footer .uxr-foot-top{display:grid;gap:12px}
/* 仕切り線は本文の行長制限（max-width）に縛られず全幅で引き、左右の整列感を保つ */
.uxr-page .uxr-footer .uxr-foot-top.has-sep{padding-bottom:18px;border-bottom:1px solid color-mix(in srgb,var(--uxr-bg) 20%,var(--uxr-ink))}
.uxr-page .uxr-footer .uxr-foot-brand{display:flex;align-items:center;gap:10px;min-width:0}
.uxr-page .uxr-footer .uxr-foot-dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--uxr-accent)}
.uxr-page .uxr-footer .uxr-foot-name{font-family:var(--uxr-font-head);font-weight:var(--uxr-head-weight);font-size:1.0625rem;letter-spacing:.03em;color:var(--uxr-bg)}
.uxr-page .uxr-footer .uxr-foot-links{display:grid;gap:4px;font-size:max(14px,.875rem);line-height:1.6;color:color-mix(in srgb,var(--uxr-bg) 86%,var(--uxr-ink))}
.uxr-page .uxr-footer .uxr-foot-link{letter-spacing:.02em}
.uxr-page .uxr-footer .uxr-foot-text{line-height:1.7;color:var(--uxr-bg);max-width:48em}

.uxr-page[data-theme="calm"] .uxr-footer{border-top-width:2px}
.uxr-page[data-theme="calm"] .uxr-footer .uxr-foot-name{letter-spacing:.08em}

@container uxr (min-width:720px){
  .uxr-page .uxr-footer .uxr-inner{padding-block:56px 64px;gap:22px}
  .uxr-page .uxr-footer .uxr-foot-top{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:14px 28px}
}
`;

export function render(block, ctx) {
  const name = txt(ctx, block, 'name', { cls: 'uxr-foot-name' });
  const brand = name ? `<div class="uxr-foot-brand"><i class="uxr-foot-dot" aria-hidden="true"></i>${name}</div>` : '';
  const linkItems = each(ctx, block, 'items').map(({ i }) => {
    const label = txt(ctx, block, `items.${i}.text`, { cls: 'uxr-foot-link' });
    return label ? `<li>${label}</li>` : '';
  }).filter(Boolean).join('');
  const links = linkItems ? `<ul class="uxr-foot-links">${linkItems}</ul>` : '';
  const text = multi(ctx, block, 'text', { cls: 'uxr-note uxr-foot-text' });
  const top = brand || links ? `<div class="uxr-foot-top${text ? ' has-sep' : ''}">${brand}${links}</div>` : '';
  return sec(ctx, block, `${top}${text}`);
}
