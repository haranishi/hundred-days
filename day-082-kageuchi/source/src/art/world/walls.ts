// OWNER: world-art
// 塀と門。土塀は石の土台・黄土色の壁に白い定規筋5本・瓦の笠。板塀は縦板と小さな笠。
// 表門は大きな屋根の門（薬医門）、裏門と中門は小さな棟門。扉は内へ開いている。
// 塀の継ぎ目（他の塀の端と接する端）は端の面を作らず、箱を重ねて角を埋める（同じ平面の面を重ねない）。
import { Matrix4 } from 'three';
import type { GateDef, StageDef, Vec2, WallDef } from '../../stage/types';
import type { Builders } from './buildings';
import type { MeshBuilder, V3 } from './geometry';
import { cross3, seedOf, sub3 } from './geometry';
import { PART } from './materialsLib';
import { buildRoof } from './roof';

/** 塀の向きの枠：s は a→b の距離、w は右手（外向き）への距離。 */
function frame(a: Vec2, b: Vec2) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;
  const P = (s: number, y: number, w: number): V3 => [a.x + ux * s + nx * w, y, a.z + uz * s + nz * w];
  return { len, ux, uz, nx, nz, P, alongX: Math.abs(ux) > 0.5 };
}

/** 四角形を足す。表が want を向くよう、頂点の順を自動で決める。 */
function face(mb: MeshBuilder, p: [V3, V3, V3, V3], uvs: [number, number][], want: V3): void {
  const n = cross3(sub3(p[1], p[0]), sub3(p[2], p[0]));
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) mb.quad(p[0], p[1], p[2], p[3], uvs);
  else mb.quad(p[3], p[2], p[1], p[0], [uvs[3], uvs[2], uvs[1], uvs[0]]);
}

/** 塀の向きに沿った箱（s0..s1、w0..w1、y0..y1）。ends で端の面を作るか選ぶ。 */
function slab(mb: MeshBuilder, f: ReturnType<typeof frame>, s0: number, s1: number, w0: number, w1: number, y0: number, y1: number, ends: [boolean, boolean], top = true, bottom = false): void {
  const { P } = f;
  const nOut: V3 = [f.nx, 0, f.nz];
  const nIn: V3 = [-f.nx, 0, -f.nz];
  const along: V3 = [f.ux, 0, f.uz];
  const back: V3 = [-f.ux, 0, -f.uz];
  face(mb, [P(s0, y0, w1), P(s1, y0, w1), P(s1, y1, w1), P(s0, y1, w1)], [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], nOut);
  face(mb, [P(s1, y0, w0), P(s0, y0, w0), P(s0, y1, w0), P(s1, y1, w0)], [[s1, y0], [s0, y0], [s0, y1], [s1, y1]], nIn);
  if (top) face(mb, [P(s0, y1, w0), P(s1, y1, w0), P(s1, y1, w1), P(s0, y1, w1)], [[s0, w0], [s1, w0], [s1, w1], [s0, w1]], [0, 1, 0]);
  if (bottom) face(mb, [P(s0, y0, w0), P(s1, y0, w0), P(s1, y0, w1), P(s0, y0, w1)], [[s0, w0], [s1, w0], [s1, w1], [s0, w1]], [0, -1, 0]);
  if (ends[0]) face(mb, [P(s0, y0, w0), P(s0, y0, w1), P(s0, y1, w1), P(s0, y1, w0)], [[w0, y0], [w1, y0], [w1, y1], [w0, y1]], back);
  if (ends[1]) face(mb, [P(s1, y0, w1), P(s1, y0, w0), P(s1, y1, w0), P(s1, y1, w1)], [[w1, y0], [w0, y0], [w0, y1], [w1, y1]], along);
}

