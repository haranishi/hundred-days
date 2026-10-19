/* 録画のときだけ、実際のページの上に重ねる字幕・指の印・終了カード。アプリのファイルもDOMも書き換えない。
   ・重ね物は popover（最前面）に入れる。字幕は暗い札にして、下の画面の文字（注記の欄など）と混ざらないようにする。
   ・字幕の札は、画面ごとに決めた場所（timeline.mjs の pos）に置く。どの場所も、左右32px・上75px・下175px（CSS px。出力では64・150・350px）の内側。
   ・指の印は、実際のタッチ（pointer イベント）を窓で聞いて出す。ページの処理には触らない（聞くだけ）。
   ・書体は Zen Kaku Gothic New の Bold と Black（SIL OFL 1.1）。ページから file:// は読めないので、render-promo.mjs が /__promo-font-* で配る。 */

export const SAFE = Object.freeze({ left: 32, right: 508, top: 75, bottom: 785 });   // CSS px（540×960）
/* 字幕の札の場所（CSS px）。札は不透明で、場所ごとの幅いっぱい。字は札の中央・一行で、必ず SAFE の内側に収める。
   札（背景）は、下にあるアプリの文字を隠しきるため、内容の列（PLATE_BOUND）の内側までは SAFE の外へ広げてよい：
   注記の欄の文字は左31pxから、推理の見出しは左16pxから始まるので、札をそこまで広げる（字は SAFE の内側のまま） */
export const PLATE_BOUND = Object.freeze({ left: 14, right: 526, top: SAFE.top, bottom: SAFE.bottom });
export const CAPTION_BOX = Object.freeze({
  note: { left: 28, right: 512, top: 659, height: 54, font: 32, min: 26 },   // 再現室：注記の欄（655〜717）の上
  side: { left: 32, right: 488, top: 421, height: 46, font: 28, min: 24 },   // 成功の画面（スクロール100px）：現場図の上の空き（415〜470。右端の壁の線は避ける）
  top: { left: 14, right: 526, top: 76, height: 64, font: 32, min: 26 },     // 推理：見出しの所（80〜138）／結末：上の空き
});
export const CAPTION_PAD = 14;
/* 字の幅の上限：札の内側、かつ SAFE の幅の内側（札の中央に置くので、これ以下なら SAFE に収まる） */
export const textMaxWidth = (box) => Math.min(box.right - box.left - CAPTION_PAD * 2, SAFE.right - SAFE.left - 8, 2 * Math.min((box.left + box.right) / 2 - SAFE.left, SAFE.right - (box.left + box.right) / 2) - 8);

export const CAPTION_COLORS = {
  lamp: '#ffb84d',     // 灯り（アプリの --lamp）
  stamp: '#ff7a66',    // 判子の朱（--stamp-ink）
  prop: '#e8d2a2',     // 道具の紙色（--prop）
  shade: '#c9c2f0',    // 影（アプリの影 #1d1a3a は暗い札の上で読めないので、薄い藍にする）
};

