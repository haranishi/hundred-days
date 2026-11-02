// OWNER: core
// 平常の扇の濃さを、プレイヤーから扇までの距離で決める（r03-fix-play 追加：見た目の採点 4 位「全員が同じ白い細線なので、何本も交わると網に見え、
// 塀で切れた所は折れた図形になる」）。近い扇（中に立っている・こちらを向いて届きそうな扇）ほどはっきり、遠い扇は薄く、far より遠ければ描かない。
// 不審・発見の扇はこの濃さを使わない（今のまま目立たせる）。three を import しない（テストで直接たたく）。
import { CONE_STYLE } from '../../config/view';

/**
 * 点 (px, pz) から扇（多角形。poly は x, z の並びで先頭が目の位置、n は点の数）までの距離（m）。中にいれば 0。
 * 番兵の位置ではなく扇までの距離で測るので、遠くの番兵でも扇の先がこちらへ届いていれば近いとみなす。
 */
export function coneDistance(poly: ArrayLike<number>, n: number, px: number, pz: number): number {
  if (n < 3) return n === 0 ? Infinity : Math.hypot(poly[0] - px, poly[1] - pz);
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = poly[j * 2];
    const az = poly[j * 2 + 1];
    const bx = poly[i * 2];
    const bz = poly[i * 2 + 1];
    // 中にいるか（水平に伸ばした線が辺を何回横切るか）
    if (bz > pz !== az > pz && px < ((ax - bx) * (pz - bz)) / (az - bz) + bx) inside = !inside;
    // 辺までの距離
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - px, az + dz * t - pz));
  }
  return inside ? 0 : best;
}

/** 平常の扇に掛ける濃さ（色みと縁の線の両方）。near より近いと nearMul、far で 0（描かない）、その間はまっすぐ下げる。 */
export function calmEmphasis(d: number): number {
  const F = CONE_STYLE.calmFocus;
  if (d <= F.near) return F.nearMul;
  if (d >= F.far) return 0;
  return F.nearMul * (1 - (d - F.near) / (F.far - F.near));
}
