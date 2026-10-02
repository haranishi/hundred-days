// サンプル画像2枚（オリジナルのねこ・こどもの絵風のくま）を SVG で描き、ブラウザで撮って PNG にする。
// 既存のキャラクターに似せない・文字を入れない。撮ったら必ず画像を目で確かめる
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from './_browser.mjs';
import { encodeRgba, encodeIndexed } from './png.mjs';

const SIZE = 768;
const out = resolve(import.meta.dirname, '../assets/samples');
const INK = '#1B1B1B';

// 平らな塗りの丸いねこ。白い顔・黒い耳（内側だけピンク）・黒い丸い目・ω の口・ピンクのほっぺ・小さなオレンジの鼻
const NEKO = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 768 768">
  <rect width="768" height="768" fill="#E3F4EC"/>
  <g stroke="${INK}" stroke-width="16" stroke-linejoin="round">
    <path d="M170 330 L202 122 Q208 98 230 112 L352 214 Z" fill="${INK}"/>
    <path d="M598 330 L566 122 Q560 98 538 112 L416 214 Z" fill="${INK}"/>
  </g>
  <path d="M224 238 L234 162 L294 211 Z" fill="#F48FB1"/>
  <path d="M544 238 L534 162 L474 211 Z" fill="#F48FB1"/>
  <ellipse cx="384" cy="432" rx="262" ry="220" fill="#FFFFFF" stroke="${INK}" stroke-width="18"/>
  <circle cx="290" cy="410" r="31" fill="${INK}"/>
  <circle cx="478" cy="410" r="31" fill="${INK}"/>
  <circle cx="222" cy="494" r="40" fill="#F48FB1"/>
  <circle cx="546" cy="494" r="40" fill="#F48FB1"/>
  <path d="M356 452 Q384 438 412 452 Q402 484 384 490 Q366 484 356 452 Z" fill="#FF9A2E" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M336 512 Q360 546 384 514 Q408 546 432 512" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// 白い画用紙にクレヨンで描いた、4歳くらいの子のくま。線のゆれは feDisplacementMap、紙の目が抜けるざらつきは feTurbulence で出す。
// 塗りは輪郭から少しはみ出させ、左右もわざと少しずらす
const KODOMO = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 768 768">
  <defs>
    <filter id="crayon" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="4" result="wobble"/>
      <feDisplacementMap in="SourceGraphic" in2="wobble" scale="10" xChannelSelector="R" yChannelSelector="G" result="shaky"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.5 0.14" numOctaves="2" seed="11" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -7 0 0 0 5.1" result="mask"/>
      <feComposite in="shaky" in2="mask" operator="in"/>
    </filter>
  </defs>
  <rect width="768" height="768" fill="#FFFFFF"/>
  <g filter="url(#crayon)">
    <circle cx="236" cy="214" r="80" fill="#8B5A2B"/>
    <circle cx="538" cy="206" r="74" fill="#8B5A2B"/>
    <ellipse cx="392" cy="428" rx="244" ry="214" fill="#8B5A2B"/>
    <g fill="none" stroke="#222222" stroke-width="12" stroke-linecap="round">
      <circle cx="232" cy="210" r="76"/>
      <circle cx="540" cy="202" r="72"/>
      <ellipse cx="384" cy="422" rx="236" ry="212"/>
    </g>
    <circle cx="264" cy="488" r="38" fill="#E23B2E"/>
    <circle cx="516" cy="480" r="35" fill="#E23B2E"/>
    <ellipse cx="306" cy="392" rx="21" ry="25" fill="#222222"/>
    <ellipse cx="468" cy="386" rx="19" ry="24" fill="#222222"/>
    <ellipse cx="388" cy="466" rx="27" ry="19" fill="#222222"/>
    <path d="M388 482 L388 516 M330 518 Q388 574 446 514" fill="none" stroke="#222222" stroke-width="12" stroke-linecap="round"/>
    <path d="M454 224 L398 190 L402 256 Z M454 224 L510 186 L506 252 Z" fill="#F7C51E" stroke="#F7C51E" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="454" cy="222" r="16" fill="#F2B705"/>
  </g>
</svg>`;

// 多い色から順に、近すぎない色だけを選んでパレットにする。クレヨンのざらつきは色数を絞ってもそのまま残る
function quantize(px, count) {
  const bins = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const b = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += px[i];
    b.g += px[i + 1];
    b.b += px[i + 2];
    bins.set(key, b);
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n).map((b) => [b.r / b.n, b.g / b.n, b.b / b.n].map(Math.round));
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const palette = [];
  for (const c of sorted) {
    if (palette.length >= count) break;
    if (palette.every((p) => d2(p, c) > 20 * 20)) palette.push(c);
  }
  const indices = new Uint8Array(px.length / 4);
  for (let i = 0; i < indices.length; i++) {
    const c = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    let best = 0;
    for (let j = 1; j < palette.length; j++) if (d2(palette[j], c) < d2(palette[best], c)) best = j;
    indices[i] = best;
  }
  return encodeIndexed(SIZE, SIZE, indices, palette);
}

mkdirSync(out, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  for (const [name, svg, colors] of [['neko', NEKO, 0], ['kodomo', KODOMO, 20]]) {
    await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
    // 撮った PNG を画素に戻す（Node だけで PNG を読むと長くなるので、ブラウザの canvas に任せる）
    const b64 = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return btoa(s);
    }, shot.toString('base64'));
    const px = Buffer.from(b64, 'base64');
    const png = colors ? quantize(px, colors) : encodeRgba(SIZE, SIZE, px, { alpha: false });
    writeFileSync(resolve(out, `${name}.png`), png);
    console.log(`make-samples: ${name}.png ${Math.round(png.length / 1024)}KB`);
  }
} finally {
  await browser.close();
}
