// roundRect は iOS 15 以前の Safari に無い。arcTo で同じ角丸を描いて端末差をなくす
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ellipse は現在点から線を引いてしまうので、必ず始点へ移ってから描く
export function ellipsePath(ctx, x, y, rx, ry, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

export function circlePath(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function starPath(ctx, x, y, r, rot = 0, inner = 0.5) {
  for (let i = 0; i < 10; i += 1) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function spiralPath(ctx, x, y, r, rot = 0) {
  const turns = 2.2;
  const n = 28;
  for (let i = 0; i <= n; i += 1) {
    const k = i / n;
    const a = rot + k * turns * Math.PI * 2;
    const rr = r * (0.12 + 0.88 * k);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

export function pawPrintPath(ctx, x, y, s) {
  ellipsePath(ctx, x, y + s * 0.18, s * 0.34, s * 0.27);
  circlePath(ctx, x - s * 0.36, y - s * 0.1, s * 0.13);
  circlePath(ctx, x - s * 0.13, y - s * 0.3, s * 0.14);
  circlePath(ctx, x + s * 0.13, y - s * 0.3, s * 0.14);
  circlePath(ctx, x + s * 0.36, y - s * 0.1, s * 0.13);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
