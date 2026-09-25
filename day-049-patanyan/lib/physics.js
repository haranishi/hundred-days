// 数値の初期値は REQUIREMENTS.md の「調整の記録」と対にして変える
export const PHYS = Object.freeze({
  gravity: 1500,
  flapVy: -420,
  maxFall: 600,
  speed: 110,
  dt: 1 / 120,
  maxFrame: 0.1,
  catR: 9,
});

export const WORLD = Object.freeze({
  width: 288,
  minH: 512,
  maxH: 624,
  bandH: 420,
  groundH: 72,
  catX: 80,
  poleW: 52,
});

// 半陰的オイラー。速度を先に更新するので、どのフレームレートでも同じ固定刻みなら同じ位置になる
export function integrate(body, dt = PHYS.dt, p = PHYS) {
  body.vy = Math.min(body.vy + p.gravity * dt, p.maxFall);
  body.y += body.vy * dt;
}

// 羽ばたきは足し算ではなく代入。連打しても上昇速度が青天井にならず、1回の意味が毎回同じになる
export function applyFlap(body, p = PHYS) {
  body.vy = p.flapVy;
}

// 入力の時刻を「その時刻以後で最初の刻みの境目」に割り当てる。
// 描画の間隔に関係なく同じ境目に乗るので、60/120/144Hz で軌道が一致する
export function stepIndexFor(t, dt = PHYS.dt) {
  return Math.max(0, Math.ceil(t / dt - 1e-7));
}