const css = (end) => `
@font-face { font-family: PromoFont; src: url('/__promo-font-bold'); font-weight: 700; }
@font-face { font-family: PromoFont; src: url('/__promo-font-black'); font-weight: 900; }
:focus, :focus-visible { outline: none !important; }
::-webkit-scrollbar { display: none; }

#promo-layer { position: fixed; inset: 0; width: 540px; height: 960px; margin: 0; padding: 0; border: 0; background: transparent;
  overflow: visible; pointer-events: none; color: #fff; font-family: PromoFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

/* 札は常に不透明（半透明にすると、下の画面の文字が透ける）。消すときは瞬時に消す。字だけをフェードで入れ替える */
.promo-cap { position: absolute; display: flex; justify-content: center; align-items: stretch; }
.promo-cap[data-plate="0"] { visibility: hidden; }
${Object.entries(CAPTION_BOX).map(([pos, b]) => `.promo-cap[data-pos="${pos}"] { left: ${b.left}px; width: ${b.right - b.left}px; top: ${b.top}px; height: ${b.height}px; }`).join('\n')}
.promo-cap .box { display: flex; align-items: center; justify-content: center; width: 100%; padding: 0 ${CAPTION_PAD}px; box-sizing: border-box;
  border-radius: 10px; background: #12102a; box-shadow: inset 0 0 0 1.5px rgba(255, 184, 77, 0.55), 0 8px 24px rgba(0, 0, 0, 0.45); }
.promo-cap .text { display: block; font-weight: 700; line-height: 1.15; letter-spacing: .02em; white-space: nowrap; opacity: 1; transition: opacity 110ms linear; }
.promo-cap .text[data-on="0"] { opacity: 0; }
.promo-cap em { font-style: normal; }
${Object.entries(CAPTION_COLORS).map(([name, color]) => `.promo-cap .c-${name} { color: ${color}; }`).join('\n')}

/* 指の印：白い輪と暗い縁（紙の壁の上でも、暗い面の上でも見える）。押した所に、広がる輪 */
.promo-finger { position: absolute; width: 50px; height: 50px; margin: -25px 0 0 -25px; box-sizing: border-box; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.85); background: rgba(255, 255, 255, 0.16); box-shadow: 0 0 0 1.5px rgba(18, 16, 42, 0.55), inset 0 0 0 1.5px rgba(18, 16, 42, 0.35);
  opacity: 0; transform: scale(.8); transition: opacity 90ms linear, transform 120ms ease-out; }
.promo-finger[data-on="1"] { opacity: 1; transform: scale(1); }
.promo-ring { position: absolute; width: 72px; height: 72px; margin: -36px 0 0 -36px; box-sizing: border-box; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, .9); opacity: 0; transform: scale(.5); }
.promo-ring.go { animation: promoRing 420ms ease-out forwards; }
.promo-ring.cut { animation: none; opacity: 0; }     /* 押した結果、画面が替わったら、輪を残さない（次の画面のボタンを押したように見えるため） */
@keyframes promoRing { 0% { opacity: 1; transform: scale(.5); } 60% { opacity: .8; } 100% { opacity: 0; transform: scale(1.25); } }

.promo-end { position: absolute; inset: 0; overflow: hidden; background: #12102a; opacity: 0; transition: opacity ${end.fade}s ease-out; }
.promo-end[data-on="1"] { opacity: 1; }
.promo-end svg { position: absolute; left: 0; top: 0; width: 540px; height: 960px; }
.promo-end .e-x { position: absolute; left: 0; right: 0; margin: 0; text-align: center; opacity: 0; transform: translateY(14px); white-space: nowrap; }
.promo-end[data-on="1"] .e-x { animation: eIn .42s ease-out forwards; animation-delay: var(--d, 0s); }
@keyframes eIn { to { opacity: 1; transform: none; } }
.e-badge { top: 92px; left: 50% !important; right: auto !important; width: max-content; translate: -50% 0; padding: 7px 18px; font-size: 21px; letter-spacing: .06em;
  color: #c9c2f0; border: 1.5px solid #6a63a6; border-radius: 999px; background: #1b1840; font-weight: 700; }
.e-title { top: 452px; font-size: 92px; line-height: 1.1; letter-spacing: .08em; font-weight: 900; }
.e-tag { top: 566px; font-size: 22px; letter-spacing: .03em; color: #c9c2f0; font-weight: 700; }
.e-sub { top: 606px; font-size: 32px; letter-spacing: .04em; color: #ffb84d; font-weight: 700; }
.e-url { top: 664px; left: 50% !important; right: auto !important; width: max-content; translate: -50% 0; padding: 12px 24px 10px; background: #1b1840;
  border: 1.5px solid #6a63a6; border-radius: 16px; }
.e-url b { display: block; font-size: 30px; letter-spacing: .01em; font-weight: 700; }
.e-url span { display: block; font-size: 22px; color: #c9c2f0; font-weight: 700; }

/* 絵：紙の壁に、灯りの影（帽子と外套の人影）が下から上がって収まり、ガイドの朱の輪郭が光る。灯りは揺らぎ続ける（停電の夜の灯り） */
.promo-end .e-paper { opacity: 0; transform-origin: 270px 285px; transform: scale(.96); }
.promo-end[data-on="1"] .e-paper { animation: ePaper .4s ease-out forwards; animation-delay: .08s; }
@keyframes ePaper { to { opacity: 1; transform: none; } }
.promo-end .e-lamp { opacity: 0; }
/* 灯りの揺らぎは、紙の上でも見えるよう大きく（明るさ 0.6〜1.0）、約0.1秒ごとに不規則に変える。カードが出きったあとも、絵が止まって見えない */
.promo-end[data-on="1"] .e-lamp { animation: eLampOn .35s ease-out forwards, eFlicker 1.2s steps(1, end) infinite; animation-delay: ${end.lamp}s, ${end.lamp + 0.35}s; }
@keyframes eLampOn { to { opacity: 1; } }
@keyframes eFlicker { 0% { opacity: 1; } 9% { opacity: .72; } 17% { opacity: .95; } 26% { opacity: .64; } 35% { opacity: 1; } 44% { opacity: .78; } 53% { opacity: .97; } 62% { opacity: .66; } 71% { opacity: .9; } 80% { opacity: .74; } 89% { opacity: 1; } 95% { opacity: .82; } }
.promo-end .e-glow { transform-origin: 355px 210px; }
.promo-end[data-on="1"] .e-glow { animation: eGlow 1.3s ease-in-out infinite alternate; }
@keyframes eGlow { from { transform: scale(.84); } to { transform: scale(1.16); } }
.promo-end .e-guide { opacity: 0; }
.promo-end[data-on="1"] .e-guide { animation: eGuide ${end.land + 0.9}s linear forwards; }
@keyframes eGuide { 0%, ${Math.round(end.rise / (end.land + 0.9) * 100)}% { opacity: 0; } ${Math.round((end.rise + 0.2) / (end.land + 0.9) * 100)}% { opacity: .9; }
  ${Math.round(end.land / (end.land + 0.9) * 100)}% { opacity: 1; stroke-width: 1.6; } ${Math.round((end.land + 0.25) / (end.land + 0.9) * 100)}% { opacity: 1; stroke-width: .9; } 100% { opacity: .75; stroke-width: .7; } }
.promo-end .e-shadow { opacity: 0; transform: translateY(13px); }
.promo-end[data-on="1"] .e-shadow { animation: eRise ${end.land - end.rise}s cubic-bezier(.3, .7, .3, 1) forwards, eSway 1.2s steps(1, end) infinite;
  animation-delay: ${end.rise}s, ${end.land + 0.1}s; }
@keyframes eRise { 0% { opacity: 0; transform: translateY(13px); } 25% { opacity: .9; } 100% { opacity: 1; transform: none; } }
/* 揺れる灯りに合わせて、影もわずかに震える（絵の5倍の座標なので、0.1 は CSS で 0.5px・出力で 1px） */
@keyframes eSway { 0% { transform: translate(0, 0); } 17% { transform: translate(.1px, -.06px); } 35% { transform: translate(-.08px, .04px); } 53% { transform: translate(.06px, .08px); }
  71% { transform: translate(-.1px, -.04px); } 89% { transform: translate(.04px, .06px); } }
`;

