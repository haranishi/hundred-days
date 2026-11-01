// OWNER: world-art
// 通りの先の眺め（r02-fix-visual）。指摘「明智勢の篝火の列と旗が、遊ぶカメラから一度も見えない」への手当て。
// 遊ぶカメラは見下ろし 25〜48°・高さ 6〜13m なので、画面の上の端は水平か、それより下を向く。町屋（棟 8m）の屋根越しの物は
// 画面の上へ外れ、見せられるのは「通りの先」だけになる。そこで町屋の輪を3か所だけ開け、閉じた木戸（縦格子）を立てて、
// その先の道に明智勢の松明・篝火・兵・幟を置く（外の飾りは outside.ts）。
//   A 表門の正面から南へ延びる道（南の通りを渡った先）
//   B 南の通りの西の突き当たり（西の陣へ）
//   C 西の小路の南の突き当たり（南の陣へ）
// 当たりは stage の町屋の線（厚み 1m）のままなので、木戸の線で行き止まりになる（木戸はその線の上に立てる）。
import type { StageDef, WallDef } from '../../stage/types';
import type { Builders } from './buildings';
import { PART } from './materialsLib';

export interface Opening {
  wallId: string;
  /** 町屋の線（wall.a から）に沿った、家を建てない区間（m） */
  s0: number;
  s1: number;
  /** 木戸の中心（x, z）・外へ向かう単位ベクトル・木戸に沿う単位ベクトル・幅 */
  cx: number;
  cz: number;
  ox: number;
  oz: number;
  ax: number;
  az: number;
  width: number;
}

function wallById(stage: StageDef, id: string): WallDef | undefined {
  return stage.walls.find((w) => w.id === id && w.kind === 'town');
}

/** 町屋の線 w の上の、点 p0→p1 の区間を開口にする。outward は町の外へ向かう向き。 */
function opening(w: WallDef, p0: [number, number], p1: [number, number]): Opening {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const s = (p: [number, number]): number => (p[0] - w.a.x) * ux + (p[1] - w.a.z) * uz;
  const s0 = Math.min(s(p0), s(p1));
  const s1 = Math.max(s(p0), s(p1));
  // 町屋の表は右手（-uz, ux）が通りの側。外はその逆
  return {
    wallId: w.id,
    s0,
    s1,
    cx: (p0[0] + p1[0]) / 2,
    cz: (p0[1] + p1[1]) / 2,
    ox: uz,
    oz: -ux,
    ax: ux,
    az: uz,
    width: s1 - s0,
  };
}

/** 本能寺の3つの開口。ステージに町屋の線や門が無ければ、その開口は作らない。 */
export function streetOpenings(stage: StageDef): Opening[] {
  const out: Opening[] = [];
  const ts = wallById(stage, 'TS');
  const tw = wallById(stage, 'TW');
  const gate = stage.gates.find((g) => g.kind === 'large');
  // A：表門の正面の道（門の幅＋2m）
  if (ts && gate) {
    const half = gate.width / 2 + 1.0;
    out.push(opening(ts, [gate.center.x - half, ts.a.z], [gate.center.x + half, ts.a.z]));
  }
  // B：南の通りの西の突き当たり（寺の南の土塀の外側から、南の町屋の手前まで）
  const south = stage.walls.filter((w) => w.kind === 'dobei' && w.a.z === w.b.z).reduce((m, w) => Math.max(m, w.a.z), -Infinity);
  if (tw && ts && Number.isFinite(south)) out.push(opening(tw, [tw.a.x, south + 0.8], [tw.a.x, ts.a.z - 0.4]));
  // C：西の小路の南の突き当たり（西の町屋の手前から、寺の西の土塀の外側まで）
  const west = stage.walls.filter((w) => w.kind === 'dobei' && w.a.x === w.b.x).reduce((m, w) => Math.min(m, w.a.x), Infinity);
  if (ts && tw && Number.isFinite(west)) out.push(opening(ts, [tw.a.x + 0.4, ts.a.z], [west - 0.8, ts.a.z]));
  return out;
}

/** 町屋の線 wallId の [s0, s1] が開口に掛かるなら、その開口を返す。 */
export function openingAt(openings: readonly Opening[], wallId: string, s: number): Opening | undefined {
  return openings.find((o) => o.wallId === wallId && s > o.s0 - 1e-3 && s < o.s1 + 1e-3);
}

/**
 * 木戸：両端の柱・冠木と小さな屋根・閉じた2枚の扉（縦格子。格子の隙間から先が見える）。
 * 柱と屋根は町屋と同じ木と瓦の材質。格子は本物の棒（模様の板では向こうが見えない）。
 */
export function buildKido(bd: Builders, o: Opening): void {
  const P = (a: number, h: number, y: number): [number, number, number] => [o.cx + o.ax * a + o.ox * h, y, o.cz + o.az * a + o.oz * h];
  const half = o.width / 2;
  const H = 3.1;
  const box = (mb: Builders['wood'], a0: number, a1: number, h0: number, h1: number, y0: number, y1: number): void => {
    const p = P((a0 + a1) / 2, (h0 + h1) / 2, (y0 + y1) / 2);
    const along = Math.abs(a1 - a0);
    const across = Math.abs(h1 - h0);
    const sx = Math.abs(o.ax) > 0.5 ? along : across;
    const sz = Math.abs(o.ax) > 0.5 ? across : along;
    mb.box(p, [sx, y1 - y0, sz]);
  };
  bd.wood.kg = [PART.wood.timber, 71, 0, 0.12];
  // 柱（両端）と冠木
  for (const a of [-half, half]) box(bd.wood, a - 0.12, a + 0.12, -0.12, 0.12, 0, H);
  box(bd.wood, -half - 0.35, half + 0.35, -0.11, 0.11, H - 0.32, H - 0.08);
  // 扉：上下の框と、縦格子（幅 7cm を 22cm おき）
  bd.wood.kg = [PART.wood.timber, 72, 1, 0.1];
  for (const y of [0.12, 1.15, 2.3]) box(bd.wood, -half + 0.12, half - 0.12, -0.05, 0.05, y, y + 0.09);
  const n = Math.max(2, Math.round((o.width - 0.24) / 0.22));
  for (let i = 0; i <= n; i++) {
    const a = -half + 0.12 + ((o.width - 0.24) * i) / n;
    box(bd.wood, a - 0.035, a + 0.035, -0.035, 0.035, 0.12, 2.39);
  }
  // 小さな屋根（瓦）
  bd.tile.kg = [PART.tile.roof, 73, 0, 0];
  box(bd.tile, -half - 0.6, half + 0.6, -0.55, 0.55, H - 0.08, H + 0.1);
  bd.tile.kg = [PART.tile.ridge, 73, 0, 0];
  box(bd.tile, -half - 0.6, half + 0.6, -0.12, 0.12, H + 0.1, H + 0.26);
}
