// OWNER: world-art
// 屋根の生成：入母屋（下が寄棟、上が切妻）と切妻。
// 屋根面の高さは「軒からの内向きの距離 d」の関数で、反り（中ほどがわずかにくぼむ）を持つ。
// 軒の隅は跳ね上がり、軒先には厚み、軒裏には垂木、棟には熨斗瓦の段と鬼瓦、入母屋の妻には白い妻壁を付ける。
// 寄棟の面と平の面は、隅棟の線（d が等しい所）で高さがそろうように作ってある。軒裏は屋根面を厚みぶん下げた面。
import type { MeshBuilder, V3 } from './geometry';
import { cross3, normalize3, sub3 } from './geometry';
import { PART } from './materialsLib';

export interface RoofSpec {
  cx: number;
  cz: number;
  /** 棟の向き */
  axis: 'x' | 'z';
  /** 軒先の線の半分の長さ（棟の向き）と半分の幅（棟と直角） */
  A: number;
  B: number;
  /** 軒先と棟の、瓦の面の高さ */
  eaveY: number;
  ridgeY: number;
  type: 'irimoya' | 'kirizuma';
  /** 入母屋：寄棟の部分の深さ（B に対する割合）と、妻壁の螻羽（けらば）からの引っ込み（m） */
  hipFrac?: number;
  gableSet?: number;
  /** 反りの深さ（m）・隅の跳ね上がり（m）・軒の厚み（m） */
  sag: number;
  cornerUp: number;
  thick: number;
  /** 壁の半分の長さ（棟の向き）・半分の幅（軒裏はこの線まで作る） */
  wallA: number;
  wallB: number;
  /** 棟の高さと幅（m） */
  ridgeH: number;
  ridgeW: number;
  oni: boolean;
  seed: number;
}

export interface RoofBuilders {
  tile: MeshBuilder;
  wood: MeshBuilder;
  plaster: MeshBuilder;
}

export interface RoofResult {
  /** 燃え広がりの炎を置く線（棟と軒の点） */
  ridge: V3[];
  eaves: V3[];
  /** ワールドの (x, z) での軒裏の高さ（壁の上端をここまで伸ばす） */
  under(x: number, z: number): number;
  /** 棟の上端の高さ */
  topY: number;
}

