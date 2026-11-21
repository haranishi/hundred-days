// 比較（compare）。v0=左を強調した比較表（table-layout:fixed）、v1=✓と—の2列リスト。
import { each, ico, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-compare:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-compare .uxr-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

/* v0: 狭い幅でも横スクロールさせない固定レイアウトの比較表 */
.uxr-page .uxr-compare.uxr-v0 .uxr-cmp-wrap{background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow);overflow:hidden}
.uxr-page .uxr-compare.uxr-v0 .uxr-cmp-table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:.875rem;line-height:1.55}
.uxr-page .uxr-compare.uxr-v0 .uxr-cmp-col-label{width:26%}
.uxr-page .uxr-compare.uxr-v0 th,
.uxr-page .uxr-compare.uxr-v0 td{padding:12px 9px;text-align:left;vertical-align:top;text-wrap:balance;word-break:auto-phrase;border-bottom:1px solid color-mix(in srgb,var(--uxr-line) 70%,transparent)}
.uxr-page .uxr-compare.uxr-v0 tbody tr:last-child th,
.uxr-page .uxr-compare.uxr-v0 tbody tr:last-child td{border-bottom:0}
.uxr-page .uxr-compare.uxr-v0 thead th{font-family:var(--uxr-font-head);font-weight:var(--uxr-head-weight);text-align:center;vertical-align:middle}
.uxr-page .uxr-compare.uxr-v0 .uxr-cmp-corner{background:var(--uxr-surface2)}
.uxr-page .uxr-compare.uxr-v0 thead .uxr-cmp-ours{background:var(--uxr-accent);color:var(--uxr-accent-ink)}
.uxr-page .uxr-compare.uxr-v0 thead .uxr-cmp-other{background:var(--uxr-surface2);color:var(--uxr-muted)}
.uxr-page .uxr-compare.uxr-v0 tbody th{font-weight:700;color:var(--uxr-ink);background:var(--uxr-surface)}
.uxr-page .uxr-compare.uxr-v0 tbody .uxr-cmp-ours{background:var(--uxr-accent-soft);color:var(--uxr-accent-text);font-weight:700;text-align:center}
.uxr-page .uxr-compare.uxr-v0 tbody .uxr-cmp-other{background:var(--uxr-surface);color:var(--uxr-muted);text-align:center}

