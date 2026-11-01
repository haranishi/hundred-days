// OWNER: world-art
// 小物：篝火（鉄の籠・三本脚・薪と熾火）、石灯籠（火袋だけがぼんやり光る）、行灯（紙の箱が光る）、庭石。
// 炎・火の粉・煙は fire.ts の仕組みへ、ここでは置き場所（FlameDef など）を返す。
import { IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import type { PropDef, StageDef } from '../../stage/types';
import type { Builders } from './buildings';
import type { FlameDef, SmokeDef, SparkDef } from './fire';
import type { MeshBuilder, V3 } from './geometry';
import { rng, seedOf } from './geometry';
import { PART } from './materialsLib';

export interface PropFx {
  flames: FlameDef[];
  smokes: SmokeDef[];
  sparks: SparkDef[];
}

/** 正 n 角柱（灯籠の石の段）。半径 r0→r1、高さ h。 */
function prism(mb: MeshBuilder, x: number, y0: number, z: number, r0: number, r1: number, h: number, n: number, rot = 0): void {
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2;
    const a1 = rot + ((i + 1) / n) * Math.PI * 2;
    const p = (a: number, r: number, y: number): V3 => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    const w = 2 * r0 * Math.sin(Math.PI / n);
    mb.quad(p(a1, r0, y0), p(a0, r0, y0), p(a0, r1, y0 + h), p(a1, r1, y0 + h), [[0, y0], [w, y0], [w, y0 + h], [0, y0 + h]]);
    mb.tri(p(a0, r1, y0 + h), [x, y0 + h, z], p(a1, r1, y0 + h), [[0, 0], [0.5, 0.5], [1, 0]]);
  }
}

function brazier(bd: Builders, p: PropDef, height: number, fx: PropFx): void {
  const seed = seedOf(p.id) % 1000;
  const x = p.pos.x;
  const z = p.pos.z;
  const top = height - 0.25;
  const bowl = top - 0.42;
  bd.iron.kg = [PART.iron.iron, seed, 0, 0];
  // 三本脚
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + seed;
    const fx0 = x + Math.cos(a) * 0.42;
    const fz0 = z + Math.sin(a) * 0.42;
    const fx1 = x + Math.cos(a) * 0.14;
    const fz1 = z + Math.sin(a) * 0.14;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const cx = fx0 + (fx1 - fx0) * (t0 + t1) * 0.5;
      const cz = fz0 + (fz1 - fz0) * (t0 + t1) * 0.5;
      bd.iron.cylinder(cx, bowl * t0, cz, 0.026, 0.024, bowl / n + 0.01, 5, false);
    }
  }
  // 鉄の籠：縦の棒と、上下の輪
  const nb = 10;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    const r0 = 0.16;
    const r1 = 0.3;
    const n = 3;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const r = r0 + (r1 - r0) * (t0 + t1) * 0.5;
      bd.iron.cylinder(x + Math.cos(a) * r, bowl + (top - bowl) * t0, z + Math.sin(a) * r, 0.014, 0.014, (top - bowl) / n + 0.005, 4, false);
    }
  }
  for (const [y, r] of [[bowl, 0.17], [top - 0.02, 0.3], [(bowl + top) / 2, 0.235]] as [number, number][]) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const mx = x + Math.cos((a0 + a1) / 2) * r;
      const mz = z + Math.sin((a0 + a1) / 2) * r;
      const len = 2 * r * Math.sin(Math.PI / n) + 0.01;
      const m = new Matrix4().makeRotationY(-(a0 + a1) / 2 + Math.PI / 2).setPosition(mx, y, mz);
      bd.iron.setMatrix(m);
      bd.iron.box([0, 0, 0], [len, 0.03, 0.025]);
      bd.iron.setMatrix(null);
    }
  }
  // 薪と熾火（籠の底で光る）
  bd.glow.kg = [PART.glow.lantern, seed, 2.6, bowl];
  prism(bd.glow, x, bowl + 0.02, z, 0.15, 0.2, 0.14, 8);
  bd.wood.kg = [PART.wood.timber, seed + 1, 1, 0];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + seed;
    const m = new Matrix4().makeRotationY(a).multiply(new Matrix4().makeRotationZ(0.35 * (i % 2 ? 1 : -1))).setPosition(x, bowl + 0.2, z);
    bd.wood.setMatrix(m);
    bd.wood.box([0, 0, 0], [0.5, 0.07, 0.07]);
    bd.wood.setMatrix(null);
  }
  // 炎（3枚の板を少しずつずらす）・火の粉・薄い煙
  const r = rng(seed + 7);
  const base: V3 = [x, bowl + 0.16, z];
  for (let i = 0; i < 3; i++) {
    fx.flames.push({ base: [base[0] + (r() - 0.5) * 0.14, base[1], base[2] + (r() - 0.5) * 0.14], w: 0.52 - i * 0.08, h: 0.95 - i * 0.18, seed: r(), from: -1, kind: 0 });
  }
  fx.sparks.push({ base: [x, bowl + 0.5, z], spread: 0.3, rise: 3.2, seed: r(), from: -1, count: 22 });
  for (let i = 0; i < 5; i++) fx.smokes.push({ base: [x, top + 0.6, z], size: 1.1, rise: 6.5, seed: r(), from: -1, density: 0.22 });
}

