// OWNER: world-art
// 建物（手続きで作る）：基壇の石、縁側と手すり、丸柱、貫、白い漆喰の壁、組物を簡略にした軒下の段、蔀戸・障子・窓、屋根。
// 本堂は大きく重い入母屋、書院は低く横長で南面の障子が内から光る、庫裏は大きな切妻、蔵は白壁と腰のなまこ壁、
// 鐘楼は四本柱と梵鐘。寸法は stage.buildings の足跡・軒の高さ・棟の高さから決める（足跡は縁側まで含む）。
import type { BuildingDef, StageDef } from '../../stage/types';
import type { MeshBuilder, V3 } from './geometry';
import { seedOf } from './geometry';
import { PART } from './materialsLib';
import { buildRoof, type RoofResult, type RoofSpec } from './roof';

export interface Builders {
  wood: MeshBuilder;
  woodLow: MeshBuilder;
  plaster: MeshBuilder;
  tile: MeshBuilder;
  stone: MeshBuilder;
  stoneLow: MeshBuilder;
  glow: MeshBuilder;
  iron: MeshBuilder;
}

/** 燃え広がりの炎を置く線（建物ごと）。 */
export interface FireLines {
  id: string;
  ridge: V3[];
  eaves: V3[];
  center: V3;
  topY: number;
}

type SideKind = 'plaster' | 'shoji' | 'lattice' | 'kura' | 'board';

interface SideSpec {
  kind: SideKind;
  /** 戸口を置く柱間の番号（板戸・暗い入口） */
  doors?: number[];
  /** 灯りの窓（中心の位置 m、幅 m、下端・上端の高さ m、明るさ） */
  window?: { at: number; w: number; y0: number; y1: number; power: number };
}

interface BodySpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floorY: number;
  headY: number;
  pillarR: number;
  round: boolean;
  spacing: number;
  sides: Record<'n' | 's' | 'e' | 'w', SideSpec>;
  /** 組物の段（0：舟肘木だけ、1：平三斗、2：出組） */
  brackets: 0 | 1 | 2;
  seed: number;
  lights?: StageDef['lights'];
}

