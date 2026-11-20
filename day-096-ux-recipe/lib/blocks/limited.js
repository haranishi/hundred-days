// 期限・残り枠（limited）。v0=細い強調の帯、v1=小さなバッジ。real は編集用の確認項目なので描画しない。
import { ico, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-limited:has(> .uxr-inner:empty){display:none}
/* 焦らせる赤や点滅を避け、選んだ強調色で静かに状況を伝える */
.uxr-page .uxr-limited .uxr-lim-label{color:var(--uxr-ink);font-size:.9375rem;font-weight:700;line-height:1.45}
.uxr-page .uxr-limited .uxr-lim-val{display:inline-block;max-width:100%;padding:5px 14px;border:0;border-radius:var(--uxr-radius-sm);background:var(--uxr-accent);color:var(--uxr-accent-ink);font-family:var(--uxr-font-head);font-variant-numeric:tabular-nums;font-weight:800;font-size:1.25rem;line-height:1.25}

/* v0: ページのリズムを作る細身の帯 */
.uxr-page .uxr-limited.uxr-v0{background:var(--uxr-accent-soft);border-top:1px solid var(--uxr-accent-line);border-bottom:1px solid var(--uxr-accent-line)}
.uxr-page .uxr-limited.uxr-v0 .uxr-inner{padding-block:22px}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-text{font-weight:600;color:var(--uxr-ink);min-width:0}
.uxr-page .uxr-limited.uxr-v0 .uxr-lim-note{margin-top:8px}

/* v1: さりげなく添えるコンパクトなバッジ */
.uxr-page .uxr-limited.uxr-v1 .uxr-inner{padding-block:24px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-badge{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 12px;max-width:100%;padding:10px 18px;border-radius:var(--uxr-radius);background:var(--uxr-surface);border:var(--uxr-card-border);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-caption{display:inline-flex;align-items:center;gap:8px}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-ico{width:18px;height:18px;color:var(--uxr-accent-text)}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-text{font-size:.9375rem;color:var(--uxr-ink)}
.uxr-page .uxr-limited.uxr-v1 .uxr-lim-val{font-size:1.125rem}

.uxr-page[data-theme="lively"] .uxr-limited.uxr-v0{background:var(--uxr-bg);border-block:2px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-limited .uxr-lim-val{box-shadow:3px 3px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-limited .uxr-lim-val{font-weight:700}

@container uxr (max-width:480px){
  .uxr-page .uxr-limited.uxr-v0 .uxr-lim-bar,
  .uxr-page .uxr-limited.uxr-v1 .uxr-lim-badge{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
  .uxr-page .uxr-limited .uxr-lim-main{display:contents}
  .uxr-page .uxr-limited.uxr-v0 .uxr-lim-label,
  .uxr-page .uxr-limited.uxr-v0 .uxr-lim-val{justify-self:start;max-width:100%}
  .uxr-page .uxr-limited.uxr-v1 .uxr-lim-badge{width:100%;justify-items:center}
  .uxr-page .uxr-limited .uxr-lim-text{order:1;justify-self:stretch}
}
@container uxr (min-width:480px){
  .uxr-page .uxr-limited .uxr-lim-main{display:inline-flex;align-items:center;gap:8px;max-width:100%}
}
@container uxr (min-width:720px){
  .uxr-page[data-theme="lively"] .uxr-limited.uxr-v0 .uxr-lim-text{flex-basis:100%}
}
`;

export function render(block, ctx) {
  const label = txt(ctx, block, 'label', { cls: 'uxr-lim-label' });
  const text = txt(ctx, block, 'text', { cls: 'uxr-lim-text' });
  const value = txt(ctx, block, 'value', { cls: 'uxr-lim-val' });
  const note = txt(ctx, block, 'note', { tag: 'p', cls: 'uxr-note uxr-lim-note' });

  const badge = block.variant === 1;
  const caption = label && badge
    ? `<span class="uxr-lim-caption">${ico('calendar', 'uxr-lim-ico')}${label}</span>` : label;
  const main = caption || value ? `<div class="uxr-lim-main">${caption}${value}</div>` : '';
  const layout = badge ? 'uxr-lim-badge' : 'uxr-lim-bar';
  const content = main || text ? `<div class="${layout}">${main}${text}</div>` : '';
  return sec(ctx, block, `${content}${note}`);
}
