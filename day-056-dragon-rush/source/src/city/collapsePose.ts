// OWNER: city
// 崩れ方の形（純データ・three を読まない）。外壁と影のシェーダー（damageGlsl.ts）は damageTexture.ts がこの関数で書いた値を読み、
// 効果（fx/buildingPoints.ts・fx/fxDirector.ts・fx/rubble.ts）は同じ関数で壁の上の点・粒子の出どころ・瓦礫の山を動かす。
// 形の決め方を1か所に置き、描画と粒子がずれないようにする（movePiece と damageGlsl.ts の dmgMovePiece は同じ式）。
// r03-fx：割れる高さで上下に割り、上の塊を倒してから下の階を上から順に潰す。
// r04-fx2：指摘「上の塊は箱のまま瓦礫の山にめり込んで消え、下の塊は約0.1秒で山に差し替わる。倒れた上の塊が隣のビルを通り抜ける」。
//   上の塊を階ごとの板（1〜5枚）に分け、傾きを戻しながら瓦礫の上へ落として、下の板から順に潰す。倒れる角度は、倒れる向きの前の
//   隣の建物へ食い込まない所まで（clearanceAngle）。瓦礫の山は崩落の最後の 0.6〜1 秒で盛り上がり、潰れた階と板はその中へ沈む。
// r04-fx2（引き継ぎ）：遊びの倒れる向きの前に隣が接していると、倒せる角度が 0 になり、傾きの段階でも上の塊が立ったままだった
//   （breath のビルは隣と隙間 0、傾き 9.1° が見た目 0°）。その向きで COLLAPSE.minLeanDeg まで倒せないときは、見た目だけ
//   倒せる向き（外形の4辺の向きのうち、遊びの向きに近い順）へ倒す（chooseFallDirection）。遊びの値（damage.dirX/dirZ）は変えない。
import { COLLAPSE, RUBBLE } from '../config/fx';
import { STAGES } from '../config/gameplay';
import type { Building, Mass } from '../world/types';

const DEG = Math.PI / 180;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x: number): number => x - Math.floor(x);

/** 割れて崩れる建物の、崩れ方に要る寸法（建物・割れる高さ・倒れる向きで決まる。崩れている間は変わらない）。 */
export interface CollapseShape {
  /** 割れる高さ・根元・屋上（m） */
  split: number;
  base: number;
  height: number;
  /** 上の塊の軸の長さ（m、割れ目から屋上まで）と、倒れる向きに測った奥行き（m、割れ目の塊の外形） */
  length: number;
  depth: number;
  /** 上の塊の階高（m）・階数・板の数（1〜COLLAPSE.slabs.max） */
  floorH: number;
  floors: number;
  slabs: number;
  /** 崩落にかかる秒数（遊びの DamageState.collapseSeconds と同じ式。瓦礫の山の盛り上がる秒数を決める） */
  seconds: number;
  /** 倒れる向きの前にある隣の建物：割れ目の縁（倒れる軸）からの隙間（m）と屋上の高さ（m） */
  gaps: number[];
  tops: number[];
  /** 板の揺らぎの種（0〜1、建物ごと。シェーダーと同じ式 fract(id × 0.618034)） */
  seed: number;
  /** r04-fx2：見た目の倒れる向き（単位の水平ベクトル）。遊びの向きの前が塞がっていれば、倒せる向きに替えたもの */
  dirX: number;
  dirZ: number;
}

export interface CollapsePose {
  /** 上の塊（板の並び）の傾き（ラジアン、割れ目の縁の軸まわり。正で倒れる向きへ） */
  angle: number;
  /** 潰れの先端の高さ（m）。これより上の下の階は squash 倍に潰れる */
  front: number;
  /** 潰れた階の積み重なりの上端（m）。上の塊の軸はここに乗る */
  stackTop: number;
  /** 全体の沈み（m）。最後に瓦礫の山の中へ沈む分だけ（地面の下へは沈めない） */
  sink: number;
  /** r04-fx2：上の塊の板ごとの潰れの進み（0〜1。0 が一番下の板。板の数より後ろは 0） */
  crush: number[];
  /** r04-fx2：瓦礫の山の盛り上がり（0〜1） */
  mound: number;
}