/** 壁の一辺（柱・壁・腰板・長押・頭貫・小壁・組物）。a→b の右手が外。 */
function wallSide(bd: Builders, body: BodySpec, side: SideSpec, a: [number, number], b: [number, number], roof: RoofResult): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  // 外向き：(-uz, ux)（a→b の右手。x 東・z 南を上から見て）
  const ox = -uz;
  const oz = ux;
  const alongX = Math.abs(ux) > 0.5;
  const nb = Math.max(1, Math.round(len / body.spacing));
  const wt = 0.16;
  const { floorY, headY, seed } = body;
  const at = (t: number, off: number): [number, number] => [a[0] + dx * t + ox * off, a[1] + dz * t + oz * off];
  /** 辺に沿った箱（t0..t1 の範囲、外へ off、厚み th、高さ y0..y1） */
  const runBox = (mb: MeshBuilder, t0: number, t1: number, off: number, th: number, y0: number, y1: number): void => {
    const p0 = at(t0, off);
    const p1 = at(t1, off);
    const cx = (p0[0] + p1[0]) / 2;
    const cz = (p0[1] + p1[1]) / 2;
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    mb.box([cx, (y0 + y1) / 2, cz], alongX ? [L, y1 - y0, th] : [th, y1 - y0, L]);
  };
  const pr = body.pillarR;
  const tp = pr / len;
  const glowIndex = (kind: 'shoji' | 'window', t: number): number => {
    const p = at(t, 0);
    let best = -1;
    let distance = Infinity;
    for (const [index, light] of (body.lights ?? []).entries()) {
      if (light.kind !== kind) continue;
      const d = Math.hypot(p[0] - light.pos.x, p[1] - light.pos.z);
      if (d < distance) [best, distance] = [index, d];
    }
    return best;
  };

  // 壁の本体（漆喰）
  bd.plaster.kg = [side.kind === 'kura' ? PART.plaster.white : PART.plaster.white, seed, floorY, headY];
  runBox(bd.plaster, -tp, 1 + tp, 0, wt, floorY, headY);

  // 柱（角の柱は k=0 の辺が受け持つ）
  bd.wood.kg = [PART.wood.timber, seed + 1, 0, 0.15];
  for (let k = 0; k < nb; k++) {
    const p = at(k / nb, 0);
    if (body.round) bd.wood.cylinder(p[0], floorY - 0.02, p[1], pr, pr * 0.94, headY - floorY + 0.02, 10, false);
    else bd.wood.box([p[0], (floorY + headY) / 2, p[1]], [pr * 2, headY - floorY, pr * 2]);
  }

  // 柱間ごとの建具
  for (let j = 0; j < nb; j++) {
    const t0 = j / nb + tp * 1.05;
    const t1 = (j + 1) / nb - tp * 1.05;
    const isDoor = side.doors?.includes(j) ?? false;
    const off = wt / 2 + 0.012;
    if (isDoor) {
      bd.wood.kg = [PART.wood.board, seed + 10 + j, 0, 0];
      runBox(bd.wood, t0, t1, off, 0.04, floorY, floorY + 2.1);
      // 扉の框・横桟と留め金は壁の外形の中に置き、通路の当たりを増やさない。
      bd.wood.kg = [PART.wood.timber, seed + 41 + j, 1, 0.15];
      for (const y of [floorY + 0.25, floorY + 1.85]) runBox(bd.wood, t0, t1, off + 0.04, 0.04, y, y + 0.09);
      bd.iron.kg = [PART.iron.iron, seed + j, 0, 0];
      for (const y of [floorY + 0.5, floorY + 1.6]) runBox(bd.iron, t0, t0 + Math.min(0.23 / len, (t1 - t0) * 0.4), off + 0.065, 0.03, y, y + 0.065);
      const handle = (t0 + t1) / 2;
      runBox(bd.iron, handle - 0.035 / len, handle + 0.035 / len, off + 0.055, 0.05, floorY + 0.85, floorY + 1.04);
      continue;
    }
    if (side.kind === 'shoji') {
      bd.glow.kg = [PART.glow.shoji, seed + j * 0.37, 1, floorY];
      bd.glow.lightIndex = glowIndex('shoji', (t0 + t1) / 2);
      runBox(bd.glow, t0, t1, off, 0.03, floorY + 0.04, floorY + 1.82);
      bd.glow.lightIndex = -1;
    } else if (side.kind === 'lattice') {
      bd.wood.kg = [PART.wood.grid, seed + j, 0, 0.25];
      runBox(bd.wood, t0, t1, off, 0.05, floorY + 0.02, floorY + 2.25);
    } else if (side.kind === 'plaster' || side.kind === 'board') {
      bd.wood.kg = [PART.wood.board, seed + j, 0, 0.1];
      runBox(bd.wood, t0, t1, off - 0.004, 0.025, floorY, floorY + (side.kind === 'board' ? headY - floorY - 0.4 : 0.85));
    }
  }

  // 灯りの窓
  if (side.window) {
    const w = side.window;
    const tc = alongX ? (w.at - a[0]) / dx : (w.at - a[1]) / dz;
    const hw = w.w / 2 / len;
    bd.glow.kg = [PART.glow.window, seed, w.power, w.y0];
    bd.glow.lightIndex = glowIndex('window', tc);
    runBox(bd.glow, tc - hw, tc + hw, wt / 2 + 0.02, 0.04, w.y0, w.y1);
    bd.glow.lightIndex = -1;
    bd.wood.kg = [PART.wood.timber, seed + 5, 1, 0.2];
    runBox(bd.wood, tc - hw - 0.04, tc + hw + 0.04, wt / 2 + 0.03, 0.06, w.y1, w.y1 + 0.08);
    runBox(bd.wood, tc - hw - 0.04, tc + hw + 0.04, wt / 2 + 0.03, 0.06, w.y0 - 0.08, w.y0);
  }

  // 長押（障子の上の鴨居を兼ねる）と頭貫
  bd.wood.kg = [PART.wood.timber, seed + 3, 1, 0.2];
  if (side.kind !== 'kura') runBox(bd.wood, -tp, 1 + tp, wt / 2 + 0.03, 0.07, floorY + 1.84, floorY + 2.0);
  runBox(bd.wood, -tp * 1.3, 1 + tp * 1.3, wt / 2 + 0.035, 0.09, headY - 0.26, headY);

  // 小壁：頭貫の上から軒裏まで（軒裏の高さに沿う）
  bd.plaster.kg = [PART.plaster.white, seed + 7, headY, headY + 2];
  const nseg = Math.max(2, nb * 2);
  bd.plaster.grid(
    nseg,
    1,
    (u, v) => {
      const p = at(u, wt / 2);
      const top = Math.max(headY + 0.05, roof.under(p[0] + ox * 0.05, p[1] + oz * 0.05) - 0.02);
      const y = headY + (top - headY) * v;
      return { p: [p[0], y, p[1]], uv: [alongX ? p[0] : -p[1], y] };
    },
    // grid の表は (du × dv)。du＝a→b、dv＝上 なので、そのまま右手（外）を向く
    false,
  );

  // 組物：柱の上の大斗と肘木（出組は外へ一手出す）
  if (body.brackets >= 0) {
    bd.wood.kg = [PART.wood.timber, seed + 4, 1, 0.3];
    for (let k = 0; k <= nb; k++) {
      const p = at(k / nb, 0);
      const top = roof.under(p[0] + ox * 0.3, p[1] + oz * 0.3);
      const room = top - headY;
      if (room < 0.25) continue;
      const s = Math.min(1, room / 1.4);
      const y0 = headY;
      const daito = 0.22 * s;
      bd.wood.box([p[0] + ox * 0.04, y0 + daito / 2, p[1] + oz * 0.04], [0.36, daito, 0.36]);
      const hijL = body.brackets === 0 ? 0.9 : 1.25;
      const hijH = 0.17 * s;
      const hc: V3 = [p[0] + ox * 0.06, y0 + daito + hijH / 2, p[1] + oz * 0.06];
      bd.wood.box(hc, alongX ? [hijL, hijH, 0.2] : [0.2, hijH, hijL]);
      if (body.brackets >= 1) {
        const mt = y0 + daito + hijH;
        for (const e of [-0.48, 0, 0.48]) {
          bd.wood.box([p[0] + ux * e + ox * 0.06, mt + 0.08 * s, p[1] + uz * e + oz * 0.06], [0.22, 0.16 * s, 0.22]);
        }
      }
      if (body.brackets === 2 && room > 1.0) {
        // 出組：外へ一手出した肘木と、その先の巻斗、丸桁
        const mt = y0 + daito + hijH + 0.16 * s;
        const out = 0.7;
        bd.wood.box([p[0] + ox * (out / 2), mt + 0.09, p[1] + oz * (out / 2)], alongX ? [0.2, 0.18, out + 0.2] : [out + 0.2, 0.18, 0.2]);
        bd.wood.box([p[0] + ox * out, mt + 0.18 + 0.08, p[1] + oz * out], [0.24, 0.16, 0.24]);
      }
    }
    if (body.brackets === 2) {
      // 丸桁（出組の先をつなぐ桁）
      const t0 = -0.02;
      const t1 = 1.02;
      const p = at(0.5, 0.7);
      const yB = Math.min(roof.under(p[0] + ox * 0.2, p[1] + oz * 0.2) - 0.05, headY + 0.98);
      runBox(bd.wood, t0, t1, 0.7, 0.2, yB - 0.22, yB);
    } else {
      // 桁（壁の上を通る）
      const p = at(0.5, 0.2);
      const yB = Math.min(roof.under(p[0] + ox * 0.2, p[1] + oz * 0.2) - 0.03, headY + 0.6);
      if (yB > headY + 0.3) runBox(bd.wood, -0.03, 1.03, 0.16, 0.18, yB - 0.2, yB);
    }
  }
}

