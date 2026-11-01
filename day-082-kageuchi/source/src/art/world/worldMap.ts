// OWNER: world-art
// ステージのデータから、地面の地図を2枚焼く（起動時に CPU で。ステージを直せば地図も追いつく）。
// A：白砂・苔・石畳・土の重み。B：環境光の倍率（暗い場所と軒下）・接地の暗がり・掃き目の帯・水際。
// 地面だけでなく、壁や建物の材質も B の環境光を自分の xz で引くので、ゲームの暗い場所と見た目の暗さがそろう。
import { DataTexture, DataUtils, HalfFloatType, RGBAFormat, UnsignedByteType } from 'three';
import type { Rect, StageDef, SurfaceKind, Vec2 } from '../../stage/types';
import { MAP_UNIFORMS, setupMapTexture } from '../render/materials';
import { LOOK } from './look';

const KIND_INDEX: Record<SurfaceKind, number> = { gravel: 0, moss: 1, stone: 2, dirt: 3 };

export interface WorldMapInfo {
  x0: number;
  z0: number;
  width: number;
  depth: number;
  res: number;
}

function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** 長方形までの距離（中なら 0）。 */
function rectDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/** 線分 a-b までの距離。 */
function segDist(a: Vec2, b: Vec2, x: number, z: number): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz || 1;
  const t = Math.min(1, Math.max(0, ((x - a.x) * vx + (z - a.z) * vz) / l2));
  return Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
}

function grow(r: Rect, d: number): Rect {
  return { x0: r.x0 - d, z0: r.z0 - d, x1: r.x1 + d, z1: r.z1 + d };
}

/** 箱で平均する（半径 rad 画素、横→縦の2回）。 */
function boxBlur(src: Float32Array, w: number, h: number, rad: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = rad * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/** 砂紋の帯を作る物（白砂の上の物）。角を丸めた長方形：中心・半分の大きさ・丸み・帯の幅。 */
export interface RakeFeature {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  r: number;
  band: number;
}

export function rakeFeatures(stage: StageDef): RakeFeature[] {
  const R = LOOK.ground.rake;
  const out: RakeFeature[] = [];
  const inGravel = (x: number, z: number): boolean => {
    let k = stage.surfaceDefault;
    for (const s of stage.surfaces) if (inRect(s.rect, x, z)) k = s.kind;
    return k === 'gravel';
  };
  const circle = (x: number, z: number, r: number): void => {
    if (inGravel(x, z)) out.push({ cx: x, cz: z, hx: 0, hz: 0, r, band: R.band + R.bandPerR * r });
  };
  const rect = (x0: number, z0: number, x1: number, z1: number, band = R.edgeBand): void => {
    out.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, r: 0, band });
  };
  for (const h of stage.hides) circle(h.center.x, h.center.z, h.radius * 0.95);
  for (const p of stage.props) {
    if (p.kind === 'pine') circle(p.pos.x, p.pos.z, 0.55 * (p.scale ?? 1));
    else if (p.kind === 'brazier') circle(p.pos.x, p.pos.z, 0.5);
    else if (p.kind === 'stoneLantern') circle(p.pos.x, p.pos.z, 0.42);
    else if (p.kind === 'rock') circle(p.pos.x, p.pos.z, 0.6 * (p.scale ?? 1));
  }
  for (const s of stage.surfaces) if (s.kind === 'stone') rect(s.rect.x0, s.rect.z0, s.rect.x1, s.rect.z1);
  for (const b of stage.buildings) rect(b.footprint.x0, b.footprint.z0, b.footprint.x1, b.footprint.z1, R.edgeBand + 0.25);
  for (const w of stage.walls) {
    if (w.kind === 'town') continue;
    const t = w.thickness / 2 + 0.06;
    rect(Math.min(w.a.x, w.b.x) - t, Math.min(w.a.z, w.b.z) - t, Math.max(w.a.x, w.b.x) + t, Math.max(w.a.z, w.b.z) + t);
  }
  return out;
}