export const poseZero = (): CollapsePose => ({ angle: 0, front: 0, stackTop: 0, sink: 0, crush: new Array<number>(COLLAPSE.slabs.max).fill(0), mound: 0 });

/** 割れる高さを含む塊（無ければ一番上の塊）。 */
function massAt(b: Building, split: number): Mass {
  let m = b.masses[b.masses.length - 1];
  for (const mm of b.masses) if (split > mm.y0 && split <= mm.y1 + 1e-3) m = mm;
  return m;
}

/** 上の塊が倒れるときの軸の位置：割れる高さの塊の、倒れる向き (dirX, dirZ) の側の辺の中点。 */
export function collapseHinge(b: Building, dirX: number, dirZ: number, split: number): { x: number; z: number } {
  const r = massAt(b, split).rect;
  const reach = (Math.abs(dirX) * (r.x1 - r.x0)) / 2 + (Math.abs(dirZ) * (r.z1 - r.z0)) / 2;
  return { x: (r.x0 + r.x1) / 2 + dirX * reach, z: (r.z0 + r.z1) / 2 + dirZ * reach };
}

/**
 * 倒れる向きの前にある隣の建物（上の塊の横の幅に重なり、軸の前に出ているもの）の、軸からの隙間と屋上の高さ。
 * 外形の4つの角を、倒れる向きと横の向きに測る（向きは斜めでもよい）。
 */
function frontNeighbors(b: Building, split: number, dirX: number, dirZ: number, others: readonly Building[]): { gaps: number[]; tops: number[] } {
  const h = collapseHinge(b, dirX, dirZ, split);
  const r = massAt(b, split).rect;
  const L = Math.max(0.5, b.height - split);
  const proj = (x: number, z: number): [number, number] => [(x - h.x) * dirX + (z - h.z) * dirZ, -(x - h.x) * dirZ + (z - h.z) * dirX];
  let w0 = Infinity;
  let w1 = -Infinity;
  for (const [x, z] of [
    [r.x0, r.z0],
    [r.x1, r.z0],
    [r.x0, r.z1],
    [r.x1, r.z1],
  ]) {
    const w = proj(x, z)[1];
    w0 = Math.min(w0, w);
    w1 = Math.max(w1, w);
  }
  const gaps: number[] = [];
  const tops: number[] = [];
  // 割れる高さより低い隣も入れる（潰れて軸が下がると届く）
  const ground = b.masses[0].y0 + 1;
  for (const o of others) {
    if (o.id === b.id || o.height <= ground) continue;
    const f = o.footprint;
    let d0 = Infinity;
    let d1 = -Infinity;
    let p0 = Infinity;
    let p1 = -Infinity;
    for (const [x, z] of [
      [f.x0, f.z0],
      [f.x1, f.z0],
      [f.x0, f.z1],
      [f.x1, f.z1],
    ]) {
      const [d, p] = proj(x, z);
      d0 = Math.min(d0, d);
      d1 = Math.max(d1, d);
      p0 = Math.min(p0, p);
      p1 = Math.max(p1, p);
    }
    // 横に重ならない・軸の後ろにある・届かないものは外す
    if (p1 < w0 - 0.5 || p0 > w1 + 0.5 || d1 <= 0 || d0 > L + COLLAPSE.clearance) continue;
    gaps.push(Math.max(0, d0));
    tops.push(o.height);
  }
  return { gaps, tops };
}

/**
 * 見た目の倒れる向き。遊びの向き (dirX, dirZ) の前で、割れ目の高さの軸から COLLAPSE.minLeanDeg まで倒せればそのまま。
 * 倒せなければ、外形の4辺の向き（遊びの向きに近い順）で minLeanDeg まで倒せる最初の向き。どれも倒せなければ、いちばん大きく倒せる向き
 * （同じなら先の順）。同じ建物・同じ割れる高さ・同じ遊びの向きなら同じ答え（撮影と自動プレイで決定的）。
 */