/** 四辺の壁を回す（北→東→南→西の順。a→b の右手が外になる向き）。 */
function bodyWalls(bd: Builders, body: BodySpec, roof: RoofResult): void {
  const { x0, z0, x1, z1 } = body;
  wallSide(bd, body, body.sides.n, [x1, z0], [x0, z0], roof);
  wallSide(bd, body, body.sides.w, [x0, z0], [x0, z1], roof);
  wallSide(bd, body, body.sides.s, [x0, z1], [x1, z1], roof);
  wallSide(bd, body, body.sides.e, [x1, z1], [x1, z0], roof);
}

/** 縁側：床板・縁框・縁束、手すり（高欄）。sides の辺だけに付ける。 */
function veranda(
  bd: Builders,
  body: BodySpec,
  outer: { x0: number; z0: number; x1: number; z1: number },
  baseY: number,
  sides: ('n' | 's' | 'e' | 'w')[],
  rail: boolean,
  gap: { side: 'n' | 's' | 'e' | 'w'; from: number; to: number } | null,
): void {
  const fy = body.floorY;
  const th = 0.12;
  for (const s of sides) {
    let r: { x0: number; z0: number; x1: number; z1: number };
    if (s === 's') r = { x0: outer.x0, z0: body.z1, x1: outer.x1, z1: outer.z1 };
    else if (s === 'n') r = { x0: outer.x0, z0: outer.z0, x1: outer.x1, z1: body.z0 };
    else {
      // 東西の縁は南北の縁の間だけ（角で床板を重ねない）
      const za = sides.includes('n') ? body.z0 : outer.z0;
      const zb = sides.includes('s') ? body.z1 : outer.z1;
      r = s === 'e' ? { x0: body.x1, z0: za, x1: outer.x1, z1: zb } : { x0: outer.x0, z0: za, x1: body.x0, z1: zb };
    }
    const alongX = s === 'n' || s === 's';
    bd.woodLow.kg = [PART.wood.floor, body.seed + 20, alongX ? 0 : 1, 0.25];
    bd.woodLow.box([(r.x0 + r.x1) / 2, fy - th / 2, (r.z0 + r.z1) / 2], [r.x1 - r.x0, th, r.z1 - r.z0]);
    // 縁束（床の下の短い柱）
    bd.woodLow.kg = [PART.wood.timber, body.seed + 21, 0, 0];
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const n = Math.max(2, Math.round(len / 1.8));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = alongX ? r.x0 + 0.15 + (r.x1 - r.x0 - 0.3) * t : s === 'e' ? r.x1 - 0.18 : r.x0 + 0.18;
      const z = alongX ? (s === 's' ? r.z1 - 0.18 : r.z0 + 0.18) : r.z0 + 0.15 + (r.z1 - r.z0 - 0.3) * t;
      bd.woodLow.box([x, (baseY + fy - th) / 2, z], [0.14, fy - th - baseY, 0.14]);
      if (!rail) continue;
      const inGap = gap && gap.side === s && (alongX ? x > gap.from && x < gap.to : z > gap.from && z < gap.to);
      if (inGap) continue;
      bd.woodLow.box([x, fy + 0.38, z], [0.1, 0.76, 0.1]);
    }
    if (rail) {
      // 手すりの横木（上と中）。正面の階段の所は切る
      bd.woodLow.kg = [PART.wood.timber, body.seed + 22, 1, 0.2];
      const edge = alongX ? (s === 's' ? r.z1 - 0.18 : r.z0 + 0.18) : s === 'e' ? r.x1 - 0.18 : r.x0 + 0.18;
      const spans: [number, number][] = [];
      const lo = alongX ? r.x0 + 0.1 : r.z0 + 0.1;
      const hi = alongX ? r.x1 - 0.1 : r.z1 - 0.1;
      if (gap && gap.side === s) spans.push([lo, gap.from], [gap.to, hi]);
      else spans.push([lo, hi]);
      for (const [a, b] of spans) {
        for (const [y, h] of [[fy + 0.76, 0.08], [fy + 0.38, 0.05]] as [number, number][]) {
          if (alongX) bd.woodLow.box([(a + b) / 2, y, edge], [b - a, h, 0.09]);
          else bd.woodLow.box([edge, y, (a + b) / 2], [0.09, h, b - a]);
        }
      }
    }
  }
}

