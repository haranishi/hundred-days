// 行動ボタン（cta）。見本として親が作り込んだ部品。担当B2が、同じ型のまま磨いてよい。
import { btn, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-cta .uxr-h2{margin:0}
.uxr-page .uxr-cta .uxr-cta-text{margin:0}
.uxr-page .uxr-cta .uxr-note{margin:0}

.uxr-page .uxr-cta.uxr-v0{background:var(--uxr-accent);color:var(--uxr-accent-ink)}
.uxr-page .uxr-cta.uxr-v0 .uxr-inner{display:grid;justify-items:center;gap:14px;text-align:center}
.uxr-page .uxr-cta.uxr-v0 .uxr-h2,.uxr-page .uxr-cta.uxr-v0 .uxr-cta-text,.uxr-page .uxr-cta.uxr-v0 .uxr-note{color:var(--uxr-accent-ink)}
.uxr-page .uxr-cta.uxr-v0 .uxr-btn{margin-top:8px;min-width:min(100%,280px)}

.uxr-page .uxr-cta.uxr-v1 .uxr-cta-card{display:grid;gap:18px;padding:28px 24px;background:var(--uxr-surface);border:var(--uxr-card-border);border-left:8px solid var(--uxr-accent);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-text{color:var(--uxr-muted)}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-side{display:grid;gap:8px;justify-items:start}

@container uxr (min-width:640px){
  .uxr-page .uxr-cta.uxr-v1 .uxr-cta-card{grid-template-columns:1fr auto;align-items:center;gap:28px;padding:34px 36px}
  .uxr-page .uxr-cta.uxr-v1 .uxr-cta-side{justify-items:center}
}
`;

export function render(block, ctx) {
  const title = txt(ctx, block, 'title', { tag: 'h2', cls: 'uxr-h2' });
  const text = multi(ctx, block, 'text', { cls: 'uxr-cta-text' });
  const note = txt(ctx, block, 'note', { tag: 'p', cls: 'uxr-note' });
  if (block.variant === 1) {
    const button = btn(ctx, block, 'button');
    return sec(ctx, block, `<div class="uxr-cta-card"><div class="uxr-cta-main">${title}${text}</div><div class="uxr-cta-side">${button}${note}</div></div>`);
  }
  return sec(ctx, block, `${title}${text}${btn(ctx, block, 'button', { inverse: true })}${note}`);
}
