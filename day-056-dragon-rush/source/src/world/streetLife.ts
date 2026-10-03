// OWNER: world
// 通りの暮らしの配置（純データ、r01-city）：車・人・道の小物（消火栓・ごみ箱・自動販売機・バス停・電柱）。
// 使われ方に沿って置く：車は交差点の手前に信号待ちの列・走る車線に間隔を空けて・ふつうの通りの路肩と駐車場に止める。
// 人は店先と横断歩道の前に寄せ、歩道と岸壁の遊歩道を歩かせる。車は左側通行（日本）。どれも止まった状態で置く。
// 避難の規則（evacuationZones / isEvacuated）：壊れかけた建物と竜のまわりの人は見えなくする（人が傷つく描写を出さない）。
// 乱数は置く物ごと・区間ごとの系列（city.life.*）なので、何かを足しても建物や街路樹の並びは変わらない。
import { CAR_COLORS, CAR_MIX, CAR_TYPES, CLOTHES, EVACUATION, FURNITURE, HARBOR, PARKED_MIX, PEOPLE, TAXI_COLORS, BUS_COLOR, TRAFFIC, type CarType } from '../config/streetLife';
import { stream, type Rng } from '../core/rng';
import { hexToRgb, type RGB } from './color';
import { containsPoint } from './geom';
import { CityIndex, type Surface } from './query';
import type { Building, CityData, RoadClass, Side } from './types';

export type CarState = 'queue' | 'moving' | 'parked';

export interface CarPlacement {
  x: number;
  z: number;
  /** 向き（+z を 0、上から見て反時計回り、ラジアン） */
  yaw: number;
  type: CarType;
  /** 描く形の番号（config/streetLife.ts の CAR_TYPES の shape） */
  shape: number;
  len: number;
  wid: number;
  hgt: number;
  /** 車体の色（sRGB 0..1） */
  color: RGB;
  state: CarState;
}

export type PersonGroup = 'shop' | 'crossing' | 'walk' | 'promenade' | 'busStop' | 'park';

export interface PersonPlacement {
  x: number;
  z: number;
  yaw: number;
  group: PersonGroup;
  /** 0 = 立っている、1 = 歩いている */
  pose: 0 | 1;
  height: number;
  /** 上着の色（sRGB 0..1）。下の服の色は描く側でこの色から決める */
  top: RGB;
}

export type FurnitureKind = 'hydrant' | 'bin' | 'vending' | 'busStop' | 'pole' | 'bench' | 'bollard' | 'container' | 'rail';
export const FURNITURE_KINDS: readonly FurnitureKind[] = ['hydrant', 'bin', 'vending', 'busStop', 'pole', 'bench', 'bollard', 'container', 'rail'];

export interface FurniturePlacement {
  x: number;
  z: number;
  yaw: number;
  kind: FurnitureKind;
  /** 自動販売機の正面の色などの変種 0..1 */
  variant: number;
  /** 置く高さ（積んだコンテナの段）と、色（コンテナ、sRGB）、長さ（コンテナ、m） */
  y?: number;
  color?: RGB;
  len?: number;
}

export type BoatKind = 'small' | 'launch' | 'ship';

/** 岸に着けた船（湾の水面に浮かべる）。 */
export interface BoatPlacement {
  x: number;
  z: number;
  yaw: number;
  kind: BoatKind;
  len: number;
  /** 船体の色（sRGB） */
  color: RGB;
}

export interface StreetLife {
  cars: CarPlacement[];
  people: PersonPlacement[];
  furniture: FurniturePlacement[];
  boats: BoatPlacement[];
}

const WALKABLE: ReadonlySet<Surface> = new Set(['sidewalk', 'lot', 'promenade', 'pier']);

function weightedKey<K extends string>(rng: Rng, table: Record<K, number>): K {
  const keys = Object.keys(table) as K[];
  return rng.weighted(keys, keys.map((k) => table[k]));
}