/** 床の下を暗く塞ぐ箱（縁の下の奥）。 */
function underfloor(bd: Builders, body: BodySpec, baseY: number): void {
  bd.woodLow.kg = [PART.wood.board, body.seed + 30, 0, 0];
  const h = body.floorY - 0.12 - baseY;
  if (h <= 0.05) return;
  bd.woodLow.box([(body.x0 + body.x1) / 2, baseY + h / 2, (body.z0 + body.z1) / 2], [body.x1 - body.x0 + 0.1, h, body.z1 - body.z0 + 0.1]);
}

function base(bd: Builders, r: { x0: number; z0: number; x1: number; z1: number }, top: number, seed: number): void {
  bd.stoneLow.kg = [PART.stone.cut, seed, 0.95, 0.3];
  bd.stoneLow.box([(r.x0 + r.x1) / 2, (top - 0.06) / 2, (r.z0 + r.z1) / 2], [r.x1 - r.x0, top + 0.06, r.z1 - r.z0]);
}

function roofSpecFor(def: BuildingDef, body: BodySpec, over: { a: number; b: number }, opts: Partial<RoofSpec>): RoofSpec {
  const f = def.footprint;
  const cx = (f.x0 + f.x1) / 2;
  const cz = (f.z0 + f.z1) / 2;
  const alongX = def.ridgeAxis === 'x';
  const bodyHalfX = (body.x1 - body.x0) / 2;
  const bodyHalfZ = (body.z1 - body.z0) / 2;
  const halfX = (f.x1 - f.x0) / 2;
  const halfZ = (f.z1 - f.z0) / 2;
  const ridgeH = opts.ridgeH ?? 0.6;
  return {
    cx,
    cz,
    axis: def.ridgeAxis,
    A: (alongX ? halfX : halfZ) + over.a,
    B: (alongX ? halfZ : halfX) + over.b,
    eaveY: def.eaveHeight,
    ridgeY: def.ridgeHeight - ridgeH,
    type: 'irimoya',
    hipFrac: 0.42,
    gableSet: 0.55,
    sag: 0.35,
    cornerUp: 0.55,
    thick: 0.36,
    wallA: alongX ? bodyHalfX : bodyHalfZ,
    wallB: alongX ? bodyHalfZ : bodyHalfX,
    ridgeH,
    ridgeW: 0.45,
    oni: true,
    seed: seedOf(def.id) % 1000,
    ...opts,
  };
}