/** 塀の上の小さな切妻（瓦の笠）。棟の高さ top、張り出し over、軒の厚み th。 */
function cap(bd: Builders, f: ReturnType<typeof frame>, s0: number, s1: number, half: number, over: number, top: number, drop: number, ends: [boolean, boolean], seed: number, wood = false): void {
  const { P } = f;
  const eW = half + over;
  const eY = top - drop;
  const mb = wood ? bd.wood : bd.tile;
  mb.kg = wood ? [PART.wood.board, seed, 1, 0.1] : [PART.tile.roof, seed, 0, 0];
  const slopeLen = Math.hypot(eW, drop);
  for (const side of [1, -1]) {
    const want: V3 = [f.nx * side, 0.6, f.nz * side];
    face(mb, [P(s0, eY, side * eW), P(s1, eY, side * eW), P(s1, top, 0), P(s0, top, 0)], [[s0, 0], [s1, 0], [s1, slopeLen], [s0, slopeLen]], want);
    // 軒先の厚み
    if (!wood) bd.tile.kg = [PART.tile.edge, seed, 0, 0];
    face(mb, [P(s0, eY - 0.07, side * eW), P(s1, eY - 0.07, side * eW), P(s1, eY, side * eW), P(s0, eY, side * eW)], [[s0, -0.07], [s1, -0.07], [s1, 0], [s0, 0]], [f.nx * side, 0, f.nz * side]);
    mb.kg = wood ? [PART.wood.board, seed, 1, 0.1] : [PART.tile.roof, seed, 0, 0];
    // 軒裏
    bd.wood.kg = [PART.wood.rafter, seed, 1, 0];
    face(bd.wood, [P(s0, eY - 0.07, side * eW), P(s1, eY - 0.07, side * eW), P(s1, eY - 0.02, side * half), P(s0, eY - 0.02, side * half)], [[s0, 0], [s1, 0], [s1, over], [s0, over]], [0, -1, 0]);
  }
  // 棟
  if (!wood) {
    bd.tile.kg = [PART.tile.ridge, seed, 0, 0];
    slab(bd.tile, f, s0, s1, -0.13, 0.13, top - 0.06, top + 0.12, ends, true);
  }
  // 端の三角（妻）
  for (const [i, s] of [[0, s0], [1, s1]] as [number, number][]) {
    if (!ends[i]) continue;
    const want: V3 = i === 0 ? [-f.ux, 0, -f.uz] : [f.ux, 0, f.uz];
    const m = wood ? bd.wood : bd.tile;
    m.kg = wood ? [PART.wood.board, seed, 1, 0.1] : [PART.tile.ridge, seed, 0, 0];
    const a = P(s, eY - 0.07, -eW);
    const b = P(s, eY - 0.07, eW);
    const c = P(s, top, 0);
    const n = cross3(sub3(b, a), sub3(c, a));
    if (n[0] * want[0] + n[2] * want[2] >= 0) m.tri(a, b, c);
    else m.tri(b, a, c);
  }
}

function isJoined(stage: StageDef, w: WallDef, p: Vec2): boolean {
  return stage.walls.some((o) => o !== w && o.kind !== 'town' && (Math.hypot(o.a.x - p.x, o.a.z - p.z) < 0.3 || Math.hypot(o.b.x - p.x, o.b.z - p.z) < 0.3));
}

