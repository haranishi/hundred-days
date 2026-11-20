// 場所・営業時間（access）。v0=ピン見出し＋項目名チップのカード、v1=区切り線のシンプルな定義リスト。地図は外部通信になるため置かない。
import { each, ico, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-access:has(> .uxr-inner:empty){display:none}
/* v0: ピン印の見出しと、項目名をチップで際立たせたカード */
.uxr-page .uxr-access.uxr-v0 .uxr-acc-head{display:flex;align-items:center;gap:12px;margin-bottom:var(--uxr-h2-gap)}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-head .uxr-h2{margin:0}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-pin{width:40px;height:40px;border-radius:50%}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-pin .uxr-ico{width:20px;height:20px}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-dl{display:grid}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-row{display:grid;gap:8px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent);align-items:baseline}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-row:first-child{padding-top:0}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-row:last-child{padding-bottom:0;border-bottom:0}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-dt{display:flex;align-items:center}
.uxr-page .uxr-access.uxr-v0 .uxr-acc-dd{color:var(--uxr-ink);line-height:1.65;min-width:0}

/* v1: 枠を省き、細い横線だけで整える静かな店舗情報 */
.uxr-page .uxr-access.uxr-v1 .uxr-acc-simple{display:grid;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent)}
.uxr-page .uxr-access.uxr-v1 .uxr-acc-srow{display:grid;gap:4px;padding:15px 0;border-bottom:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent);align-items:baseline}
.uxr-page .uxr-access.uxr-v1 .uxr-acc-sdt{font-size:.875rem;font-weight:700;color:var(--uxr-muted);letter-spacing:.02em}
.uxr-page .uxr-access.uxr-v1 .uxr-acc-sdd{color:var(--uxr-ink);line-height:1.65;min-width:0}

.uxr-page[data-theme="lively"] .uxr-access.uxr-v0 .uxr-acc-pin{border:2px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-access.uxr-v0 .uxr-chip{border:1.5px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-access.uxr-v0 .uxr-acc-pin{border:1px solid var(--uxr-accent-line)}

@container uxr (min-width:540px){
  .uxr-page .uxr-access.uxr-v0 .uxr-acc-row{grid-template-columns:minmax(7.5em,10.5em) minmax(0,1fr);gap:16px}
  .uxr-page .uxr-access.uxr-v1 .uxr-acc-srow{grid-template-columns:minmax(7.5em,10.5em) minmax(0,1fr);gap:18px}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const items = each(ctx, block, 'items');

  if (block.variant === 1) {
    const rows = items.map(({ i }) => {
      const label = txt(ctx, block, `items.${i}.label`);
      const value = txt(ctx, block, `items.${i}.value`);
      const dt = label ? `<dt class="uxr-acc-sdt">${label}</dt>` : '';
      const dd = value ? `<dd class="uxr-acc-sdd">${value}</dd>` : '';
      return dt || dd ? `<div class="uxr-acc-srow">${dt}${dd}</div>` : '';
    }).filter(Boolean).join('');
    const list = rows ? `<dl class="uxr-acc-simple">${rows}</dl>` : '';
    return sec(ctx, block, `${heading}${list}`);
  }

  const head = heading ? `<div class="uxr-acc-head"><span class="uxr-ico-badge uxr-acc-pin" aria-hidden="true">${ico('pin')}</span>${heading}</div>` : '';
  const rows = items.map(({ i }) => {
    const label = txt(ctx, block, `items.${i}.label`, { cls: 'uxr-chip' });
    const value = txt(ctx, block, `items.${i}.value`);
    const dt = label ? `<dt class="uxr-acc-dt">${label}</dt>` : '';
    const dd = value ? `<dd class="uxr-acc-dd">${value}</dd>` : '';
    return dt || dd ? `<div class="uxr-acc-row">${dt}${dd}</div>` : '';
  }).filter(Boolean).join('');
  const card = rows ? `<div class="uxr-card"><dl class="uxr-acc-dl">${rows}</dl></div>` : '';
  return sec(ctx, block, `${head}${card}`);
}