function hondo(bd: Builders, def: BuildingDef): FireLines {
  const f = def.footprint;
  const seed = seedOf(def.id) % 1000;
  const baseY = 0.55;
  const ver = 1.55;
  const body: BodySpec = {
    x0: f.x0 + ver,
    z0: f.z0 + ver,
    x1: f.x1 - ver,
    z1: f.z1 - ver,
    floorY: 1.35,
    headY: 4.75,
    pillarR: 0.23,
    round: true,
    spacing: 2.35,
    sides: {
      s: { kind: 'lattice', doors: [] },
      n: { kind: 'plaster', doors: [3] },
      e: { kind: 'plaster', doors: [2] },
      w: { kind: 'plaster', doors: [2] },
    },
    brackets: 2,
    seed,
  };
  base(bd, f, baseY, seed);
  const outer = { x0: f.x0 + 0.2, z0: f.z0 + 0.2, x1: f.x1 - 0.2, z1: f.z1 - 0.2 };
  veranda(bd, body, outer, baseY, ['n', 's', 'e', 'w'], true, { side: 's', from: -1.7, to: 1.7 });
  underfloor(bd, body, baseY);
  // 正面の階段（足跡の外へ 1m。石畳の端までつなぐ）
  bd.woodLow.kg = [PART.wood.floor, seed + 40, 1, 0.25];
  const steps = 6;
  const zAt = (k: number): number => (k >= steps ? outer.z1 : f.z1 + 1.0 - k / (steps - 1));
  for (let k = 0; k < steps; k++) {
    // 段ごとに自分の踏み面の奥行きだけの箱（重ねると側面がちらつく）
    const yTop = ((k + 1) / steps) * body.floorY;
    const zFront = zAt(k);
    const zBack = zAt(k + 1);
    bd.woodLow.box([0, yTop / 2, (zFront + zBack) / 2], [3.2, yTop, zFront - zBack]);
  }
  bd.woodLow.kg = [PART.wood.timber, seed + 41, 0, 0.2];
  for (const sx of [-1.7, 1.7]) bd.woodLow.box([sx, body.floorY / 2 + 0.35, f.z1 + 0.35], [0.12, body.floorY + 0.7, 1.4]);
  const roof = buildRoof(roofSpecFor(def, body, { a: 1.8, b: 1.8 }, { sag: 0.65, cornerUp: 0.85, thick: 0.42, ridgeH: 0.75, ridgeW: 0.55, hipFrac: 0.42 }), bd);
  bodyWalls(bd, body, roof);
  return { id: def.id, ridge: roof.ridge, eaves: roof.eaves, center: [(f.x0 + f.x1) / 2, def.ridgeHeight * 0.6, (f.z0 + f.z1) / 2], topY: roof.topY };
}