function makeCar(rng: Rng, x: number, z: number, yaw: number, type: CarType, state: CarState): CarPlacement {
  const spec = CAR_TYPES[type];
  let color: RGB;
  if (type === 'taxi') color = hexToRgb(rng.pick(TAXI_COLORS));
  else if (type === 'bus') color = hexToRgb(BUS_COLOR);
  else color = hexToRgb(rng.weighted(CAR_COLORS.map((c) => c[0]), CAR_COLORS.map((c) => c[1])));
  return {
    x,
    z,
    yaw,
    type,
    shape: spec.shape,
    len: rng.range(spec.len[0], spec.len[1]),
    wid: rng.range(spec.wid[0], spec.wid[1]),
    hgt: rng.range(spec.hgt[0], spec.hgt[1]),
    color,
    state,
  };
}

/** 車道の区間の局所座標（along：始点からの距離、across：中心線からの横の距離）をワールドへ。 */
function segPoint(seg: CityData['segments'][number], along: number, across: number): { x: number; z: number } {
  const r = seg.rect;
  if (seg.axis === 'ns') return { x: (r.x0 + r.x1) / 2 + across, z: r.z0 + along };
  return { x: r.x0 + along, z: (r.z0 + r.z1) / 2 + across };
}

/**
 * 車線の進む向き（左側通行）：南北の道では西側（across<0）が北行き、東西の道では南側（across>0）が西行き。
 * 戻り値は「始点（along=0）へ向かうか」と yaw。
 */
function laneHeading(axis: 'ns' | 'ew', across: number): { towardStart: boolean; yaw: number } {
  if (axis === 'ns') return across < 0 ? { towardStart: true, yaw: Math.PI } : { towardStart: false, yaw: 0 };
  return across > 0 ? { towardStart: true, yaw: -Math.PI / 2 } : { towardStart: false, yaw: Math.PI / 2 };
}

function generateCars(city: CityData, index: CityIndex): CarPlacement[] {
  const cars: CarPlacement[] = [];
  for (const seg of city.segments) {
    const rng = stream(city.seed, 'city.life.cars', seg.id);
    const r = seg.rect;
    const len = seg.axis === 'ns' ? r.z1 - r.z0 : r.x1 - r.x0;
    const width = seg.axis === 'ns' ? r.x1 - r.x0 : r.z1 - r.z0;
    const halfW = width / 2;
    const cls: RoadClass = seg.cls;
    if (len < 20) continue;
    const lanes = Math.max(1, seg.lanes);
    const laneW = width / lanes;
    for (let i = 0; i < lanes; i++) {
      const across = lanes === 1 ? 0 : -halfW + (i + 0.5) * laneW;
      const heading = lanes === 1 ? { towardStart: rng.chance(0.5), yaw: 0 } : laneHeading(seg.axis, across);
      if (lanes === 1) heading.yaw = seg.axis === 'ns' ? (heading.towardStart ? Math.PI : 0) : heading.towardStart ? -Math.PI / 2 : Math.PI / 2;
      // 信号待ちの列：向かう先の交差点の停止線から後ろへ詰める
      let queueEnd: number = TRAFFIC.endClear;
      if (rng.chance(TRAFFIC.queueChance[cls])) {
        const n = rng.int(1, TRAFFIC.queueMax[cls]);
        let pos = 6.75 + TRAFFIC.stopGap;
        for (let k = 0; k < n; k++) {
          const car = makeCar(rng, 0, 0, heading.yaw, weightedKey(rng, CAR_MIX), 'queue');
          const center = pos + car.len / 2;
          if (center + car.len / 2 > len / 2 - 2) break;
          const along = heading.towardStart ? center : len - center;
          const p = segPoint(seg, along, across + rng.range(-0.15, 0.15));
          car.x = p.x;
          car.z = p.z;
          cars.push(car);
          pos = center + car.len / 2 + rng.range(TRAFFIC.queueGap[0], TRAFFIC.queueGap[1]);
        }
        queueEnd = Math.max(queueEnd, pos + 6);
      }
      // 走っている車：列の後ろから反対の端の手前まで、間隔を空けて置く
      const gap = TRAFFIC.movingGap[cls];
      let pos = queueEnd + rng.range(0, gap);
      while (pos < len - TRAFFIC.endClear) {
        const car = makeCar(rng, 0, 0, heading.yaw, weightedKey(rng, CAR_MIX), 'moving');
        const along = heading.towardStart ? pos : len - pos;
        const p = segPoint(seg, along, across + rng.range(-0.25, 0.25));
        car.x = p.x;
        car.z = p.z;
        cars.push(car);
        pos += car.len + gap * rng.range(0.4, 1.7);
      }
    }
    // 路肩の駐車：ふつうの通りの両側の縁石沿い
    if (cls === 'street') {
      for (const side of [-1, 1]) {
        const heading = laneHeading(seg.axis, side);
        for (let along = TRAFFIC.endClear + 4; along < len - TRAFFIC.endClear - 4; along += 7) {
          if (!rng.chance(TRAFFIC.parkedChance)) continue;
          const p = segPoint(seg, along, side * (halfW - 1.05));
          const car = makeCar(rng, p.x, p.z, heading.yaw, weightedKey(rng, PARKED_MIX), 'parked');
          cars.push(car);
        }
      }
    }
  }
  // 駐車場（建てない奥の区画）：路面の区画線（2.5m ごと、12m ごとの列）に合わせて止める
  for (const lot of city.lots) {
    if (lot.courtyard !== 'parking') continue;
    const rng = stream(city.seed, 'city.life.parking', lot.id);
    const rr = lot.rect;
    for (let j = Math.ceil((rr.z0 - 3.3) / 12); (j * 12 + 3.3) < rr.z1; j++) {
      const z = j * 12 + 3.3;
      if (z - 2.4 < rr.z0 + 0.5 || z + 2.4 > rr.z1 - 0.5) continue;
      for (let k = Math.ceil(rr.x0 / 2.5); k * 2.5 < rr.x1; k++) {
        const x = k * 2.5;
        if (x - 1.1 < rr.x0 + 0.5 || x + 1.1 > rr.x1 - 0.5) continue;
        if (!rng.chance(TRAFFIC.lotOccupancy)) continue;
        if (index.buildingAt(x, z)) continue;
        cars.push(makeCar(rng, x, z, rng.chance(0.5) ? 0 : Math.PI, weightedKey(rng, PARKED_MIX), 'parked'));
      }
    }
  }
  return cars;
}

