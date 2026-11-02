// OWNER: world-art
// 町屋の並び（stage.walls の town）。間口・軒の高さ・屋根の勾配・二階の窓・卯建を家ごとに少しずつ変え、
// ごく一部の窓だけ薄く光らせる。表（通りの側）は塀の線の内側の面。家は外へ奥行きを持つ。
// その外は、距離帯ごとの安い代役（屋根付きの箱のインスタンス）で地平まで埋め、霧に溶かす。
import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type MeshStandardMaterial,
} from 'three';
import type { Rect, StageDef, WallDef } from '../../stage/types';
import { kgMaterial } from '../render/materials';
import type { Builders } from './buildings';
import type { MeshBuilder, V3 } from './geometry';
import { hash2, rng, seedOf } from './geometry';
import { PART } from './materialsLib';
import { buildRoof } from './roof';
import { streetOpenings } from './vistas';

function frame(w: WallDef) {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  // 右手（内向き＝通りの側）
  const nx = -uz;
  const nz = ux;
  const P = (s: number, w2: number): [number, number] => [w.a.x + ux * s + nx * w2, w.a.z + uz * s + nz * w2];
  return { len, ux, uz, nx, nz, P, alongX: Math.abs(ux) > 0.5 };
}

/** 枠の向きに沿った箱（s0..s1、w0..w1、y0..y1）を、ワールドの軸に沿った箱として足す（町の塀は軸に沿う）。 */
function fbox(mb: MeshBuilder, f: ReturnType<typeof frame>, s0: number, s1: number, w0: number, w1: number, y0: number, y1: number, faces?: string): void {
  const a = f.P(s0, w0);
  const b = f.P(s1, w1);
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const z0 = Math.min(a[1], b[1]);
  const z1 = Math.max(a[1], b[1]);
  mb.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], faces);
}

/** 通りに向いた面の名前（box の faces）。 */
function frontFace(f: ReturnType<typeof frame>): string {
  if (Math.abs(f.nx) > 0.5) return f.nx > 0 ? 'px' : 'nx';
  return f.nz > 0 ? 'pz' : 'nz';
}