function dobei(bd: Builders, stage: StageDef, w: WallDef): void {
  const f = frame(w.a, w.b);
  const seed = seedOf(w.id) % 1000;
  const ja = isJoined(stage, w, w.a);
  const jb = isJoined(stage, w, w.b);
  const t = w.thickness / 2;
  const s0 = ja ? -t : 0;
  const s1 = jb ? f.len + t : f.len;
  const ends: [boolean, boolean] = [!ja, !jb];
  const baseH = 0.45;
  const top = w.height;
  const bodyTop = top - 0.36;
  if (w.crawl) {
    // 水抜き穴：下 0.95m を抜いた壁（しゃがめば通れる）。穴の縁に木の枠
    const hole = 0.95;
    bd.plaster.kg = [PART.plaster.dobei, seed, hole, bodyTop];
    slab(bd.plaster, f, s0, s1, -t + 0.03, t - 0.03, hole, bodyTop, ends, true, true);
    bd.wood.kg = [PART.wood.timber, seed, 1, 0.1];
    slab(bd.wood, f, s0 - 0.05, s1 + 0.05, -t - 0.02, t + 0.02, hole - 0.16, hole, [true, true], true, true);
    bd.stone.kg = [PART.stone.cut, seed, 0.7, 0.22];
    slab(bd.stone, f, s0 - 0.25, s0 + 0.05, -t - 0.06, t + 0.06, 0, baseH, [true, true]);
    slab(bd.stone, f, s1 - 0.05, s1 + 0.25, -t - 0.06, t + 0.06, 0, baseH, [true, true]);
  } else {
    bd.stoneLow.kg = [PART.stone.cut, seed, 0.72, 0.22];
    slab(bd.stoneLow, f, s0, s1, -t - 0.06, t + 0.06, -0.05, baseH, ends);
    bd.plaster.kg = [PART.plaster.dobei, seed, baseH, bodyTop];
    slab(bd.plaster, f, s0, s1, -t + 0.03, t - 0.03, baseH, bodyTop, ends, false);
  }
  cap(bd, f, s0 - (ja ? 0.3 : 0.12), s1 + (jb ? 0.3 : 0.12), t - 0.03, 0.32, top, 0.4, ends, seed);
}

function itabei(bd: Builders, stage: StageDef, w: WallDef): void {
  const f = frame(w.a, w.b);
  const seed = seedOf(w.id) % 1000;
  const ja = isJoined(stage, w, w.a);
  const jb = isJoined(stage, w, w.b);
  const t = w.thickness / 2;
  const ends: [boolean, boolean] = [!ja, !jb];
  const top = w.height;
  bd.stoneLow.kg = [PART.stone.rough, seed, 0, 0];
  slab(bd.stoneLow, f, 0, f.len, -t - 0.05, t + 0.05, -0.05, 0.16, [true, true]);
  bd.wood.kg = [PART.wood.board, seed, 0, 0.05];
  slab(bd.wood, f, 0, f.len, -t + 0.02, t - 0.02, 0.16, top - 0.14, ends, false);
  // 柱と胴縁（両面）
  bd.wood.kg = [PART.wood.timber, seed + 1, 0, 0.12];
  const n = Math.max(1, Math.round(f.len / 1.8));
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * f.len;
    slab(bd.wood, f, s - 0.07, s + 0.07, -t - 0.03, t + 0.03, 0.1, top - 0.08, [true, true]);
  }
  bd.wood.kg = [PART.wood.timber, seed + 2, 1, 0.12];
  for (const y of [0.62, 1.6]) {
    slab(bd.wood, f, 0, f.len, -t - 0.035, -t + 0.01, y, y + 0.09, [true, true], true, true);
    slab(bd.wood, f, 0, f.len, t - 0.01, t + 0.035, y, y + 0.09, [true, true], true, true);
  }
  cap(bd, f, -0.05, f.len + 0.05, t, 0.12, top, 0.16, [true, true], seed, true);
}

/** 扉の板（蝶番の位置 hinge から、開いた向き dir へ幅 w） */
function door(mb: MeshBuilder, hinge: V3, dirX: number, dirZ: number, w: number, h: number, th: number): void {
  const ang = Math.atan2(dirZ, dirX);
  const m = new Matrix4().makeRotationY(-ang);
  m.setPosition(hinge[0] + (dirX * w) / 2, hinge[1] + h / 2, hinge[2] + (dirZ * w) / 2);
  mb.setMatrix(m);
  mb.box([0, 0, 0], [w, h, th]);
  mb.setMatrix(null);
}