export function buildRoof(spec: RoofSpec, b: RoofBuilders): RoofResult {
  const { A, B, eaveY, ridgeY, sag, cornerUp, thick } = spec;
  const rise = ridgeY - eaveY;
  const irimoya = spec.type === 'irimoya';
  const dT = irimoya ? (spec.hipFrac ?? 0.42) * B : 0;
  // 妻壁は端の壁より内側に立てる（寄棟の面が端の壁の上を覆う）
  const dE = irimoya ? Math.min(B * 0.9, Math.max(dT + (spec.gableSet ?? 0.5), A - spec.wallA + 0.25)) : 0;
  const Lc = B * 0.55;

  const toW = (s: number, y: number, w: number): V3 =>
    spec.axis === 'x' ? [spec.cx + s, y, spec.cz + w] : [spec.cx - w, y, spec.cz + s];
  const toL = (x: number, z: number): [number, number] =>
    spec.axis === 'x' ? [x - spec.cx, z - spec.cz] : [z - spec.cz, -(x - spec.cx)];
  const P = (d: number): number => {
    const x = Math.min(1, Math.max(0, d / B));
    return rise * x - sag * Math.sin(Math.PI * x) * (1 - 0.25 * x);
  };
  const lift = (e: number, d: number): number => {
    const k = Math.max(0, 1 - e / Lc);
    return cornerUp * k * k * Math.pow(Math.max(0, 1 - d / (B * 0.8)), 1.5);
  };
  /** 平の面の高さ（s：棟の向きの位置、d：軒からの距離） */
  const yMain = (s: number, d: number): number => eaveY + P(d) + lift(A - Math.abs(s), d) * (irimoya ? 1 : 0.6);
  /** 寄棟の面の高さ */
  const yEnd = (w: number, d: number): number => eaveY + P(d) + lift(B - Math.abs(w), d);
  const slopeK = Math.sqrt(1 + (rise / B) ** 2);
  const Xmain = (d: number): number => (irimoya ? (d < dT ? A - d : A - dT) : A);

  /** 面の格子を足す。表がおおよそ want を向くよう、向きを自動で決める。 */
  const surface = (mb: MeshBuilder, nu: number, nv: number, fn: (u: number, v: number) => { p: V3; uv: [number, number] }, want: V3): void => {
    const c = fn(0.5, 0.5).p;
    const pu = fn(0.53, 0.5).p;
    const pv = fn(0.5, 0.53).p;
    const n = cross3(sub3(pu, c), sub3(pv, c));
    const flip = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0;
    mb.grid(nu, nv, fn, flip);
  };
  const outW = (sw: number): V3 => (spec.axis === 'x' ? [0, 0.3, sw] : [-sw, 0.3, 0]);
  const outS = (ss: number): V3 => (spec.axis === 'x' ? [ss, 0.3, 0] : [0, 0.3, ss]);
  const DOWN: V3 = [0, -1, 0];

  const nu = Math.max(8, Math.round(A * 2.2));
  const nuE = Math.max(6, Math.round(B * 2));
  const nv = 10;
  const seed = spec.seed;
  const dWallMain = Math.max(0.3, B - spec.wallB);
  const dWallEnd = Math.max(0.3, A - spec.wallA);

  // ---- 平の面（棟と直角の2面）・その軒裏・軒先の厚み ----
  for (const sw of [1, -1]) {
    b.tile.kg = [PART.tile.roof, seed, 0, 0];
    surface(
      b.tile,
      nu,
      nv,
      (u, v) => {
        const d = v * B;
        const X = Xmain(d);
        const s = -X + 2 * X * u;
        return { p: toW(s, yMain(s, d), sw * (B - d)), uv: [s + 50, d * slopeK] };
      },
      outW(sw),
    );
    b.wood.kg = [PART.wood.rafter, seed, 1, 0];
    surface(
      b.wood,
      nu,
      3,
      (u, v) => {
        const d = v * dWallMain;
        const X = Xmain(d);
        const s = -X + 2 * X * u;
        return { p: toW(s, yMain(s, d) - thick, sw * (B - d)), uv: [s + 50, d] };
      },
      DOWN,
    );
    b.tile.kg = [PART.tile.edge, seed, 0, 0];
    surface(
      b.tile,
      nu,
      1,
      (u, v) => {
        const X = Xmain(0);
        const s = -X + 2 * X * u;
        return { p: toW(s, yMain(s, 0) - thick * v, sw * B), uv: [s + 50, -v * thick] };
      },
      outW(sw),
    );
  }

  if (irimoya) {
    for (const ss of [1, -1]) {
      // 寄棟の面（妻の側）・その軒裏・軒先の厚み
      b.tile.kg = [PART.tile.roof, seed + 1, 0, 0];
      surface(
        b.tile,
        nuE,
        nv,
        (u, v) => {
          const d = v * dE;
          const Z = B - d;
          const w = -Z + 2 * Z * u;
          return { p: toW(ss * (A - d), yEnd(w, d), w), uv: [w + 50, d * slopeK] };
        },
        outS(ss),
      );
      b.wood.kg = [PART.wood.rafter, seed, 1, 0];
      surface(
        b.wood,
        nuE,
        3,
        (u, v) => {
          const d = v * dWallEnd;
          const Z = B - d;
          const w = -Z + 2 * Z * u;
          return { p: toW(ss * (A - d), yEnd(w, d) - thick, w), uv: [w + 50, d] };
        },
        DOWN,
      );
      b.tile.kg = [PART.tile.edge, seed, 0, 0];
      surface(
        b.tile,
        nuE,
        1,
        (u, v) => {
          const w = -B + 2 * B * u;
          return { p: toW(ss * A, yEnd(w, 0) - thick * v, w), uv: [w + 50, -v * thick] };
        },
        outS(ss),
      );
      // 上の切妻の螻羽の下（妻壁から螻羽まで）
      b.wood.kg = [PART.wood.rafter, seed, 0, 0];
      for (const sw of [1, -1]) {
        surface(
          b.wood,
          2,
          6,
          (u, v) => {
            const d = dT + (B - dT) * v;
            const s = ss * (A - dE + (dE - dT) * u);
            return { p: toW(s, yMain(s, d) - thick, sw * (B - d)), uv: [s, d] };
          },
          DOWN,
        );
      }
      // 妻壁：寄棟の上端から棟まで、平の面の下に沿う白い三角
      const sG = A - dE;
      const zG = B - dE;
      const yBase = yEnd(0, dE) - 0.03;
      b.plaster.kg = [PART.plaster.white, seed, yBase, ridgeY];
      surface(
        b.plaster,
        12,
        1,
        (u, v) => {
          const w = -zG + 2 * zG * u;
          const yTop = yMain(sG, B - Math.abs(w)) - thick * 0.9;
          const y = yBase + (Math.max(yBase, yTop) - yBase) * v;
          return { p: toW(ss * sG, y, w), uv: [w, y] };
        },
        outS(ss),
      );
      // 破風板：螻羽に沿う板
      b.wood.kg = [PART.wood.timber, seed + 2, 1, 0.35];
      for (const sw of [1, -1]) {
        surface(
          b.wood,
          1,
          8,
          (u, v) => {
            const d = dT + (B - dT) * v;
            const s = ss * (A - dT);
            return { p: toW(s, yMain(s, d) + 0.03 - thick * 1.15 * u, sw * (B - d)), uv: [d, u] };
          },
          outS(ss),
        );
      }
      // 隅棟：軒の隅から寄棟の上端へ。降り棟：棟の端から螻羽に沿って
      b.tile.kg = [PART.tile.ridge, seed, 0, 0];
      for (const sw of [1, -1]) {
        const hip: V3[] = [];
        for (let k = 0; k <= 6; k++) {
          const d = (k / 6) * dT;
          hip.push(toW(ss * (A - d), yMain(ss * (A - d), d) + 0.02, sw * (B - d)));
        }
        beamChain(b.tile, hip, spec.ridgeW * 0.55, spec.ridgeH * 0.4);
        const fall: V3[] = [];
        for (let k = 0; k <= 6; k++) {
          const d = B - (k / 6) * (B - dT);
          fall.push(toW(ss * (A - dT - 0.14), yMain(ss * (A - dT), d) + 0.02, sw * (B - d)));
        }
        beamChain(b.tile, fall, spec.ridgeW * 0.5, spec.ridgeH * 0.42);
      }
    }
  } else {
    for (const ss of [1, -1]) {
      // 螻羽の下（端の壁から螻羽まで、壁の線より上の部分）
      if (A > spec.wallA + 0.05) {
        b.wood.kg = [PART.wood.rafter, seed, 0, 0];
        for (const sw of [1, -1]) {
          surface(
            b.wood,
            2,
            8,
            (u, v) => {
              const d = dWallMain + (B - dWallMain) * v;
              const s = ss * (spec.wallA + (A - spec.wallA) * u);
              return { p: toW(s, yMain(s, d) - thick, sw * (B - d)), uv: [s, d] };
            },
            DOWN,
          );
        }
      }
      // 破風板
      b.wood.kg = [PART.wood.timber, seed + 2, 1, 0.35];
      for (const sw of [1, -1]) {
        surface(
          b.wood,
          1,
          8,
          (u, v) => {
            const d = B * v;
            const s = ss * A;
            return { p: toW(s, yMain(s, d) + 0.03 - thick * 1.15 * u, sw * (B - d)), uv: [d, u] };
          },
          outS(ss),
        );
      }
      // 降り棟（螻羽に沿って）
      b.tile.kg = [PART.tile.ridge, seed, 0, 0];
      for (const sw of [1, -1]) {
        const fall: V3[] = [];
        for (let k = 0; k <= 6; k++) {
          const d = B - (k / 6) * B;
          fall.push(toW(ss * (A - 0.14), yMain(ss * A, d) + 0.02, sw * (B - d)));
        }
        beamChain(b.tile, fall, spec.ridgeW * 0.5, spec.ridgeH * 0.42);
      }
    }
  }

  // ---- 棟（熨斗瓦を積んだ箱）と鬼瓦 ----
  const Xr = irimoya ? A - dT : A;
  b.tile.kg = [PART.tile.ridge, seed, 0, 0];
  const ry = yMain(0, B);
  beamChain(b.tile, [toW(-Xr + 0.05, ry - 0.12, 0), toW(Xr - 0.05, ry - 0.12, 0)], spec.ridgeW, spec.ridgeH + 0.12);
  if (spec.oni) {
    b.tile.kg = [PART.tile.oni, seed, 0, 0];
    for (const ss of [1, -1]) {
      const p = toW(ss * (Xr - 0.08), ry - 0.12, 0);
      const h = spec.ridgeH * 1.6;
      const wdt = spec.ridgeW * 2.0;
      const dpt = spec.ridgeW * 0.5;
      b.tile.box([p[0], p[1] + h / 2, p[2]], spec.axis === 'x' ? [dpt, h, wdt] : [wdt, h, dpt]);
    }
  }

  const ridgePts: V3[] = [];
  const eaves: V3[] = [];
  for (let k = 0; k <= 12; k++) ridgePts.push(toW(-Xr + (2 * Xr * k) / 12, ry + spec.ridgeH, 0));
  for (const sw of [1, -1]) {
    for (let k = 0; k <= 12; k++) {
      const s = -A * 0.92 + (2 * A * 0.92 * k) / 12;
      eaves.push(toW(s, yMain(s, 0.6) + 0.05, sw * (B - 0.6)));
    }
  }

  const under = (x: number, z: number): number => {
    const [s, w] = toL(x, z);
    const dm = B - Math.abs(w);
    const de = A - Math.abs(s);
    if (irimoya && de < dm && de < dE) return yEnd(w, de) - thick;
    return yMain(s, dm) - thick;
  };
  return { ridge: ridgePts, eaves, under, topY: ry + spec.ridgeH };
}