function shoin(bd: Builders, def: BuildingDef, stage: StageDef): FireLines {
  const f = def.footprint;
  const seed = seedOf(def.id) % 1000;
  const baseY = 0.3;
  const body: BodySpec = {
    x0: f.x0 + 0.5,
    z0: f.z0 + 0.5,
    x1: f.x1 - 0.5,
    z1: f.z1 - 1.15,
    floorY: 0.68,
    headY: 3.0,
    pillarR: 0.11,
    round: false,
    spacing: 1.82,
    lights: stage.lights,
    sides: {
      s: { kind: 'shoji' },
      n: { kind: 'plaster' },
      e: { kind: 'shoji' },
      w: { kind: 'plaster' },
    },
    brackets: 0,
    seed,
  };
  base(bd, f, baseY, seed);
  veranda(bd, body, { x0: f.x0 + 0.15, z0: f.z0 + 0.2, x1: f.x1 - 0.15, z1: f.z1 - 0.1 }, baseY, ['s'], false, null);
  underfloor(bd, body, baseY);
  // 沓脱石（縁側の前の踏み石）
  bd.stoneLow.kg = [PART.stone.rough, seed + 3, 0, 0];
  for (const x of [-6.2, 1.2, 8.1]) bd.stoneLow.box([x, 0.13, f.z1 + 0.05], [0.9, 0.26, 0.55]);
  const roof = buildRoof(
    roofSpecFor(def, body, { a: 1.5, b: 1.55 }, { sag: 0.4, cornerUp: 0.45, thick: 0.32, ridgeH: 0.5, ridgeW: 0.4, hipFrac: 0.4 }),
    bd,
  );
  bodyWalls(bd, body, roof);
  return { id: def.id, ridge: roof.ridge, eaves: roof.eaves, center: [(f.x0 + f.x1) / 2, 4.5, (f.z0 + f.z1) / 2], topY: roof.topY };
}

function kuri(bd: Builders, def: BuildingDef, stage: StageDef): FireLines {
  const f = def.footprint;
  const seed = seedOf(def.id) % 1000;
  const baseY = 0.28;
  const win = stage.lights.find((l) => l.kind === 'window');
  const body: BodySpec = {
    x0: f.x0 + 0.35,
    z0: f.z0 + 0.35,
    x1: f.x1 - 0.35,
    z1: f.z1 - 0.35,
    floorY: 0.3,
    headY: 3.45,
    pillarR: 0.13,
    round: false,
    spacing: 2.0,
    lights: stage.lights,
    sides: {
      w: { kind: 'plaster', doors: [1, 2], window: win ? { at: win.pos.z, w: 1.5, y0: 1.0, y1: 1.9, power: 1.1 } : undefined },
      e: { kind: 'plaster' },
      n: { kind: 'plaster' },
      s: { kind: 'plaster' },
    },
    brackets: 0,
    seed,
  };
  base(bd, f, baseY, seed);
  const roof = buildRoof(
    roofSpecFor(def, body, { a: 0.9, b: 1.25 }, { type: 'kirizuma', sag: 0.45, cornerUp: 0.2, thick: 0.3, ridgeH: 0.55, ridgeW: 0.45 }),
    bd,
  );
  bodyWalls(bd, body, roof);
  // 妻の飾り（虹梁と束）：北と南の妻壁に木の線
  bd.wood.kg = [PART.wood.timber, seed + 9, 1, 0.2];
  for (const z of [body.z0 - 0.1, body.z1 + 0.1]) {
    const y = body.headY + 1.1;
    bd.wood.box([(body.x0 + body.x1) / 2, y, z], [body.x1 - body.x0 - 1.2, 0.3, 0.12]);
    for (const dx of [-1.6, 0, 1.6]) bd.wood.box([(body.x0 + body.x1) / 2 + dx, y + 0.9, z], [0.18, 1.5, 0.12]);
  }
  return { id: def.id, ridge: roof.ridge, eaves: roof.eaves, center: [(f.x0 + f.x1) / 2, 5, (f.z0 + f.z1) / 2], topY: roof.topY };
}