export function chooseFallDirection(b: Building, split: number, dirX: number, dirZ: number, others: readonly Building[]): { dirX: number; dirZ: number } {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-6) return { dirX, dirZ };
  const ux = dirX / len;
  const uz = dirZ / len;
  const axes: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  axes.sort((p, q) => q[0] * ux + q[1] * uz - (p[0] * ux + p[1] * uz));
  const candidates: [number, number][] = [[ux, uz], ...axes];
  const min = COLLAPSE.minLeanDeg * DEG;
  let best = candidates[0];
  let bestLim = -1;
  for (const [cx, cz] of candidates) {
    const lim = clearanceAngle(collapseShapeToward(b, split, cx, cz, others), split);
    if (lim >= min - 1e-9) return { dirX: cx, dirZ: cz };
    if (lim > bestLim + 1e-9) {
      best = [cx, cz];
      bestLim = lim;
    }
  }
  return { dirX: best[0], dirZ: best[1] };
}

/** 崩れ方の寸法。others は倒れる先の隣を探す建物の一覧（null なら隣を見ず、向きも替えない）。 */
export function collapseShape(b: Building, split: number, dirX: number, dirZ: number, others: readonly Building[] | null): CollapseShape {
  if (!others) return collapseShapeToward(b, split, dirX, dirZ, null);
  const d = chooseFallDirection(b, split, dirX, dirZ, others);
  return collapseShapeToward(b, split, d.dirX, d.dirZ, others);
}

/** 向き (dirX, dirZ) へ倒れるときの寸法（向きは替えない）。 */
export function collapseShapeToward(b: Building, split: number, dirX: number, dirZ: number, others: readonly Building[] | null): CollapseShape {
  const base = b.masses[0].y0;
  const m = massAt(b, split);
  // 階高：ガラスの高層の基壇だけ 4.6m（gameplay の splitHeight・city/buildingGeometry.ts と同じ割り付け）
  const tower = b.kind === 'glassTower' && m !== b.masses[0];
  const floorH = b.kind === 'glassTower' && !tower && b.masses.length > 1 ? 4.6 : b.facade.floorHeight;
  const length = Math.max(0.5, b.height - split);
  const floors = Math.max(1, Math.round(length / floorH));
  const r = m.rect;
  const n = others ? frontNeighbors(b, split, dirX, dirZ, others) : { gaps: [], tops: [] };
  return {
    split,
    base,
    height: b.height,
    length,
    depth: Math.abs(dirX) * (r.x1 - r.x0) + Math.abs(dirZ) * (r.z1 - r.z0),
    floorH,
    floors,
    slabs: Math.min(COLLAPSE.slabs.max, floors),
    seconds: STAGES.collapseSeconds.base + STAGES.collapseSeconds.perMeter * b.height,
    gaps: n.gaps,
    tops: n.tops,
    seed: fract(b.id * 0.618034),
    dirX,
    dirZ,
  };
}

/** 板 j（0 が一番下）の下端の高さ（m）。境目は割れ目から階高ごとの階の境目に置く（j = 板の数 で屋上）。 */
export function slabBottom(shape: CollapseShape, j: number): number {
  if (j <= 0) return shape.split;
  if (j >= shape.slabs) return shape.height;
  return Math.min(shape.height, shape.split + Math.floor((j * shape.floors) / shape.slabs + 0.5) * shape.floorH);
}

/** 板の境目の高さの一覧（割れ目と屋上を除く。下から順）。詳しい形（buildingGeometry.ts）はここで外壁を切る。 */
export function slabBounds(shape: CollapseShape): number[] {
  const out: number[] = [];
  for (let j = 1; j < shape.slabs; j++) out.push(slabBottom(shape, j));
  return out;
}

/** 高さ y（m、動く前）の点が入る板の番号。割れ目以下は -1（下の塊）。 */
export function slabIndexAt(shape: CollapseShape, y: number): number {
  if (y <= shape.split) return -1;
  let j = 0;
  while (j + 1 < shape.slabs && y >= slabBottom(shape, j + 1)) j++;
  return j;
}

