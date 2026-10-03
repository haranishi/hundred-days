// OWNER: gameplay
// 当たりの形と、街の純データ（建物の箱）への問い合わせ。攻撃・カメラの逃げ・体の当たりが同じ関数を使う。
import type { CityIndex } from '../world/query';
import type { Building, Mass } from '../world/types';
import { type Vec3, clamp, distXZ } from './math';

/** 点 (x,y,z) から塊（直方体）までの距離の2乗。中にあれば 0。 */
export function massDistanceSq(m: Mass, x: number, y: number, z: number): number {
  const dx = Math.max(m.rect.x0 - x, 0, x - m.rect.x1);
  const dy = Math.max(m.y0 - y, 0, y - m.y1);
  const dz = Math.max(m.rect.z0 - z, 0, z - m.rect.z1);
  return dx * dx + dy * dy + dz * dz;
}

/** 球が建物（どれかの塊）に触れるか。 */
export function sphereTouchesBuilding(b: Building, x: number, y: number, z: number, r: number): boolean {
  const r2 = r * r;
  return b.masses.some((m) => massDistanceSq(m, x, y, z) <= r2);
}

/** 半直線と直方体の交わり（スラブ法）。入る距離を返し、交わらなければ -1。 */
export function rayMass(m: Mass, o: Vec3, d: Vec3, maxT: number): number {
  let t0 = 0;
  let t1 = maxT;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, m.rect.x0, m.rect.x1],
    [o.y, d.y, m.y0, m.y1],
    [o.z, d.z, m.rect.z0, m.rect.z1],
  ];
  for (const [p, v, lo, hi] of axes) {
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return -1;
      continue;
    }
    let a = (lo - p) / v;
    let b = (hi - p) / v;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

export interface RayHit {
  building: Building;
  t: number;
}

/**
 * 半直線に最初に当たる建物。include で「まだ立っている建物だけ」などに絞る。
 * 街の格子を粗く歩いて候補を集め、候補の塊ごとにスラブ法で調べる。
 */
export function raycastBuildings(index: CityIndex, o: Vec3, d: Vec3, maxT: number, include: (b: Building) => boolean): RayHit | null {
  const seen = new Set<number>();
  let best: RayHit | null = null;
  const step = 30;
  for (let s = 0; s <= maxT + step; s += step) {
    if (best && s > best.t + step) break;
    const t = Math.min(s, maxT);
    for (const b of index.buildingsNear(o.x + d.x * t, o.z + d.z * t, step)) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      if (!include(b)) continue;
      for (const m of b.masses) {
        const hit = rayMass(m, o, d, maxT);
        if (hit >= 0 && (!best || hit < best.t)) best = { building: b, t: hit };
      }
    }
  }
  return best;
}

/** 半直線が maxT までに通り抜ける建物をすべて out に足す（カメラと竜の間の建物を透かすのに使う）。 */
export function raycastAllBuildings(index: CityIndex, o: Vec3, d: Vec3, maxT: number, include: (b: Building) => boolean, out: Set<number>): void {
  const seen = new Set<number>();
  const step = 30;
  for (let s = 0; s <= maxT + step; s += step) {
    const t = Math.min(s, maxT);
    for (const b of index.buildingsNear(o.x + d.x * t, o.z + d.z * t, step)) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      if (!include(b)) continue;
      if (b.masses.some((m) => rayMass(m, o, d, maxT) >= 0)) out.add(b.id);
    }
  }
}

/** 地面（高さ groundY の水平面）と半直線の交わり。上向きなら -1。 */
export function rayGround(o: Vec3, d: Vec3, groundY: number, maxT: number): number {
  if (d.y >= -1e-6) return -1;
  const t = (groundY - o.y) / d.y;
  return t >= 0 && t <= maxT ? t : -1;
}

/**
 * 扇（水平）と建物の外形の当たり。origin から range 以内で、forward（水平の単位ベクトル）から halfAngle 以内。
 * 外形の最も近い点と中心のどちらかが扇に入れば当たりとする（幅の広い建物の取りこぼしを減らす）。
 */
export function fanTouchesBuilding(b: Building, ox: number, oz: number, fx: number, fz: number, range: number, halfAngle: number): boolean {
  const f = b.footprint;
  const cosHalf = Math.cos(halfAngle);
  const inside = ox >= f.x0 && ox <= f.x1 && oz >= f.z0 && oz <= f.z1;
  if (inside) return true;
  const points: [number, number][] = [
    [clamp(ox, f.x0, f.x1), clamp(oz, f.z0, f.z1)],
    [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2],
  ];
  for (const [px, pz] of points) {
    const d = distXZ(px, pz, ox, oz);
    if (d > range) continue;
    if (d < 1e-6) return true;
    if (((px - ox) * fx + (pz - oz) * fz) / d >= cosHalf) return true;
  }
  return false;
}

/** 建物の外形の中で、点 (x,z) に最も近い点までの水平距離。 */
export function footprintDistance(b: Building, x: number, z: number): number {
  const f = b.footprint;
  return Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1));
}

/** 建物の外形の中心。 */
export function footprintCenter(b: Building): { x: number; z: number } {
  return { x: (b.footprint.x0 + b.footprint.x1) / 2, z: (b.footprint.z0 + b.footprint.z1) / 2 };
}