/* 終了カードの絵。アプリの favicon.svg（自作）と同じ形を、5倍の大きさで描き直したもの（実画面ではない）。
   favicon の座標（64×64・紙は 7〜57）を、カードの (145, 160) から 250×250 の紙へ写す */
const endArt = `
<svg viewBox="0 0 540 960" aria-hidden="true">
  <defs>
    <radialGradient id="eglow" cx="355" cy="210" r="120" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff2c9" stop-opacity=".9"/><stop offset=".35" stop-color="#ffb84d" stop-opacity=".45"/><stop offset="1" stop-color="#ffb84d" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ebg" cx="270" cy="0" r="620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2c2670"/><stop offset=".58" stop-color="#12102a"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="540" height="960" fill="url(#ebg)"/>
  <g class="e-paper"><rect x="145" y="160" width="250" height="250" rx="40" fill="#efe6cf"/></g>
  <g transform="translate(110 125) scale(5)">
    <g class="e-shadow">
      <path d="M24 13h12.5l-1 8H41v3H19v-3h5z" fill="#1d1a3a"/>
      <path d="M23 25.5h14.5l5.5 27H17.5z" fill="#1d1a3a"/>
    </g>
    <g class="e-guide" fill="none" stroke="#d6402f" stroke-width=".7" stroke-linejoin="round" stroke-dasharray="1.6 1.1">
      <path d="M24 13h12.5l-1 8H41v3H19v-3h5z"/>
      <path d="M23 25.5h14.5l5.5 27H17.5z"/>
    </g>
  </g>
  <g class="e-lamp">
    <circle class="e-glow" cx="355" cy="210" r="120" fill="url(#eglow)"/>
    <circle cx="355" cy="210" r="22.5" fill="#ffb84d"/>
    <circle cx="348" cy="203" r="7" fill="#fff6dc" opacity=".9"/>
  </g>
</svg>`;