/** 板 j の潰れの進み（0〜1）。一番下の板から順に潰れ始め、潰れる速さは落ちる加速で増す（進みの2乗）。 */
export function slabCrush(j: number, slabs: number, collapse: number): number {
  const S = COLLAPSE.slabs;
  const span = Math.max(0, S.to - S.from - S.each);
  const start = S.from + (slabs > 1 ? (span * j) / (slabs - 1) : span * 0.5);
  const t = clamp01((collapse - start) / S.each);
  return t * t;
}

/**
 * 上の塊の傾きの上限（ラジアン）：軸の高さ hingeY のとき、倒れる向きの前の隣へ食い込まない角度。
 * 上の塊の前の面は、軸から (sin a, cos a) の向きに長さ L で伸びる。隙間 g の隣の手前の面（屋上の高さ top）に届くのは
 * sin a ≥ g / L かつ tan a ≥ g / (top − hingeY) のとき。どちらかを満たさない角度まで倒せる。
 */
export function clearanceAngle(shape: CollapseShape, hingeY: number): number {
  const C = COLLAPSE;
  let lim = C.toppleMaxDeg * DEG;
  const L = shape.length;
  for (let i = 0; i < shape.gaps.length; i++) {
    const rise = shape.tops[i] - hingeY;
    if (rise <= 0) continue;
    const g = shape.gaps[i] - C.clearance;
    if (g <= 0) {
      lim = 0;
      continue;
    }
    const reach = g >= L ? Math.PI / 2 : Math.asin(g / L);
    lim = Math.min(lim, Math.max(reach, Math.atan2(g, rise)));
  }
  return lim;
}

/** 潰れた階と板の積み重なりの高さ（m、根元から。沈む前）。瓦礫の山はこれを隠す高さにする。 */
export function pileHeight(shape: CollapseShape): number {
  const C = COLLAPSE;
  const a = C.settleDeg * DEG;
  return (shape.split - shape.base) * C.squash + shape.length * C.slabs.squash * Math.cos(a) + shape.depth * Math.sin(a);
}

/** 最後に沈む量（m）：積み重なりの share 倍（上限 sinkMax）を、潰れた下の階の高さの stackShare 倍までに抑える（地面の下へ入れない）。 */
export function sinkDepth(shape: CollapseShape): number {
  const C = COLLAPSE;
  return Math.min(C.sinkMax, pileHeight(shape) * C.sinkShare, (shape.split - shape.base) * C.squash * C.sinkStackShare);
}

/** 瓦礫の山の高さ（m、盛り上がりきったとき）。 */
export function moundHeight(shape: CollapseShape): number {
  return Math.min(RUBBLE.height[1], Math.max(RUBBLE.height[0], pileHeight(shape) * RUBBLE.cover + RUBBLE.lift));
}

/** 瓦礫の山が盛り上がる秒数（崩落の秒数 × share を [seconds] に収める）。 */
export function moundSeconds(shape: CollapseShape): number {
  const M = COLLAPSE.mound;
  return Math.min(M.seconds[1], Math.max(M.seconds[0], shape.seconds * M.share));
}

/** 崩落の進み collapse での瓦礫の山の盛り上がり（0〜1）。速く盛り上がって、ゆっくり落ち着く。崩落の終わりで 1。 */
export function moundProgress(shape: CollapseShape, collapse: number): number {
  const start = Math.max(0, 1 - moundSeconds(shape) / shape.seconds);
  const t = clamp01((collapse - start) / Math.max(1e-6, 1 - start));
  return 1 - (1 - t) * (1 - t);
}

