/* 録画のときだけ、実際のページの上に重ねる字幕・指の輪・終了カード。アプリのファイルは書き換えない。
   ・字幕は面の帯と盤のあいだ（ヒントの行）に置く。ヒントの行は見えなくして、字幕が代わりに入る。面8のように盤が高い面でも、盤や十字ボタンに重ならない。
   ・重ね物は popover（最前面）に入れる。面の一覧の窓（dialog）が開いても、字幕が窓の裏に隠れて暗くならない。
   ・キーで遊ぶ録画では指が映らないので、押した十字ボタンに輪を出す（実際の押下の見た目は、アプリの :active と同じ色）。
   ・書体は Zen Kaku Gothic New Bold（SIL OFL 1.1）。ページから file:// は読めないので、render-promo.mjs が /__promo-font で配る。 */

export const CAPTION_COLORS = {
  danger: '#ff6b6b',   // 見つかった（アプリの --danger）
  light: '#f3cf63',    // 光（--light）
  box: '#e0a56a',      // 箱（--box を少し明るく）
  gold: '#f6c945',     // 宝（--gold）
  guard: '#8fb0ff',    // 警備員（--guard を少し明るく）
  laser: '#ff7a92',    // レーザー（--laser を少し明るく）
  shade: '#aebbd8',    // 影
};

const css = (end, hideShare) => `
@font-face { font-family: PromoFont; src: url('/__promo-font'); font-weight: 700; }
:focus, :focus-visible { outline: none !important; }
.foot, #hint${hideShare ? ', .resultshare' : ''} { visibility: hidden !important; }     /* 足のリンクと、ヒントの行（字幕が代わりに入る）。場所は残す */
html { scroll-behavior: auto !important; }
::-webkit-scrollbar { display: none; }

#promo-layer { position: fixed; inset: 0; width: 540px; height: 960px; margin: 0; padding: 0; border: 0; background: transparent;
  overflow: visible; pointer-events: none; color: #fff; font-family: PromoFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

.promo-cap { position: absolute; left: 16px; right: 16px; top: 163px; height: 48px; display: flex; align-items: center; justify-content: center;
  font-size: 32px; line-height: 1.2; font-weight: 700; letter-spacing: .02em; white-space: nowrap;
  opacity: 1; transition: opacity 110ms linear; }
.promo-cap[data-on="0"] { opacity: 0; }
.promo-cap[data-pos="bottom"] { top: 894px; height: 56px; }
.promo-cap em { font-style: normal; }
${Object.entries(CAPTION_COLORS).map(([name, color]) => `.promo-cap .c-${name} { color: ${color}; }`).join('\n')}

.promo-ring { position: absolute; width: 76px; height: 76px; margin: -38px 0 0 -38px; box-sizing: border-box; border-radius: 50%;
  border: 3px solid rgba(243, 207, 99, .95); background: rgba(243, 207, 99, .18); opacity: 0; transform: scale(.55); }
.promo-ring.go { animation: promoRing 380ms ease-out forwards; }
.promo-ring.go.quick { animation-duration: 170ms; }     /* 押した所が、すぐ結果の欄に替わるとき */
@keyframes promoRing { 0% { opacity: 1; transform: scale(.55); } 60% { opacity: .85; } 100% { opacity: 0; transform: scale(1.18); } }
.promo-down { background: var(--surface-press) !important; border-color: var(--ink) !important; transform: translateY(2px) scale(.97) !important; }
.promo-down-primary { background: var(--primary-press) !important; border-color: var(--primary-press) !important; transform: translateY(1px) !important; }

.promo-end { position: absolute; inset: 0; overflow: hidden; background: #0b0f1a; opacity: 0; transition: opacity ${end.fade}s ease-out; }
.promo-end[data-on="1"] { opacity: 1; }
.promo-end svg { position: absolute; left: 0; top: 0; width: 540px; height: 960px; }
.promo-end .e-x { position: absolute; left: 0; right: 0; margin: 0; text-align: center; opacity: 0; transform: translateY(14px); white-space: nowrap; }
.promo-end[data-on="1"] .e-x { animation: eIn .42s ease-out forwards; animation-delay: var(--d, 0s); }
@keyframes eIn { to { opacity: 1; transform: none; } }
.e-badge { top: 44px; left: 50% !important; right: auto !important; width: max-content; translate: -50% 0; padding: 7px 18px; font-size: 21px; letter-spacing: .06em;
  color: #b9c2d6; border: 1.5px solid #6f7c9b; border-radius: 999px; background: #0e1320; }
.e-title { top: 468px; font-size: 80px; line-height: 1.15; letter-spacing: .05em; font-weight: 700; }
.e-sub { top: 584px; font-size: 34px; letter-spacing: .04em; color: #f3cf63; font-weight: 700; }
.e-tag { top: 640px; font-size: 20px; letter-spacing: .02em; color: #b9c2d6; }
.e-url { top: 698px; left: 50% !important; right: auto !important; width: max-content; translate: -50% 0; padding: 12px 24px 10px; background: #161d2e;
  border: 1.5px solid #6f7c9b; border-radius: 16px; }
.e-url b { display: block; font-size: 30px; letter-spacing: .01em; font-weight: 700; }
.e-url span { display: block; font-size: 22px; color: #b9c2d6; font-weight: 700; }
.e-note { top: 812px; font-size: 22px; color: #b9c2d6; letter-spacing: .04em; }

.e-beam { transform-origin: 36px 150px; animation: eBeam 3.4s ease-in-out infinite alternate; }
@keyframes eBeam { from { transform: rotate(-1.2deg); } to { transform: rotate(1.4deg); } }
.promo-end .e-box { opacity: 0; transform: translateX(-250px); }
.promo-end[data-on="1"] .e-box { animation: eBox .32s cubic-bezier(.2, .8, .2, 1) forwards; animation-delay: ${end.boxIn}s; }
@keyframes eBox { to { opacity: 1; transform: none; } }
.promo-end .e-shadow { transform-origin: 292px 215px; transform: scaleX(0); }
.promo-end[data-on="1"] .e-shadow { animation: eShadow .26s ease-out forwards; animation-delay: ${end.shadow}s; }
@keyframes eShadow { to { transform: none; } }
.promo-end .e-gem { opacity: 0; }
.promo-end[data-on="1"] .e-gem { animation: eGem .5s ease-out forwards; animation-delay: ${end.glint - 0.2}s; }
@keyframes eGem { to { opacity: 1; } }
.promo-end .e-glint { opacity: 0; transform-origin: 432px 262px; }
.promo-end[data-on="1"] .e-glint { animation: eGlint .8s ease-in-out forwards; animation-delay: ${end.glint}s; }
@keyframes eGlint { 0% { opacity: 0; transform: scale(.4) rotate(0deg); } 40% { opacity: 1; transform: scale(1.1) rotate(20deg); } 100% { opacity: 0; transform: scale(1.4) rotate(45deg); } }
`;