function gate(bd: Builders, g: GateDef): void {
  const seed = seedOf(g.id) % 1000;
  const yaw = (g.facingDeg * Math.PI) / 180;
  // 外向き（門の正面）と、門の幅の向き
  const ox = Math.cos(yaw);
  const oz = Math.sin(yaw);
  const wx = -oz;
  const wz = ox;
  const half = g.width / 2;
  const large = g.kind === 'large';
  const pillarH = large ? 4.3 : 3.0;
  const pr = large ? 0.2 : 0.14;
  const cx = g.center.x;
  const cz = g.center.z;
  const at = (along: number, out: number): [number, number] => [cx + wx * along + ox * out, cz + wz * along + oz * out];
  // 本柱と礎石
  for (const sgn of [-1, 1]) {
    const p = at(sgn * half, 0);
    bd.wood.kg = [PART.wood.timber, seed + (sgn > 0 ? 1 : 2), 0, 0.12];
    bd.wood.box([p[0], pillarH / 2, p[1]], [pr * 2, pillarH, pr * 2]);
    bd.stoneLow.kg = [PART.stone.rough, seed, 0, 0];
    bd.stoneLow.box([p[0], 0.08, p[1]], [pr * 3, 0.16, pr * 3]);
    if (large) {
      // 控柱（内側）と、本柱とをつなぐ貫
      const q = at(sgn * half, -1.7);
      bd.wood.box([q[0], 1.6, q[1]], [0.28, 3.2, 0.28]);
      bd.stoneLow.box([q[0], 0.08, q[1]], [0.45, 0.16, 0.45]);
      const m = at(sgn * half, -0.85);
      bd.wood.kg = [PART.wood.timber, seed + 3, 1, 0.15];
      bd.wood.box([m[0], 2.9, m[1]], Math.abs(ox) > 0.5 ? [1.9, 0.2, 0.18] : [0.18, 0.2, 1.9]);
      bd.wood.box([m[0], 1.2, m[1]], Math.abs(ox) > 0.5 ? [1.9, 0.14, 0.14] : [0.14, 0.14, 1.9]);
    }
  }
  // 冠木（開口の上の横木）
  bd.wood.kg = [PART.wood.timber, seed + 4, 1, 0.18];
  const c0 = at(0, 0);
  const lintelW = g.width + pr * 2 + 0.5;
  bd.wood.box([c0[0], pillarH - 0.2, c0[1]], Math.abs(ox) > 0.5 ? [0.3, 0.4, lintelW] : [lintelW, 0.4, 0.3]);
  // 扉：内へ開く（外向きの逆へ、蝶番は本柱）
  bd.wood.kg = [PART.wood.board, seed + 5, 0, 0.05];
  const dh = pillarH - 0.55;
  const open = large ? 1.3 : 1.15;
  for (const sgn of [-1, 1]) {
    const p = at(sgn * (half - pr), 0);
    // 開いた向き：内側（-外向き）へ、角 open だけ回した方向
    const dx = -wx * sgn * Math.cos(open) - ox * Math.sin(open);
    const dz = -wz * sgn * Math.cos(open) - oz * Math.sin(open);
    door(bd.wood, [p[0], 0.05, p[1]], dx, dz, half - pr, dh, 0.1);
  }
  // 屋根（切妻。棟は塀に沿う）
  const axis: 'x' | 'z' = Math.abs(wx) > 0.5 ? 'x' : 'z';
  const roofC = at(0, large ? -0.75 : 0);
  const eave = large ? pillarH + 0.05 : pillarH + 0.15;
  buildRoof(
    {
      cx: roofC[0],
      cz: roofC[1],
      axis,
      A: half + (large ? 1.55 : 0.85),
      B: large ? 2.05 : 1.05,
      eaveY: eave,
      ridgeY: eave + (large ? 1.45 : 0.85),
      type: 'kirizuma',
      sag: large ? 0.22 : 0.1,
      cornerUp: large ? 0.18 : 0.08,
      thick: large ? 0.3 : 0.22,
      wallA: half,
      wallB: large ? 1.1 : 0.4,
      ridgeH: large ? 0.42 : 0.3,
      ridgeW: large ? 0.38 : 0.28,
      oni: true,
      seed,
    },
    bd,
  );
}

export function buildWalls(bd: Builders, stage: StageDef): void {
  for (const w of stage.walls) {
    if (w.kind === 'dobei') dobei(bd, stage, w);
    else if (w.kind === 'itabei') itabei(bd, stage, w);
  }
  for (const g of stage.gates) gate(bd, g);
}
