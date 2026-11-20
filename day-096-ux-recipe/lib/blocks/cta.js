// 行動ボタン（cta）。v0=強調色の帯、v1=左に太い線を備えたカード。4テーマで角丸と線の質を揃える。
import { btn, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-cta:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-cta .uxr-h2{margin:0}
.uxr-page .uxr-cta .uxr-cta-text{margin:0}
.uxr-page .uxr-cta .uxr-note{margin:0}

/* v0: 強調色の帯。白文字のコントラスト（4.5:1以上）を落とさないよう、明側でなく下端だけをわずかに暗くして奥行きを出す */
.uxr-page .uxr-cta.uxr-v0{background:var(--uxr-accent);background-image:linear-gradient(180deg,transparent 0%,color-mix(in srgb,#000000 10%,transparent) 100%);color:var(--uxr-accent-ink)}
.uxr-page .uxr-cta.uxr-v0 .uxr-inner{display:grid;justify-items:center;gap:14px;text-align:center}
.uxr-page .uxr-cta.uxr-v0 .uxr-h2,
.uxr-page .uxr-cta.uxr-v0 .uxr-cta-text,
.uxr-page .uxr-cta.uxr-v0 .uxr-note{color:var(--uxr-accent-ink)}
.uxr-page .uxr-cta.uxr-v0 .uxr-cta-text{max-width:34em}
.uxr-page .uxr-cta.uxr-v0 .uxr-btn{margin-top:8px;min-width:min(100%,280px)}

/* v1: 角丸や太枠と喧嘩しないよう、左の太い線は border-left でなく内側の擬似要素で描く */
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-card{position:relative;overflow:hidden;display:grid;gap:20px;padding:28px 24px 28px 32px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-card::before{content:"";position:absolute;inset:0 auto 0 0;width:8px;background:var(--uxr-accent)}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-main{display:grid;gap:10px;min-width:0}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-text{color:var(--uxr-muted)}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-side{display:grid;gap:8px;justify-items:start}
.uxr-page .uxr-cta.uxr-v1 .uxr-cta-side .uxr-btn{min-width:min(100%,200px)}

.uxr-page[data-theme="lively"] .uxr-cta.uxr-v0{border-block:1px solid var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-cta.uxr-v1 .uxr-cta-card::before{width:10px;border-right:2px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-cta.uxr-v1 .uxr-cta-card::before{width:5px}

@container uxr (min-width:640px){
  .uxr-page .uxr-cta.uxr-v1 .uxr-cta-card{grid-template-columns:1fr auto;align-items:center;gap:28px;padding:34px 36px 34px 44px}
  .uxr-page .uxr-cta.uxr-v1 .uxr-cta-side{justify-items:center;text-align:center}
}
`;

export function render(block, ctx) {
  const title = txt(ctx, block, 'title', { tag: 'h2', cls: 'uxr-h2' });
  const text = multi(ctx, block, 'text', { cls: 'uxr-cta-text' });
  const note = txt(ctx, block, 'note', { tag: 'p', cls: 'uxr-note' });

  if (block.variant === 1) {
    const button = btn(ctx, block, 'button');
    const main = title || text ? `<div class="uxr-cta-main">${title}${text}</div>` : '';
    const side = button || note ? `<div class="uxr-cta-side">${button}${note}</div>` : '';
    const card = main || side ? `<div class="uxr-cta-card">${main}${side}</div>` : '';
    return sec(ctx, block, card);
  }
  return sec(ctx, block, `${title}${text}${btn(ctx, block, 'button', { inverse: true })}${note}`);
}