/** 点の列に沿って、幅 w・高さ h の箱をつなげる（棟・隅棟）。下の面は屋根に埋まるので作らない。 */
export function beamChain(mb: MeshBuilder, pts: V3[], w: number, h: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const dir = normalize3(sub3(c, a));
    let side = normalize3(cross3(dir, [0, 1, 0]));
    if (!Number.isFinite(side[0]) || Math.abs(dir[1]) > 0.999) side = [1, 0, 0];
    const up = normalize3(cross3(side, dir));
    const hw = w / 2;
    const at = (p: V3, sx: number, uy: number): V3 => [p[0] + side[0] * sx + up[0] * uy, p[1] + side[1] * sx + up[1] * uy, p[2] + side[2] * sx + up[2] * uy];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    mb.quad(at(a, -hw, h), at(a, hw, h), at(c, hw, h), at(c, -hw, h), [[0, 0], [0, w], [len, w], [len, 0]]);
    mb.quad(at(a, hw, 0), at(c, hw, 0), at(c, hw, h), at(a, hw, h), [[0, a[1]], [len, c[1]], [len, c[1] + h], [0, a[1] + h]]);
    mb.quad(at(c, -hw, 0), at(a, -hw, 0), at(a, -hw, h), at(c, -hw, h), [[len, c[1]], [0, a[1]], [0, a[1] + h], [len, c[1] + h]]);
    if (i === 0) mb.quad(at(a, -hw, 0), at(a, hw, 0), at(a, hw, h), at(a, -hw, h));
    if (i === pts.length - 2) mb.quad(at(c, hw, 0), at(c, -hw, 0), at(c, -hw, h), at(c, hw, h));
  }
}
