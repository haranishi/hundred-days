// 期限・残り枠（limited）。v0=細い強調の帯、v1=小さなバッジ。real は編集用の確認項目なので描画しない。
import { ico, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-limited:has(> .uxr-inner:empty){display:none}
/* 焦らせる赤や点滅を避け、選んだ強調色で静かに状況を伝える */
.uxr-page .uxr-limited .uxr-lim-label{display:inline-flex;align-items:center;gap:5px;padding:.22em .8em;border-radius:var(--uxr-radius-sm);background:var(--uxr-accent);color:var(--uxr-accent-ink);font-size:.8125rem;font-weight:700;line-height:1.45;letter-spacing:.04em}
.uxr-page .uxr-limited .uxr-lim-val{font-family:var(--uxr-font-head);font-variant-numeric:tabular-nums;font-weight:800;font-size:1.25rem;line-height:1.25;color:var(--uxr-accent-text)}

/* v0: ページのリズムを作る細身の帯 */
.uxr-page .uxr-limited.uxr-v0{background:var(--uxr-accent-soft);border-top:1px solid var(--uxr-accent-line);border-bottom:1px solid var(--uxr-accent-line)}
.uxr-page .uxr-limited.uxr-v0 .uxr-inner{padding-block:22px}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-main{flex:1 1 200px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;min-width:0}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-text{font-weight:600;color:var(--uxr-ink);min-width:0}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-val-box{display:inline-flex;align-items:center;padding:5px 14px;border-radius:var(--uxr-radius-sm);background:var(--uxr-surface);border:1px solid var(--uxr-accent-line)}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-note{margin-top:8px}

/* v1: さりげなく添えるコンパクトなバッジ */
.uxr-page .uxr-limited.uxr-v1 .uxr-inner{padding-block:24px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-badge{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 12px;max-width:100%;padding:10px 18px;border-radius:var(--uxr-radius);background:var(--uxr-surface);border:var(--uxr-card-border);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-ico{width:18px;height:18px;color:var(--uxr-accent-text)}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-text{font-size:.9375rem;color:var(--uxr-ink)}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-val{font-size:1.125rem}

.uxr-page[data-theme="soft"] .uxr-limited .uxr-lim-label{border-radius:999px}
.uxr-page[data-theme="lively"] .uxr-limited.uxr-v0{border-block:1px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-limited.uxr-v0 .uxr-lim-val-box{border:2px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-limited .uxr-lim-label{border:1.5px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-limited .uxr-lim-val{font-weight:700}
`;

export function render(block, ctx) {
  const label = txt(ctx, block, 'label', { cls: 'uxr-lim-label' });
  const text = txt(ctx, block, 'text', { cls: 'uxr-lim-text' });
  const value = txt(ctx, block, 'value', { cls: 'uxr-lim-val' });
  const note = txt(ctx, block, 'note', { tag: 'p', cls: 'uxr-note uxr-lim-note' });

  if (block.variant === 1) {
    const content = label || text || value
      ? `<div class="uxr-lim-badge">${ico('calendar', 'uxr-lim-ico')}${label}${text}${value}</div>`
      : '';
    return sec(ctx, block, `${content}${note}`);
  }

  const main = label || text ? `<div class="uxr-lim-main">${label}${text}</div>` : '';
  const valBox = value ? `<div class="uxr-lim-val-box">${value}</div>` : '';
  const bar = main || valBox ? `<div class="uxr-lim-bar">${main}${valBox}</div>` : '';
  return sec(ctx, block, `${bar}${note}`);
}
