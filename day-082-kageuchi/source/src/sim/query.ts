// OWNER: core
// ステージから一度だけ作る「問い合わせ」：当たり・視線の遮り・地面の種類・明るさ・植え込み・暗い場所。
// 当たりの形：壁は太さのある線分（向きのある長方形）、建物は長方形、鐘楼（open）は四隅の柱だけ、
// 小物は円、池は楕円、門は両端の柱。外周は町屋の壁（town）が閉じる。
// 視線を遮るのは壁（水抜き穴の壁も含む）と建物だけ。池・小物・門の柱・鐘楼は遮らない。
// 明るさの距離は水平の距離で測る（地面の上の明るさなので）。灯りは壁で遮らない。
import type { MovingLight } from '../contract/snapshot';
import type { HideZone, StageDef, SurfaceKind } from '../stage/types';
import { LIGHT } from '../config/rules';
import { DEG } from './math';
import { moveCircle } from './collision';

/** 向きのある長方形（壁・建物）。中心 (cx, cz)、長さの向き (ux, uz)、半分の長さ hl、半分の太さ ht。 */
export interface Box {
  id: string;
  kind: 'wall' | 'building';
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  hl: number;
  ht: number;
  /** 水抜き穴：しゃがめば通れる。視線は通さない。 */
  crawl: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Circle {
  id: string;
  x: number;
  z: number;
  r: number;
}

export interface Ellipse {
  id: string;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
}

/** 置いてある灯り（明るさの計算用。視界の場 SightField も同じ値を使う）。 */
export interface StaticLight {
  x: number;
  z: number;
  r2: number;
  inv2: number;
  intensity: number;
}

/** 門の柱と鐘楼の柱の半径（m）。types.ts の GateDef の説明に合わせる。 */
const PILLAR_R = 0.3;
const EPS = 1e-9;

/** 灯りの減衰 f(u) ＝ max(0, 1−u²)²。u² ＝ 距離² ÷ 半径²。 */
export function falloff(u2: number): number {
  if (u2 >= 1) return 0;
  const k = 1 - u2;
  return k * k;
}

export type LightTier = 'dark' | 'dim' | 'lit';

export function lightTier(l: number): LightTier {
  return l < LIGHT.tierDim ? 'dark' : l < LIGHT.tierLit ? 'dim' : 'lit';
}

function makeBox(id: string, kind: Box['kind'], cx: number, cz: number, ux: number, uz: number, hl: number, ht: number, crawl: boolean): Box {
  // 外枠：四隅を回して最小・最大を取る
  const ex = Math.abs(ux) * hl + Math.abs(uz) * ht;
  const ez = Math.abs(uz) * hl + Math.abs(ux) * ht;
  return { id, kind, cx, cz, ux, uz, hl, ht, crawl, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez };
}

/**
 * 線分 a→a+d（t は 0..tMax）が長方形に入る最初の t。当たらなければ Infinity。
 * 始点が中にあるときは 0。
 */
export function boxEntryT(b: Box, ax: number, az: number, dx: number, dz: number, tMax: number): number {
  const rx = ax - b.cx;
  const rz = az - b.cz;
  const au = rx * b.ux + rz * b.uz;
  const av = -rx * b.uz + rz * b.ux;
  const du = dx * b.ux + dz * b.uz;
  const dv = -dx * b.uz + dz * b.ux;
  let t0 = 0;
  let t1 = tMax;
  if (Math.abs(du) < EPS) {
    if (au < -b.hl || au > b.hl) return Infinity;
  } else {
    let ta = (-b.hl - au) / du;
    let tb = (b.hl - au) / du;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  if (Math.abs(dv) < EPS) {
    if (av < -b.ht || av > b.ht) return Infinity;
  } else {
    let ta = (-b.ht - av) / dv;
    let tb = (b.ht - av) / dv;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

export class StageQuery {
  readonly stage: StageDef;
  /** 壁と建物（水抜き穴の壁も含む）。視線もこれで遮る。 */
  readonly boxes: Box[] = [];
  /** 小物・門の柱・鐘楼の柱。 */
  readonly circles: Circle[] = [];
  readonly ellipses: Ellipse[] = [];
  /** 置いてある灯り（ステージの順）。明るさ brightnessAt と視界の場 SightField が同じ順で足す。 */
  readonly lights: StaticLight[] = [];

  constructor(stage: StageDef) {
    this.stage = stage;
    this.buildWalls();
    for (const item of stage.interactions ?? []) {
      if (!item.wall) continue;
      const w = item.wall;
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz);
      this.boxes.push(makeBox(w.id, 'wall', (w.a.x + w.b.x) / 2, (w.a.z + w.b.z) / 2, dx / len, dz / len, len / 2, w.thickness / 2, false));
    }
    for (const b of stage.buildings) {
      const f = b.footprint;
      if (b.open) {
        // 鐘楼のように柱だけ：四隅に柱を立てる（柱の太さぶん内側）
        const cs: [number, number][] = [
          [f.x0 + PILLAR_R, f.z0 + PILLAR_R],
          [f.x1 - PILLAR_R, f.z0 + PILLAR_R],
          [f.x0 + PILLAR_R, f.z1 - PILLAR_R],
          [f.x1 - PILLAR_R, f.z1 - PILLAR_R],
        ];
        cs.forEach(([x, z], i) => this.circles.push({ id: `${b.id}-pillar${i}`, x, z, r: PILLAR_R }));
        continue;
      }
      this.boxes.push(makeBox(b.id, 'building', (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, 1, 0, (f.x1 - f.x0) / 2, (f.z1 - f.z0) / 2, false));
    }
    for (const g of stage.gates) {
      const f = g.facingDeg * DEG;
      // 柱は門の正面に直角な向き（壁の向き）に、幅の両端に立つ
      const ax = -Math.sin(f);
      const az = Math.cos(f);
      const h = g.width / 2;
      this.circles.push({ id: `${g.id}-pillarA`, x: g.center.x + ax * h, z: g.center.z + az * h, r: PILLAR_R });
      this.circles.push({ id: `${g.id}-pillarB`, x: g.center.x - ax * h, z: g.center.z - az * h, r: PILLAR_R });
    }
    for (const p of stage.props) if (p.radius > 0) this.circles.push({ id: p.id, x: p.pos.x, z: p.pos.z, r: p.radius });
    for (const p of stage.ponds) this.ellipses.push({ id: p.id, cx: p.center.x, cz: p.center.z, rx: p.rx, rz: p.rz });
    for (const l of stage.lights) this.lights.push({ x: l.pos.x, z: l.pos.z, r2: l.radius * l.radius, inv2: 1 / (l.radius * l.radius), intensity: l.intensity });
  }

  /**
   * 壁を長方形にする。壁どうしが角で接する端（向きが違う壁と端点を共有する）だけ、太さの半分だけ延ばして角の隙間を閉じる。
   * 一直線につながる端（水抜き穴の両側など）と、門の切れ目の端は延ばさない（穴や門の幅が縮まないように）。
   */
  private buildWalls(): void {
    const walls = this.stage.walls;
    const same = (ax: number, az: number, bx: number, bz: number): boolean => Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6;
    for (const w of walls) {
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const ht = w.thickness / 2;
      const cornerAt = (px: number, pz: number): boolean =>
        walls.some((o) => {
          if (o === w) return false;
          if (!same(o.a.x, o.a.z, px, pz) && !same(o.b.x, o.b.z, px, pz)) return false;
          const ol = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z);
          const cross = (ux * (o.b.z - o.a.z) - uz * (o.b.x - o.a.x)) / ol;
          return Math.abs(cross) > 0.01;
        });
      const ea = cornerAt(w.a.x, w.a.z) ? ht : 0;
      const eb = cornerAt(w.b.x, w.b.z) ? ht : 0;
      const hl = (len + ea + eb) / 2;
      const mid = (eb - ea) / 2;
      const cx = (w.a.x + w.b.x) / 2 + ux * mid;
      const cz = (w.a.z + w.b.z) / 2 + uz * mid;
      this.boxes.push(makeBox(w.id, 'wall', cx, cz, ux, uz, hl, ht, w.crawl === true));
    }
  }

  // ---------------------------------------------------------------- 地面・植え込み・暗い場所

  /** その場所の地面（後に書いた面が優先）。 */
  surfaceAt(x: number, z: number): SurfaceKind {
    const s = this.stage.surfaces;
    for (let i = s.length - 1; i >= 0; i--) {
      const r = s[i].rect;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return s[i].kind;
    }
    return this.stage.surfaceDefault;
  }

  bushAt(x: number, z: number): HideZone | null {
    for (const h of this.stage.hides) {
      const dx = x - h.center.x;
      const dz = z - h.center.z;
      if (dx * dx + dz * dz <= h.radius * h.radius) return h;
    }
    return null;
  }

  inBush(x: number, z: number): boolean {
    return this.bushAt(x, z) !== null;
  }

  /** 空の明るさ。DarkZone の中ではその値に置き換え、重なるときは小さい方。 */
  ambientAt(x: number, z: number): number {
    let amb = Infinity;
    for (const d of this.stage.darkZones) {
      const r = d.rect;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && d.ambient < amb) amb = d.ambient;
    }
    return amb === Infinity ? this.stage.baseAmbient : amb;
  }

  darkZoneName(x: number, z: number): string | null {
    let best: { name: string; ambient: number } | null = null;
    for (const d of this.stage.darkZones) {
      const r = d.rect;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && (!best || d.ambient < best.ambient)) best = d;
    }
    return best ? best.name : null;
  }

  // ---------------------------------------------------------------- 明るさ

  private staticLightAt(x: number, z: number): number {
    let sum = 0;
    for (const l of this.lights) {
      const dx = x - l.x;
      const dz = z - l.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < l.r2) sum += l.intensity * falloff(d2 * l.inv2);
    }
    return sum;
  }