function stoneLantern(bd: Builders, p: PropDef, height: number): void {
  const seed = seedOf(p.id) % 1000;
  const x = p.pos.x;
  const z = p.pos.z;
  const rot = (seed % 60) * 0.01;
  const s = height / 1.1;
  bd.stone.kg = [PART.stone.rough, seed, 0, 0];
  prism(bd.stone, x, 0, z, 0.36 * s, 0.33 * s, 0.16 * s, 6, rot);
  prism(bd.stone, x, 0.16 * s, z, 0.22 * s, 0.2 * s, 0.08 * s, 6, rot);
  bd.stone.cylinder(x, 0.24 * s, z, 0.11 * s, 0.1 * s, 0.5 * s, 10, false);
  prism(bd.stone, x, 0.74 * s, z, 0.18 * s, 0.3 * s, 0.14 * s, 6, rot);
  // 火袋：石の柱の間に、光る紙の六角
  const fb = 0.88 * s;
  const fh = 0.34 * s;
  bd.glow.kg = [PART.glow.lantern, seed, 1.6, fb];
  prism(bd.glow, x, fb, z, 0.17 * s, 0.17 * s, fh, 6, rot);
  bd.stone.kg = [PART.stone.rough, seed + 1, 0, 0];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    bd.stone.box([x + Math.cos(a) * 0.2 * s, fb + fh / 2, z + Math.sin(a) * 0.2 * s], [0.06 * s, fh, 0.06 * s]);
  }
  // 笠：反りのある六角の屋根と宝珠
  prism(bd.stone, x, fb + fh, z, 0.45 * s, 0.34 * s, 0.06 * s, 6, rot);
  prism(bd.stone, x, fb + fh + 0.06 * s, z, 0.34 * s, 0.07 * s, 0.2 * s, 6, rot);
  bd.stone.cylinder(x, fb + fh + 0.26 * s, z, 0.07 * s, 0.03 * s, 0.14 * s, 8, true);
}

function andon(bd: Builders, p: PropDef, height: number): void {
  const seed = seedOf(p.id) % 1000;
  const x = p.pos.x;
  const z = p.pos.z;
  const y0 = 0.14;
  const y1 = Math.max(0.6, height + 0.12);
  bd.wood.kg = [PART.wood.timber, seed, 0, 0.2];
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bd.wood.box([x + dx * 0.15, (y1 + 0.04) / 2, z + dz * 0.15], [0.035, y1 + 0.04, 0.035]);
  bd.wood.box([x, y0 - 0.02, z], [0.34, 0.03, 0.34]);
  bd.wood.box([x, y1 + 0.03, z], [0.34, 0.025, 0.34]);
  // r01-world-周2: 指摘「行灯が白く飛ぶ」 2.0→1.5
  bd.glow.kg = [PART.glow.andon, seed, 1.5, y0];
  bd.glow.box([x, (y0 + y1) / 2, z], [0.29, y1 - y0, 0.29]);
}

