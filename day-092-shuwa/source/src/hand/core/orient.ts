/**
 * 向き（手のひらの向き・指先の向き）→ 手の回転。
 * 場の座標: 見る人（相手）は +Z 側, +X=見る人から見て右, +Y=上。
 * 手の座標の +Y（指先）が fingers に、+Z（手のひらの面の外向き）が palm に重なる回転を返す。
 */
import type { Dir, Orientation, Vec3 } from '../types';
import { add, cross, dot, fromCols, length, normalize, sub, type M3 } from './math';

export function dirVector(d: Dir): Vec3 {
  if (Array.isArray(d)) return normalize(d as Vec3);
  switch (d) {
    case 'toViewer':
      return [0, 0, 1];
    case 'toSigner':
      return [0, 0, -1];
    case 'up':
      return [0, 1, 0];
    case 'down':
      return [0, -1, 0];
    case 'viewerLeft':
      return [-1, 0, 0];
    case 'viewerRight':
      return [1, 0, 0];
  }
  return [0, 0, 1];
}

/**
 * 手の座標→場の座標の回転。palm と fingers が直交していない（斜めの指定のずれ）ときは、
 * 2つの方向を同じ角度ずつ逆向きに開いて直交させる（どちらか一方だけを曲げると、その方向だけ誤差が大きくなるため）。
 * 平行で決まらないときは、手のひらを相手へ向けた形を基準にして補う。
 */
export function orientationMatrix(o: Orientation): M3 {
  let f = dirVector(o.fingers);
  let p = dirVector(o.palm);
  if (length(f) < 1e-9) f = [0, 1, 0];
  if (length(p) < 1e-9) p = [0, 0, 1];
  const c = dot(f, p);
  if (Math.abs(c) > 0.999) {
    // 平行: 指先の向きを優先し、手のひらは指先に直交するもっとも「相手向き」に近い方向にする
    const ref: Vec3 = Math.abs(f[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    p = normalize(sub(ref, [f[0] * dot(ref, f), f[1] * dot(ref, f), f[2] * dot(ref, f)]));
  } else if (Math.abs(c) > 1e-9) {
    const m = normalize(add(f, p));
    const n = normalize(sub(f, p));
    const s = Math.SQRT1_2;
    f = normalize([(m[0] + n[0]) * s, (m[1] + n[1]) * s, (m[2] + n[2]) * s]);
    p = normalize([(m[0] - n[0]) * s, (m[1] - n[1]) * s, (m[2] - n[2]) * s]);
  }
  const x = normalize(cross(f, p));
  return fromCols(x, f, p);
}
