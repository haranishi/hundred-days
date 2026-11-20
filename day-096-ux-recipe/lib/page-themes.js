// ページのCSS（テーマと強調色）。親の担当。4つの人格 × 6つの強調色。部品のCSSは、ここの変数だけを使う。
// 使える変数: --uxr-bg / -surface / -surface2 / -ink / -muted / -line / -field-line / -radius / -radius-sm / -shadow / -card-border /
//   -btn-radius / -btn-border / -btn-border-inverse / -btn-shadow / -font / -font-head / -head-weight / -head-track / -eyebrow-case / -h2-gap
//   -accent / -accent-ink / -accent-soft / -accent-text / -accent-line
import { ACCENTS } from './contract.js';

const SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic Medium","Yu Gothic","Noto Sans JP","Meiryo",system-ui,sans-serif';
const MARU = '"Hiragino Maru Gothic ProN","Hiragino Sans","Yu Gothic Medium","Yu Gothic","Noto Sans JP",system-ui,sans-serif';
const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","BIZ UDPMincho",serif';

const WHITE = '#ffffff';
const LIVELY_BG = '#fffaf0';
const CALM_SURFACE = '#fbfaf6';

const THEMES_CSS = `
.uxr-page[data-theme="soft"]{--uxr-bg:#fbf7f2;--uxr-surface:${WHITE};--uxr-surface2:#f4ece2;--uxr-ink:#2d2a26;--uxr-muted:#514a42;--uxr-line:#e7dccf;--uxr-field-line:#88796a;--uxr-radius:22px;--uxr-radius-sm:12px;--uxr-shadow:0 10px 26px -14px rgba(90,55,20,.32);--uxr-card-border:1px solid var(--uxr-line);--uxr-btn-radius:999px;--uxr-btn-border:0;--uxr-btn-border-inverse:0;--uxr-btn-shadow:0 8px 18px -10px color-mix(in srgb,var(--uxr-accent) 70%,transparent);--uxr-font:${MARU};--uxr-font-head:${MARU};--uxr-head-weight:700;--uxr-head-track:.01em;--uxr-eyebrow-case:none;--uxr-h2-gap:22px}
.uxr-page[data-theme="crisp"]{--uxr-bg:${WHITE};--uxr-surface:${WHITE};--uxr-surface2:#f2f4f7;--uxr-ink:#12161b;--uxr-muted:#414c58;--uxr-line:#d5dbe2;--uxr-field-line:#74818d;--uxr-radius:4px;--uxr-radius-sm:3px;--uxr-shadow:none;--uxr-card-border:1px solid var(--uxr-line);--uxr-btn-radius:4px;--uxr-btn-border:0;--uxr-btn-border-inverse:0;--uxr-btn-shadow:none;--uxr-font:${SANS};--uxr-font-head:${SANS};--uxr-head-weight:800;--uxr-head-track:0;--uxr-eyebrow-case:uppercase;--uxr-h2-gap:20px}
.uxr-page[data-theme="lively"]{--uxr-bg:${LIVELY_BG};--uxr-surface:${WHITE};--uxr-surface2:${LIVELY_BG};--uxr-ink:#1b1a22;--uxr-muted:#423f4e;--uxr-line:#1b1a22;--uxr-field-line:#1b1a22;--uxr-radius:16px;--uxr-radius-sm:10px;--uxr-shadow:4px 4px 0 var(--uxr-ink);--uxr-card-border:2px solid var(--uxr-ink);--uxr-btn-radius:12px;--uxr-btn-border:2px solid var(--uxr-ink);--uxr-btn-border-inverse:2px solid var(--uxr-ink);--uxr-btn-shadow-x:3px;--uxr-btn-shadow:var(--uxr-btn-shadow-x) 3px 0 var(--uxr-ink);--uxr-font:${SANS};--uxr-font-head:${SANS};--uxr-head-weight:900;--uxr-head-track:0;--uxr-eyebrow-case:none;--uxr-h2-gap:22px}
.uxr-page[data-theme="calm"]{--uxr-bg:#f4f1ea;--uxr-surface:${CALM_SURFACE};--uxr-surface2:#ebe6dc;--uxr-ink:#27231e;--uxr-muted:#514a41;--uxr-line:#d6cebf;--uxr-field-line:#877b6c;--uxr-radius:2px;--uxr-radius-sm:2px;--uxr-shadow:none;--uxr-card-border:1px solid var(--uxr-line);--uxr-btn-radius:2px;--uxr-btn-border:0;--uxr-btn-border-inverse:0;--uxr-btn-shadow:none;--uxr-font:${SANS};--uxr-font-head:${MINCHO};--uxr-head-weight:600;--uxr-head-track:.06em;--uxr-eyebrow-case:none;--uxr-h2-gap:26px}

/* 影も含めてボタンをそろえると、幅いっぱいの札でも左右の余白が等しくなる。 */
@container uxr (width < 640px){
  .uxr-page[data-theme="lively"] .uxr-btn:not(.uxr-btn--ghost){--uxr-btn-max:calc(100% - var(--uxr-btn-shadow-x));max-width:var(--uxr-btn-max);margin-inline-end:var(--uxr-btn-shadow-x)}
}
`;

// 面の色を不透明な値で渡すと、プレビューと書き出しで同じ色を使って注記の読みやすさを検証できる。
function tint(surface, accent, weight) {
  const channels = [1, 3, 5].map(start => {
    const base = parseInt(surface.slice(start, start + 2), 16);
    const ink = parseInt(accent.slice(start, start + 2), 16);
    return Math.round(base + (ink - base) * weight).toString(16).padStart(2, '0');
  });
  return '#' + channels.join('');
}

const ACCENTS_CSS = ACCENTS.map(({ hex }, i) => {
  const selector = `[data-accent="${i}"]`;
  return `.uxr-page${selector}{--uxr-accent:${hex};--uxr-accent-ink:${WHITE};--uxr-accent-soft:${tint(WHITE, hex, 0.11)};--uxr-accent-text:color-mix(in srgb,${hex} 82%,#000000);--uxr-accent-line:color-mix(in srgb,${hex} 35%,var(--uxr-bg))}
.uxr-page[data-theme="calm"]${selector}{--uxr-accent-soft:${tint(CALM_SURFACE, hex, 0.11)}}
.uxr-page[data-theme="lively"]${selector}{--uxr-surface2:${tint(LIVELY_BG, hex, 0.09)}}`;
}).join('\n');

export const THEME_CSS = `${THEMES_CSS}\n${ACCENTS_CSS}\n`;
