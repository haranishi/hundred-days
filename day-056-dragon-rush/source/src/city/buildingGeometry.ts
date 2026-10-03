// OWNER: city
// 建物の純データから、描画用の頂点を作る。窓や目地は形にせず、頂点属性で外壁のシェーダーに指示する。
// 1棟ごとの頂点の範囲を記録しておき、次の周（破壊）で建物単位に手を入れられるようにする。
import type { BufferGeometry } from 'three';
import { RECESS_DEPTH, SHOPFRONT } from '../config/facade';
import { hash01 } from '../core/rng';
import { hasShopFront } from '../world/streetLife';
import type { Building, FacadeSpec, Mass, Rect, RoofItem, Side } from '../world/types';
import type { FillerBox } from '../world/scenery';
import { FACADE_STYLE_ID, SURFACE_STYLE } from './styles';
import { MeshWriter, normalize, type V3 } from './meshWriter';

export const BUILDING_ATTRIBUTES = [
  { name: 'aUv', size: 2, type: 'f32' },
  { name: 'aColor', size: 3, type: 'u8' },
  { name: 'aFac', size: 4, type: 'f32' },
  { name: 'aFac2', size: 4, type: 'f32' },
  { name: 'aFac3', size: 4, type: 'f32' },
  { name: 'aTrim', size: 3, type: 'u8' },
  { name: 'aGlass', size: 3, type: 'u8' },
  // 建物の番号（壊れ方の表を引く。街の外の代役は -1）
  { name: 'aBid', size: 1, type: 'f32' },
  // 1階の店の区切り（r01-city）：店の柱間の k 番目から新しい店が始まるならビット k が立つ（shopStartBits）
  { name: 'aShop', size: 1, type: 'f32' },
] as const;

export function newBuildingWriter(): MeshWriter {
  return new MeshWriter(BUILDING_ATTRIBUTES);
}

const PARAPET_THICKNESS = 0.28;

interface WallParams {
  style: number;
  seed: number;
  facade: FacadeSpec;
  /** 窓の割り付けの基準になる高さ（建物の地面） */
  baseY: number;
  /** 通常の階が始まる高さ（v、基準からの高さ） */
  groundH: number;
  floorH: number;
  /** 屋上の高さ（v）。これより上は窓を描かない */
  roofV: number;
  /** 壁の上端（v） */
  wallTop: number;
  /** 窓の開口の奥行き（m、r01-city） */
  recess: number;
  /** 面する通りの交通の多さ 0..1（根元の汚れの濃さ、r01-city） */
  traffic: number;
  /** 店の区切りを決める乱数の鍵（建物の番号。代役は種から作る）。r01-city */
  shopKey: number;
}

/** 店の柱間の幅（外壁のシェーダーの shopSurf と同じ割り付け：柱間を 3.6m に近い倍数にまとめる）。 */
export function shopBayWidth(faceLen: number, bayWidth: number): number {
  const bays = Math.max(1, Math.round(faceLen / bayWidth));
  const bayW = faceLen / bays;
  return bayW * Math.max(1, Math.floor(3.6 / bayW + 0.5));
}

/** ビットで持てる店の柱間の数（float32 の仮数に収まる） */
const SHOP_BITS = 23;

/**
 * 1階の店の区切り（r01-city。メインループの所見「看板が同じ調子で並ぶ」）：店の柱間を1〜3つまとめて1軒にする。
 * 戻り値のビット k は「k 番目の店の柱間から新しい店が始まる」。面の端の半端な柱間と、ビットに収まらない先は1柱間ずつの店。
 * 外壁のシェーダー（看板は1軒で1枚）とひさし（1軒に1枚）が同じ区切りを使う。
 */
export function shopStartBits(key: number, face: number, faceLen: number, bayWidth: number): number {
  const full = Math.floor(faceLen / shopBayWidth(faceLen, bayWidth) + 1e-3);
  let bits = 0;
  let run = 0;
  for (let k = 0; k < SHOP_BITS; k++) {
    const start = k === 0 || k >= full || run >= 3 || hash01(key, face, k, 131) < 0.5;
    if (start) {
      bits += 2 ** k;
      run = 1;
    } else run++;
  }
  return bits;
}

/** 店の区切りのビットから、各店の最初の柱間の番号と柱間の数の一覧（full 個の柱間まで）。 */
export function shopsFromBits(bits: number, full: number): { start: number; count: number }[] {
  const out: { start: number; count: number }[] = [];
  for (let k = 0; k < full; k++) {
    if (Math.floor(bits / 2 ** k) % 2 === 1 || k >= SHOP_BITS) out.push({ start: k, count: 1 });
    else out[out.length - 1].count++;
  }
  return out;
}

/** 外壁を高さで分けた帯（r03-fx：崩れる建物の詳しい形）。bid は帯の頂点の aBid（建物番号＋部品の印）。 */
export interface WallBand {
  y0: number;
  y1: number;
  bid: number;
}

/**
 * 箱の4面の外壁。各面の柱間は、面の幅に整数個がちょうど入るよう調整する。
 * bands があれば、各面をその高さの帯に分けて書く（模様の座標は分けない場合と同じなので、窓の位置は変わらない）。
 */