function kura(bd: Builders, def: BuildingDef): FireLines {
  const f = def.footprint;
  const seed = seedOf(def.id) % 1000;
  const baseY = 0.45;
  const x0 = f.x0 + 0.25;
  const x1 = f.x1 - 0.25;
  const z0 = f.z0 + 0.25;
  const z1 = f.z1 - 0.25;
  base(bd, f, baseY, seed);
  // 厚い土の壁：腰はなまこ壁、上は白漆喰
  const wallTop = def.eaveHeight - 0.35;
  bd.plaster.kg = [PART.plaster.namako, seed, baseY, baseY + 1.3];
  bd.plaster.box([(x0 + x1) / 2, baseY + 0.65, (z0 + z1) / 2], [x1 - x0 + 0.06, 1.3, z1 - z0 + 0.06]);
  bd.plaster.kg = [PART.plaster.white, seed + 1, baseY + 1.3, wallTop];
  bd.plaster.box([(x0 + x1) / 2, (baseY + 1.3 + wallTop) / 2, (z0 + z1) / 2], [x1 - x0, wallTop - baseY - 1.3, z1 - z0]);
  // 鉢巻（軒下の厚い漆喰の段）
  bd.plaster.kg = [PART.plaster.white, seed + 2, wallTop, wallTop + 0.6];
  bd.plaster.box([(x0 + x1) / 2, wallTop + 0.18, (z0 + z1) / 2], [x1 - x0 + 0.24, 0.36, z1 - z0 + 0.24]);
  // 西の戸口（重い扉）と、高い所の小窓
  bd.wood.kg = [PART.wood.board, seed + 3, 0, 0];
  const zc = (z0 + z1) / 2;
  bd.wood.box([x0 - 0.04, baseY + 1.15, zc], [0.1, 2.0, 1.5]);
  bd.plaster.kg = [PART.plaster.white, seed + 4, baseY, wallTop];
  bd.plaster.box([x0 - 0.12, baseY + 1.15, zc - 0.95], [0.18, 2.3, 0.35]);
  bd.plaster.box([x0 - 0.12, baseY + 1.15, zc + 0.95], [0.18, 2.3, 0.35]);
  bd.glow.kg = [PART.glow.dark, seed, 0, 0];
  bd.glow.box([x0 - 0.03, wallTop - 0.9, zc], [0.06, 0.55, 0.7]);
  bd.glow.box([(x0 + x1) / 2 + 0.0, wallTop - 0.9, z1 + 0.03], [0.7, 0.55, 0.06]);
  // 置き屋根（壁から少し浮かせた切妻）
  const body: BodySpec = {
    x0,
    z0,
    x1,
    z1,
    floorY: baseY,
    headY: wallTop,
    pillarR: 0.1,
    round: false,
    spacing: 3,
    sides: { n: { kind: 'kura' }, s: { kind: 'kura' }, e: { kind: 'kura' }, w: { kind: 'kura' } },
    brackets: 0,
    seed,
  };
  const roof = buildRoof(
    roofSpecFor(def, body, { a: 0.75, b: 0.85 }, { type: 'kirizuma', sag: 0.18, cornerUp: 0.1, thick: 0.3, ridgeH: 0.42, ridgeW: 0.35 }),
    bd,
  );
  // 妻壁の上の三角（白漆喰）
  bd.plaster.kg = [PART.plaster.white, seed + 6, wallTop, def.ridgeHeight];
  for (const zz of [z0, z1]) {
    const sgn = zz === z0 ? -1 : 1;
    bd.plaster.grid(
      8,
      1,
      (u, v) => {
        const x = x0 + (x1 - x0) * u;
        const top = Math.max(wallTop + 0.36, roof.under(x, zz) - 0.02);
        const y = wallTop + 0.36 + (top - wallTop - 0.36) * v;
        return { p: [x, y, zz], uv: [x, y] };
      },
      sgn < 0,
    );
  }
  return { id: def.id, ridge: roof.ridge, eaves: roof.eaves, center: [(f.x0 + f.x1) / 2, 4, (f.z0 + f.z1) / 2], topY: roof.topY };
}