/** 裏（通りと反対）の面の名前。 */
function backFace(ff: string): string {
  return { px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' }[ff] ?? ff;
}

export function buildTown(bd: Builders, stage: StageDef): void {
  const openings = streetOpenings(stage);
  for (const wall of stage.walls) {
    if (wall.kind !== 'town') continue;
    const f = frame(wall);
    const r = rng(seedOf(`town-${wall.id}`));
    // r02-fix-visual: 通りの先の開口（vistas.ts）には家を建てず、開口に面した家の横と妻を閉じる
    const gaps = openings.filter((o) => o.wallId === wall.id).sort((a, b) => a.s0 - b.s0);
    const faceU = Math.abs(f.ux) > 0.5 ? (f.ux > 0 ? 'px' : 'nx') : f.uz > 0 ? 'pz' : 'nz';
    const faceUBack = backFace(faceU);
    let afterGap = false;
    const front = 0.5;
    const ff = frontFace(f);
    const bf = backFace(ff);
    const longRow = f.alongX;
    let s = longRow ? -0.5 : 0.6;
    const sEnd = longRow ? f.len + 0.5 : f.len - 0.6;
    // r01-world-周3: 指摘「旗が南の町屋の奥行きの中に埋まって見えない」 家の奥行きを外の飾り（旗・陣）の手前で止める
    const outward = (x: number, z: number): number => -((x - wall.a.x) * f.nx + (z - wall.a.z) * f.nz);
    const along = (x: number, z: number): number => (x - wall.a.x) * f.ux + (z - wall.a.z) * f.uz;
    let maxDepth = 11;
    for (const b of stage.decor.banners) {
      const o = outward(b.x, b.z);
      const a = along(b.x, b.z);
      if (o > 0 && a > -2 && a < f.len + 2) maxDepth = Math.min(maxDepth, front + o - 1.2);
    }
    for (const c of stage.decor.armyCamps) {
      for (const [x, z] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1], [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2]]) {
        const o = outward(x, z);
        const a = along(x, z);
        if (o > 0 && a > -2 && a < f.len + 2) maxDepth = Math.min(maxDepth, front + Math.min(o, Math.abs(outward(c.x0, c.z0)), Math.abs(outward(c.x1, c.z1))) - 1.0);
      }
    }
    maxDepth = Math.max(4.5, maxDepth);
    let k = 0;
    while (s < sEnd - 1) {
      const inGap = gaps.find((g) => s >= g.s0 - 0.01 && s < g.s1);
      if (inGap) {
        s = inGap.s1;
        afterGap = true;
        continue;
      }
      let W = Math.min(sEnd - s, 4.6 + r() * 3.8);
      const nextGap = gaps.find((g) => g.s0 > s && g.s0 < s + W + 2.4);
      if (nextGap) W = nextGap.s0 - s;
      if (W < 1.2) {
        s += W;
        continue;
      }
      const s0 = s;
      const s1 = s + W;
      const openS0 = afterGap;
      const openS1 = nextGap !== undefined;
      afterGap = false;
      const D = Math.min(maxDepth, 8 + r() * 3);
      const E = wall.height - 0.4 + r() * 0.75;
      const rise = 1.5 + r() * 0.9;
      const seed = seedOf(`${wall.id}-${k}`) % 1000;
      const darkWood = r() < 0.45;
      const lit = r() < 0.13;
      const twoLattice = r() < 0.4;
      const firstH = 2.85 + r() * 0.25;
      // 本体（奥行きぶんの箱）。表の面は建具で覆う。隣と接する横の面と、屋根の下の上の面は作らない
      // （撮影のカメラが町屋の中に入る構図があり、隣の家の横の面が画面を塞ぐため）
      // r01-world-周4: 指摘「通りに沿って見ると、建具の継ぎ目から本体の白い漆喰が縦の線にのぞく」 表の面は暗い板、裏の面だけ漆喰
      bd.wood.kg = [PART.wood.board, seed, 0, 0.05];
      fbox(bd.wood, f, s0, s1, front - D, front - 0.02, 0, E - 0.05, ff);
      bd.plaster.kg = [PART.plaster.white, seed, 0, E];
      fbox(bd.plaster, f, s0, s1, front - D, front - 0.02, 0, E - 0.05, bf);
      // 開口に面した横の壁と、その上の妻（三角）
      for (const [open, sEdge, face] of [[openS0, s0, faceUBack], [openS1, s1, faceU]] as [boolean, number, string][]) {
        if (!open) continue;
        fbox(bd.plaster, f, s0, s1, front - D, front - 0.02, 0, E - 0.05, face);
        const a = f.P(sEdge, front - D - 0.02);
        const b = f.P(sEdge, front + 0.02);
        const c = f.P(sEdge, front - D / 2);
        const pa: V3 = [a[0], E - 0.06, a[1]];
        const pb: V3 = [b[0], E - 0.06, b[1]];
        const pc: V3 = [c[0], E + rise - 0.12, c[1]];
        bd.plaster.quad(pa, pb, pc, pc);
        bd.plaster.quad(pb, pa, pc, pc);
      }
      // 一階：腰（石）、格子、入口
      bd.stone.kg = [PART.stone.rough, seed, 0, 0];
      fbox(bd.stone, f, s0 + 0.05, s1 - 0.05, front - 0.05, front + 0.06, 0, 0.32, ff);
      const door = 1.5 + r() * 0.4;
      const doorAt = s0 + 0.5 + r() * Math.max(0.1, W - door - 1.0);
      bd.glow.kg = [PART.glow.dark, seed, 0, 0];
      fbox(bd.glow, f, doorAt, doorAt + door, front - 0.3, front + 0.02, 0.32, 2.35, ff);
      bd.wood.kg = [PART.wood.lattice, seed + 1, 0, darkWood ? 0.05 : 0.35];
      if (doorAt - s0 > 0.6) fbox(bd.wood, f, s0 + 0.12, doorAt - 0.08, front, front + 0.06, 0.32, firstH - 0.25, ff);
      if (s1 - (doorAt + door) > 0.6) fbox(bd.wood, f, doorAt + door + 0.08, s1 - 0.12, front, front + 0.06, 0.32, firstH - 0.25, ff);
      // 柱と、一階の上の桁
      bd.wood.kg = [PART.wood.timber, seed + 2, 0, darkWood ? 0.05 : 0.3];
      for (const sp of [s0 + 0.08, s1 - 0.08]) fbox(bd.wood, f, sp - 0.08, sp + 0.08, front - 0.02, front + 0.1, 0, E - 0.1, ff);
      bd.wood.kg = [PART.wood.timber, seed + 3, 1, darkWood ? 0.05 : 0.3];
      fbox(bd.wood, f, s0, s1, front - 0.02, front + 0.12, firstH - 0.25, firstH, `${ff},py,ny`);
      // 庇（一階の上の瓦の庇）：通りへ 0.9m
      const hy0 = firstH + 0.32;
      const hy1 = firstH - 0.02;
      const hw = 0.95;
      bd.tile.kg = [PART.tile.roof, seed, 0, 0];
      const A = f.P(s0, front);
      const B = f.P(s1, front);
      const C = f.P(s1, front + hw);
      const Dd = f.P(s0, front + hw);
      const slopeL = Math.hypot(hw, hy0 - hy1);
      const quadUp = (mb: MeshBuilder, p: V3[], uv: [number, number][]): void => {
        // 上向きになるよう順を選ぶ
        const n = (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]);
        if (n >= 0) mb.quad(p[0], p[1], p[2], p[3], uv);
        else mb.quad(p[3], p[2], p[1], p[0], [uv[3], uv[2], uv[1], uv[0]]);
      };
      quadUp(bd.tile, [[Dd[0], hy1, Dd[1]], [C[0], hy1, C[1]], [B[0], hy0, B[1]], [A[0], hy0, A[1]]], [[s0, 0], [s1, 0], [s1, slopeL], [s0, slopeL]]);
      bd.tile.kg = [PART.tile.edge, seed, 0, 0];
      fbox(bd.tile, f, s0, s1, front + hw - 0.02, front + hw + 0.02, hy1 - 0.08, hy1, ff);
      bd.wood.kg = [PART.wood.rafter, seed, 1, 0];
      {
        const p0: V3 = [Dd[0], hy1 - 0.08, Dd[1]];
        const p1: V3 = [C[0], hy1 - 0.08, C[1]];
        const p2: V3 = [B[0], firstH, B[1]];
        const p3: V3 = [A[0], firstH, A[1]];
        const n = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
        if (n < 0) bd.wood.quad(p0, p1, p2, p3, [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
        else bd.wood.quad(p3, p2, p1, p0, [[s0, 1], [s1, 1], [s1, 0], [s0, 0]]);
      }
      // 二階：虫籠窓（漆喰の壁に縦の格子の小窓）か、木の格子窓。ごく一部が薄く光る
      const y2 = hy0 + 0.05;
      bd.plaster.kg = [PART.plaster.town, seed + 5, y2, E];
      fbox(bd.plaster, f, s0 + 0.16, s1 - 0.16, front - 0.02, front + 0.03, y2, E - 0.12, ff);
      const nw = W > 6.5 ? 3 : 2;
      for (let i = 0; i < nw; i++) {
        const cs = s0 + (W * (i + 0.5)) / nw;
        const ww = twoLattice ? Math.min(1.5, W / nw - 0.5) : 0.85;
        const glowPart = lit && i === 1 ? PART.glow.townWindow : PART.glow.dark;
        bd.glow.kg = [glowPart, seed + i, lit ? 0.75 : 0, y2];
        fbox(bd.glow, f, cs - ww / 2, cs + ww / 2, front + 0.02, front + 0.06, y2 + 0.38, Math.min(E - 0.35, y2 + 1.0), ff);
        bd.wood.kg = [PART.wood.lattice, seed + 7 + i, 0, 0.2];
        if (twoLattice) fbox(bd.wood, f, cs - ww / 2, cs + ww / 2, front + 0.06, front + 0.09, y2 + 0.38, Math.min(E - 0.35, y2 + 1.0), ff);
      }
      // 屋根：通りに平行な棟の切妻（平入り）
      const c = f.P((s0 + s1) / 2, front - D / 2);
      buildRoof(
        {
          cx: c[0],
          cz: c[1],
          axis: longRow ? 'x' : 'z',
          A: W / 2 + 0.03,
          B: D / 2 + 0.75,
          eaveY: E,
          ridgeY: E + rise,
          type: 'kirizuma',
          sag: 0.12 + r() * 0.1,
          cornerUp: 0.05,
          thick: 0.22,
          wallA: W / 2,
          wallB: D / 2,
          ridgeH: 0.25,
          ridgeW: 0.3,
          oni: r() < 0.5,
          seed,
        },
        bd,
      );
      // 卯建（隣との境の小さな防火壁）
      if (k > 0 && hash2(s0, seed) < 0.35) {
        bd.plaster.kg = [PART.plaster.white, seed + 9, y2, E + 0.6];
        fbox(bd.plaster, f, s0 - 0.13, s0 + 0.13, front - 1.6, front + 0.35, y2 - 0.2, E + 0.45, `${ff},py,${f.alongX ? 'px,nx' : 'pz,nz'}`);
        bd.tile.kg = [PART.tile.ridge, seed, 0, 0];
        fbox(bd.tile, f, s0 - 0.22, s0 + 0.22, front - 1.7, front + 0.45, E + 0.45, E + 0.62);
      }
      s = s1;
      k++;
    }
  }
}

