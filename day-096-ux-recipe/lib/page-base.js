// ページのCSS（土台）。親の担当。すべての規則は `.uxr-page` の中だけ（編集画面のCSSと混ざらない）。
// 幅は画面でなく「ページの幅」（container query）で変える。スマホ枠・パソコン幅の切替で、そのまま効く。
// 部品ごとのCSSは lib/blocks/*.js の css。ここにある「トークン」と「基本部品」を使って書く。
export const BASE_CSS = `
.uxr-page{container-type:inline-size;container-name:uxr;width:100%;min-height:100%;margin:0;background:var(--uxr-bg);color:var(--uxr-ink);font-family:var(--uxr-font);font-size:16px;line-height:1.75;-webkit-text-size-adjust:100%;text-size-adjust:100%;overflow-wrap:anywhere;line-break:strict;--uxr-max:720px;--uxr-pad-x:20px;--uxr-pad-y:56px}
@supports (word-break:auto-phrase){
  .uxr-page{word-break:auto-phrase}
}
.uxr-page *,.uxr-page *::before,.uxr-page *::after{box-sizing:border-box}
.uxr-page :where(h1,h2,h3,h4,p,ul,ol,li,figure,dl,dd,blockquote,table){margin:0;padding:0}
.uxr-page :where(ul,ol){list-style:none}
.uxr-page :where(h1,h2,h3,h4){font-family:var(--uxr-font-head);font-weight:var(--uxr-head-weight);line-height:1.38;letter-spacing:var(--uxr-head-track)}
.uxr-page :where(p,li,dt,dd,blockquote,th,td,.uxr-lead,.uxr-note,.uxr-lim-text){text-wrap:pretty}
/* 下線を引く大見出しはインラインなので、実際に行を組む親にも指定する。 */
.uxr-page :where(h1,h2,h3,h4,.uxr-h1,.uxr-h2,.uxr-h3,.uxr-h1wrap){text-wrap:balance}
.uxr-page :where(a){color:inherit}
.uxr-page svg{max-width:100%}

.uxr-page .uxr-head{border-bottom:1px solid var(--uxr-line);background:var(--uxr-bg)}
.uxr-page .uxr-head-in{display:flex;align-items:center;gap:10px;max-width:var(--uxr-max);margin:0 auto;padding:14px var(--uxr-pad-x)}
.uxr-page .uxr-head-in::before{content:"";flex:none;width:.7em;height:.7em;border-radius:50%;background:var(--uxr-accent)}
.uxr-page .uxr-brand{font-family:var(--uxr-font-head);font-weight:700;font-size:1.0625rem;letter-spacing:.02em;min-width:0}

.uxr-page .uxr-main{display:block}
.uxr-page .uxr-block{position:relative;background:var(--uxr-bg)}
.uxr-page .uxr-inner{max-width:var(--uxr-max);margin:0 auto;padding:var(--uxr-pad-y) var(--uxr-pad-x)}
/* 書き出しで全項目が空の部品は、色だけの帯を残さず枠ごと隠す（編集中は「ここに書く」の要素があるので対象外） */
.uxr-page .uxr-block:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-main>.uxr-block:nth-child(even):not(.uxr-hero):not(.uxr-cta):not(.uxr-footer):not(.uxr-limited):not(.uxr-guarantee){background:var(--uxr-surface2)}

.uxr-page .uxr-eyebrow{display:inline-block;font-size:.8125rem;font-weight:700;letter-spacing:.08em;color:var(--uxr-accent-text);text-transform:var(--uxr-eyebrow-case)}
.uxr-page .uxr-h1{font-size:clamp(1.75rem,7.4cqw,2.75rem)}
.uxr-page .uxr-h2{font-size:clamp(1.35rem,5.6cqw,2rem);margin-bottom:var(--uxr-h2-gap)}
.uxr-page .uxr-h3{font-size:1.0625rem}
.uxr-page .uxr-lead{font-size:1.0625rem;color:var(--uxr-muted)}
.uxr-page .uxr-note{font-size:max(14px,.875rem);line-height:1.6;color:var(--uxr-muted)}
.uxr-page .uxr-muted{color:var(--uxr-muted)}

.uxr-page .uxr-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:52px;padding:.75em 1.7em;border:var(--uxr-btn-border);border-radius:var(--uxr-btn-radius);background:var(--uxr-accent);color:var(--uxr-accent-ink);font:inherit;font-weight:700;font-size:1rem;letter-spacing:.03em;line-height:1.4;text-decoration:none;text-align:center;cursor:pointer;box-shadow:var(--uxr-btn-shadow);transition:transform .12s ease,filter .12s ease}
.uxr-page .uxr-btn:hover{filter:brightness(1.07)}
.uxr-page .uxr-btn:active{transform:translateY(1px)}
.uxr-page .uxr-btn:focus-visible{outline:3px solid var(--uxr-ink);outline-offset:3px}
.uxr-page .uxr-btn--ghost{background:transparent;color:var(--uxr-accent-text);border:2px solid var(--uxr-accent);box-shadow:none}
.uxr-page .uxr-btn--inverse{background:var(--uxr-accent-ink);color:var(--uxr-accent-text);border:var(--uxr-btn-border-inverse)}
@media (prefers-reduced-motion:reduce){.uxr-page .uxr-btn{transition:none}}

.uxr-page .uxr-card{background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);padding:22px;box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-chip{display:inline-flex;align-items:center;gap:.4em;padding:.25em .85em;border-radius:999px;background:var(--uxr-accent-soft);color:var(--uxr-accent-text);font-size:.8125rem;font-weight:700;line-height:1.5}
.uxr-page .uxr-ico{width:1.5em;height:1.5em;flex:none}
.uxr-page .uxr-ico-badge{display:inline-grid;place-items:center;flex:none;width:46px;height:46px;border-radius:calc(var(--uxr-radius)*.55);background:var(--uxr-accent-soft);color:var(--uxr-accent-text)}
.uxr-page .uxr-ico-badge .uxr-ico{width:24px;height:24px}
.uxr-page .uxr-grid{display:grid;gap:16px}
.uxr-page .uxr-stack{display:flex;flex-direction:column;gap:12px}
.uxr-page .uxr-price{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.01em}
.uxr-page .uxr-num{font-variant-numeric:tabular-nums;font-weight:800;line-height:1.1;color:var(--uxr-accent-text)}

/* 編集中だけ出る「ここに書く」の目印（書き出しには空の項目が出ないので、ここは編集画面専用） */
.uxr-page .is-empty::before{content:attr(data-ph);opacity:.5;font-style:normal;font-weight:400}

/* 狭い画面では見出しの読み始めをそろえ、中央に視線を集める部品は元の配置を生かす。 */
@container uxr (width < 560px){
  .uxr-page .uxr-main > .uxr-block:not(.uxr-hero,.uxr-cta,.uxr-limited,.uxr-guarantee) .uxr-h2{text-align:left}
}
@container uxr (min-width:640px){
  .uxr-page .uxr-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .uxr-page .uxr-grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .uxr-page .uxr-grid--4{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@container uxr (min-width:720px){
  /* 本文と店名の帯は、内側の余白に加えて中央に置く箱の幅までそろえる。 */
  .uxr-page .uxr-main,.uxr-page .uxr-head{--uxr-max:880px;--uxr-pad-x:32px;--uxr-pad-y:84px}
}
`;