function addWalls(w: MeshWriter, r: Rect, y0: number, y1: number, p: WallParams, bands?: readonly WallBand[]): void {
  const faces: { a: [number, number]; b: [number, number]; n: V3 }[] = [
    { a: [r.x1, r.z0], b: [r.x0, r.z0], n: [0, 0, -1] },
    { a: [r.x0, r.z1], b: [r.x1, r.z1], n: [0, 0, 1] },
    { a: [r.x1, r.z1], b: [r.x1, r.z0], n: [1, 0, 0] },
    { a: [r.x0, r.z0], b: [r.x0, r.z1], n: [-1, 0, 0] },
  ];
  faces.forEach((f, i) => {
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    if (len < 0.05) return;
    const bays = Math.max(1, Math.round(len / p.facade.bayWidth));
    w.set({
      aFac: [p.floorH, len / bays, p.facade.windowWidth, p.facade.windowHeight],
      aFac2: [p.style, p.seed, p.groundH, p.roofV],
      aFac3: [p.wallTop, (p.seed * 7.13 + i * 0.137) % 1, p.recess, p.traffic],
      aShop: [shopStartBits(p.shopKey, i, len, p.facade.bayWidth)],
    });
    for (const band of bands ?? [{ y0, y1, bid: -2 }]) {
      if (band.bid !== -2) w.set({ aBid: [band.bid] });
      const vb = band.y0 - p.baseY;
      const vt = band.y1 - p.baseY;
      w.quad(
        [f.a[0], band.y0, f.a[1]],
        [f.b[0], band.y0, f.b[1]],
        [f.b[0], band.y1, f.b[1]],
        [f.a[0], band.y1, f.a[1]],
        f.n,
        [
          [0, vb],
          [len, vb],
          [len, vt],
          [0, vt],
        ],
      );
    }
  });
}

function plain(w: MeshWriter, color: readonly number[], roughness: number, metalness = 0): void {
  w.set({ aColor: color, aFac: [roughness, metalness, 0, 0], aFac2: [SURFACE_STYLE.plain, 0, 0, 0], aFac3: [0, 0, 0, 0] });
}

