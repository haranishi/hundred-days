// 遊び方の3枚の絵（SVG）。外部の画像は使わない。色は docs/02 ⑤ の差し色。
// 絵の中の文字は飾りなので、読み上げには絵の下の文で伝える（絵は aria-hidden）。

const INK = '#1F2A44'
const SHU = '#E2483D'
const TEAL = '#1E9A8A'
const MUSTARD = '#F2B544'

/** 1枚目：台座の上で白い部品が上から落ちて組み上がる */
export const ART_BUILD = `
<svg viewBox="0 0 160 112" aria-hidden="true" focusable="false">
  <ellipse cx="80" cy="96" rx="58" ry="12" fill="#D9CFBC"/>
  <ellipse cx="80" cy="92" rx="58" ry="12" fill="#EFE7D6" stroke="${INK}" stroke-width="2"/>
  <rect x="52" y="62" width="56" height="30" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
  <path d="M52 70h56" stroke="${INK}" stroke-width="1.4" opacity=".35"/>
  <rect x="64" y="42" width="32" height="20" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
  <rect x="71" y="8" width="18" height="18" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
  <path d="M66 6v14M94 6v14" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" opacity=".35"/>
  <path d="M80 30v6m-4-3 4 4 4-4" fill="none" stroke="${SHU}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="122" cy="40" r="3" fill="${MUSTARD}"/><circle cx="132" cy="54" r="2.4" fill="${TEAL}"/><circle cx="34" cy="50" r="2.6" fill="${SHU}"/>
</svg>`

/** 2枚目：大きな早押しボタンと「いま押すと◯点」の帯 */
export const ART_BUZZ = `
<svg viewBox="0 0 160 112" aria-hidden="true" focusable="false">
  <rect x="22" y="10" width="116" height="12" rx="6" fill="#EFE7D6" stroke="${INK}" stroke-width="2"/>
  <rect x="24" y="12" width="56" height="8" rx="4" fill="${TEAL}"/>
  <text x="80" y="40" text-anchor="middle" font-size="13" font-weight="800" fill="${INK}" font-family="system-ui,sans-serif">早いほど高得点</text>
  <ellipse cx="80" cy="96" rx="40" ry="9" fill="#B8352C"/>
  <rect x="40" y="76" width="80" height="20" fill="#B8352C"/>
  <ellipse cx="80" cy="76" rx="40" ry="11" fill="${SHU}" stroke="${INK}" stroke-width="2.4"/>
  <path d="M40 76v20M120 76v20" stroke="${INK}" stroke-width="2.4"/>
  <path d="M40 96a40 9 0 0 0 80 0" fill="none" stroke="${INK}" stroke-width="2.4"/>
  <path d="M46 54l-8-6M114 54l8-6M80 50v-8" stroke="${MUSTARD}" stroke-width="3" stroke-linecap="round"/>
</svg>`

/** 3枚目：4択。1つは○、まちがいは×と −200 */
export const ART_CHOICE = `
<svg viewBox="0 0 160 112" aria-hidden="true" focusable="false">
  <rect x="14" y="14" width="62" height="38" rx="8" fill="#fff" stroke="${INK}" stroke-width="2.2"/>
  <rect x="84" y="14" width="62" height="38" rx="8" fill="#fff" stroke="${INK}" stroke-width="2.2"/>
  <rect x="14" y="60" width="62" height="38" rx="8" fill="#fff" stroke="${INK}" stroke-width="2.2"/>
  <rect x="84" y="60" width="62" height="38" rx="8" fill="#fff" stroke="${INK}" stroke-width="2.2"/>
  <circle cx="45" cy="79" r="12" fill="none" stroke="${TEAL}" stroke-width="4"/>
  <path d="M106 23l18 20M124 23l-18 20" stroke="${SHU}" stroke-width="4.4" stroke-linecap="round"/>
  <rect x="96" y="2" width="52" height="18" rx="9" fill="${SHU}"/>
  <text x="122" y="15.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">−200</text>
</svg>`
