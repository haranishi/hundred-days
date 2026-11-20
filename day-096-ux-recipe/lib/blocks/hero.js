// ファーストビュー（hero）。見本として親が作り込んだ部品。担当B1が、同じ型のまま磨いてよい。
// 型: render(block, ctx) → HTML文字列 ／ css → `.uxr-page` の中だけの規則。トークン（--uxr-*）と基本部品（.uxr-btn など）を使う。
import { btn, ico, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-hero{overflow:hidden;isolation:isolate}
.uxr-page .uxr-hero .uxr-inner{padding-top:calc(var(--uxr-pad-y)*.85);padding-bottom:var(--uxr-pad-y)}
.uxr-page .uxr-hero .uxr-h1{margin:14px 0 16px}
.uxr-page .uxr-hero .uxr-lead{max-width:36em}
.uxr-page .uxr-hero .uxr-actions{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:28px}
.uxr-page .uxr-hero .uxr-note{margin:0}

.uxr-page .uxr-hero.uxr-v0::before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(90% 70% at 50% -12%,var(--uxr-accent-soft),transparent 72%)}
.uxr-page .uxr-hero.uxr-v0 .uxr-inner{text-align:center}
.uxr-page .uxr-hero.uxr-v0 .uxr-lead{margin-inline:auto}
.uxr-page .uxr-hero.uxr-v0 .uxr-actions{align-items:center}

.uxr-page .uxr-hero.uxr-v1 .uxr-hero-grid{display:grid;gap:30px;align-items:center}
.uxr-page .uxr-hero.uxr-v1 .uxr-art{position:relative;height:176px;width:100%;max-width:340px}
.uxr-page .uxr-hero.uxr-v1 .uxr-art i{position:absolute;display:block;border-radius:var(--uxr-radius)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .a{inset:10% 26% 16% 0;background:var(--uxr-accent);transform:rotate(-3deg)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .b{inset:30% 0 0 34%;background:var(--uxr-accent-soft);border:var(--uxr-card-border)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .c{inset:0 50% 56% 38%;background:var(--uxr-surface);border:var(--uxr-card-border);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art-ico{position:absolute;left:11%;top:34%;color:var(--uxr-accent-ink)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art-ico .uxr-ico{width:38px;height:38px}

.uxr-page .uxr-hero.uxr-v2 .uxr-inner{border-top:8px solid var(--uxr-accent);padding-top:calc(var(--uxr-pad-y)*.7)}
.uxr-page .uxr-hero.uxr-v2 .uxr-eyebrow::before{content:"";display:inline-block;width:28px;height:2px;margin-right:10px;vertical-align:middle;background:var(--uxr-accent)}
.uxr-page .uxr-hero.uxr-v2 .uxr-h1{display:inline;font-size:clamp(2.1rem,10cqw,3.9rem);line-height:1.3;background:linear-gradient(transparent 62%,var(--uxr-accent-soft) 62%);-webkit-box-decoration-break:clone;box-decoration-break:clone}
.uxr-page .uxr-hero.uxr-v2 .uxr-h1wrap{margin:16px 0 18px}
.uxr-page .uxr-hero.uxr-v2 .uxr-actions .uxr-btn{width:100%}

@container uxr (min-width:640px){
  .uxr-page .uxr-hero.uxr-v1 .uxr-hero-grid{grid-template-columns:1.2fr .8fr}
  .uxr-page .uxr-hero.uxr-v1 .uxr-art{height:280px;max-width:none}
  .uxr-page .uxr-hero.uxr-v2 .uxr-actions .uxr-btn{width:auto}
}
`;

export function render(block, ctx) {
  const v = block.variant;
  const eyebrow = txt(ctx, block, 'eyebrow', { cls: v === 0 ? 'uxr-chip' : 'uxr-eyebrow' });
  const title = txt(ctx, block, 'title', { tag: 'h1', cls: 'uxr-h1' });
  const lead = multi(ctx, block, 'lead', { cls: 'uxr-lead' });
  const cta = btn(ctx, block, 'cta');
  const note = txt(ctx, block, 'note', { tag: 'p', cls: 'uxr-note' });
  const actions = cta || note ? `<div class="uxr-actions">${cta}${note}</div>` : '';
  const head = v === 2 ? `${eyebrow}<div class="uxr-h1wrap">${title}</div>` : `${eyebrow}${title}`;
  const text = `<div class="uxr-hero-text">${head}${lead}${actions}</div>`;
  if (v === 1) {
    const art = `<div class="uxr-art" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i><span class="uxr-art-ico">${ico('spark')}</span></div>`;
    return sec(ctx, block, `<div class="uxr-hero-grid">${text}${art}</div>`);
  }
  return sec(ctx, block, text);
}
