// 序盤の手触りを保ち、30本以降も60本までは少しずつ難しくする
export const CURVE = Object.freeze({
  gapStart: 150,
  gapEnd: 116,
  pitchStart: 180,
  pitchEnd: 155,
  flatUntil: 3,
  fullAt: 30,
  lateAt: 60,
  gapLate: 106,
  pitchLate: 150,
});

export function rampFor(n, c = CURVE) {
  if (n <= c.flatUntil) return 0;
  if (n >= c.fullAt) return 1;
  return (n - c.flatUntil) / (c.fullAt - c.flatUntil);
}

// n は1から数える「何本目」
export function gapFor(n, c = CURVE) {
  return c.gapStart + (c.gapEnd - c.gapStart) * rampFor(n, c)
    + ((c.gapLate ?? c.gapEnd) - c.gapEnd) * lateRamp(n, c);
}

// ひとつ前のポールの前の縁から、n本目の前の縁までの距離
export function pitchFor(n, c = CURVE) {
  return c.pitchStart + (c.pitchEnd - c.pitchStart) * rampFor(n, c)
    + ((c.pitchLate ?? c.pitchEnd) - c.pitchEnd) * lateRamp(n, c);
}

function lateRamp(n, c) {
  return c.lateAt ? Math.max(0, Math.min(1, (n - c.fullAt) / (c.lateAt - c.fullAt))) : 0;
}