const ROCK = new IcosahedronGeometry(1, 2);
{
  // 庭石：上が平たく、下は埋まる、でこぼこの塊
  const pos = ROCK.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.18 * Math.sin(x * 3.7 + 1.1) * Math.sin(z * 4.1 + 0.3) + 0.08 * Math.sin(y * 9.0 + x * 5.0);
    pos.setXYZ(i, x * n, Math.min(y * n, 0.55 + 0.1 * x), z * n);
  }
  ROCK.computeVertexNormals();
}

export function rock(mb: MeshBuilder, x: number, z: number, size: number, seed: number, flatten = 0.6): void {
  const r = rng(seed);
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6.28);
  const m = new Matrix4().compose(new Vector3(x, size * 0.12, z), q, new Vector3(size * (0.9 + r() * 0.4), size * flatten, size * (0.75 + r() * 0.4)));
  mb.kg = [PART.stone.rough, seed % 97, 0, 0];
  mb.geometry(ROCK, m);
}

/** 飛び石（見た目だけ。当たりは無い）。a→b を間隔 step で、少しずつずらして置く。 */
function steppingStones(mb: MeshBuilder, a: [number, number], b: [number, number], step: number, seed: number): void {
  const r = rng(seed);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / step));
  const nx = -(b[1] - a[1]) / len;
  const nz = (b[0] - a[0]) / len;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const side = (i % 2 === 0 ? 1 : -1) * (0.08 + r() * 0.1);
    const x = a[0] + (b[0] - a[0]) * t + nx * side;
    const z = a[1] + (b[1] - a[1]) * t + nz * side;
    const size = 0.26 + r() * 0.1;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6.28);
    const m = new Matrix4().compose(new Vector3(x, -0.02, z), q, new Vector3(size * (1.1 + r() * 0.3), 0.07, size));
    mb.kg = [PART.stone.rough, (seed + i * 13) % 97, 0, 0];
    mb.geometry(ROCK, m);
  }
}

/** 奥庭の飛び石：石畳から池の岸へ、池の西から松の下へ、書院の前の白砂から東の植え込みへ。 */
function gardenDetails(bd: Builders, stage: StageDef): void {
  const pond = stage.ponds[0];
  if (!pond) return;
  const east = pond.center.x + pond.rx;
  const west = pond.center.x - pond.rx;
  steppingStones(bd.stoneLow, [-1.25, pond.center.z + 1.4], [east + 0.45, pond.center.z + 0.6], 0.62, 101);
  steppingStones(bd.stoneLow, [west - 0.6, pond.center.z + 0.5], [west - 5.2, pond.center.z + 1.3], 0.66, 102);
  steppingStones(bd.stoneLow, [7.6, -19.8], [10.4, -17.6], 0.64, 103);
  steppingStones(bd.stoneLow, [10.9, -17.3], [15.6, -16.4], 0.68, 104);
}

export function buildProps(bd: Builders, stage: StageDef): PropFx {
  gardenDetails(bd, stage);
  const fx: PropFx = { flames: [], smokes: [], sparks: [] };
  const heightOf = (id: string, fallback: number): number => stage.lights.find((l) => l.id === id)?.height ?? fallback;
  for (const p of stage.props) {
    bd.glow.lightIndex = stage.lights.findIndex((light) => light.id === p.id);
    if (p.kind === 'brazier') brazier(bd, p, heightOf(p.id, 1.3), fx);
    else if (p.kind === 'stoneLantern') stoneLantern(bd, p, heightOf(p.id, 1.1));
    else if (p.kind === 'andon') andon(bd, p, heightOf(p.id, 0.7));
    else if (p.kind === 'rock') rock(bd.stoneLow, p.pos.x, p.pos.z, 0.75 * (p.scale ?? 1), seedOf(p.id));
  }
  bd.glow.lightIndex = -1;
  return fx;
}