/** 直方体（底面なし）。小物・塔屋・水槽の台など。 */
export function addBox(w: MeshWriter, r: Rect, y0: number, y1: number): void {
  const sides: [V3, V3, V3, V3, V3][] = [
    [[r.x1, y0, r.z0], [r.x0, y0, r.z0], [r.x0, y1, r.z0], [r.x1, y1, r.z0], [0, 0, -1]],
    [[r.x0, y0, r.z1], [r.x1, y0, r.z1], [r.x1, y1, r.z1], [r.x0, y1, r.z1], [0, 0, 1]],
    [[r.x1, y0, r.z1], [r.x1, y0, r.z0], [r.x1, y1, r.z0], [r.x1, y1, r.z1], [1, 0, 0]],
    [[r.x0, y0, r.z0], [r.x0, y0, r.z1], [r.x0, y1, r.z1], [r.x0, y1, r.z0], [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of sides) {
    w.quad(a, b, c, d, n, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  }
  w.quad([r.x0, y1, r.z0], [r.x0, y1, r.z1], [r.x1, y1, r.z1], [r.x1, y1, r.z0], [0, 1, 0], [
    [r.x0, r.z0],
    [r.x0, r.z1],
    [r.x1, r.z1],
    [r.x1, r.z0],
  ]);
}

/** 陸屋根：屋根面・パラペットの内側・笠木。helipad なら屋根の中央に緊急離着陸場の印（シェーダーが描く）。 */
function addFlatRoof(w: MeshWriter, r: Rect, y: number, parapet: number, roofColor: readonly number[], capColor: readonly number[], innerColor: readonly number[], helipad = false): void {
  const t = parapet > 0 ? PARAPET_THICKNESS : 0;
  const inner: Rect = { x0: r.x0 + t, z0: r.z0 + t, x1: r.x1 - t, z1: r.z1 - t };
  w.set({ aColor: roofColor, aFac: [helipad ? 1 : 0, 0, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], aFac2: [SURFACE_STYLE.roofFlat, 0, 0, 0], aFac3: [0, 0, 0, 0] });
  w.quad([inner.x0, y, inner.z0], [inner.x0, y, inner.z1], [inner.x1, y, inner.z1], [inner.x1, y, inner.z0], [0, 1, 0], [
    [inner.x0, inner.z0],
    [inner.x0, inner.z1],
    [inner.x1, inner.z1],
    [inner.x1, inner.z0],
  ]);
  if (parapet <= 0) return;
  const top = y + parapet;
  plain(w, innerColor, 0.9);
  const innerFaces: [V3, V3, V3, V3, V3][] = [
    [[inner.x0, y, inner.z0], [inner.x1, y, inner.z0], [inner.x1, top, inner.z0], [inner.x0, top, inner.z0], [0, 0, 1]],
    [[inner.x1, y, inner.z1], [inner.x0, y, inner.z1], [inner.x0, top, inner.z1], [inner.x1, top, inner.z1], [0, 0, -1]],
    [[inner.x0, y, inner.z1], [inner.x0, y, inner.z0], [inner.x0, top, inner.z0], [inner.x0, top, inner.z1], [1, 0, 0]],
    [[inner.x1, y, inner.z0], [inner.x1, y, inner.z1], [inner.x1, top, inner.z1], [inner.x1, top, inner.z0], [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of innerFaces) {
    w.quad(a, b, c, d, n, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  }
  plain(w, capColor, 0.75);
  const ring: Rect[] = [
    { x0: r.x0, z0: r.z0, x1: r.x1, z1: inner.z0 },
    { x0: r.x0, z0: inner.z1, x1: r.x1, z1: r.z1 },
    { x0: r.x0, z0: inner.z0, x1: inner.x0, z1: inner.z1 },
    { x0: inner.x1, z0: inner.z0, x1: r.x1, z1: inner.z1 },
  ];
  for (const q of ring) {
    w.quad([q.x0, top, q.z0], [q.x0, top, q.z1], [q.x1, top, q.z1], [q.x1, top, q.z0], [0, 1, 0], [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
  }
}

function roofSurfaceAttrs(w: MeshWriter, color: readonly number[], metal: boolean): void {
  w.set({ aColor: color, aFac: [0, 0, 0, 0], aFac2: [metal ? SURFACE_STYLE.roofMetal : SURFACE_STYLE.roofTile, 0, 0, 0], aFac3: [0, 0, 0, 0] });
}

/** 切妻・寄棟の屋根。軒の出を含み、妻側の三角の壁も足す。 */
function addPitchedRoof(w: MeshWriter, b: Building, top: Mass, wall: WallParams): void {
  const roof = b.roof;
  const r = top.rect;
  const o = roof.overhang;
  const alongX = roof.ridgeAxis === 'x';
  const half = alongX ? (r.z1 - r.z0) / 2 : (r.x1 - r.x0) / 2;
  const y1 = top.y1;
  const yR = y1 + roof.pitchHeight;
  const slope = roof.pitchHeight / half;
  const yE = y1 - o * slope;
  const metal = b.kind === 'warehouse';
  // 妻側の三角（外壁と同じ描き方、窓は描かない）
  w.set({
    aColor: top.wallColor,
    aFac: [wall.floorH, b.facade.bayWidth, b.facade.windowWidth, b.facade.windowHeight],
    aFac2: [wall.style, wall.seed, wall.groundH, wall.roofV],
    aFac3: [yR - wall.baseY, 0.5, 0, 0],
  });
  if (roof.kind === 'gable' || roof.kind === 'sawtooth') {
    if (alongX) {
      const zc = (r.z0 + r.z1) / 2;
      for (const [x, n] of [
        [r.x0, [-1, 0, 0]],
        [r.x1, [1, 0, 0]],
      ] as [number, V3][]) {
        w.tri([x, y1, r.z0], [x, y1, r.z1], [x, yR, zc], n, [
          [0, y1 - wall.baseY],
          [r.z1 - r.z0, y1 - wall.baseY],
          [(r.z1 - r.z0) / 2, yR - wall.baseY],
        ]);
      }
    } else {
      const xc = (r.x0 + r.x1) / 2;
      for (const [z, n] of [
        [r.z0, [0, 0, -1]],
        [r.z1, [0, 0, 1]],
      ] as [number, V3][]) {
        w.tri([r.x0, y1, z], [r.x1, y1, z], [xc, yR, z], n, [
          [0, y1 - wall.baseY],
          [r.x1 - r.x0, y1 - wall.baseY],
          [(r.x1 - r.x0) / 2, yR - wall.baseY],
        ]);
      }
    }
  }
  roofSurfaceAttrs(w, roof.color, metal);
  const slopeLen = Math.hypot(half + o, yR - yE);
  if (roof.kind === 'gable' || roof.kind === 'sawtooth') {
    if (alongX) {
      const zc = (r.z0 + r.z1) / 2;
      const xa = r.x0 - o;
      const xb = r.x1 + o;
      const nN = normalize([0, half, -roof.pitchHeight]);
      const nS = normalize([0, half, roof.pitchHeight]);
      w.quad([xa, yE, r.z0 - o], [xb, yE, r.z0 - o], [xb, yR, zc], [xa, yR, zc], nN, [
        [xa, 0],
        [xb, 0],
        [xb, slopeLen],
        [xa, slopeLen],
      ]);
      w.quad([xb, yE, r.z1 + o], [xa, yE, r.z1 + o], [xa, yR, zc], [xb, yR, zc], nS, [
        [xb, 0],
        [xa, 0],
        [xa, slopeLen],
        [xb, slopeLen],
      ]);
    } else {
      const xc = (r.x0 + r.x1) / 2;
      const za = r.z0 - o;
      const zb = r.z1 + o;
      const nW = normalize([-roof.pitchHeight, half, 0]);
      const nE = normalize([roof.pitchHeight, half, 0]);
      w.quad([r.x0 - o, yE, zb], [r.x0 - o, yE, za], [xc, yR, za], [xc, yR, zb], nW, [
        [zb, 0],
        [za, 0],
        [za, slopeLen],
        [zb, slopeLen],
      ]);
      w.quad([r.x1 + o, yE, za], [r.x1 + o, yE, zb], [xc, yR, zb], [xc, yR, za], nE, [
        [za, 0],
        [zb, 0],
        [zb, slopeLen],
        [za, slopeLen],
      ]);
    }
    return;
  }
  // 寄棟：長辺の台形2枚と短辺の三角2枚
  const R: Rect = { x0: r.x0 - o, z0: r.z0 - o, x1: r.x1 + o, z1: r.z1 + o };
  const halfShort = half + o;
  if (alongX) {
    const zc = (R.z0 + R.z1) / 2;
    const ra = Math.min(R.x0 + halfShort, (R.x0 + R.x1) / 2);
    const rb = Math.max(R.x1 - halfShort, (R.x0 + R.x1) / 2);
    const nN = normalize([0, halfShort, -(yR - yE)]);
    const nS = normalize([0, halfShort, yR - yE]);
    const nW = normalize([-(yR - yE), halfShort, 0]);
    const nE = normalize([yR - yE, halfShort, 0]);
    w.quad([R.x0, yE, R.z0], [R.x1, yE, R.z0], [rb, yR, zc], [ra, yR, zc], nN, [
      [R.x0, 0],
      [R.x1, 0],
      [rb, slopeLen],
      [ra, slopeLen],
    ]);
    w.quad([R.x1, yE, R.z1], [R.x0, yE, R.z1], [ra, yR, zc], [rb, yR, zc], nS, [
      [R.x1, 0],
      [R.x0, 0],
      [ra, slopeLen],
      [rb, slopeLen],
    ]);
    w.tri([R.x0, yE, R.z1], [R.x0, yE, R.z0], [ra, yR, zc], nW, [
      [R.z1, 0],
      [R.z0, 0],
      [zc, slopeLen],
    ]);
    w.tri([R.x1, yE, R.z0], [R.x1, yE, R.z1], [rb, yR, zc], nE, [
      [R.z0, 0],
      [R.z1, 0],
      [zc, slopeLen],
    ]);
  } else {
    const xc = (R.x0 + R.x1) / 2;
    const ra = Math.min(R.z0 + halfShort, (R.z0 + R.z1) / 2);
    const rb = Math.max(R.z1 - halfShort, (R.z0 + R.z1) / 2);
    const nW = normalize([-(yR - yE), halfShort, 0]);
    const nE = normalize([yR - yE, halfShort, 0]);
    const nN = normalize([0, halfShort, -(yR - yE)]);
    const nS = normalize([0, halfShort, yR - yE]);
    w.quad([R.x0, yE, R.z1], [R.x0, yE, R.z0], [xc, yR, ra], [xc, yR, rb], nW, [
      [R.z1, 0],
      [R.z0, 0],
      [ra, slopeLen],
      [rb, slopeLen],
    ]);
    w.quad([R.x1, yE, R.z0], [R.x1, yE, R.z1], [xc, yR, rb], [xc, yR, ra], nE, [
      [R.z0, 0],
      [R.z1, 0],
      [rb, slopeLen],
      [ra, slopeLen],
    ]);
    w.tri([R.x1, yE, R.z0], [R.x0, yE, R.z0], [xc, yR, ra], nN, [
      [R.x1, 0],
      [R.x0, 0],
      [xc, slopeLen],
    ]);
    w.tri([R.x0, yE, R.z1], [R.x1, yE, R.z1], [xc, yR, rb], nS, [
      [R.x0, 0],
      [R.x1, 0],
      [xc, slopeLen],
    ]);
  }
}

function addRoofItem(w: MeshWriter, it: RoofItem): void {
  const r: Rect = { x0: it.x - it.w / 2, z0: it.z - it.d / 2, x1: it.x + it.w / 2, z1: it.z + it.d / 2 };
  if (it.kind === 'tank') {
    // 台
    plain(w, [0.42, 0.42, 0.41], 0.8, 0.3);
    const s = 0.32;
    addBox(w, { x0: it.x - it.w * s, z0: it.z - it.d * s, x1: it.x + it.w * s, z1: it.z + it.d * s }, it.y - 1.1, it.y);
    // 八角柱の水槽
    plain(w, it.color, 0.55);
    const rad = it.w / 2;
    const y0 = it.y;
    const y1 = it.y + it.h;
    const pts: [number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push([it.x + Math.cos(a) * rad, it.z + Math.sin(a) * rad]);
    }
    for (let k = 0; k < 8; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % 8];
      const mid = (k + 0.5) / 8;
      const a = mid * Math.PI * 2 + Math.PI / 8;
      const n: V3 = [Math.cos(a), 0, Math.sin(a)];
      w.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n, [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]);
    }
    for (let k = 0; k < 8; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % 8];
      w.tri([it.x, y1 + rad * 0.15, it.z], [p[0], y1, p[1]], [q[0], y1, q[1]], [0, 1, 0], [
        [0, 0],
        [0, 1],
        [1, 1],
      ]);
    }
    return;
  }
  if (it.kind === 'cooling') {
    // 冷却塔：胴・上の縁・送風機の暗い輪
    plain(w, it.color, 0.7, 0.2);
    addBox(w, r, it.y, it.y + it.h);
    plain(w, [0.16, 0.17, 0.18], 0.6, 0.4);
    const rad = Math.min(it.w, it.d) * 0.36;
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2;
      const a1 = ((k + 1) / 8) * Math.PI * 2;
      const y0 = it.y + it.h;
      const y1 = y0 + 0.9;
      const p0: V3 = [it.x + Math.cos(a0) * rad, y0, it.z + Math.sin(a0) * rad];
      const p1: V3 = [it.x + Math.cos(a1) * rad, y0, it.z + Math.sin(a1) * rad];
      const n: V3 = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      w.quad(p0, p1, [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], n, [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]);
    }
    return;
  }
  if (it.kind === 'frame') {
    plain(w, it.color, 0.6, 0.6);
    const posts = 0.3;
    addBox(w, { x0: r.x0, z0: r.z0, x1: r.x0 + Math.max(posts, 0), z1: r.z1 }, it.y, it.y + 1.4);
    addBox(w, { x0: r.x1 - posts, z0: r.z0, x1: r.x1, z1: r.z1 }, it.y, it.y + 1.4);
    addBox(w, r, it.y + 1.4, it.y + it.h);
    return;
  }
  plain(w, it.color, it.kind === 'penthouse' ? 0.85 : 0.6, it.kind === 'box' ? 0.2 : 0);
  addBox(w, r, it.y, it.y + it.h);
}

export interface BuildingRange {
  firstIndex: number;
  indexCount: number;
}

/** 面の順（addWalls の faces と同じ）。 */
const FACE_ORDER: readonly Side[] = ['n', 's', 'e', 'w'];

/** 箱の面（addWalls と同じ順と向き）：始点・終点と外向きの法線。 */
function faceOf(r: Rect, side: Side): { a: [number, number]; b: [number, number]; n: V3 } {
  switch (side) {
    case 'n':
      return { a: [r.x1, r.z0], b: [r.x0, r.z0], n: [0, 0, -1] };
    case 's':
      return { a: [r.x0, r.z1], b: [r.x1, r.z1], n: [0, 0, 1] };
    case 'e':
      return { a: [r.x1, r.z1], b: [r.x1, r.z0], n: [1, 0, 0] };
    case 'w':
      return { a: [r.x0, r.z0], b: [r.x0, r.z1], n: [-1, 0, 0] };
  }
}

/** 面の上の点：u は始点からの距離（m）、y は高さ、out は外向きの距離。 */
function onFace(f: ReturnType<typeof faceOf>, u: number, y: number, out: number): V3 {
  const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
  const ux = (f.b[0] - f.a[0]) / len;
  const uz = (f.b[1] - f.a[1]) / len;
  return [f.a[0] + ux * u + f.n[0] * out, y, f.a[1] + uz * u + f.n[2] * out];
}

/** 両面の四角形（下からも上からも見える薄い板）。 */
function sheet(w: MeshWriter, a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][]): void {
  w.quad(a, b, c, d, n, uv);
  w.quad(a, b, c, d, [-n[0], -n[1], -n[2]], uv);
}

/**
 * 店先のひさし（r01-city）：1階の店の柱間のうち、いくつかに布のひさしを掛ける。外壁のシェーダーと同じ柱間の割り付け
 * （面の長さを柱間の数で割った幅、3.6m に近い倍数）を使うので、ひさしは柱の間に収まる。
 */
function addAwnings(w: MeshWriter, b: Building, m: Mass, side: Side, baseY: number): void {
  const f = faceOf(m.rect, side);
  const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
  const shopBay = shopBayWidth(len, b.facade.bayWidth);
  const S = SHOPFRONT;
  const yTop = baseY + b.facade.groundFloor - 1.15;
  // r01-city：ひさしは1軒に1枚（外壁のシェーダーの看板と同じ区切り）。以前は柱間ごとに色の違うひさしが並んだ
  const full = Math.floor(len / shopBay + 1e-3);
  const faceIndex = FACE_ORDER.indexOf(side);
  for (const shop of shopsFromBits(shopStartBits(b.id, faceIndex, len, b.facade.bayWidth), full)) {
    const k = shop.start;
    if (hash01(b.id, k, 71) > S.awningChance) continue;
    const u0 = k * shopBay + 0.28;
    const u1 = (k + shop.count) * shopBay - 0.28;
    const color = S.awningColors[Math.floor(hash01(b.id, k, 73) * S.awningColors.length)];
    const striped = hash01(b.id, k, 79) < S.awningStriped ? 1 : 0;
    const rgb: V3 = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
    w.set({ aColor: rgb, aFac: [0, striped, 0, 0], aFac2: [SURFACE_STYLE.awning, 0, 0, 0], aFac3: [0, 0, 0, 0] });
    const p = S.awningDepth;
    const drop = S.awningDrop;
    const slope = Math.hypot(p, drop);
    // 斜めの布（上端は壁、下端は外）・前の垂れ・両端の三角の布
    const t0 = onFace(f, u0, yTop, 0);
    const t1 = onFace(f, u1, yTop, 0);
    const b0 = onFace(f, u0, yTop - drop, p);
    const b1 = onFace(f, u1, yTop - drop, p);
    const nSlope = normalize([f.n[0] * drop, p, f.n[2] * drop]);
    sheet(w, t0, t1, b1, b0, nSlope, [
      [u0, 0],
      [u1, 0],
      [u1, slope],
      [u0, slope],
    ]);
    const v0 = onFace(f, u0, yTop - drop - S.valance, p);
    const v1 = onFace(f, u1, yTop - drop - S.valance, p);
    sheet(w, b0, b1, v1, v0, f.n, [
      [u0, slope],
      [u1, slope],
      [u1, slope + S.valance],
      [u0, slope + S.valance],
    ]);
    const len2 = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const side0: V3 = [-(f.b[0] - f.a[0]) / len2, 0, -(f.b[1] - f.a[1]) / len2];
    w.tri(t0, b0, onFace(f, u0, yTop - drop, 0), side0, [
      [0, 0],
      [0, slope],
      [0.3, slope],
    ]);
    w.tri(t0, onFace(f, u0, yTop - drop, 0), b0, [-side0[0], 0, -side0[2]], [
      [0, 0],
      [0.3, slope],
      [0, slope],
    ]);
    w.tri(t1, b1, onFace(f, u1, yTop - drop, 0), [-side0[0], 0, -side0[2]], [
      [0, 0],
      [0, slope],
      [0.3, slope],
    ]);
    w.tri(t1, onFace(f, u1, yTop - drop, 0), b1, side0, [
      [0, 0],
      [0.3, slope],
      [0, slope],
    ]);
  }
}

/** 袖看板（r01-city）：雑居ビルの正面の端から突き出す縦長の看板。字は縦に並ぶ（外壁のシェーダーの SS_SIGN）。 */
function addBladeSign(w: MeshWriter, b: Building, m: Mass, side: Side, baseY: number): void {
  const S = SHOPFRONT;
  if (hash01(b.id, 83) > S.bladeChance) return;
  const f = faceOf(m.rect, side);
  const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
  if (len < 5) return;
  const width = S.bladeWidth[0] + (S.bladeWidth[1] - S.bladeWidth[0]) * hash01(b.id, 89);
  const y0 = baseY + b.facade.groundFloor + 0.6;
  const top = m.y1 - 0.8;
  const tall = hash01(b.id, 97) < 0.55;
  const y1 = Math.min(top, tall ? top : y0 + 2.5 + 3 * hash01(b.id, 101));
  if (y1 - y0 < 2) return;
  const h = y1 - y0;
  const u = hash01(b.id, 103) < 0.5 ? 0.45 : len - 0.45 - S.bladeThick;
  const gap = 0.25;
  const color = hash01(b.id, 107);
  // 看板の両側の広い面（字）と、外側の細い面・天・底（地の色）
  const setSign = (): void => w.set({ aColor: [1, 1, 1], aFac: [width, h, color, 0], aFac2: [SURFACE_STYLE.sign, 0, 0, 0], aFac3: [0, 0, 0, 0] });
  const len2 = len;
  const ut: V3 = [(f.b[0] - f.a[0]) / len2, 0, (f.b[1] - f.a[1]) / len2];
  for (const [uu, n] of [
    [u, [-ut[0], 0, -ut[2]] as V3],
    [u + S.bladeThick, ut],
  ] as [number, V3][]) {
    setSign();
    const p0 = onFace(f, uu, y0, gap);
    const p1 = onFace(f, uu, y0, gap + width);
    const p2 = onFace(f, uu, y1, gap + width);
    const p3 = onFace(f, uu, y1, gap);
    w.quad(p0, p1, p2, p3, n, [
      [0, 0],
      [width, 0],
      [width, h],
      [0, h],
    ]);
  }
  plain(w, [0.22, 0.22, 0.23], 0.5, 0.4);
  const o0 = onFace(f, u, y0, gap + width);
  const o1 = onFace(f, u + S.bladeThick, y0, gap + width);
  const o2 = onFace(f, u + S.bladeThick, y1, gap + width);
  const o3 = onFace(f, u, y1, gap + width);
  w.quad(o0, o1, o2, o3, f.n, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
  const i0 = onFace(f, u, y1, gap);
  const i1 = onFace(f, u + S.bladeThick, y1, gap);
  w.quad(i0, i1, o2, o3, [0, 1, 0], [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
  // 壁に留める2本の腕
  for (const y of [y0 + 0.3, y1 - 0.3]) {
    const a0 = onFace(f, u + S.bladeThick / 2 - 0.04, y - 0.04, 0);
    const a1 = onFace(f, u + S.bladeThick / 2 + 0.04, y + 0.04, gap);
    addBox(w, { x0: Math.min(a0[0], a1[0]), z0: Math.min(a0[2], a1[2]), x1: Math.max(a0[0], a1[0]), z1: Math.max(a0[2], a1[2]) }, y - 0.04, y + 0.04);
  }
}

/**
 * r03-fx：崩れる建物の詳しい形の印。頂点の aBid の小数部で部品を見分ける（整数部は建物番号のまま、表の引き方は変わらない）。
 * 0 はまとめたメッシュ、LOWER は割れ目より下（階ごとの帯に分け、上から順に潰す）、UPPER は割れ目より上。
 * r04-fx2：上の塊は階ごとの板に分け、板 j の印は UPPER + j × SLAB_STEP（j は 0〜4。1/16 刻みなので、建物番号が大きくても float32 で崩れない）
 */
export const PIECE = { lower: 0.25, upper: 0.375, slabStep: 0.0625 } as const;

/**
 * 崩れる建物の詳しい形の作り方：割れる高さ（m）と、上の塊の板の境目の高さ（m、下から。city/collapsePose.ts の slabBounds）。
 * 割れ目より下の外壁は階の境目ごとに帯に分け、割れ目より上は板の境目で切る。割れ目と板の境目に割れた床の蓋を足す。
 */
export interface SliceSpec {
  split: number;
  bounds?: readonly number[];
}

/** 板の境目の一覧 bounds で、高さ y の点が入る板の番号（y より下にある境目の数）。 */
function slabOf(bounds: readonly number[], y: number): number {
  let j = 0;
  for (const c of bounds) if (c <= y + 1e-3) j++;
  return j;
}

/**
 * 割れた床の蓋（割れ目・板の境目の上下、塊の外形より少し内側）。上の部品の底は下向き、下の部品の上端は上向き。
 * 平らな板に見せないよう、n×n の格子の高さを乱数でずらす（下の部品は境目より沈め、上の部品は部品の中へ引っ込める。
 * どちらも外からは境目が開くまで見えない）。below と above は、下と上の部品の印（aBid の小数部）。
 */
function addBrokenCaps(w: MeshWriter, r: Rect, y: number, id: number, below: number = PIECE.lower, above: number = PIECE.upper, n = 6): void {
  const inset = 0.04;
  const q: Rect = { x0: r.x0 + inset, z0: r.z0 + inset, x1: r.x1 - inset, z1: r.z1 - inset };
  w.set({ aColor: [0.25, 0.24, 0.23], aFac: [0.95, 0, 0, 0], aFac2: [SURFACE_STYLE.broken, 0, 0, 0], aFac3: [0, 0, 0, 0] });
  for (const [piece, sign] of [
    [below, -1],
    [above, 1],
  ] as const) {
    w.set({ aBid: [id + piece] });
    const at = (i: number, j: number): V3 => {
      const edge = i === 0 || j === 0 || i === n || j === n;
      const dy = edge ? 0.05 : 0.15 + 0.85 * hash01(id, i, j, Math.round(piece * 1000) + (sign < 0 ? 61 : 67));
      return [q.x0 + ((q.x1 - q.x0) * i) / n, y + sign * dy, q.z0 + ((q.z1 - q.z0) * j) / n];
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = at(i, j);
        const b = at(i, j + 1);
        const c = at(i + 1, j + 1);
        const d = at(i + 1, j);
        w.quad(a, b, c, d, [0, -sign, 0], [
          [a[0], a[2]],
          [b[0], b[2]],
          [c[0], c[2]],
          [d[0], d[2]],
        ]);
      }
    }
  }
}

/**
 * 外壁の帯：y0〜y1 を、割れ目 split より下は階の境目（first から floorH ごと）で分け（下の部品）、
 * 割れ目より上は板の境目 bounds で分ける（r04-fx2。板 j の印は upper + j × PIECE.slabStep）。
 * 帯の数は下の部品で最大 28 本（高い塔でも頂点が増えすぎない）。
 */
function sliceBands(y0: number, y1: number, split: number, first: number, floorH: number, lower: number, upper: number, bounds: readonly number[]): WallBand[] {
  const out: WallBand[] = [];
  const top = Math.min(y1, split);
  if (top > y0) {
    const cuts: number[] = [];
    for (let k = 0, y = first; y < top - 0.05 && cuts.length < 27; k++, y = first + k * floorH) if (y > y0 + 0.05) cuts.push(y);
    let a = y0;
    for (const c of cuts) {
      out.push({ y0: a, y1: c, bid: lower });
      a = c;
    }
    out.push({ y0: a, y1: top, bid: lower });
  }
  if (y1 > split) {
    let a = Math.max(y0, split);
    for (const c of bounds) {
      if (c <= a + 0.05 || c >= y1 - 0.05) continue;
      out.push({ y0: a, y1: c, bid: upper + slabOf(bounds, a) * PIECE.slabStep });
      a = c;
    }
    out.push({ y0: a, y1, bid: upper + slabOf(bounds, a) * PIECE.slabStep });
  }
  return out;
}

/** 1棟を書き込む。戻り値は index の範囲（破壊の周で使う）。traffic は面する通りの交通の多さ（0..1）。slice は崩れる建物の詳しい形。 */
export function writeBuilding(w: MeshWriter, b: Building, baseY: number, traffic = 0.4, front: Side | null = null, slice: SliceSpec | null = null): BuildingRange {
  const firstIndex = w.indexCount;
  const bidLower = slice ? b.id + PIECE.lower : b.id;
  const bidUpper = slice ? b.id + PIECE.upper : b.id;
  const bounds = slice?.bounds ?? [];
  w.set({ aBid: [bidLower], aShop: [0] });
  const f = b.facade;
  const topIndex = b.masses.reduce((best, m, i) => (m.y1 > b.masses[best].y1 ? i : best), 0);
  b.masses.forEach((m, i) => {
    const isTop = i === topIndex;
    const pitched = isTop && b.roof.kind !== 'flat';
    const parapet = pitched ? 0 : isTop ? b.roof.parapet : 0.9;
    const isPodium = b.kind === 'glassTower' && i === 0;
    const floorH = isPodium ? 4.6 : f.floorHeight;
    const groundH = isPodium ? f.groundFloor : b.kind === 'glassTower' ? m.y0 - baseY : f.groundFloor;
    const wall: WallParams = {
      style: FACADE_STYLE_ID[m.facade],
      seed: b.seed,
      facade: f,
      baseY,
      groundH,
      floorH,
      roofV: m.y1 - baseY,
      wallTop: m.y1 + parapet - baseY,
      recess: RECESS_DEPTH[m.facade],
      traffic,
      shopKey: b.id,
    };
    w.set({ aColor: m.wallColor, aTrim: f.trimColor, aGlass: f.glassColor, aUv: [0, 0] });
    const bands = slice ? sliceBands(m.y0 - 0.3, m.y1 + parapet, slice.split, baseY + groundH, floorH, bidLower, bidUpper, bounds) : undefined;
    addWalls(w, m.rect, m.y0 - 0.3, m.y1 + parapet, wall, bands);
    // 屋根は、その塊の上端が入る部品（割れ目より下なら下の部品、上なら上端の入る板）
    const roofBid = slice && m.y1 <= slice.split + 1e-3 ? bidLower : bidUpper + slabOf(bounds, m.y1 - 0.01) * PIECE.slabStep;
    w.set({ aBid: [roofBid] });
    if (pitched) {
      addPitchedRoof(w, b, m, wall);
    } else {
      const cap = f.trimColor;
      addFlatRoof(w, m.rect, m.y1, parapet, b.roof.color, cap, m.wallColor, isTop && b.roof.helipad === true);
    }
    if (slice && slice.split > m.y0 && slice.split < m.y1) addBrokenCaps(w, m.rect, slice.split, b.id);
    // r04-fx2：板の境目にも割れた床の蓋（板が潰れて開いたとき、中の空洞が見えないように。頂点を抑えて 3×3）
    if (slice) {
      bounds.forEach((c, k) => {
        if (c > m.y0 + 0.05 && c < m.y1 - 0.05) addBrokenCaps(w, m.rect, c, b.id, PIECE.upper + k * PIECE.slabStep, PIECE.upper + (k + 1) * PIECE.slabStep, 3);
      });
    }
  });
  w.set({ aBid: [slice ? bidUpper + slabOf(bounds, b.height - 0.01) * PIECE.slabStep : bidUpper] });
  for (const it of b.roof.items) addRoofItem(w, it);
  w.set({ aBid: [bidLower] });
  // 店先のひさしと袖看板（r01-city）。正面の面が分かるときだけ
  if (front && hasShopFront(b)) {
    addAwnings(w, b, b.masses[0], front, baseY);
    if (b.kind === 'zakkyo' || (b.kind === 'tileMidrise' && hash01(b.id, 109) < 0.35)) addBladeSign(w, b, b.masses[0], front, baseY);
  }
  return { firstIndex, indexCount: w.indexCount - firstIndex };
}

/** 街の外の代役（箱）。窓のある外壁と陸屋根だけ。 */
export function writeFiller(w: MeshWriter, box: FillerBox, baseY: number, facade: FacadeSpec): void {
  const r: Rect = { x0: box.x - box.w / 2, z0: box.z - box.d / 2, x1: box.x + box.w / 2, z1: box.z + box.d / 2 };
  w.set({ aColor: box.color, aTrim: facade.trimColor, aGlass: facade.glassColor, aUv: [0, 0], aBid: [-1], aShop: [0] });
  addWalls(w, r, baseY - 0.3, baseY + box.h, {
    style: FACADE_STYLE_ID.punched,
    seed: box.seed,
    facade,
    baseY,
    groundH: 3.6,
    floorH: box.floorHeight,
    roofV: box.h,
    wallTop: box.h,
    recess: RECESS_DEPTH.punched,
    traffic: 0.3,
    shopKey: Math.floor(box.seed * 1e6) + 900000,
  });
  addFlatRoof(w, r, baseY + box.h, 0, box.roofColor, box.roofColor, box.color);
}

export type { BufferGeometry };
