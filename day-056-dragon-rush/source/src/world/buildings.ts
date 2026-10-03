// OWNER: world
// 区画ごとに建物の種類と形（塊の積み方）を決める。見た目の選択（色・窓割り・屋根）は
// buildingLook.ts が、隣と同じ組にしない調整は neighbors.ts が受け持つ。
import type { CityConfig } from '../config/city';
import { stream, type Rng } from '../core/rng';
import { clamp, centerX, centerZ, depth, inset, lerp, rect, width } from './geom';
import { BUILDING_KINDS, type BuildingKind, type Lot, type Rect } from './types';

export type MassRole = 'podium' | 'tower' | 'body' | 'slab' | 'house' | 'shed';

export interface DraftMass {
  rect: Rect;
  y0: number;
  y1: number;
  role: MassRole;
}

/** 形だけ決まった建物（見た目はまだ）。 */
export interface BuildingDraft {
  lotId: number;
  blockId: number;
  kind: BuildingKind;
  footprint: Rect;
  floors: number;
  floorHeight: number;
  masses: DraftMass[];
  /** 都心への近さ 0..1（高さや見た目の格に使う） */
  intensity: number;
}

export interface VariantCounts {
  palette: number;
  facade: number;
  roof: number;
}

/** 種類ごとの見た目の選択肢の数。palette は config の色見本の数から決まる。 */
export function variantCounts(cfg: CityConfig, kind: BuildingKind): VariantCounts {
  const p = cfg.palettes;
  switch (kind) {
    case 'glassTower':
      return { palette: p.towerGlass.length, facade: 3, roof: 3 };
    case 'tileMidrise':
      return { palette: p.tileWall.length, facade: 3, roof: 3 };
    case 'zakkyo':
      return { palette: p.zakkyoWall.length, facade: 3, roof: 3 };
    case 'apartment':
      return { palette: p.apartmentWall.length, facade: 2, roof: 2 };
    case 'house':
      return { palette: p.houseWall.length, facade: 3, roof: p.houseRoof.length * 2 };
    case 'warehouse':
      return { palette: p.warehouseWall.length, facade: 2, roof: 3 };
  }
}

// ---- 区画の局所座標：u は間口に沿って、v は道から奥へ ----

export function frontLength(lot: Lot): number {
  return lot.front === 'n' || lot.front === 's' ? width(lot.rect) : depth(lot.rect);
}

export function lotDepth(lot: Lot): number {
  return lot.front === 'n' || lot.front === 's' ? depth(lot.rect) : width(lot.rect);
}

export function localRect(lot: Lot, u0: number, u1: number, v0: number, v1: number): Rect {
  const r = lot.rect;
  switch (lot.front) {
    case 'n':
      return rect(r.x0 + u0, r.z0 + v0, r.x0 + u1, r.z0 + v1);
    case 's':
      return rect(r.x0 + u0, r.z1 - v1, r.x0 + u1, r.z1 - v0);
    case 'w':
      return rect(r.x0 + v0, r.z0 + u0, r.x0 + v1, r.z0 + u1);
    case 'e':
      return rect(r.x1 - v1, r.z0 + u0, r.x1 - v0, r.z0 + u1);
  }
}

function intensityAt(cfg: CityConfig, lot: Lot): number {
  const c = cfg.zones.downtownCenter;
  const d = Math.hypot(centerX(lot.rect) - c.x, centerZ(lot.rect) - c.z);
  return 1 - clamp(d / cfg.zones.commercialRadius, 0, 1);
}

export function chooseKind(cfg: CityConfig, lot: Lot, rng: Rng): BuildingKind | null {
  const weights = cfg.kindWeights[lot.zone];
  const minSide = Math.min(width(lot.rect), depth(lot.rect));
  const candidates = BUILDING_KINDS.filter((k) => (weights[k] ?? 0) > 0 && minSide >= cfg.kinds[k].minLotSide);
  if (candidates.length === 0) return minSide >= cfg.kinds.house.minLotSide ? 'house' : null;
  return rng.weighted(candidates, candidates.map((k) => weights[k] ?? 0));
}

function shapeFor(cfg: CityConfig, kind: BuildingKind, lot: Lot, rng: Rng, intensity: number): BuildingDraft | null {
  const spec = cfg.kinds[kind];
  const base = cfg.curbHeight;
  const F = frontLength(lot);
  const D = lotDepth(lot);
  const front = rng.range(spec.frontSetback[0], spec.frontSetback[1]);
  const gapL = rng.range(spec.sideGap[0], spec.sideGap[1]);
  const gapR = rng.range(spec.sideGap[0], spec.sideGap[1]);
  const back = rng.range(1, 3.5);
  const floorHeight = rng.range(spec.floorHeight[0], spec.floorHeight[1]);

  let u0 = gapL;
  let u1 = F - gapR;
  let v1 = Math.min(D - back, front + spec.depthCap * rng.range(0.8, 1));
  if (kind === 'house') {
    const w = Math.min(u1 - u0, rng.range(7, 11));
    const slack = u1 - u0 - w;
    u0 += rng.range(0, Math.max(0, slack));
    u1 = u0 + w;
    v1 = Math.min(D - 1.5, front + rng.range(8, 12));
  }
  if (u1 - u0 < 5 || v1 - front < 5) return null;
  const footprint = localRect(lot, u0, u1, front, v1);

  let floors = rng.int(spec.floors[0], spec.floors[1]);
  if (kind === 'glassTower') {
    floors = Math.round(lerp(spec.floors[0], spec.floors[1], clamp(intensity * rng.range(0.7, 1.25), 0, 1)));
  } else if (kind === 'tileMidrise' || kind === 'apartment') {
    floors = Math.round(lerp(spec.floors[0], spec.floors[1], clamp(0.35 * rng.next() + 0.75 * intensity, 0, 1)));
  }

  const masses: DraftMass[] = [];
  if (kind === 'glassTower') {
    const podiumFloors = rng.int(2, 4);
    const podiumTop = base + podiumFloors * 4.6;
    masses.push({ rect: footprint, y0: base, y1: podiumTop, role: 'podium' });
    const minSide = Math.min(width(footprint), depth(footprint));
    const maxInset = Math.max(1.5, (minSide - 20) / 2);
    const ins = (): number => Math.min(maxInset, rng.range(2.5, 8));
    const tower = inset(footprint, ins(), ins(), ins(), ins());
    masses.push({ rect: tower, y0: podiumTop, y1: podiumTop + (floors - podiumFloors) * floorHeight, role: 'tower' });
  } else {
    const role: DraftMass['role'] =
      kind === 'house' ? 'house' : kind === 'warehouse' ? 'shed' : kind === 'apartment' ? 'slab' : 'body';
    masses.push({ rect: footprint, y0: base, y1: base + floors * floorHeight, role });
  }

  return {
    lotId: lot.id,
    blockId: lot.blockId,
    kind,
    footprint,
    floors,
    floorHeight,
    masses,
    intensity,
  };
}

