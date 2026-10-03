// OWNER: world
// 矩形の小さな道具。街は軸に平行な矩形の組み合わせで表す。
import type { Rect, Side } from './types';

export function rect(x0: number, z0: number, x1: number, z1: number): Rect {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
}

export const width = (r: Rect): number => r.x1 - r.x0;
export const depth = (r: Rect): number => r.z1 - r.z0;
export const area = (r: Rect): number => width(r) * depth(r);
export const centerX = (r: Rect): number => (r.x0 + r.x1) / 2;
export const centerZ = (r: Rect): number => (r.z0 + r.z1) / 2;

export function inset(r: Rect, n: number, s: number, e: number, w: number): Rect {
  return { x0: r.x0 + w, z0: r.z0 + n, x1: r.x1 - e, z1: r.z1 - s };
}

export function insetAll(r: Rect, d: number): Rect {
  return inset(r, d, d, d, d);
}

export function isValid(r: Rect, minSide = 0): boolean {
  return width(r) > minSide && depth(r) > minSide;
}

export function containsPoint(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

export function containsRect(outer: Rect, inner: Rect, eps = 1e-6): boolean {
  return inner.x0 >= outer.x0 - eps && inner.x1 <= outer.x1 + eps && inner.z0 >= outer.z0 - eps && inner.z1 <= outer.z1 + eps;
}

/** 内部が重なるか（辺が接するだけなら false） */
export function overlaps(a: Rect, b: Rect, eps = 1e-6): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
}

/**
 * 2つの矩形が辺で隣り合うか。隙間 gap 以下で向かい合い、
 * 向かい合う辺の重なりが minOverlap 以上あれば隣とみなす。
 */
export function touches(a: Rect, b: Rect, gap: number, minOverlap: number): boolean {
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
  const gapZ = Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1);
  const sideBySideX = gapX >= -1e-6 && gapX <= gap && overlapZ >= minOverlap;
  const sideBySideZ = gapZ >= -1e-6 && gapZ <= gap && overlapX >= minOverlap;
  return sideBySideX || sideBySideZ;
}

/** 側の向き（外向きの単位ベクトル）。n は -z。 */
export function sideNormal(side: Side): { x: number; z: number } {
  switch (side) {
    case 'n':
      return { x: 0, z: -1 };
    case 's':
      return { x: 0, z: 1 };
    case 'e':
      return { x: 1, z: 0 };
    case 'w':
      return { x: -1, z: 0 };
  }
}

export function opposite(side: Side): Side {
  return side === 'n' ? 's' : side === 's' ? 'n' : side === 'e' ? 'w' : 'e';
}

/** 区間 [a,b] を幅 widths の順に切る。余りは最後の区画に足す。 */
export function splitSpan(a: number, b: number, widths: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = a;
  for (let i = 0; i < widths.length; i++) {
    const end = i === widths.length - 1 ? b : Math.min(b, cursor + widths[i]);
    if (end - cursor > 1e-6) out.push([cursor, end]);
    cursor = end;
    if (cursor >= b) break;
  }
  return out;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