// ---- 遠景：屋根付きの箱のインスタンス ----

function farHouseGeometry(): BufferGeometry {
  // 幅 1・奥行き 1・軒 1 の家（中心が原点、足元が y=0）と、高さ 0.45 の切妻屋根。aKg.x：0 壁、1 屋根、2 窓
  const pos: number[] = [];
  const kg: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3, part: number): void => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) kg.push(part, 0, 0, 0);
  };
  const tri = (a: V3, b: V3, c: V3, part: number): void => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) kg.push(part, 0, 0, 0);
  };
  const h = 1;
  quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, h, 0.5], [-0.5, h, 0.5], 0);
  quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, h, -0.5], [0.5, h, -0.5], 0);
  quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, h, -0.5], [0.5, h, 0.5], 0);
  quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, h, 0.5], [-0.5, h, -0.5], 0);
  // 屋根（棟は x に沿う。少し張り出す）
  const e = 0.62;
  const r = h + 0.45;
  quad([-0.56, h - 0.05, e], [0.56, h - 0.05, e], [0.56, r, 0], [-0.56, r, 0], 1);
  quad([0.56, h - 0.05, -e], [-0.56, h - 0.05, -e], [-0.56, r, 0], [0.56, r, 0], 1);
  tri([0.5, h, 0.5], [0.5, h, -0.5], [0.5, r - 0.04, 0], 0);
  tri([-0.5, h, -0.5], [-0.5, h, 0.5], [-0.5, r - 0.04, 0], 0);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aKg', new BufferAttribute(new Float32Array(kg), 4));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