/** 傾き tilt（遊びの値、ラジアン）と崩落の進み collapse（0〜1）から、割れた建物の形を決める。 */
export function collapsePose(tilt: number, collapse: number, shape: CollapseShape, out: CollapsePose): CollapsePose {
  const C = COLLAPSE;
  const c = clamp01(collapse);
  const { split, base, length } = shape;
  // 下の階：潰れの先端は割れ目から根元へ。落ちる加速で速くなる（進みの2乗）
  const t = clamp01((c - C.crush[0]) / (C.crush[1] - C.crush[0]));
  out.front = split - (split - base) * t * t;
  out.stackTop = out.front + (split - out.front) * C.squash;
  // 上の塊の傾き：遊びの傾き＋崩落の間の倒れ込み。隣へ食い込まない角度と上限で止め、最後は瓦礫の上へ落ちて傾きを戻す
  const k = clamp01((length - 15) / 65);
  const extra = (C.toppleDeg[0] + (C.toppleDeg[1] - C.toppleDeg[0]) * k) * DEG;
  const e = clamp01(c / C.toppleEnd);
  const lean = Math.min(tilt + extra * e * e, clearanceAngle(shape, out.stackTop));
  const s = smooth(C.settle[0], C.settle[1], c);
  out.angle = lean + (C.settleDeg * DEG - lean) * s;
  for (let j = 0; j < C.slabs.max; j++) out.crush[j] = j < shape.slabs ? slabCrush(j, shape.slabs, c) : 0;
  out.sink = smooth(C.sinkRange[0], C.sinkRange[1], c) * sinkDepth(shape);
  out.mound = moundProgress(shape, c);
  return out;
}

/**
 * 点 p（動く前の位置）を、割れた建物の形に合わせて動かす（シェーダーの dmgMovePiece と同じ式）。
 * piece は -1 で下の塊、0 以上で上の塊の板の番号。上の塊は、板の継ぎ目を上の塊の傾きのまま軸に沿って並べ、
 * 板の中の点は板の傾き（上の塊の傾き＋潰れるときの揺らぎ）で回す。回す軸は水平で倒れる向きに直交する。
 */
export function movePiece(
  p: { x: number; y: number; z: number },
  piece: number,
  pose: CollapsePose,
  hinge: { x: number; z: number },
  shape: CollapseShape,
  dirX: number,
  dirZ: number,
): void {
  if (piece < 0) {
    if (p.y > pose.front) p.y = pose.front + (p.y - pose.front) * COLLAPSE.squash;
    p.y -= pose.sink;
    return;
  }
  const S = COLLAPSE.slabs;
  let along = 0;
  for (let i = 0; i < piece; i++) along += (slabBottom(shape, i + 1) - slabBottom(shape, i)) * (1 - (1 - S.squash) * pose.crush[i]);
  const q = pose.crush[piece];
  const eta = (p.y - slabBottom(shape, piece)) * (1 - (1 - S.squash) * q);
  const theta = pose.angle + S.jitterDeg * DEG * Math.sin(piece * 2.39 + shape.seed * 6.283) * q;
  const slide = S.slide * Math.sin(piece * 1.73 + shape.seed * 4.1) * q;
  const rx = p.x - hinge.x;
  const rz = p.z - hinge.z;
  // d：倒れる向きの距離、w：横（軸に沿った）距離
  const d = rx * dirX + rz * dirZ + slide;
  const w = -rx * dirZ + rz * dirX;
  const ca = Math.cos(pose.angle);
  const sa = Math.sin(pose.angle);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const dd = along * sa + d * ct + eta * st;
  const yy = along * ca - d * st + eta * ct;
  p.x = hinge.x + dd * dirX - w * dirZ;
  p.z = hinge.z + dd * dirZ + w * dirX;
  p.y = pose.stackTop + yy - pose.sink;
}

/**
 * 建物ごとの崩れ方の寸法の入れ物（描画の表と効果の側がそれぞれ1つ持つ）。割れる高さと倒れる向きは傾きの段階で決まって変わらないので、
 * 同じ値のあいだは作り直さない（隣の建物を探すのは、崩れ始める建物ごとに1回）。
 */
export class CollapseShapes {
  private readonly cache = new Map<number, { split: number; dirX: number; dirZ: number; shape: CollapseShape }>();

  constructor(private readonly buildings: readonly Building[]) {}

  get(b: Building, split: number, dirX: number, dirZ: number): CollapseShape {
    const c = this.cache.get(b.id);
    if (c && c.split === split && c.dirX === dirX && c.dirZ === dirZ) return c.shape;
    const shape = collapseShape(b, split, dirX, dirZ, this.buildings);
    this.cache.set(b.id, { split, dirX, dirZ, shape });
    return shape;
  }
}
