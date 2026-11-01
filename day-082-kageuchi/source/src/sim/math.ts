// OWNER: core
// sim の小さな計算の道具。three も DOM も使わない。

export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 角度を (-π, π] に畳む。 */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** 角度の差の大きさ（0..π）。 */
export function angleDist(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

/** 角度を最短の向きで補間する。 */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** 角度を最大 maxDelta だけ target へ回す。 */
export function approachAngle(current: number, target: number, maxDelta: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

/** 向き yaw から点 (dx, dz) への角の大きさ（0..π）。 */
export function angleTo(yaw: number, dx: number, dz: number): number {
  return angleDist(Math.atan2(dz, dx), yaw);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

/** 点 p から線分 ab までの距離の2乗。 */
export function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px;
  const qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}
