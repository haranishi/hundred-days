import { skyForScore } from './sky.js';
import { drawSky, drawStars, drawSun, drawClouds, drawTown, drawRoof, drawFish } from './render.js';
import { drawCat } from './cat.js';
import { drawNumber } from './digits.js';
import { STAMPS } from './storage.js';
import { roundRectPath, pawPrintPath, circlePath } from './draw.js';

export const CARD = Object.freeze({ w: 1080, h: 1350 });
export const OG = Object.freeze({ w: 1200, h: 630 });
export const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif';

function outlinedText(ctx, text, x, y, size, { fill = '#fffaf0', stroke = '#4b2e2a', width = size * 0.16, align = 'center', weight = 800 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function pill(ctx, text, cx, cy, size) {
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 1.7;
  ctx.beginPath();
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(40,28,70,0.85)';
  ctx.fill();
  ctx.fillStyle = '#fff6e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.04);
}

// 肉球スタンプ。達成は塗り＋実線、未達は点線の輪だけ。色だけに頼らず形でも区別する
export function drawStamp(ctx, x, y, size, reached, label) {
  ctx.save();
  ctx.beginPath();
  circlePath(ctx, x, y, size * 0.5);
  ctx.fillStyle = reached ? '#fff3e2' : 'rgba(255,243,226,0.35)';
  ctx.fill();
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = reached ? '#c0566a' : '#70515c';
  if (!reached) ctx.setLineDash([size * 0.09, size * 0.08]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  pawPrintPath(ctx, x, y - size * 0.02, size * 0.62);
  if (reached) {
    ctx.fillStyle = '#d76b82';
    ctx.fill();
  } else {
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = '#70515c';
    ctx.stroke();
  }
  if (label) {
    ctx.font = `800 ${Math.max(12, size * 0.3)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(3, size * 0.08);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#291c29';
    ctx.strokeText(label, x, y + size * 0.58);
    ctx.fillStyle = '#fff6e8';
    ctx.fillText(label, x, y + size * 0.58);
  }
  ctx.restore();
}

function backdrop(ctx, logicalW, logicalH, groundH, k, sky = skyForScore(0)) {
  ctx.save();
  ctx.scale(k, k);
  const box = { left: 0, right: logicalW, top: 0, bottom: logicalH };
  const groundY = logicalH - groundH;
  drawSky(ctx, box, groundY, sky);
  drawStars(ctx, box, groundY, sky);
  drawSun(ctx, logicalW * 0.74, groundY - 70, 22);
  drawClouds(ctx, box, groundY, 40, sky);
  drawTown(ctx, box, groundY, 30, 'far', sky);
  drawTown(ctx, box, groundY, 90, 'near', sky);
  drawRoof(ctx, box, groundY, 0);
  ctx.restore();
  return groundY * k;
}

/**
 * d: { score, fish, best, isNewBest, label, dateText, reached:[10,25…], pattern, url }
 */
export function drawResultCard(ctx, d) {
  const { w, h } = CARD;
  const k = w / 288;
  const groundPx = backdrop(ctx, 288, h / k, 58, k, d.sky ?? skyForScore(d.score));
  outlinedText(ctx, 'ぱたにゃん', w / 2, 150, 104);
  pill(ctx, d.label, w / 2, 222, 44);
  const scoreW = drawNumber(ctx, d.score, w / 2, 268, 262, { shadow: 'rgba(40,20,50,0.45)' });
  outlinedText(ctx, '本くぐった', w / 2, 612, 60);
  const infoY = 690;
  drawFish(ctx, w / 2 - 250, infoY - 20, 3.2);
  outlinedText(ctx, `×${d.fish}`, w / 2 - 205, infoY, 54, { align: 'left' });
  outlinedText(ctx, `ベスト ${d.best}`, w / 2 + 250, infoY, 54, { align: 'right' });
  if (d.isNewBest) {
    // NEW は点数の右上に貼ったシールにする。文字に重ねると読めなくなる
    ctx.save();
    ctx.translate(Math.min(w - 90, w / 2 + scoreW / 2 + 80), 330);
    ctx.rotate(0.2);
    ctx.beginPath();
    roundRectPath(ctx, -66, -32, 132, 64, 32);
    ctx.fillStyle = '#ffd95a';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#4b2e2a';
    ctx.stroke();
    ctx.fillStyle = '#4b2e2a';
    ctx.font = `900 42px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEW', 0, 2);
    ctx.restore();
  }
  STAMPS.forEach((s, i) => {
    drawStamp(ctx, w / 2 + (i - 1.5) * 150, 770, 88, d.reached.includes(s), `${s}本`);
  });
  const catScale = 5;
  drawCat(ctx, { x: w / 2 - 10, y: groundPx - 19.5 * catScale, scale: catScale, pattern: d.pattern, pose: 'sit', face: 'happy', paw: 0, tail: 0.25, t: 0 });
  outlinedText(ctx, d.url, w / 2, h - 52, 40, { stroke: '#291c29', width: 7 });
}

export function drawOgImage(ctx, { pattern = 'chatora' } = {}) {
  const { w, h } = OG;
  const k = 2.5;
  const groundPx = backdrop(ctx, w / k, h / k, 44, k);
  outlinedText(ctx, 'ぱたにゃん', 64, 250, 124, { align: 'left' });
  outlinedText(ctx, 'タップで羽ばたく、猫のワンタップゲーム', 66, 330, 36, { width: 8, align: 'left' });
  outlinedText(ctx, 'ダウンロードなし・広告なし', 66, 392, 32, { width: 7, align: 'left' });
  drawCat(ctx, { x: 975, y: 250, scale: 5.8, pattern, pose: 'fly', face: 'happy', paw: 1, tail: 0.3, angle: -0.15, t: 0 });
  drawFish(ctx, 1120, 130, 3);
  drawCat(ctx, { x: 690, y: groundPx - 19.5 * 3.2, scale: 3.2, pattern: 'hachiware', pose: 'sit', face: 'normal', tail: 0.2, t: 0 });
}