function person(rng: Rng, x: number, z: number, yaw: number, group: PersonGroup, pose: 0 | 1): PersonPlacement {
  return { x, z, yaw, group, pose, height: rng.range(PEOPLE.height[0], PEOPLE.height[1]), top: hexToRgb(rng.pick(CLOTHES)) };
}

/** 建物の正面の辺（区画の前の側）：始点・終点と、外向きの単位ベクトル。 */
function frontEdge(b: Building, front: Side): { ax: number; az: number; bx: number; bz: number; nx: number; nz: number } {
  const f = b.masses[0].rect;
  switch (front) {
    case 'n':
      return { ax: f.x0, az: f.z0, bx: f.x1, bz: f.z0, nx: 0, nz: -1 };
    case 's':
      return { ax: f.x0, az: f.z1, bx: f.x1, bz: f.z1, nx: 0, nz: 1 };
    case 'w':
      return { ax: f.x0, az: f.z0, bx: f.x0, bz: f.z1, nx: -1, nz: 0 };
    case 'e':
      return { ax: f.x1, az: f.z0, bx: f.x1, bz: f.z1, nx: 1, nz: 0 };
  }
}

/** 1階が店の建物か（外壁の描き方と同じ条件：1階の帯が 2.5m より高く、倉庫と集合住宅の外壁ではない）。 */
export function hasShopFront(b: Building): boolean {
  const style = b.masses[0].facade;
  return b.facade.groundFloor > 2.5 && style !== 'corrugated' && style !== 'balcony';
}