  private movingLightAt(x: number, z: number, moving: readonly MovingLight[] | undefined): number {
    if (!moving) return 0;
    let sum = 0;
    for (const l of moving) {
      const dx = x - l.x;
      const dz = z - l.z;
      const r2 = l.radius * l.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < r2) sum += l.intensity * falloff(d2 / r2);
    }
    return sum;
  }

  /** その場所の明るさ L（0..1）。発見の判定はこれを使う。 */
  brightnessAt(x: number, z: number, moving?: readonly MovingLight[]): number {
    const l = this.ambientAt(x, z) + this.staticLightAt(x, z) + this.movingLightAt(x, z, moving);
    return l < 0 ? 0 : l > 1 ? 1 : l;
  }

  // ---------------------------------------------------------------- 視線

  /** 点 a から点 b への線が、壁か建物に当たるか（平面で判定。壁と建物はどれも目の高さより高い）。 */
  blocked(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz);
    const maxZ = Math.max(az, bz);
    for (const b of this.boxes) {
      if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
      if (boxEntryT(b, ax, az, dx, dz, 1) <= 1) return true;
    }
    return false;
  }

  /** 点 o から向き (dx, dz)（長さ 1）へ伸ばした線が、最初に壁か建物に当たるまでの距離（当たらなければ maxLen）。 */
  rayLength(ox: number, oz: number, dx: number, dz: number, maxLen: number): number {
    const ex = ox + dx * maxLen;
    const ez = oz + dz * maxLen;
    const minX = Math.min(ox, ex);
    const maxX = Math.max(ox, ex);
    const minZ = Math.min(oz, ez);
    const maxZ = Math.max(oz, ez);
    let best = maxLen;
    for (const b of this.boxes) {
      if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
      const t = boxEntryT(b, ox, oz, dx, dz, best);
      if (t < best) best = t;
    }
    return best;
  }

  // ---------------------------------------------------------------- 当たり

  /** 移動途中の当たりを求める。bodies は生きている人物の円（任意）。 */
  move(out: { x: number; z: number }, dx: number, dz: number, r: number, crouch: boolean, bodies?: readonly Circle[]): void {
    moveCircle(this, out, dx, dz, r, crouch, bodies);
  }

  /** 半径 r の円が、どれかの当たりと重なるか。crouch なら水抜き穴の壁は通れる。 */
  overlaps(x: number, z: number, r: number, crouch: boolean): boolean {
    const bd = this.stage.bounds;
    if (x - r < bd.x0 || x + r > bd.x1 || z - r < bd.z0 || z + r > bd.z1) return true;
    for (const b of this.boxes) {
      if (crouch && b.crawl) continue;
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      const rx = x - b.cx;
      const rz = z - b.cz;
      const u = rx * b.ux + rz * b.uz;
      const v = -rx * b.uz + rz * b.ux;
      const cu = u < -b.hl ? -b.hl : u > b.hl ? b.hl : u;
      const cv = v < -b.ht ? -b.ht : v > b.ht ? b.ht : v;
      const du = u - cu;
      const dv = v - cv;
      if (du * du + dv * dv < r * r) return true;
    }
    for (const c of this.circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    for (const e of this.ellipses) {
      const qx = (x - e.cx) / (e.rx + r);
      const qz = (z - e.cz) / (e.rz + r);
      if (qx * qx + qz * qz < 1) return true;
    }
    return false;
  }

  /** 水抜き穴の壁と重なっているか（しゃがみから立てるかの判定）。 */
  overlapsCrawl(x: number, z: number, r: number): boolean {
    for (const b of this.boxes) {
      if (!b.crawl) continue;
      const rx = x - b.cx;
      const rz = z - b.cz;
      const u = rx * b.ux + rz * b.uz;
      const v = -rx * b.uz + rz * b.ux;
      const cu = u < -b.hl ? -b.hl : u > b.hl ? b.hl : u;
      const cv = v < -b.ht ? -b.ht : v > b.ht ? b.ht : v;
      const du = u - cu;
      const dv = v - cv;
      if (du * du + dv * dv < r * r) return true;
    }
    return false;
  }

  /**
   * 半径 r の円を当たりの外へ押し出す（壁に沿って滑る）。out に結果を書く。
   * 数回くり返して、角で二つの当たりに挟まれたときも外へ出す。
   */
  resolve(out: { x: number; z: number }, r: number, crouch: boolean): void {
    let x = out.x;
    let z = out.z;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (crouch && b.crawl) continue;
        if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
        const rx = x - b.cx;
        const rz = z - b.cz;
        const u = rx * b.ux + rz * b.uz;
        const v = -rx * b.uz + rz * b.ux;
        let pu = 0;
        let pv = 0;
        if (u > -b.hl && u < b.hl && v > -b.ht && v < b.ht) {
          // 中に入っている：浅い方の軸で外へ
          const peU = b.hl - Math.abs(u) + r;
          const peV = b.ht - Math.abs(v) + r;
          if (peU < peV) pu = (u >= 0 ? 1 : -1) * peU;
          else pv = (v >= 0 ? 1 : -1) * peV;
        } else {
          const cu = u < -b.hl ? -b.hl : u > b.hl ? b.hl : u;
          const cv = v < -b.ht ? -b.ht : v > b.ht ? b.ht : v;
          const du = u - cu;
          const dv = v - cv;
          const d2 = du * du + dv * dv;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          if (d < EPS) {
            pv = r;
          } else {
            const k = (r - d) / d;
            pu = du * k;
            pv = dv * k;
          }
        }
        x += pu * b.ux - pv * b.uz;
        z += pu * b.uz + pv * b.ux;
        moved = true;
      }
      for (const c of this.circles) {
        const dx = x - c.x;
        const dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d < EPS) {
          x += rr;
        } else {
          const k = (rr - d) / d;
          x += dx * k;
          z += dz * k;
        }
        moved = true;
      }
      for (const e of this.ellipses) {
        const ax = e.rx + r;
        const az = e.rz + r;
        const qx = (x - e.cx) / ax;
        const qz = (z - e.cz) / az;
        const q2 = qx * qx + qz * qz;
        if (q2 >= 1) continue;
        const q = Math.sqrt(q2);
        if (q < EPS) {
          x = e.cx + ax;
        } else {
          x = e.cx + (qx / q) * ax;
          z = e.cz + (qz / q) * az;
        }
        moved = true;
      }
      const bd = this.stage.bounds;
      if (x < bd.x0 + r) x = bd.x0 + r;
      if (x > bd.x1 - r) x = bd.x1 - r;
      if (z < bd.z0 + r) z = bd.z0 + r;
      if (z > bd.z1 - r) z = bd.z1 - r;
      if (!moved) break;
    }
    out.x = x;
    out.z = z;
  }
}

const cache = new WeakMap<StageDef, StageQuery>();

/** ステージごとに一度だけ作る（やり直しでは作り直さない）。 */
export function getQuery(stage: StageDef): StageQuery {
  let q = cache.get(stage);
  if (!q) {
    q = new StageQuery(stage);
    cache.set(stage, q);
  }
  return q;
}