/* ページに重ね物を入れる。window.promo に操作の口を作る */
export async function installOverlay(page, { endCard, endAnim }) {
  await page.addStyleTag({ content: css(endAnim) });
  await page.evaluate(({ endCard, endArt, boxes, pad }) => {
    const layer = document.createElement('div');
    layer.id = 'promo-layer';
    layer.setAttribute('popover', 'manual');
    const h = (tag, cls, text, style) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (style) e.setAttribute('style', style); return e; };

    const cap = h('div', 'promo-cap'); cap.id = 'promo-cap'; cap.dataset.plate = '0'; cap.dataset.pos = 'note';
    const box = h('span', 'box'); const capText = h('span', 'text'); capText.dataset.on = '0'; box.append(capText); cap.append(box);
    const finger = h('div', 'promo-finger'); finger.dataset.on = '0';
    const rings = Array.from({ length: 4 }, () => h('div', 'promo-ring'));
    const end = h('div', 'promo-end'); end.id = 'promo-end'; end.dataset.on = '0';
    end.insertAdjacentHTML('beforeend', endArt);
    const url = h('div', 'e-x e-url', undefined, '--d:1.3s');
    url.append(h('b', '', endCard.urlHost), h('span', '', endCard.urlPath));
    end.append(
      h('p', 'e-x e-badge', endCard.badge, '--d:.2s'),
      h('h1', 'e-x e-title', endCard.title, '--d:.75s'),
      h('p', 'e-x e-tag', endCard.tag, '--d:.9s'),
      h('p', 'e-x e-sub', endCard.sub, '--d:1.05s'),
      url);
    layer.append(cap, finger, ...rings, end);
    document.body.append(layer);
    layer.showPopover();
    new MutationObserver(() => rings.forEach((r) => { if (r.classList.contains('go')) { r.classList.remove('go'); r.classList.add('cut'); } }))
      .observe(document.getElementById('app'), { attributes: true, attributeFilter: ['data-phase'] });

    // 指の印：実際のタッチを聞くだけ（preventDefault も stopPropagation もしない）
    let down = null; let ringIndex = 0;
    const place = (el, x, y) => { el.style.left = `${x}px`; el.style.top = `${y}px`; };
    window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; down = { x: e.clientX, y: e.clientY, at: performance.now(), moved: 0 }; place(finger, e.clientX, e.clientY); finger.dataset.on = '1'; }, { capture: true, passive: true });
    window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' || !down) return; down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y)); place(finger, e.clientX, e.clientY); }, { capture: true, passive: true });
    const lift = (e) => {
      if (e.pointerType !== 'touch' || !down) return;
      if (performance.now() - down.at < 250 && down.moved < 10) {      // 押しただけ（ボタン）：広がる輪
        const r = rings[ringIndex++ % rings.length]; place(r, down.x, down.y);
        r.classList.remove('go', 'cut'); void r.offsetWidth; r.classList.add('go');
      }
      finger.dataset.on = '0'; down = null;
    };
    window.addEventListener('pointerup', lift, { capture: true, passive: true });
    window.addEventListener('pointercancel', lift, { capture: true, passive: true });

    const render = (parts) => capText.replaceChildren(...parts.map((p) => (p.c ? h('em', `c-${p.c}`, p.t) : document.createTextNode(p.t))));
    const fit = (pos) => {                 // 一行に収める。字の幅の上限に入らなければ、字を小さくする
      const spec = boxes[pos];
      let size = spec.font; capText.style.fontSize = `${size}px`;
      while (capText.getBoundingClientRect().width > spec.max && size > spec.min) { size -= 1; capText.style.fontSize = `${size}px`; }
      return size;
    };
    const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const app = document.getElementById('app');
    let waiting = null;
    const textOff = () => { capText.style.transition = 'none'; capText.dataset.on = '0'; void capText.offsetWidth; capText.style.transition = ''; };
    window.promo = {
      log: [],
      // 札を pos に置き（瞬時）、字を入れてフェードで出す（instant なら、すぐ出す）
      apply(parts, pos, text, instant = false) {
        cap.dataset.pos = pos; cap.dataset.plate = '1'; render(parts); const size = fit(pos);
        if (instant) capText.style.transition = 'none';
        capText.dataset.on = '1';
        if (instant) { void capText.offsetWidth; capText.style.transition = ''; }
        this.log.push({ text, pos, size, at: performance.timeOrigin + performance.now(), phase: app.dataset.phase, box: rect(box), textRect: rect(capText), fits: capText.getBoundingClientRect().width <= boxes[pos].max + 0.5 });
      },
      caption(parts, pos, instant, text) {
        if (instant) { this.apply(parts, pos, text, true); return; }
        capText.dataset.on = '0';               // 字だけを消す（札は残すので、下の画面の文字は透けない）
        setTimeout(() => this.apply(parts, pos, text), 110);
      },
      // 画面ごと替わる所：字だけ先に消し、空の札のまま待つ。#app[data-phase] が phase になった瞬間（新しい画面の最初の描画）に、
      // 札を新しい場所へ移して、新しい字をフェードで出す。parts が null のときは、その瞬間に札ごと消すだけ
      captionOnPhase(phase, parts, pos, text) {
        if (parts) capText.dataset.on = '0';
        waiting?.disconnect();
        const show = () => {
          waiting?.disconnect(); waiting = null;
          if (!parts) { cap.dataset.plate = '0'; textOff(); return; }
          textOff(); this.apply(parts, pos, text);
        };
        if (app.dataset.phase === phase) { setTimeout(show, 110); return; }
        waiting = new MutationObserver(() => { if (app.dataset.phase === phase) show(); });
        waiting.observe(app, { attributes: true, attributeFilter: ['data-phase'] });
      },
      hideCaption() { cap.dataset.plate = '0'; textOff(); },
      showEnd() { end.dataset.on = '1'; },
      // 終了カードの文字の範囲（字そのもの。題名などの段落は横幅いっぱいの箱なので、箱でなく文字の並びで測る。枠のある札は枠ごと）
      endRects() {
        return [...end.querySelectorAll('.e-x')].map((el) => {
          const framed = el.classList.contains('e-badge') || el.classList.contains('e-url');
          const range = document.createRange(); range.selectNodeContents(el);
          return { cls: el.className.replace('e-x ', ''), text: el.textContent, ...(framed ? rect(el) : rect(range)) };
        });
      },
    };
  }, { endCard, endArt, boxes: Object.fromEntries(Object.entries(CAPTION_BOX).map(([pos, b]) => [pos, { ...b, max: textMaxWidth(b) }])), pad: CAPTION_PAD });
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('700 32px PromoFont'), document.fonts.load('900 92px PromoFont')]);
    await document.fonts.ready;
  });
  const loaded = await page.evaluate(() => ({ bold: document.fonts.check('700 32px PromoFont'), black: document.fonts.check('900 92px PromoFont') }));
  if (!loaded.bold || !loaded.black) throw new Error(`字幕の書体を読めません（${JSON.stringify(loaded)}）`);
}