/** 区画の正面の側から、矩形を奥行き d だけ削る（通りに面した側を後退させる）。 */
function cutFront(r: Rect, front: Lot['front'], d: number): Rect {
  switch (front) {
    case 'n':
      return rect(r.x0, r.z0 + d, r.x1, r.z1);
    case 's':
      return rect(r.x0, r.z0, r.x1, r.z1 - d);
    case 'w':
      return rect(r.x0 + d, r.z0, r.x1, r.z1);
    case 'e':
      return rect(r.x0, r.z0, r.x1 - d, r.z1);
  }
}

/**
 * 塊の積み方の語彙（r01-city。採点 r00a の改善5位「高層に基壇・段差・頂部」）。系列は city.massing（区画 id ごと）なので、
 * ほかの選択（種類・高さ・色）は変わらない。外形と高さは変えず、上の方の塊を細くするだけ：
 * ・ガラスの高層：途中の高さで一回り細くする段（セットバック）
 * ・タイルの中層・雑居ビル・集合住宅：通りの側の上の階を後退させる（道路斜線の段）。下の塊の屋上が露台になる
 */
function addTiers(cfg: CityConfig, d: BuildingDraft, lot: Lot): void {
  const rng = stream(cfg.seed, 'city.massing', lot.id);
  const T = cfg.massing;
  const top = d.masses[d.masses.length - 1];
  const floorsIn = (m: DraftMass): number => Math.round((m.y1 - m.y0) / d.floorHeight);
  if (d.kind === 'glassTower') {
    if (floorsIn(top) < T.towerMinFloors || !rng.chance(T.towerChance)) return;
    const cut = top.y0 + Math.round(floorsIn(top) * rng.range(0.5, 0.72)) * d.floorHeight;
    const minSide = Math.min(width(top.rect), depth(top.rect));
    const ins = (): number => (rng.chance(0.6) ? Math.min(rng.range(2, 4.5), minSide * 0.18) : 0);
    const upper = inset(top.rect, ins(), ins(), ins(), ins());
    if (width(upper) >= width(top.rect) - 0.5 && depth(upper) >= depth(top.rect) - 0.5) return;
    d.masses.push({ rect: upper, y0: cut, y1: top.y1, role: 'tower' });
    top.y1 = cut;
    return;
  }
  const chance = d.kind === 'tileMidrise' ? T.midriseChance : d.kind === 'zakkyo' ? T.zakkyoChance : d.kind === 'apartment' ? T.apartmentChance : 0;
  if (chance === 0 || d.floors < T.minFloors || !rng.chance(chance)) return;
  const k = d.kind === 'tileMidrise' ? rng.int(1, 3) : rng.int(1, 2);
  const back = d.kind === 'zakkyo' ? rng.range(1.4, 2.4) : rng.range(2.2, 4.0);
  const upper = cutFront(top.rect, lot.front, back);
  if (Math.min(width(upper), depth(upper)) < 5) return;
  const cut = top.y1 - k * d.floorHeight;
  if (cut - top.y0 < 2 * d.floorHeight) return;
  d.masses.push({ rect: upper, y0: cut, y1: top.y1, role: top.role });
  top.y1 = cut;
}

/** 建てられる区画ごとに形を決める。乱数は区画 id ごとの系列（city.buildings）。 */
export function draftBuildings(cfg: CityConfig, lots: Lot[]): BuildingDraft[] {
  const drafts: BuildingDraft[] = [];
  for (const lot of lots) {
    if (!lot.buildable) continue;
    const rng = stream(cfg.seed, 'city.buildings', lot.id);
    const kind = chooseKind(cfg, lot, rng);
    if (kind === null) continue;
    const draft = shapeFor(cfg, kind, lot, rng, intensityAt(cfg, lot));
    if (!draft) continue;
    addTiers(cfg, draft, lot);
    drafts.push(draft);
  }
  return drafts;
}

/** 見た目の選択の初期値。系列は city.variant（区画 id ごと）。 */
export function initialVariant(cfg: CityConfig, draft: BuildingDraft): { palette: number; facade: number; roof: number } {
  const rng = stream(cfg.seed, 'city.variant', draft.lotId);
  const counts = variantCounts(cfg, draft.kind);
  return { palette: rng.int(0, counts.palette - 1), facade: rng.int(0, counts.facade - 1), roof: rng.int(0, counts.roof - 1) };
}