const FAR_COLOR = /* glsl */ `
{
  float part = floor(vKg.x + 0.5);
  float v = vKgInst.y;
  vec3 wall = vec3(0.17, 0.165, 0.15) * (0.6 + 0.6 * v);
  vec3 roof = vec3(0.045, 0.048, 0.053) * (0.8 + 0.5 * v);
  float stripes = kgPulse(vKgWorld.x * 3.4 + vKgWorld.z * 3.4, 0.5, length(fwidth(vKgWorld.xz)) * 3.4);
  roof *= 0.85 + 0.25 * stripes;
  diffuseColor.rgb = part == 1.0 ? roof : wall;
}
`;
const FAR_EMISSIVE = /* glsl */ `
{
  float part = floor(vKg.x + 0.5);
  // ごく一部の家の、一階の正面だけが薄く光る
  float lit = step(0.93, vKgInst.z) * step(part, 0.5) * step(vKgObj.y, 0.55) * step(0.25, vKgObj.y) * step(0.45, abs(vKgObj.z));
  totalEmissiveRadiance = vec3(1.0, 0.55, 0.24) * lit * 0.5;
}
`;

function inRect(r: Rect, x: number, z: number, m = 0): boolean {
  return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
}

export function buildFarTown(stage: StageDef): { mesh: InstancedMesh; material: MeshStandardMaterial } {
  const material = kgMaterial(
    { color: 0xffffff, roughness: 0.85, metalness: 0 },
    { key: 'farTown', attr: true, inst: true, amb: [100, 101], color: FAR_COLOR, emissive: FAR_EMISSIVE },
  );
  const geo = farHouseGeometry();
  const r = rng(seedOf('far-town'));
  const mats: Matrix4[] = [];
  const inst: number[] = [];
  const b = stage.bounds;
  const camps = stage.decor.armyCamps;
  // 京の町割り：120m 四方の町を、道（幅 10m）で区切る。家は町の縁に沿って並ぶ
  const block = 60;
  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -6; gz <= 6; gz++) {
      const bx0 = gx * block - block / 2 + 5;
      const bz0 = gz * block - block / 2 + 5;
      const bw = block - 10;
      for (let i = 0; i < 40; i++) {
        const t = r();
        const side = Math.floor(r() * 4);
        const w = 5 + r() * 4;
        const d = 7 + r() * 4;
        let x = 0;
        let z = 0;
        let rot = 0;
        if (side === 0) {
          x = bx0 + t * bw;
          z = bz0 + d / 2;
          rot = 0;
        } else if (side === 1) {
          x = bx0 + t * bw;
          z = bz0 + bw - d / 2;
          rot = 0;
        } else if (side === 2) {
          x = bx0 + d / 2;
          z = bz0 + t * bw;
          rot = Math.PI / 2;
        } else {
          x = bx0 + bw - d / 2;
          z = bz0 + t * bw;
          rot = Math.PI / 2;
        }
        const dist = Math.hypot(x, z - 2);
        if (dist > 330) continue;
        if (inRect(b, x, z, 14)) continue;
        if (camps.some((c) => inRect(c, x, z, 6))) continue;
        const h = 4.2 + r() * 1.6;
        mats.push(new Matrix4().makeRotationY(rot).multiply(new Matrix4().makeScale(w, h, d)).setPosition(x, 0, z));
        inst.push(r(), r(), r(), 0);
      }
    }
  }
  const mesh = new InstancedMesh(geo, material, mats.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  geo.setAttribute('aKgInst', new InstancedBufferAttribute(new Float32Array(inst), 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'farTown';
  mesh.computeBoundingSphere();
  return { mesh, material };
}