/* 終了カードの絵。箱が光の中へ入り、後ろに影ができ、影の中の宝が光る。ゲームの仕組みを、自前の図形で描き直したもの（実画面ではない） */
const endArt = `
<svg viewBox="0 0 540 960" aria-hidden="true">
  <defs>
    <linearGradient id="pbeam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f3cf63" stop-opacity=".60"/>
      <stop offset="1" stop-color="#f3cf63" stop-opacity=".08"/>
    </linearGradient>
    <radialGradient id="pglow" cx="36" cy="150" r="140" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff2b8" stop-opacity=".55"/><stop offset="1" stop-color="#f3cf63" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="540" height="960" fill="#0b0f1a"/>
  <rect x="24" y="360" width="492" height="2" fill="#232b40"/>
  <g class="e-beam"><polygon points="36,150 560,64 560,430" fill="url(#pbeam)"/></g>
  <circle cx="36" cy="150" r="140" fill="url(#pglow)"/>
  <circle cx="36" cy="150" r="13" fill="#f3cf63"/><circle cx="36" cy="150" r="5.5" fill="#fff6cf"/>
  <polygon class="e-shadow" points="292,173 540,195 540,361 292,257" fill="#04060a" opacity=".92"/>
  <g class="e-box"><rect x="208" y="173" width="84" height="84" rx="9" fill="#c98f55" stroke="#4a2f12" stroke-width="5"/><rect x="238" y="175" width="24" height="80" fill="#e7c78f"/></g>
  <g class="e-gem"><path d="M414 270 L420 250 L436 240 L452 250 L458 270 L440 286 Z" fill="#f6c945" stroke="#7a5a0e" stroke-width="3" stroke-linejoin="round"/><path d="M426 254 L440 250 L449 257" fill="none" stroke="#7a5a0e" stroke-width="3" stroke-linecap="round"/></g>
  <g class="e-glint"><path d="M432 232 L436 258 L432 284 L428 258 Z M406 258 L432 254 L458 258 L432 262 Z" fill="#fff6cf"/></g>
</svg>`;

