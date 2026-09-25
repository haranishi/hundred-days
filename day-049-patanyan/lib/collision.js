import { WORLD } from './physics.js';

export function circleRect(cx, cy, r, x, y, w, h) {
  const px = Math.max(x, Math.min(cx, x + w));
  const py = Math.max(y, Math.min(cy, y + h));
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy < r * r ? { x: px, y: py } : null;
}

export function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

// 上のポールは画面の外まで伸びている扱い。天井より上へ回り込んで抜ける道を作らない
export function hitPole(cx, cy, r, pole, bandH = WORLD.bandH) {
  return (
    circleRect(cx, cy, r, pole.x, -10000, pole.w, pole.top + 10000) ||
    circleRect(cx, cy, r, pole.x, pole.bottom, pole.w, bandH + 10000 - pole.bottom)
  );
}

export function hitGround(cy, r, bandH = WORLD.bandH) {
  return cy + r >= bandH;
}

// 天井は死なない。ぶつかったらそこで止めるだけにして、上に逃げても理不尽に終わらないようにする。
// top は止まる高さ（帯の座標）。実際のゲームでは画面の上端を渡すので、帯より上の空の分だけ負になる
export function clampCeiling(body, r, top = 0) {
  if (body.y - r >= top) return false;
  body.y = top + r;
  if (body.vy < 0) body.vy = 0;
  return true;
}