function shoro(bd: Builders, def: BuildingDef): FireLines {
  const f = def.footprint;
  const seed = seedOf(def.id) % 1000;
  const baseY = 0.55;
  base(bd, f, baseY, seed);
  const cx = (f.x0 + f.x1) / 2;
  const cz = (f.z0 + f.z1) / 2;
  const half = (f.x1 - f.x0) / 2 - 0.4;
  const top = def.eaveHeight - 0.75;
  // 四本柱（わずかに内へ転ぶ）
  bd.wood.kg = [PART.wood.timber, seed, 0, 0.15];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lean = 0.12;
    const bx = cx + sx * half;
    const bz = cz + sz * half;
    const tx = cx + sx * (half - lean);
    const tz = cz + sz * (half - lean);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const x = bx + (tx - bx) * (t0 + t1) / 2;
      const z = bz + (tz - bz) * (t0 + t1) / 2;
      bd.wood.cylinder(x, baseY + (top - baseY) * t0, z, 0.17, 0.16, (top - baseY) / n + 0.01, 10, false);
    }
    // 礎石
    bd.stoneLow.kg = [PART.stone.rough, seed + 1, 0, 0];
    bd.stoneLow.box([bx, baseY + 0.06, bz], [0.55, 0.12, 0.55]);
  }
  // 貫と頭貫
  bd.wood.kg = [PART.wood.timber, seed + 2, 1, 0.2];
  const h2 = half - 0.12;
  for (const y of [baseY + 1.2, top - 0.15]) {
    bd.wood.box([cx, y, cz - h2], [h2 * 2 + 0.4, 0.22, 0.16]);
    bd.wood.box([cx, y, cz + h2], [h2 * 2 + 0.4, 0.22, 0.16]);
    bd.wood.box([cx - h2, y, cz], [0.16, 0.22, h2 * 2 + 0.4]);
    bd.wood.box([cx + h2, y, cz], [0.16, 0.22, h2 * 2 + 0.4]);
  }
  // 梵鐘を吊る梁と、梵鐘（青銅）
  bd.wood.box([cx, top + 0.1, cz], [h2 * 2 + 0.3, 0.28, 0.24]);
  bd.iron.kg = [PART.iron.bronze, seed, 0, 0];
  const bellTop = top - 0.12;
  bd.iron.cylinder(cx, bellTop - 0.25, cz, 0.08, 0.08, 0.25, 8, false);
  bd.iron.cylinder(cx, bellTop - 1.45, cz, 0.5, 0.42, 1.15, 16, false);
  bd.iron.cylinder(cx, bellTop - 0.3, cz, 0.42, 0.18, 0.06, 16, true);
  bd.iron.cylinder(cx, bellTop - 1.5, cz, 0.52, 0.5, 0.08, 16, false);
  for (let k = 0; k < 4; k++) bd.iron.cylinder(cx, bellTop - 1.45 + 0.3 * k + 0.12, cz, 0.505 - 0.02 * k, 0.5 - 0.02 * k, 0.03, 16, false);
  // 組物（柱の上の大斗）
  bd.wood.kg = [PART.wood.timber, seed + 3, 1, 0.3];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bd.wood.box([cx + sx * (half - 0.12), top + 0.12, cz + sz * (half - 0.12)], [0.4, 0.24, 0.4]);
  const body: BodySpec = {
    x0: cx - half,
    z0: cz - half,
    x1: cx + half,
    z1: cz + half,
    floorY: baseY,
    headY: top,
    pillarR: 0.17,
    round: true,
    spacing: 9,
    sides: { n: { kind: 'plaster' }, s: { kind: 'plaster' }, e: { kind: 'plaster' }, w: { kind: 'plaster' } },
    brackets: 0,
    seed,
  };
  const roof = buildRoof(
    roofSpecFor(def, body, { a: 1.55, b: 1.55 }, { sag: 0.4, cornerUp: 0.55, thick: 0.3, ridgeH: 0.45, ridgeW: 0.38, hipFrac: 0.45, gableSet: 0.35 }),
    bd,
  );
  // 屋根の下を閉じる天井（下から見上げたときに抜けない）
  bd.wood.kg = [PART.wood.rafter, seed + 4, 1, 0];
  const ceil = top + 0.3;
  bd.wood.grid(
    4,
    4,
    (u, v) => {
      const x = cx - half - 0.05 + (half * 2 + 0.1) * u;
      const z = cz - half - 0.05 + (half * 2 + 0.1) * v;
      return { p: [x, Math.min(ceil, roof.under(x, z) - 0.01), z], uv: [x, z] };
    },
    false,
  );
  return { id: def.id, ridge: roof.ridge, eaves: roof.eaves, center: [cx, 5, cz], topY: roof.topY };
}

/** stage.buildings の全部を builder へ足す。返り値は燃え広がりの線。 */
export function buildBuildings(bd: Builders, stage: StageDef): FireLines[] {
  const out: FireLines[] = [];
  for (const def of stage.buildings) {
    if (def.kind === 'hondo') out.push(hondo(bd, def));
    else if (def.kind === 'shoin') out.push(shoin(bd, def, stage));
    else if (def.kind === 'kuri') out.push(kuri(bd, def, stage));
    else if (def.kind === 'kura') out.push(kura(bd, def));
    else if (def.kind === 'shoro') out.push(shoro(bd, def));
  }
  return out;
}
