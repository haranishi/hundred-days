// OWNER: city
// 地面の頂点：車道（道に沿った座標で標示を描く）・交差点・一段高い街区（歩道・区画）・縁石・
// 岸壁の遊歩道・埠頭・護岸・街の外の地面。標示や目地は形にせず、地面のシェーダーが描く。
// r01-city：汚れの濃さを位置から決めるため、歩道には幅と人通り、区画には建物の外形（壁の根元の暗がり）を渡す。
// 街路樹の根元には植え枡（土と鉄の格子）を足す。
import type { BufferGeometry } from 'three';
import type { CityData, Lot, Rect, RoadClass } from '../world/types';
import { GROUND_STYLE } from './styles';
import { MeshWriter, type V3 } from './meshWriter';

export const GROUND_ATTRIBUTES = [
  { name: 'aUv', size: 2, type: 'f32' },
  { name: 'aColor', size: 3, type: 'u8' },
  { name: 'aGround', size: 4, type: 'f32' },
  { name: 'aGround2', size: 4, type: 'f32' },
] as const;

const CLASS_ID: Record<RoadClass, number> = { avenue: 0, street: 1, lane: 2 };

const COLORS = {
  asphalt: [0.37, 0.37, 0.375],
  sidewalk: [0.58, 0.56, 0.53],
  plaza: [0.62, 0.6, 0.56],
  garden: [0.42, 0.44, 0.36],
  wharf: [0.55, 0.54, 0.52],
  parking: [0.38, 0.38, 0.385],
  curb: [0.66, 0.65, 0.62],
  seawall: [0.5, 0.49, 0.47],
  outskirts: [0.34, 0.34, 0.345],
} as const;

/** 水平な矩形。uv は各頂点の値を関数で決める。 */
function flat(w: MeshWriter, r: Rect, y: number, uv: (x: number, z: number) => [number, number]): void {
  w.quad([r.x0, y, r.z0], [r.x0, y, r.z1], [r.x1, y, r.z1], [r.x1, y, r.z0], [0, 1, 0], [
    uv(r.x0, r.z0),
    uv(r.x0, r.z1),
    uv(r.x1, r.z1),
    uv(r.x1, r.z0),
  ]);
}

const worldUv = (x: number, z: number): [number, number] => [x, z];

/** 縦の面（縁石・護岸）。a→b を外から見て左→右に並べる。 */
function wall(w: MeshWriter, a: [number, number], b: [number, number], y0: number, y1: number, n: V3): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  w.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n, [
    [0, y0],
    [len, y0],
    [len, y1],
    [0, y1],
  ]);
}

/** 矩形の外周の縦の面（外向き）。skip に入れた辺は描かない。 */
function perimeter(w: MeshWriter, r: Rect, y0: number, y1: number, skip: ReadonlySet<'n' | 's' | 'e' | 'w'> = new Set()): void {
  if (!skip.has('n')) wall(w, [r.x1, r.z0], [r.x0, r.z0], y0, y1, [0, 0, -1]);
  if (!skip.has('s')) wall(w, [r.x0, r.z1], [r.x1, r.z1], y0, y1, [0, 0, 1]);
  if (!skip.has('e')) wall(w, [r.x1, r.z1], [r.x1, r.z0], y0, y1, [1, 0, 0]);
  if (!skip.has('w')) wall(w, [r.x0, r.z0], [r.x0, r.z1], y0, y1, [-1, 0, 0]);
}

function lotStyle(lot: Lot): { style: number; color: readonly number[] } {
  if (!lot.buildable) {
    if (lot.courtyard === 'park') return { style: GROUND_STYLE.park, color: COLORS.garden };
    if (lot.courtyard === 'yard') return { style: GROUND_STYLE.wharf, color: COLORS.wharf };
    return { style: GROUND_STYLE.parking, color: COLORS.parking };
  }
  switch (lot.zone) {
    case 'residential':
      return { style: GROUND_STYLE.garden, color: COLORS.garden };
    case 'port':
      return { style: GROUND_STYLE.wharf, color: COLORS.wharf };
    default:
      return { style: GROUND_STYLE.plaza, color: COLORS.plaza };
  }
}