/* v1: 左（✓）と右（—）の2列リストで違いを記号ごと伝える */
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-cols{display:grid;gap:16px}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-card{display:flex;flex-direction:column;gap:14px;overflow:hidden}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-card--ours{border:2px solid var(--uxr-accent)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-head{margin:-22px -22px 2px;padding:13px 22px;font-size:1.0625rem}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-card--ours .uxr-cmp-head{background:var(--uxr-accent);color:var(--uxr-accent-ink)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-card--other .uxr-cmp-head{background:var(--uxr-surface2);color:var(--uxr-muted);border-bottom:1px solid color-mix(in srgb,var(--uxr-line) 70%,transparent)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-list{display:grid;gap:12px}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-row{display:flex;align-items:flex-start;gap:10px;padding-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--uxr-line) 55%,transparent)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-row:last-child{padding-bottom:0;border-bottom:0}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-mark{flex:none;display:inline-grid;place-items:center;width:24px;height:24px;margin-top:1px;border-radius:50%;font-style:normal}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-mark--yes{background:var(--uxr-accent-soft);color:var(--uxr-accent-text)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-mark--yes .uxr-ico{width:15px;height:15px}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-mark--no{background:var(--uxr-surface2);color:var(--uxr-muted);font-weight:700;font-size:.875rem;line-height:1}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-meta{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 10px}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-k{font-size:.875rem;color:var(--uxr-muted)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-v{font-weight:700;color:var(--uxr-ink)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-card--ours .uxr-cmp-v{color:var(--uxr-accent-text)}
.uxr-page .uxr-compare.uxr-v1 .uxr-cmp-card--other .uxr-cmp-v{color:var(--uxr-muted);font-weight:500}

.uxr-page[data-theme="lively"] .uxr-compare.uxr-v1 .uxr-cmp-card--ours{border-color:var(--uxr-ink);box-shadow:5px 5px 0 var(--uxr-accent)}
.uxr-page[data-theme="lively"] .uxr-compare.uxr-v1 .uxr-cmp-head{border-bottom:2px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-compare.uxr-v1 .uxr-cmp-mark{border:1.5px solid var(--uxr-ink)}

/* 固定表では見出し列にだけ幅を与え、両側の値を常に同じ幅で読めるようにする。 */
@container uxr (max-width:336px){
  .uxr-page .uxr-compare.uxr-v0 .uxr-cmp-col-label{width:5.5em}
}
@container uxr (max-width:420px){
  .uxr-page .uxr-compare.uxr-v0 th,
  .uxr-page .uxr-compare.uxr-v0 td{padding:10px 6px}
}
@container uxr (min-width:560px){
  .uxr-page .uxr-compare.uxr-v0 .uxr-cmp-table{font-size:.9375rem}
  .uxr-page .uxr-compare.uxr-v0 .uxr-cmp-col-label{width:9em}
  .uxr-page .uxr-compare.uxr-v0 th,
  .uxr-page .uxr-compare.uxr-v0 td{padding:14px 16px}
  .uxr-page .uxr-compare.uxr-v1 .uxr-cmp-cols{grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const leftName = txt(ctx, block, 'leftName');
  const rightName = txt(ctx, block, 'rightName');
  const items = each(ctx, block, 'items');

  if (block.variant === 1) {
    const oursRows = items.map(({ i }) => {
      const label = txt(ctx, block, `items.${i}.label`, { cls: 'uxr-cmp-k' });
      const val = txt(ctx, block, `items.${i}.left`, { cls: 'uxr-cmp-v' });
      if (!label && !val) return '';
      return `<li class="uxr-cmp-row"><i class="uxr-cmp-mark uxr-cmp-mark--yes" aria-hidden="true">${ico('check')}</i><div class="uxr-cmp-meta">${label}${val}</div></li>`;
    }).filter(Boolean).join('');
    const otherRows = items.map(({ i }) => {
      const label = txt(ctx, block, `items.${i}.label`, { cls: 'uxr-cmp-k' });
      const val = txt(ctx, block, `items.${i}.right`, { cls: 'uxr-cmp-v' });
      if (!label && !val) return '';
      return `<li class="uxr-cmp-row"><i class="uxr-cmp-mark uxr-cmp-mark--no" aria-hidden="true">—</i><div class="uxr-cmp-meta">${label}${val}</div></li>`;
    }).filter(Boolean).join('');

    const leftHead = leftName ? `<h3 class="uxr-h3 uxr-cmp-head">${leftName}</h3>` : '';
    const rightHead = rightName ? `<h3 class="uxr-h3 uxr-cmp-head">${rightName}</h3>` : '';
    const oursCard = leftHead || oursRows
      ? `<div class="uxr-card uxr-cmp-card uxr-cmp-card--ours">${leftHead}${oursRows ? `<ul class="uxr-cmp-list">${oursRows}</ul>` : ''}</div>`
      : '';
    const otherCard = rightHead || otherRows
      ? `<div class="uxr-card uxr-cmp-card uxr-cmp-card--other">${rightHead}${otherRows ? `<ul class="uxr-cmp-list">${otherRows}</ul>` : ''}</div>`
      : '';
    const cols = oursCard || otherCard ? `<div class="uxr-cmp-cols">${oursCard}${otherCard}</div>` : '';
    return sec(ctx, block, `${heading}${cols}`);
  }

  const bodyRows = items.map(({ i }) => {
    const label = txt(ctx, block, `items.${i}.label`);
    const left = txt(ctx, block, `items.${i}.left`);
    const right = txt(ctx, block, `items.${i}.right`);
    return `<tr><th scope="row">${label}</th><td class="uxr-cmp-ours">${left}</td><td class="uxr-cmp-other">${right}</td></tr>`;
  }).join('');
  const hasTable = leftName || rightName || bodyRows;
  const table = hasTable
    ? `<div class="uxr-cmp-wrap"><table class="uxr-cmp-table"><colgroup><col class="uxr-cmp-col-label" /><col span="2" /></colgroup><thead><tr><th scope="col" class="uxr-cmp-corner"><span class="uxr-sr">項目</span></th><th scope="col" class="uxr-cmp-ours">${leftName}</th><th scope="col" class="uxr-cmp-other">${rightName}</th></tr></thead>${bodyRows ? `<tbody>${bodyRows}</tbody>` : ''}</table></div>`
    : '';
  return sec(ctx, block, `${heading}${table}`);
}