export function buildWorldMap(stage: StageDef): WorldMapInfo {
  const M = LOOK.map;
  const x0 = stage.bounds.x0 - M.margin;
  const z0 = stage.bounds.z0 - M.margin;
  const width = stage.bounds.x1 - stage.bounds.x0 + M.margin * 2;
  const depth = stage.bounds.z1 - stage.bounds.z0 + M.margin * 2;
  const W = Math.round(width * M.res);
  const H = Math.round(depth * M.res);
  const N = W * H;

  // ---- A：地面の種類（4×4 で抜き取りして縁をなめらかに） ----
  const kinds = [new Float32Array(N), new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  const kindAt = (x: number, z: number): number => {
    let k = KIND_INDEX[stage.surfaceDefault];
    for (const s of stage.surfaces) if (inRect(s.rect, x, z)) k = KIND_INDEX[s.kind];
    return k;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      for (let sj = 0; sj < 4; sj++) {
        for (let si = 0; si < 4; si++) {
          const x = x0 + (i + (si + 0.5) / 4) / M.res;
          const z = z0 + (j + (sj + 0.5) / 4) / M.res;
          kinds[kindAt(x, z)][j * W + i] += 1 / 16;
        }
      }
    }
  }
  // 白砂・苔・土の境はぼかす（石畳の縁は切石なので鋭いまま）
  const soft = [boxBlur(kinds[0], W, H, 2), boxBlur(kinds[1], W, H, 3), kinds[2], boxBlur(kinds[3], W, H, 3)];

  // ---- B：環境光の倍率 ----
  const amb = new Float32Array(N).fill(1);
  const base = stage.baseAmbient;
  const eaves = LOOK.map.eaves;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) / M.res;
      const z = z0 + (j + 0.5) / M.res;
      let a = 1;
      for (const dz of stage.darkZones) if (inRect(dz.rect, x, z)) a = Math.min(a, dz.ambient / base);
      // 軒下（暗い場所の決まっていない建物）。鐘楼は柱だけなので浅く
      for (const b of stage.buildings) {
        // 軒下が暗い場所として決まっている建物（本堂）は、その値に任せる
        const cx = (b.footprint.x0 + b.footprint.x1) / 2;
        const cz = (b.footprint.z0 + b.footprint.z1) / 2;
        if (stage.darkZones.some((d) => inRect(d.rect, cx, cz))) continue;
        const o = b.open ? eaves.openOverhang : eaves.overhang;
        if (inRect(grow(b.footprint, o), x, z)) a = Math.min(a, b.open ? eaves.openFactor : eaves.factor);
      }
      // ステージの外（町屋の向こう）は少し暗い
      const out = stage.bounds;
      if (x < out.x0 - 1 || x > out.x1 + 1 || z < out.z0 - 1 || z > out.z1 + 1) a = Math.min(a, M.outsideAmbient);
      amb[j * W + i] = a;
    }
  }
  const ambSoft = boxBlur(amb, W, H, 3);

  // ---- B：接地の暗がり（地面だけが使う）・掃き目の帯・水際 ----
  const contact = new Float32Array(N);
  const rake = new Float32Array(N);
  const shore = new Float32Array(N);
  const damp = new Float32Array(N);
  const C = LOOK.map.contact;
  const band = stage.surfaces.filter((s) => s.kind === 'gravel' && s.rect.z1 - s.rect.z0 < 4).map((s) => s.rect);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) / M.res;
      const z = z0 + (j + 0.5) / M.res;
      let ao = 1;
      let wet = 0;
      for (const w of stage.walls) {
        const d = Math.max(0, segDist(w.a, w.b, x, z) - w.thickness / 2);
        const k = w.kind === 'town' ? C.town : w.kind === 'dobei' ? C.dobei : C.itabei;
        ao *= 1 - k[0] * Math.exp(-d / k[1]);
        wet = Math.max(wet, Math.exp(-d / M.damp.wallWidth) * 0.45);
      }
      for (const b of stage.buildings) {
        const d = rectDist(b.footprint, x, z);
        const k = b.open ? C.open : C.building;
        ao *= 1 - k[0] * Math.exp(-d / k[1]);
        if (!b.open) {
          const drop = Math.abs(d - M.damp.eaves) / M.damp.width;
          wet = Math.max(wet, Math.exp(-drop * drop) * M.damp.strength);
        }
      }
      for (const p of stage.props) {
        const d = Math.max(0, Math.hypot(x - p.pos.x, z - p.pos.z) - p.radius * (p.scale ?? 1));
        const k = p.kind === 'pine' ? C.pine : p.kind === 'rock' ? C.rock : C.prop;
        ao *= 1 - k[0] * Math.exp(-d / k[1]);
      }
      for (const h of stage.hides) {
        const d = Math.max(0, Math.hypot(x - h.center.x, z - h.center.z) - h.radius * 0.85);
        ao *= 1 - C.bush[0] * Math.exp(-d / C.bush[1]);
      }
      contact[j * W + i] = ao;
      damp[j * W + i] = wet;
      for (const r of band) {
        const d = rectDist(r, x, z);
        rake[j * W + i] = Math.max(rake[j * W + i], d <= 0 ? 1 : Math.max(0, 1 - d / 0.25));
      }
      for (const p of stage.ponds) {
        const ex = (x - p.center.x) / p.rx;
        const ez = (z - p.center.z) / p.rz;
        const e = Math.sqrt(ex * ex + ez * ez);
        // 楕円の縁からの外向きのおおよその距離（m）
        const d = (e - 1) * Math.min(p.rx, p.rz);
        shore[j * W + i] = Math.max(shore[j * W + i], Math.min(1, Math.max(0, 1 - d / LOOK.map.shoreWidth)));
      }
    }
  }

  // ---- C：見回りの道の踏み荒らし（道順の線分と、立ち番の足元） ----
  const wear = new Float32Array(N);
  const segs: [Vec2, Vec2][] = [];
  const spots: Vec2[] = [];
  for (const g of stage.guards) {
    if (g.route && g.route.length > 1) {
      for (let i = 0; i < g.route.length - 1; i++) segs.push([g.route[i].pos, g.route[i + 1].pos]);
      if (g.routeMode === 'loop') segs.push([g.route[g.route.length - 1].pos, g.route[0].pos]);
      for (const w of g.route) if (w.wait > 0) spots.push(w.pos);
    } else spots.push(g.start);
  }
  const W2 = LOOK.map.wear;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) / M.res;
      const z = z0 + (j + 0.5) / M.res;
      let v = 0;
      for (const [a, b] of segs) v = Math.max(v, 1 - Math.min(1, Math.max(0, (segDist(a, b, x, z) - W2.half) / W2.soft)));
      for (const p of spots) v = Math.max(v, 1 - Math.min(1, Math.max(0, (Math.hypot(x - p.x, z - p.z) - W2.spot) / W2.soft)));
      wear[j * W + i] = v;
    }
  }

  // ---- 砂紋の距離の地図：最寄りの物までの距離・勾配・帯の幅（帯の中で一番近い物、無ければ一番近い物） ----
  const feats = rakeFeatures(stage);
  const rh = new Uint16Array(N * 4);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) / M.res;
      const z = z0 + (j + 0.5) / M.res;
      let best = 1e9;
      let bestBand = 0;
      let gx = 0;
      let gz = 1;
      let inBand = false;
      for (const f of feats) {
        const dx = x - f.cx;
        const dz = z - f.cz;
        const qx = Math.abs(dx) - f.hx;
        const qz = Math.abs(dz) - f.hz;
        const ox = Math.max(qx, 0);
        const oz = Math.max(qz, 0);
        const lo = Math.hypot(ox, oz);
        const d = lo + Math.min(Math.max(qx, qz), 0) - f.r;
        const within = d < f.band;
        // 帯の中の物を優先し、その中で一番近い物
        if ((within && (!inBand || d < best)) || (!inBand && !within && d < best)) {
          best = d;
          bestBand = f.band;
          inBand = within;
          if (lo > 1e-4) {
            gx = (ox / lo) * Math.sign(dx || 1);
            gz = (oz / lo) * Math.sign(dz || 1);
          } else if (qx > qz) {
            gx = Math.sign(dx || 1);
            gz = 0;
          } else {
            gx = 0;
            gz = Math.sign(dz || 1);
          }
        }
      }
      const k = (j * W + i) * 4;
      rh[k] = DataUtils.toHalfFloat(Math.min(best, 60000));
      rh[k + 1] = DataUtils.toHalfFloat(gx);
      rh[k + 2] = DataUtils.toHalfFloat(gz);
      rh[k + 3] = DataUtils.toHalfFloat(bestBand);
    }
  }

  const a8 = new Uint8Array(N * 4);
  const b8 = new Uint8Array(N * 4);
  const c8 = new Uint8Array(N * 4);
  const q = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let k = 0; k < N; k++) {
    const sum = soft[0][k] + soft[1][k] + soft[2][k] + soft[3][k] || 1;
    a8[k * 4] = q(soft[0][k] / sum);
    a8[k * 4 + 1] = q(soft[1][k] / sum);
    a8[k * 4 + 2] = q(soft[2][k] / sum);
    a8[k * 4 + 3] = q(soft[3][k] / sum);
    b8[k * 4] = q(ambSoft[k]);
    b8[k * 4 + 1] = q(contact[k]);
    b8[k * 4 + 2] = q(rake[k]);
    b8[k * 4 + 3] = q(shore[k]);
    c8[k * 4] = q(wear[k]);
    c8[k * 4 + 1] = q(Math.max(damp[k], shore[k]));
  }
  const texA = new DataTexture(a8, W, H, RGBAFormat, UnsignedByteType);
  const texB = new DataTexture(b8, W, H, RGBAFormat, UnsignedByteType);
  const texC = new DataTexture(c8, W, H, RGBAFormat, UnsignedByteType);
  const texR = new DataTexture(rh, W, H, RGBAFormat, HalfFloatType);
  setupMapTexture(texA);
  setupMapTexture(texB);
  setupMapTexture(texC);
  setupMapTexture(texR);
  const old = [MAP_UNIFORMS.uKgMapA.value, MAP_UNIFORMS.uKgMapB.value, MAP_UNIFORMS.uKgMapC.value, MAP_UNIFORMS.uKgMapR.value];
  MAP_UNIFORMS.uKgMapA.value = texA;
  MAP_UNIFORMS.uKgMapB.value = texB;
  MAP_UNIFORMS.uKgMapC.value = texC;
  MAP_UNIFORMS.uKgMapR.value = texR;
  MAP_UNIFORMS.uKgMapRect.value.set(x0, z0, 1 / width, 1 / depth);
  old.forEach((t) => t.dispose());
  ambientMap = { data: ambSoft, W, H, x0, z0, res: M.res };
  return { x0, z0, width, depth, res: M.res };
}

/** 環境光の倍率の地図（B の R と同じ値）を CPU でも引けるように残す（r01-integrate：人物の足元の暗さに使う）。 */
let ambientMap: { data: Float32Array; W: number; H: number; x0: number; z0: number; res: number } | null = null;

/** その地点の環境光の倍率（竹林・軒下・蔵の陰で 1 より小さい）。地図がまだ無ければ 1。世界の材質と同じく双線形で引く。 */
export function ambientFactorAt(x: number, z: number): number {
  const m = ambientMap;
  if (!m) return 1;
  const fx = Math.min(m.W - 1.001, Math.max(0, (x - m.x0) * m.res - 0.5));
  const fz = Math.min(m.H - 1.001, Math.max(0, (z - m.z0) * m.res - 0.5));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const d = m.data;
  const k = j * m.W + i;
  const top = d[k] + (d[k + 1] - d[k]) * tx;
  const bot = d[k + m.W] + (d[k + m.W + 1] - d[k + m.W]) * tx;
  return top + (bot - top) * tz;
}