/* ページに重ね物を入れる。window.promo に操作の口を作る */
export async function installOverlay(page, { endCard, endAnim, hideShare = false }) {
  await page.addStyleTag({ content: css(endAnim, hideShare) });
  await page.evaluate(({ endCard, endArt }) => {
    const layer = document.createElement('div');
    layer.id = 'promo-layer';
    layer.setAttribute('popover', 'manual');
    const h = (tag, cls, text, style) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (style) e.setAttribute('style', style); return e; };

    const cap = h('div', 'promo-cap'); cap.id = 'promo-cap'; cap.dataset.on = '0'; cap.dataset.pos = 'row';
    const capText = h('span'); cap.append(capText);
    layer.append(cap);

    const rings = Array.from({ length: 6 }, () => { const r = h('div', 'promo-ring'); layer.append(r); return r; });

    const end = h('div', 'promo-end'); end.id = 'promo-end'; end.dataset.on = '0';
    end.insertAdjacentHTML('beforeend', endArt);
    const url = h('div', 'e-x e-url', undefined, '--d:1.05s');
    url.append(h('b', '', endCard.urlHost), h('span', '', endCard.urlPath));
    end.append(
      h('p', 'e-x e-badge', endCard.badge, '--d:.2s'),
      h('h1', 'e-x e-title', endCard.title, '--d:.35s'),
      h('p', 'e-x e-sub', endCard.sub, '--d:.65s'),
      h('p', 'e-x e-tag', endCard.tag, '--d:.85s'),
      url,
      h('p', 'e-x e-note', endCard.note, '--d:1.25s'));
    layer.append(end);
    document.body.append(layer);
    layer.showPopover();

    let ringIndex = 0;
    const ring = (x, y, quick) => {
      const r = rings[ringIndex++ % rings.length];
      r.style.left = `${x}px`; r.style.top = `${y}px`;
      r.classList.remove('go', 'quick'); void r.offsetWidth; r.classList.add('go'); if (quick) r.classList.add('quick');
    };
    const render = (parts) => capText.replaceChildren(...parts.map((p) => {
      if (!p.c) return document.createTextNode(p.t);
      const e = h('em', `c-${p.c}`, p.t); return e;
    }));
    const fit = () => {                 // 一行に収める。足りなければ字を小さくする（下限 24px）
      let size = 32; capText.style.fontSize = `${size}px`;
      while (capText.getBoundingClientRect().width > 484 && size > 24) { size -= 1; capText.style.fontSize = `${size}px`; }
      return size;
    };
    window.promo = {
      sizes: [],
      caption(parts, pos, instant) {
        const apply = () => { render(parts); cap.dataset.pos = pos || 'row'; this.sizes.push(fit()); cap.dataset.on = '1'; };
        if (instant) { cap.style.transition = 'none'; apply(); void cap.offsetWidth; cap.style.transition = ''; return; }
        cap.dataset.on = '0';
        setTimeout(apply, 110);
      },
      press(selector, primary, quick) {
        const el = document.querySelector(selector);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        ring(r.left + r.width / 2, r.top + r.height / 2, quick);
        const cls = primary ? 'promo-down-primary' : 'promo-down';
        el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 130);
        return true;
      },
      bump() { layer.hidePopover(); layer.showPopover(); },    // 窓（dialog）が開いたあと、重ね物を最前面へ戻す
      showEnd() { end.dataset.on = '1'; },
    };
  }, { endCard, endArt });
  await page.evaluate(() => document.fonts.load('700 32px PromoFont'));
  await page.evaluate(() => document.fonts.ready);
}
