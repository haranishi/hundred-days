// ファーストビュー（hero）。4テーマの人格を揃え、狭い幅から広い幅まで視線が自然に通る構成にする。
import { btn, ico, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-hero{overflow:hidden;isolation:isolate}
.uxr-page .uxr-hero .uxr-inner{padding-top:calc(var(--uxr-pad-y)*.82);padding-bottom:var(--uxr-pad-y)}
.uxr-page .uxr-hero .uxr-h1{margin:14px 0 16px}
.uxr-page .uxr-hero .uxr-hero-text>.uxr-h1:first-child{margin-top:0}
.uxr-page .uxr-hero .uxr-lead{max-width:34em}
.uxr-page .uxr-hero .uxr-actions{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:28px}
.uxr-page .uxr-hero .uxr-actions .uxr-btn{text-wrap:balance;max-width:100%}
.uxr-page .uxr-hero .uxr-note{margin:0}

/* v0: 中央。やわらかな光の広がりで、最初の視線を中央の主見出しへ集める */
.uxr-page .uxr-hero.uxr-v0::before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(88% 68% at 50% -10%,var(--uxr-accent-soft),transparent 72%)}
.uxr-page .uxr-hero.uxr-v0 .uxr-inner{text-align:center}
.uxr-page .uxr-hero.uxr-v0 .uxr-chip{max-width:100%;text-wrap:balance}
.uxr-page .uxr-hero.uxr-v0 .uxr-lead{margin-inline:auto}
.uxr-page .uxr-hero.uxr-v0 .uxr-actions{align-items:center}
.uxr-page[data-theme="crisp"] .uxr-hero.uxr-v0::before{background:linear-gradient(180deg,var(--uxr-accent-soft) 0%,transparent 48%)}
.uxr-page[data-theme="crisp"] .uxr-hero.uxr-v0 .uxr-chip{border-radius:var(--uxr-radius-sm);border:1px solid var(--uxr-accent-line)}
.uxr-page[data-theme="lively"] .uxr-hero.uxr-v0 .uxr-chip{border:2px solid var(--uxr-ink);box-shadow:2px 2px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v0::before{background:none}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v0 .uxr-chip{background:transparent;border:1px solid var(--uxr-accent-line);border-radius:var(--uxr-radius);padding:.3em 1.1em;letter-spacing:.12em}

/* v1: 左寄せ＋図形。写真の代わりに幾何学の重なりと線の絵で、テーマごとの佇まいを作る */
.uxr-page .uxr-hero.uxr-v1 .uxr-hero-grid{display:grid;gap:28px;align-items:center}
.uxr-page .uxr-hero.uxr-v1 .uxr-art{position:relative;height:188px;width:100%;max-width:320px;margin-inline:auto}
.uxr-page .uxr-hero.uxr-v1 .uxr-art i{position:absolute;display:block;border-radius:var(--uxr-radius)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .b{inset:20% 0 2% 24%;z-index:0;background:var(--uxr-accent-soft);border:var(--uxr-card-border)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .b::after{content:"";position:absolute;inset:12px;border-radius:var(--uxr-radius-sm);background:repeating-linear-gradient(-45deg,var(--uxr-accent-line) 0 1px,transparent 1px 10px);opacity:.6}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .a{inset:8% 26% 18% 4%;z-index:1;display:grid;place-items:center;background:var(--uxr-accent);box-shadow:var(--uxr-shadow);transform:rotate(-2deg);color:var(--uxr-accent-ink)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .a::after{content:"";position:absolute;inset:11px;border-radius:calc(var(--uxr-radius)*.65);border:1px solid color-mix(in srgb,var(--uxr-accent-ink) 32%,transparent);pointer-events:none}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .a .uxr-ico{width:40px;height:40px}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .c{right:4%;top:0;width:54px;height:54px;z-index:2;border-radius:var(--uxr-radius-sm);background:var(--uxr-surface);border:var(--uxr-card-border);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .c::after{content:"";position:absolute;inset:14px;border-radius:50%;border:2px solid var(--uxr-accent)}
.uxr-page .uxr-hero.uxr-v1 .uxr-art .d{left:0;bottom:4%;width:74px;height:10px;z-index:2;border-radius:var(--uxr-radius-sm);background:repeating-linear-gradient(90deg,var(--uxr-accent) 0 14px,transparent 14px 20px);opacity:.55}
.uxr-page[data-theme="crisp"] .uxr-hero.uxr-v1 .uxr-art .a{transform:none}
.uxr-page[data-theme="crisp"] .uxr-hero.uxr-v1 .uxr-art .c::after{border-radius:2px}
.uxr-page[data-theme="lively"] .uxr-hero.uxr-v1 .uxr-art .a{border:2px solid var(--uxr-ink);box-shadow:4px 4px 0 var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-hero.uxr-v1 .uxr-art .b{box-shadow:4px 4px 0 var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-hero.uxr-v1 .uxr-art .d{opacity:1}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v1 .uxr-art .a{transform:none;background:var(--uxr-surface);border:1px solid var(--uxr-accent-line);box-shadow:none;color:var(--uxr-accent-text)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v1 .uxr-art .a::after{border-color:var(--uxr-line)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v1 .uxr-art .c{box-shadow:none;border-color:var(--uxr-accent-line)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v1 .uxr-art .c::after{border-width:1px;border-radius:var(--uxr-radius)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v1 .uxr-art .d{width:96px;height:2px;background:var(--uxr-accent-line);opacity:1}

/* v2: 大見出し。全幅の帯で見開きを締め、2〜3行に折り返しても下線マーカーと左端が揃うようにする */
.uxr-page .uxr-hero.uxr-v2{border-top:6px solid var(--uxr-accent)}
.uxr-page .uxr-hero.uxr-v2 .uxr-inner{padding-top:calc(var(--uxr-pad-y)*.72)}
/* 編集時の .is-empty::before と衝突しないよう、左の短い線は背景グラデーションで描く */
.uxr-page .uxr-hero.uxr-v2 .uxr-eyebrow{display:inline-block;padding-left:34px;background:linear-gradient(var(--uxr-accent),var(--uxr-accent)) left .8em/24px 2px no-repeat}
.uxr-page .uxr-hero.uxr-v2 .uxr-h1wrap{margin:16px 0 20px}
.uxr-page .uxr-hero.uxr-v2 .uxr-hero-text>.uxr-h1wrap:first-child{margin-top:0}
.uxr-page .uxr-hero.uxr-v2 .uxr-h1{display:inline;font-size:clamp(1.9rem,9.2cqw,3.5rem);line-height:1.48;padding:0 0 .06em;background:linear-gradient(transparent 66%,color-mix(in srgb,var(--uxr-accent) 18%,var(--uxr-bg)) 66%,color-mix(in srgb,var(--uxr-accent) 18%,var(--uxr-bg)) 94%,transparent 94%);-webkit-box-decoration-break:clone;box-decoration-break:clone}
.uxr-page .uxr-hero.uxr-v2 .uxr-actions .uxr-btn{width:100%}
.uxr-page[data-theme="lively"] .uxr-hero.uxr-v2 .uxr-h1{background:linear-gradient(transparent 64%,color-mix(in srgb,var(--uxr-accent) 26%,var(--uxr-bg)) 64%,color-mix(in srgb,var(--uxr-accent) 26%,var(--uxr-bg)) 94%,transparent 94%)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v2{border-top-width:2px}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v2 .uxr-h1{background:linear-gradient(transparent 84%,var(--uxr-accent-line) 84%,var(--uxr-accent-line) 96%,transparent 96%)}

@container uxr (min-width:640px){
  .uxr-page .uxr-hero.uxr-v1 .uxr-hero-grid{grid-template-columns:1.18fr .82fr;gap:36px}
  .uxr-page .uxr-hero.uxr-v1 .uxr-art{height:276px;max-width:none;margin-inline:0}
  .uxr-page .uxr-hero.uxr-v1 .uxr-art .a .uxr-ico{width:50px;height:50px}
  .uxr-page .uxr-hero.uxr-v1 .uxr-art .c{width:68px;height:68px}
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
  const head = v === 2
    ? `${eyebrow}${title ? `<div class="uxr-h1wrap">${title}</div>` : ''}`
    : `${eyebrow}${title}`;
  const hasContent = Boolean(head || lead || actions);
  // 書き出し時に全項目が空なら、飾りの図形だけを残さずすっきり畳む
  if (!hasContent) return sec(ctx, block, '');
  const text = `<div class="uxr-hero-text">${head}${lead}${actions}</div>`;
  if (v === 1) {
    const art = `<div class="uxr-art" aria-hidden="true"><i class="b"></i><i class="a">${ico('spark')}</i><i class="c"></i><i class="d"></i></div>`;
    return sec(ctx, block, `<div class="uxr-hero-grid">${text}${art}</div>`);
  }
  return sec(ctx, block, text);
}
