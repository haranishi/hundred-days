/**
 * 小さなベクトル・回転の計算。three.js に依存させない（landmarks() を軽く保ち、Node の単体試験で動かすため）。
 * 行列は 3x3 の列優先（[x列, y列, z列]）。四元数は [x, y, z, w]。角度は特記がなければラジアン。
 */
import type { Vec3 } from '../types';

export type M3 = readonly [number, number, number, number, number, number, number, number, number];
export type Quat = readonly [number, number, number, number];

export const DEG = Math.PI / 180;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const madd = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** 2つの方向のなす角（ラジアン） */
export function angleBetween(a: Vec3, b: Vec3): number {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(clamp(d, -1, 1));
}

export const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const fromCols = (x: Vec3, y: Vec3, z: Vec3): M3 => [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
export const colX = (m: M3): Vec3 => [m[0], m[1], m[2]];
export const colY = (m: M3): Vec3 => [m[3], m[4], m[5]];
export const colZ = (m: M3): Vec3 => [m[6], m[7], m[8]];
export const mulMV = (m: M3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];
export function mulMM(a: M3, b: M3): M3 {
  const x = mulMV(a, [b[0], b[1], b[2]]);
  const y = mulMV(a, [b[3], b[4], b[5]]);
  const z = mulMV(a, [b[6], b[7], b[8]]);
  return fromCols(x, y, z);
}
export const transpose = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** X軸まわりの回転。+θ で +Y が +Z へ倒れる（指の曲げ＝手のひら側へ） */
export function rotX(r: number): M3 {
  const c = Math.cos(r), s = Math.sin(r);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
/** Y軸まわりの回転。+θ で +Z が +X へ回る */
export function rotY(r: number): M3 {
  const c = Math.cos(r), s = Math.sin(r);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
/** Z軸まわりの回転。+θ で +X が +Y へ回る（−θ で +Y が +X＝親指側へ倒れる） */
export function rotZ(r: number): M3 {
  const c = Math.cos(r), s = Math.sin(r);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

export function quatFromM3(m: M3): Quat {
  const m00 = m[0], m10 = m[1], m20 = m[2], m01 = m[3], m11 = m[4], m21 = m[5], m02 = m[6], m12 = m[7], m22 = m[8];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

export function m3FromQuat(q: Quat): M3 {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy),
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx),
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy),
  ];
}

/** 球面線形補間（短い方の弧） */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) {
    d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let k0: number, k1: number;
  if (d > 0.9995) {
    k0 = 1 - t; k1 = t;
  } else {
    const th = Math.acos(d), s = Math.sin(th);
    k0 = Math.sin((1 - t) * th) / s;
    k1 = Math.sin(t * th) / s;
  }
  const x = a[0] * k0 + bx * k1, y = a[1] * k0 + by * k1, z = a[2] * k0 + bz * k1, w = a[3] * k0 + bw * k1;
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

/** 2つの線分の最短距離（カプセルどうしのめり込みの判定に使う） */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s: number, t: number;
  if (a <= 1e-12 && e <= 1e-12) return length(r);
  if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return distance(madd(p1, d1, s), madd(p2, d2, t));
}

/** 3次エルミート曲線: p0 から p1 へ、端の接線 m0・m1 で結ぶ（t は 0〜1） */
export function hermite(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, t: number): Vec3 {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = 3 * t2 - 2 * t3, h11 = t3 - t2;
  return [
    h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
    h00 * p0[2] + h10 * m0[2] + h01 * p1[2] + h11 * m1[2],
  ];
}

/** 中心付き Catmull-Rom（centripetal でなく一様。点の間隔がそろったキーフレーム位置の補間に使う） */
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}