function generatePeopleAndFurniture(city: CityData, index: CityIndex): { people: PersonPlacement[]; furniture: FurniturePlacement[] } {
  const people: PersonPlacement[] = [];
  const furniture: FurniturePlacement[] = [];
  const walkable = (x: number, z: number): boolean => WALKABLE.has(index.surfaceAt(x, z)) && index.buildingAt(x, z) === null;

  // 店先：店の前に数人、ところどころに自動販売機とごみ箱
  for (const b of city.buildings) {
    if (!hasShopFront(b)) continue;
    const lot = city.lots[b.lotId];
    const rng = stream(city.seed, 'city.life.shops', b.id);
    const e = frontEdge(b, lot.front);
    const L = Math.hypot(e.bx - e.ax, e.bz - e.az);
    if (L < 4) continue;
    const ux = (e.bx - e.ax) / L;
    const uz = (e.bz - e.az) / L;
    const n = rng.int(0, PEOPLE.perShop);
    for (let k = 0; k < n; k++) {
      const s = rng.range(1, L - 1);
      const off = rng.range(PEOPLE.shopOffset[0], PEOPLE.shopOffset[1]);
      const x = e.ax + ux * s + e.nx * off;
      const z = e.az + uz * s + e.nz * off;
      if (!walkable(x, z)) continue;
      // 店を見ているか、通りに沿って立ち止まっている
      const yaw = rng.chance(0.55) ? Math.atan2(-e.nx, -e.nz) : Math.atan2(ux, uz) + (rng.chance(0.5) ? Math.PI : 0);
      people.push(person(rng, x, z, yaw, 'shop', rng.chance(0.3) ? 1 : 0));
    }
    if (rng.chance(FURNITURE.vendingChance)) {
      const s = rng.chance(0.5) ? rng.range(0.9, 2.0) : L - rng.range(0.9, 2.0);
      const x = e.ax + ux * s + e.nx * 0.5;
      const z = e.az + uz * s + e.nz * 0.5;
      if (walkable(x, z)) {
        const yaw = Math.atan2(e.nx, e.nz);
        furniture.push({ x, z, yaw, kind: 'vending', variant: rng.next() });
        const side = s < L / 2 ? 1 : -1;
        furniture.push({ x: x + ux * side * 0.95, z: z + uz * side * 0.95, yaw, kind: 'bin', variant: rng.next() });
        furniture.push({ x: x + ux * side * 1.5, z: z + uz * side * 1.5, yaw, kind: 'bin', variant: rng.next() });
      }
    }
  }

  // 横断歩道の前：区間の両端（路地を除く）で、道の両側の歩道に信号を待つ人の塊
  for (const seg of city.segments) {
    if (seg.cls === 'lane') continue;
    const rng = stream(city.seed, 'city.life.cross', seg.id);
    const r = seg.rect;
    const len = seg.axis === 'ns' ? r.z1 - r.z0 : r.x1 - r.x0;
    const halfW = (seg.axis === 'ns' ? r.x1 - r.x0 : r.z1 - r.z0) / 2;
    for (const endAlong of [2.8, len - 2.8]) {
      for (const side of [-1, 1]) {
        if (!rng.chance(0.55)) continue;
        const n = rng.int(1, PEOPLE.perCrossing);
        // 向こう側を向いて待つ
        const yaw = seg.axis === 'ns' ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : side < 0 ? 0 : Math.PI;
        for (let k = 0; k < n; k++) {
          const p = segPoint(seg, endAlong + rng.range(-1.8, 1.8), side * (halfW + rng.range(0.5, 2.2)));
          if (!walkable(p.x, p.z)) continue;
          people.push(person(rng, p.x, p.z, yaw + rng.range(-0.3, 0.3), 'crossing', 0));
        }
      }
    }
  }

  // 歩道を歩く人・消火栓・バス停・電柱：街区の歩道の帯ごと
  for (const block of city.blocks) {
    if (block.isPier) continue;
    const rng = stream(city.seed, 'city.life.walk', block.id);
    const frng = stream(city.seed, 'city.life.furniture', block.id);
    const c = block.curb;
    const downtown = block.zone === 'downtown' ? 1 : block.zone === 'commercial' ? 0.6 : 0.25;
    const sides: { side: Side; ax: number; az: number; bx: number; bz: number; nx: number; nz: number }[] = [
      { side: 'n', ax: c.x0, az: c.z0, bx: c.x1, bz: c.z0, nx: 0, nz: 1 },
      { side: 's', ax: c.x0, az: c.z1, bx: c.x1, bz: c.z1, nx: 0, nz: -1 },
      { side: 'w', ax: c.x0, az: c.z0, bx: c.x0, bz: c.z1, nx: 1, nz: 0 },
      { side: 'e', ax: c.x1, az: c.z0, bx: c.x1, bz: c.z1, nx: -1, nz: 0 },
    ];
    for (const s of sides) {
      const cls = block.faces[s.side];
      const w = block.sidewalk[s.side];
      if (!cls || w < 1) continue;
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const ux = (s.bx - s.ax) / L;
      const uz = (s.bz - s.az) / L;
      const traffic = (cls === 'avenue' ? 1 : cls === 'street' ? 0.55 : 0.2) * (0.5 + 0.5 * downtown);
      const spacing = PEOPLE.walkSpacing / Math.max(0.15, traffic);
      for (let t = rng.range(0, spacing); t < L; t += spacing * rng.range(0.5, 1.5)) {
        const off = rng.range(0.7, Math.max(0.8, w - 0.5));
        const x = s.ax + ux * t + s.nx * off;
        const z = s.az + uz * t + s.nz * off;
        if (!walkable(x, z)) continue;
        const yaw = Math.atan2(ux, uz) + (rng.chance(0.5) ? Math.PI : 0);
        people.push(person(rng, x, z, yaw, 'walk', rng.chance(0.75) ? 1 : 0));
      }
      const toRoad = Math.atan2(-s.nx, -s.nz);
      // 消火栓：街区の角の近く
      if (frng.chance(FURNITURE.hydrantChance)) {
        const t = frng.chance(0.5) ? 3 : L - 3;
        const x = s.ax + ux * t + s.nx * 0.6;
        const z = s.az + uz * t + s.nz * 0.6;
        if (walkable(x, z)) furniture.push({ x, z, yaw: toRoad, kind: 'hydrant', variant: frng.next() });
      }
      // バス停：大通りの歩道、交差点の先。停まっているバスと、待つ人
      if (cls === 'avenue' && frng.chance(FURNITURE.busStopChance) && L > 50) {
        const t = frng.range(16, 26);
        const x = s.ax + ux * t + s.nx * 1.3;
        const z = s.az + uz * t + s.nz * 1.3;
        if (walkable(x, z)) {
          furniture.push({ x, z, yaw: toRoad, kind: 'busStop', variant: frng.next() });
          const n = frng.int(1, 4);
          for (let k = 0; k < n; k++) {
            const px = x + ux * frng.range(-3, 3) + s.nx * frng.range(0.6, 2.4);
            const pz = z + uz * frng.range(-3, 3) + s.nz * frng.range(0.6, 2.4);
            if (walkable(px, pz)) people.push(person(frng, px, pz, toRoad + frng.range(-0.5, 0.5), 'busStop', 0));
          }
        }
      }
      // 電柱：住宅地の通りと路地の縁石沿い（都心と商業地は電線を地中に埋めてある）
      if (block.zone === 'residential' || block.zone === 'port') {
        for (let t = frng.range(4, FURNITURE.poleSpacing); t < L - 4; t += FURNITURE.poleSpacing * frng.range(0.9, 1.1)) {
          const x = s.ax + ux * t + s.nx * 0.35;
          const z = s.az + uz * t + s.nz * 0.35;
          if (walkable(x, z)) furniture.push({ x, z, yaw: toRoad, kind: 'pole', variant: frng.next() });
        }
      }
    }
  }

  // 中庭の公園：園路沿いのベンチと、園路を歩く人
  for (const lot of city.lots) {
    if (lot.courtyard !== 'park') continue;
    const rng = stream(city.seed, 'city.life.park', lot.id);
    const r = lot.rect;
    const mx = (r.x0 + r.x1) / 2;
    const mz = (r.z0 + r.z1) / 2;
    for (let k = 0; k < rng.int(2, 4); k++) {
      // 十字の園路の脇に、園路を向いて置く
      const alongX = rng.chance(0.5);
      const side = rng.chance(0.5) ? 1 : -1;
      const t = rng.range(0.2, 0.8);
      const x = alongX ? r.x0 + (r.x1 - r.x0) * t : mx + side * 2.1;
      const z = alongX ? mz + side * 2.1 : r.z0 + (r.z1 - r.z0) * t;
      const yaw = alongX ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (walkable(x, z)) furniture.push({ x, z, yaw, kind: 'bench', variant: rng.next() });
    }
    for (let k = 0; k < rng.int(1, 5); k++) {
      const onX = rng.chance(0.5);
      const x = onX ? rng.range(r.x0 + 3, r.x1 - 3) : mx + rng.range(-0.8, 0.8);
      const z = onX ? mz + rng.range(-0.8, 0.8) : rng.range(r.z0 + 3, r.z1 - 3);
      if (walkable(x, z)) people.push(person(rng, x, z, onX ? Math.PI / 2 : 0, 'park', rng.chance(0.6) ? 1 : 0));
    }
  }

  // 岸壁の遊歩道：海を眺める人と歩く人
  {
    const rng = stream(city.seed, 'city.life.promenade');
    const p = city.coast.promenade;
    for (let z = p.z0 + rng.range(0, 10); z < p.z1; z += PEOPLE.promenadeSpacing * rng.range(0.5, 1.5)) {
      const atRail = rng.chance(0.35);
      const x = atRail ? p.x0 + rng.range(1.0, 2.2) : rng.range(p.x0 + 3, p.x1 - 3);
      if (!containsPoint(p, x, z) || !walkable(x, z)) continue;
      const yaw = atRail ? -Math.PI / 2 + rng.range(-0.4, 0.4) : rng.chance(0.5) ? 0 : Math.PI;
      people.push(person(rng, x, z, yaw, 'promenade', atRail ? 0 : 1));
    }
  }
  return { people, furniture };
}