export interface GroundOptions {
  /** 街の外の地面を広げる範囲（m） */
  outskirts: number;
  /** 街路樹の植え枡（中心と一辺、m）。r01-city */
  treePits?: readonly { x: number; z: number; size: number }[];
}

/** 道の格付けから人と車の通りの多さ（0..1）。汚れと轍の濃さに使う。 */
const CLASS_TRAFFIC: Record<RoadClass, number> = { avenue: 1, street: 0.55, lane: 0.2 };

export function buildGround(city: CityData, options: GroundOptions): BufferGeometry {
  const w = new MeshWriter(GROUND_ATTRIBUTES);
  const curb = city.curbHeight;
  const ground = city.groundLevel;
  const waterBottom = city.coast.waterLevel - 2.5;

  // 車道の区間：u は道に沿った距離、v は中心線からの横の距離
  for (const seg of city.segments) {
    const r = seg.rect;
    const alongZ = seg.axis === 'ns';
    const len = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
    const halfWidth = alongZ ? (r.x1 - r.x0) / 2 : (r.z1 - r.z0) / 2;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    // 横断歩道の有無と、停止線を引く側（左側通行で交差点に向かう車線の側）の符号。
    // 南北の道の北端（始点）へ向かう車は西側（v<0）、東西の道の西端へ向かう車は南側（v>0）を走る
    const crosswalk = seg.cls === 'lane' ? 0 : 1;
    const startSide = alongZ ? -1 : 1;
    w.set({
      aColor: COLORS.asphalt,
      aGround: [GROUND_STYLE.asphalt, crosswalk * startSide, crosswalk * -startSide, (seg.id * 0.618) % 1],
      aGround2: [len, halfWidth, seg.lanes, CLASS_ID[seg.cls]],
    });
    flat(w, r, ground, (x, z) => (alongZ ? [z - r.z0, x - cx] : [x - r.x0, z - cz]));
  }
  for (const ix of city.intersections) {
    w.set({ aColor: COLORS.asphalt, aGround: [GROUND_STYLE.intersection, 0, 0, (ix.id * 0.618) % 1], aGround2: [0, 0, 0, 0] });
    flat(w, ix.rect, ground, worldUv);
  }

  // 街区：歩道の帯（u は帯に沿って、v は縁石からの距離）・区画・縁石
  for (const block of city.blocks) {
    const c = block.curb;
    const sw = block.sidewalk;
    const swStyle = block.isPier ? GROUND_STYLE.wharf : GROUND_STYLE.sidewalk;
    const swColor = block.isPier ? COLORS.wharf : COLORS.sidewalk;
    // 歩道の帯ごとに、幅（建物の側の縁までの距離）と人通り（面する道の格付けと都心への近さ）を渡す
    const downtown = block.zone === 'downtown' ? 1 : block.zone === 'commercial' ? 0.6 : 0.25;
    const strip = (side: 'n' | 's' | 'e' | 'w'): void => {
      const cls = block.faces[side];
      const traffic = cls ? Math.min(1, CLASS_TRAFFIC[cls] * (0.55 + 0.45 * downtown)) : 0.2;
      w.set({ aColor: swColor, aGround: [swStyle, sw[side], traffic, (block.id * 0.37) % 1], aGround2: [0, 0, 0, 0] });
    };
    if (sw.n > 0) {
      strip('n');
      flat(w, { x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z0 + sw.n }, curb, (x, z) => [x - c.x0, z - c.z0]);
    }
    if (sw.s > 0) {
      strip('s');
      flat(w, { x0: c.x0, z0: c.z1 - sw.s, x1: c.x1, z1: c.z1 }, curb, (x, z) => [x - c.x0, c.z1 - z]);
    }
    if (sw.w > 0) {
      strip('w');
      flat(w, { x0: c.x0, z0: c.z0 + sw.n, x1: c.x0 + sw.w, z1: c.z1 - sw.s }, curb, (x, z) => [z - c.z0, x - c.x0]);
    }
    if (sw.e > 0) {
      strip('e');
      flat(w, { x0: c.x1 - sw.e, z0: c.z0 + sw.n, x1: c.x1, z1: c.z1 - sw.s }, curb, (x, z) => [z - c.z0, c.x1 - x]);
    }
    for (const lotId of block.lotIds) {
      const lot = city.lots[lotId];
      const s = lotStyle(lot);
      // 建物のある区画は、建物の外形を渡す（壁の根元の暗がりをシェーダーで描く）。無ければ外形を空にする
      const b = lot.buildingId !== null ? city.buildings[lot.buildingId] : null;
      // 公園は区画の矩形を渡す（園路を区画に合わせて描く）
      const fp = b
        ? [b.footprint.x0, b.footprint.z0, b.footprint.x1, b.footprint.z1]
        : lot.courtyard === 'park'
          ? [lot.rect.x0, lot.rect.z0, lot.rect.x1, lot.rect.z1]
          : [0, 0, -1, -1];
      w.set({ aColor: s.color, aGround: [s.style, lot.buildable ? 1 : 0, 0, (lot.id * 0.618) % 1], aGround2: fp });
      flat(w, lot.rect, curb, worldUv);
    }
    if (block.isPier) {
      w.set({ aColor: COLORS.seawall, aGround: [GROUND_STYLE.seawall, city.coast.waterLevel, 0, 0], aGround2: [0, 0, 0, 0] });
      perimeter(w, c, waterBottom, curb, new Set(['e']));
    } else {
      w.set({ aColor: COLORS.curb, aGround: [GROUND_STYLE.curb, 0, 0, 0], aGround2: [0, 0, 0, 0] });
      perimeter(w, c, ground - 0.05, curb);
    }
  }

  // 岸壁の遊歩道と護岸。街の外の地面の縁まで延ばす
  const half = (city.bounds.z1 - city.bounds.z0) / 2;
  const edge = half + 6;
  const p = city.coast.promenade;
  const prom: Rect = { x0: p.x0, z0: -edge, x1: p.x1, z1: edge };
  w.set({ aColor: COLORS.plaza, aGround: [GROUND_STYLE.plaza, 0, 0, 0.5], aGround2: [0, 0, 0, 0] });
  flat(w, prom, curb, worldUv);
  w.set({ aColor: COLORS.curb, aGround: [GROUND_STYLE.curb, 0, 0, 0], aGround2: [0, 0, 0, 0] });
  wall(w, [prom.x1, prom.z1], [prom.x1, prom.z0], ground - 0.05, curb, [1, 0, 0]);

  const far = options.outskirts;
  w.set({ aColor: COLORS.seawall, aGround: [GROUND_STYLE.seawall, city.coast.waterLevel, 0, 0], aGround2: [0, 0, 0, 0] });
  wall(w, [city.coast.coastX, -far], [city.coast.coastX, far], waterBottom, curb, [-1, 0, 0]);

  // 街の外の地面（北・南・東の帯）。街の範囲とは重ねない（遠くで深度が競合するため）
  const east = city.bounds.x1 + 6;
  w.set({ aColor: COLORS.outskirts, aGround: [GROUND_STYLE.outskirts, 0, 0, 0], aGround2: [0, 0, 0, 0] });
  flat(w, { x0: city.coast.coastX, z0: -far, x1: far, z1: -edge }, ground, worldUv);
  flat(w, { x0: city.coast.coastX, z0: edge, x1: far, z1: far }, ground, worldUv);
  flat(w, { x0: east, z0: -edge, x1: far, z1: edge }, ground, worldUv);
  // 帯のうち、遊歩道の高さ（縁石の高さ）と地面の段差は、街の外では岸の縁だけなので省く

  // 植え枡：歩道より少し高い土と鉄の格子（歩道の面と重ねるので、遠くで深度が競り合わない高さに上げる）
  for (const pit of options.treePits ?? []) {
    const h = pit.size / 2;
    w.set({ aColor: [0.24, 0.19, 0.14], aGround: [GROUND_STYLE.treePit, pit.size, 0, (Math.abs(pit.x * 0.37 + pit.z * 0.61) % 1)], aGround2: [pit.x, pit.z, 0, 0] });
    flat(w, { x0: pit.x - h, z0: pit.z - h, x1: pit.x + h, z1: pit.z + h }, curb + 0.035, (x, z) => [x - pit.x, z - pit.z]);
  }

  return w.toGeometry();
}
