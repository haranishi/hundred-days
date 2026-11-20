// ファーストビュー（hero）。4テーマの人格を揃え、狭い幅から広い幅まで視線が自然に通る構成にする。
import { btn, multi, sec, txt } from '../render-kit.js';

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

/* 図形を本文の外へ浮かせると、短い見出しでも画像一枚分の空白ができない。 */
.uxr-page .uxr-hero.uxr-v1 .uxr-hero-shape{position:absolute;z-index:0;top:0;right:0;width:60%;aspect-ratio:1;transform:translate(70%,-60%);border-radius:50%;background:var(--uxr-accent-soft);pointer-events:none}
.uxr-page .uxr-hero.uxr-v1 .uxr-hero-text{position:relative;z-index:1}
.uxr-page[data-theme="crisp"] .uxr-hero.uxr-v1 .uxr-hero-shape{border-radius:var(--uxr-radius-sm)}
.uxr-page[data-theme="lively"] .uxr-hero.uxr-v1 .uxr-hero-shape{border:3px solid var(--uxr-ink);box-shadow:6px 6px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-hero.uxr-v1 .uxr-hero-shape{background:transparent;border:1px solid var(--uxr-accent-line)}

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
  .uxr-page .uxr-hero.uxr-v1 .uxr-hero-shape{transform:translate(48%,-44%)}
  .uxr-page .uxr-hero.uxr-v1 .uxr-hero-text{max-width:72%}
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
  const shape = v === 1 ? '<i class="uxr-hero-shape" aria-hidden="true"></i>' : '';
  return sec(ctx, block, `${shape}<div class="uxr-hero-text">${head}${lead}${actions}</div>`);
}