/**
 * 港の物（r01-city。採点 r00a の改善5位「岸壁に港の物」）：港の中庭のコンテナ置き場、埠頭の縁の係船柱と着けた船、
 * 岸壁の遊歩道の柵・係船柱。系列は city.harbor.*。
 */
function generateHarbor(city: CityData, index: CityIndex, furniture: FurniturePlacement[]): BoatPlacement[] {
  const boats: BoatPlacement[] = [];
  const H = HARBOR;
  // コンテナ置き場：港の中庭と、埠頭の建物の無い所に列を作って1〜3段に積む。建物から 1.5m 離す
  const clear = (cx: number, cz: number, hx: number, hz: number): boolean => {
    for (const [dx, dz] of [
      [0, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      if (index.buildingAt(cx + dx * (hx + 1.5), cz + dz * (hz + 1.5))) return false;
    }
    return true;
  };
  const yards: { id: number; r: { x0: number; z0: number; x1: number; z1: number } }[] = [];
  for (const lot of city.lots) if (lot.courtyard === 'yard') yards.push({ id: lot.id, r: lot.rect });
  for (const block of city.blocks) if (block.isPier) yards.push({ id: 100000 + block.id, r: block.lotArea });
  for (const yard of yards) {
    const rng = stream(city.seed, 'city.harbor.yard', yard.id);
    const r = yard.r;
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
    const rowPitch = 2.44 + 1.2;
    const across0 = alongX ? r.z0 : r.x0;
    const across1 = alongX ? r.z1 : r.x1;
    const along0 = alongX ? r.x0 : r.z0;
    const along1 = alongX ? r.x1 : r.z1;
    for (let a = across0 + 3; a + 2.44 < across1 - 3; a += rowPitch) {
      // 列の中は 40ft と 20ft を並べ、ところどころ空ける
      for (let t = along0 + 3; t < along1 - 3; ) {
        const len = rng.chance(0.55) ? 12.19 : 6.06;
        if (t + len > along1 - 3) break;
        if (rng.chance(0.82)) {
          const stack = rng.int(1, 3);
          for (let k = 0; k < stack; k++) {
            const cx = alongX ? t + len / 2 : a + 1.22;
            const cz = alongX ? a + 1.22 : t + len / 2;
            if (!clear(cx, cz, alongX ? len / 2 : 1.22, alongX ? 1.22 : len / 2)) continue;
            furniture.push({ x: cx, z: cz, y: k * 2.59, yaw: alongX ? Math.PI / 2 : 0, kind: 'container', variant: rng.next(), len, color: hexToRgb(rng.weighted(H.containerColors.map((c) => c[0]), H.containerColors.map((c) => c[1]))) });
          }
        }
        t += len + rng.range(0.4, 1.2);
      }
    }
  }
  // 埠頭：両側の縁に係船柱、着けた小舟と、ときどき貨物船
  for (const block of city.blocks) {
    if (!block.isPier) continue;
    const rng = stream(city.seed, 'city.harbor.pier', block.id);
    const c = block.curb;
    for (const side of [-1, 1]) {
      const zEdge = side < 0 ? c.z0 : c.z1;
      for (let x = c.x0 + 6; x < c.x1 - 6; x += H.bollardSpacing) furniture.push({ x, z: zEdge - side * 0.6, yaw: 0, kind: 'bollard', variant: rng.next() });
      let x = c.x0 + rng.range(8, 20);
      if (rng.chance(H.shipChance)) {
        const len = rng.range(H.shipLength[0], H.shipLength[1]);
        if (x + len < c.x1 - 10) {
          boats.push({ x: x + len / 2, z: zEdge + side * (H.shipBeam / 2 + 1.5), yaw: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, kind: 'ship', len, color: hexToRgb(rng.pick(H.shipColors)) });
          x += len + 10;
        }
      }
      while (x < c.x1 - 12) {
        const kind: BoatKind = rng.chance(0.35) ? 'launch' : 'small';
        const len = kind === 'launch' ? rng.range(13, 18) : rng.range(7, 11);
        boats.push({ x: x + len / 2, z: zEdge + side * (kind === 'launch' ? 3.2 : 2.4), yaw: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, kind, len, color: hexToRgb(rng.pick(H.boatColors)) });
        x += len + rng.range(6, 26);
      }
    }
  }
  // 岸壁の遊歩道：水際の柵と、海を向いたベンチ
  {
    const rng = stream(city.seed, 'city.harbor.promenade');
    const p = city.coast.promenade;
    for (let z = p.z0 + 1.25; z < p.z1; z += 2.5) {
      if (index.surfaceAt(p.x0 + 0.5, z) !== 'promenade') continue;
      furniture.push({ x: p.x0 + 0.45, z, yaw: 0, kind: 'rail', variant: rng.next() });
    }
    for (let z = p.z0 + rng.range(10, 20); z < p.z1 - 5; z += rng.range(24, 40)) {
      if (index.surfaceAt(p.x0 + 3.2, z) !== 'promenade') continue;
      furniture.push({ x: p.x0 + 3.2, z, yaw: -Math.PI / 2, kind: 'bench', variant: rng.next() });
    }
  }
  return boats;
}

/** 通りの暮らしの配置一式。同じ街からは必ず同じ配置になる。 */
export function generateStreetLife(city: CityData, index: CityIndex = new CityIndex(city)): StreetLife {
  const cars = generateCars(city, index);
  const { people, furniture } = generatePeopleAndFurniture(city, index);
  const boats = generateHarbor(city, index, furniture);
  return { cars, people, furniture, boats };
}

// ---- 避難の規則 ----

/** 危ない範囲：矩形（点なら幅0）から半径 r の内側。 */
export interface DangerZone {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  r: number;
}

/** 壊れかけた建物のまわりの危ない範囲（高いビルほど広い）。 */
export function buildingDanger(b: Building): DangerZone {
  const f = b.footprint;
  return { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, r: EVACUATION.base + EVACUATION.perHeight * b.height };
}

/** 竜のまわりの危ない範囲。 */
export function pointDanger(x: number, z: number, r: number): DangerZone {
  return { x0: x, z0: z, x1: x, z1: z, r };
}

export function inDanger(x: number, z: number, zone: DangerZone): boolean {
  const dx = Math.max(zone.x0 - x, 0, x - zone.x1);
  const dz = Math.max(zone.z0 - z, 0, z - zone.z1);
  return dx * dx + dz * dz <= zone.r * zone.r;
}

/** 壊れかけた建物（breaking(id) が true）と、竜の位置（あれば）から危ない範囲の一覧を作る。 */
export function evacuationZones(city: CityData, breaking: (id: number) => boolean, dragon?: { x: number; z: number } | null): DangerZone[] {
  const zones: DangerZone[] = [];
  for (const b of city.buildings) if (breaking(b.id)) zones.push(buildingDanger(b));
  if (dragon) zones.push(pointDanger(dragon.x, dragon.z, EVACUATION.dragonRadius));
  return zones;
}

/** その人は避難して見えなくなっているか。 */
export function isEvacuated(p: { x: number; z: number }, zones: readonly DangerZone[]): boolean {
  for (const zone of zones) if (inDanger(p.x, p.z, zone)) return true;
  return false;
}
