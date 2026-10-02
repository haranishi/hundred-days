// 完成イメージ。見当をつけるための絵なので写真風にはせず、弁当箱・土台・パーツを模様で塗るやさしいイラストにする
import { toPathD } from '../contour.js';
import { FOODS } from '../foods.js';
import { foodPattern } from './textures.js';

const RIM = 7;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function withShadow(ctx, u, blur, dy, alpha, draw) {
  ctx.save();
  ctx.shadowColor = `rgba(90, 60, 25, ${alpha})`;
  ctx.shadowBlur = blur * u;
  ctx.shadowOffsetY = dy * u;
  draw();
  ctx.restore();
}

function broccoli(ctx, u, x, y, s) {
  const P = (v) => v * u;
  withShadow(ctx, u, 1.4, 0.6, 0.25, () => {
    ctx.fillStyle = '#9CC46B';
    roundRect(ctx, P(x + s * 0.4), P(y + s * 0.45), P(s * 0.22), P(s * 0.5), P(s * 0.08));
    ctx.fill();
  });
  const buds = [[0.3, 0.35, 0.22], [0.55, 0.28, 0.25], [0.75, 0.42, 0.2], [0.42, 0.52, 0.2], [0.63, 0.55, 0.19]];
  withShadow(ctx, u, 1.4, 0.6, 0.25, () => {
    ctx.fillStyle = '#3F8A3A';
    for (const [bx, by, br] of buds) {
      ctx.beginPath();
      ctx.arc(P(x + s * bx), P(y + s * by), P(s * br), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.fillStyle = '#6DB35A';
  for (const [bx, by, br] of buds) {
    ctx.beginPath();
    ctx.arc(P(x + s * bx - s * br * 0.3), P(y + s * by - s * br * 0.3), P(s * br * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
}

function tomato(ctx, u, cx, cy, r) {
  const P = (v) => v * u;
  withShadow(ctx, u, 1.6, 0.7, 0.3, () => {
    ctx.fillStyle = '#E4412F';
    ctx.beginPath();
    ctx.arc(P(cx), P(cy), P(r), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(P(cx - r * 0.38), P(cy - r * 0.35), P(r * 0.22), P(r * 0.13), -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4C9A3B';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(P(cx + Math.cos(a) * r * 0.28), P(cy - r * 0.62 + Math.sin(a) * r * 0.2), P(r * 0.26), P(r * 0.09), a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tamagoyaki(ctx, u, x, y, w, h) {
  const P = (v) => v * u;
  const sw = w * 0.48;
  for (let i = 0; i < 2; i++) {
    const sx = x + i * (w * 0.52);
    withShadow(ctx, u, 1.4, 0.6, 0.25, () => {
      ctx.fillStyle = '#F7CF4E';
      roundRect(ctx, P(sx), P(y), P(sw), P(h), P(Math.min(sw, h) * 0.3));
      ctx.fill();
    });
    // 切り口の巻いた層。内側へ小さくなる角丸の線で見せる
    ctx.strokeStyle = '#E3AA2E';
    ctx.lineWidth = Math.max(1, 0.45 * u);
    for (let t = 1; t <= 2; t++) {
      const inset = Math.min(sw, h) * 0.17 * t;
      roundRect(ctx, P(sx + inset), P(y + inset), P(sw - inset * 2), P(h - inset * 2), P(Math.max(0.5, Math.min(sw, h) * 0.3 - inset * 0.6)));
      ctx.stroke();
    }
  }
}

// キャラの右に余白があれば、付け合わせを縦に並べる。無ければ隅に小さく置き、キャラの下に隠れてもよい
function layout(plan) {
  const { w: bw, h: bh } = plan.box;
  const { w: cw, h: ch } = plan.charMm;
  const free = bw - cw;
  const cy = (bh - ch) / 2;
  if (free >= 40) {
    const cx = Math.max(4, (free - 36) * 0.35);
    const col = { x: cx + cw + 3, w: bw - (cx + cw + 3) - 3 };
    return { cx, cy, col };
  }
  return { cx: free / 2, cy, col: null };
}

export function drawPreview(canvas, plan) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const { w: bw, h: bh } = plan.box;
  const totalW = bw + RIM * 2;
  const totalH = bh + RIM * 2;
  canvas.style.aspectRatio = `${totalW} / ${totalH}`;
  const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 360;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round((cssW * dpr * totalH) / totalW);
  const u = canvas.width / totalW;
  const P = (v) => v * u;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  withShadow(ctx, u, 3, 1.4, 0.3, () => {
    ctx.fillStyle = '#C98B4F';
    roundRect(ctx, 0.5 * u, 0.5 * u, P(totalW - 1), P(totalH - 1.5), P(12));
    ctx.fill();
  });
  ctx.fillStyle = '#EED6AE';
  roundRect(ctx, P(RIM), P(RIM), P(bw), P(bh), P(8));
  ctx.fill();
  ctx.strokeStyle = '#D9B98A';
  ctx.lineWidth = P(1.2);
  ctx.stroke();

  const { cx, cy, col } = layout(plan);
  const ix = RIM;
  const iy = RIM;
  if (col) {
    const s = Math.min(col.w, bh / 3.2, 30);
    const mid = ix + col.x + col.w / 2;
    broccoli(ctx, u, mid - s / 2, iy + bh * 0.04, s);
    tomato(ctx, u, mid, iy + bh * 0.52, Math.min(s * 0.42, 12));
    tamagoyaki(ctx, u, mid - s * 0.55, iy + bh - s * 0.62 - 4, s * 1.1, s * 0.62);
  } else {
    const s = Math.min(24, bh * 0.28);
    broccoli(ctx, u, ix + bw - s - 3, iy + 2, s);
    tomato(ctx, u, ix + bw - s * 0.6, iy + bh - s * 0.6, s * 0.4);
    tamagoyaki(ctx, u, ix + 3, iy + bh - s * 0.6 - 3, s * 1.2, s * 0.55);
  }

  const scale = plan.scale.mmPerPx * u;
  const ox = P(ix + cx);
  const oy = P(iy + cy);
  const base = new Path2D(toPathD(plan.base.polys, scale, ox, oy));
  withShadow(ctx, u, 2.4, 1, 0.3, () => {
    ctx.fillStyle = foodPattern(ctx, plan.base.food, FOODS[plan.base.food].color, u);
    ctx.fill(base, 'evenodd');
  });
  // plan.groups は「ご飯のパーツ → シートを大きい順 → のり」の順なので、その順に重ねれば作る順と同じ見え方になる
  for (const g of plan.groups) {
    const path = new Path2D(g.parts.map((p) => toPathD(p.polys, scale, ox, oy)).join(''));
    withShadow(ctx, u, 1.1, 0.45, 0.22, () => {
      ctx.fillStyle = foodPattern(ctx, g.food, FOODS[g.food].color, u);
      ctx.fill(path, 'evenodd');
    });
  }
  ctx.strokeStyle = 'rgba(120, 95, 60, 0.35)';
  ctx.lineWidth = Math.max(1, 0.35 * u);
  ctx.stroke(base);
}
