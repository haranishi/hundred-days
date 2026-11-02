// OWNER: world-art
// 植物：庭木の松（曲がった幹と、平たく重なる葉の塊）・竹林（節のある竹を密に立て、獣道 x≈-33 だけ空ける）・
// 植え込み（丸く刈り込んだ低木。隠れ場所だと分かる、腰ほどの高さの丸い塊）。
// 葉の塊・竹・竹の葉はインスタンスで1回ずつ描く。揺れはシェーダー（材質の SWAY）。
import {
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type MeshStandardMaterial,
} from 'three';
import type { PropDef, StageDef } from '../../stage/types';
import type { MeshBuilder, V3 } from './geometry';
import { rng, seedOf } from './geometry';
import type { WorldMaterials } from './materialsLib';

/** でこぼこの球（葉の塊の元）。aKg.z に露出（上と外は 1、下と内は 0）を入れる。 */
function lumpGeometry(seed: number, detail: number, bump: number): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position') as BufferAttribute;
  const r = rng(seed);
  const freq = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 3.1 + freq[0]) * Math.sin(y * 2.7 + freq[1]) * Math.sin(z * 3.3 + freq[2]) * 0.6 +
      Math.sin(x * 7.3 + freq[1]) * Math.sin(z * 6.9 + freq[0]) * 0.4;
    const k = 1 + bump * n;
    pos.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 1), z * k);
  }
  g.computeVertexNormals();
  const nor = g.getAttribute('normal') as BufferAttribute;
  const kg = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i);
    const y = pos.getY(i);
    kg[i * 4 + 2] = Math.min(1, Math.max(0, 0.55 + 0.45 * ny + 0.15 * y));
  }
  g.setAttribute('aKg', new BufferAttribute(kg, 4));
  return g;
}

/** 曲線に沿った管（幹・枝）。pts は中心線、r0→r1 で細くなる。 */
function tube(mb: MeshBuilder, pts: V3[], r0: number, r1: number, sides: number): void {
  const n = pts.length - 1;
  const at = (t: number): V3 => {
    const f = Math.min(n - 1e-6, Math.max(0, t * n));
    const i = Math.floor(f);
    const k = f - i;
    const a = pts[i];
    const b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  const tangent = (t: number): Vector3 => {
    const a = at(Math.max(0, t - 0.02));
    const b = at(Math.min(1, t + 0.02));
    return new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  };
  let len = 0;
  for (let i = 0; i < n; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
  mb.grid(
    sides,
    Math.max(2, n * 2),
    (u, v) => {
      const c = at(v);
      const tg = tangent(v);
      const ref = Math.abs(tg.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
      const nn = new Vector3().crossVectors(tg, ref).normalize();
      const bb = new Vector3().crossVectors(tg, nn).normalize();
      const a = u * Math.PI * 2;
      const r = r0 + (r1 - r0) * v;
      const p: V3 = [c[0] + (nn.x * Math.cos(a) + bb.x * Math.sin(a)) * r, c[1] + (nn.y * Math.cos(a) + bb.y * Math.sin(a)) * r, c[2] + (nn.z * Math.cos(a) + bb.z * Math.sin(a)) * r];
      return { p, uv: [u * Math.PI * 2 * (r0 + r1) * 0.5, v * len] };
    },
    true,
  );
}

interface PadPlace {
  m: Matrix4;
  tint: number;
}

/** 庭木の松：曲がって傾いた幹、横へ張る枝、枝先ごとに平たい葉の塊を2〜3段。 */
function pine(bark: MeshBuilder, pads: PadPlace[], p: PropDef): void {
  const r = rng(seedOf(`pine-${p.id}`));
  const s = p.scale ?? 1;
  const rot = ((p.rotDeg ?? 0) * Math.PI) / 180;
  const lx = Math.cos(rot);
  const lz = Math.sin(rot);
  const H = (4.6 + r() * 1.4) * s;
  // 幹：根元から、傾いて一度曲がり、上で戻る
  const lean = 0.9 * s;
  const trunk: V3[] = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const bend = Math.sin(t * Math.PI * 1.1) * lean;
    const wob = Math.sin(t * 7 + r() * 2) * 0.12 * s;
    trunk.push([p.pos.x + lx * bend + -lz * wob, t * H, p.pos.z + lz * bend + lx * wob]);
  }
  bark.kg = [0, r(), 0, 0];
  tube(bark, trunk, 0.2 * s, 0.07 * s, 9);
  // 根張り
  tube(bark, [[p.pos.x, -0.05, p.pos.z], [p.pos.x, 0.35 * s, p.pos.z]], 0.32 * s, 0.2 * s, 9);
  const top = trunk[trunk.length - 1];
  // 枝：高さの違う 4〜6 本、方角を散らして水平に張る
  const nb = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const t = 0.38 + (i / nb) * 0.55 + r() * 0.05;
    const f = t * 6;
    const k = Math.floor(f);
    const a = trunk[Math.min(6, k)];
    const b = trunk[Math.min(6, k + 1)];
    const base: V3 = [a[0] + (b[0] - a[0]) * (f - k), a[1] + (b[1] - a[1]) * (f - k), a[2] + (b[2] - a[2]) * (f - k)];
    const ang = rot + (i / nb) * Math.PI * 2 * 0.85 + r() * 0.8;
    const L = (1.3 + r() * 1.3) * s * (1.15 - t * 0.5);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const mid: V3 = [base[0] + dx * L * 0.5, base[1] - 0.15 * s, base[2] + dz * L * 0.5];
    const end: V3 = [base[0] + dx * L, base[1] + 0.1 * s, base[2] + dz * L];
    tube(bark, [base, mid, end], 0.07 * s, 0.03 * s, 6);
    padCluster(pads, end, (0.85 + r() * 0.5) * s, ang, r);
  }
  padCluster(pads, [top[0], top[1] + 0.1 * s, top[2]], (0.95 + r() * 0.3) * s, rot, r);
}

/** 枝先の葉の塊：平たい塊を2〜3つ、少しずつずらして重ねる。 */
function padCluster(pads: PadPlace[], at: V3, size: number, ang: number, r: () => number): void {
  // r01-world-周2: 指摘「松の葉が厚い塊にくっついて黒い玉に見える」 厚み 0.32-0.42→0.2-0.26、塊どうしを離す 0.9→1.5
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const off = i === 0 ? 0 : (r() - 0.5) * size * 1.5;
    const offz = i === 0 ? 0 : (r() - 0.5) * size * 1.5;
    const sx = size * (0.9 + r() * 0.5) * (i === 0 ? 1.1 : 0.7);
    const sz = size * (0.8 + r() * 0.5) * (i === 0 ? 1.0 : 0.65);
    const sy = size * (0.2 + r() * 0.06) * (i === 0 ? 1 : 0.85);
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ang + r());
    const m = new Matrix4().compose(new Vector3(at[0] + off, at[1] + sy * 0.35 + (i === 0 ? 0 : (r() - 0.3) * 0.25), at[2] + offz), q, new Vector3(sx, sy, sz));
    pads.push({ m, tint: r() });
  }
}

/** 竹の幹の元：高さ 1・半径 1 の、上で細る円柱（揺れのために縦に刻む）。uv は（周の角, 高さ）。 */
function culmGeometry(): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const sides = 6;
  const rings = [0, 0.12, 0.28, 0.45, 0.62, 0.78, 0.9, 1];
  for (let j = 0; j < rings.length; j++) {
    const y = rings[j];
    const rr = 1 - 0.35 * y;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      uv.push(i / sides, y);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * (sides + 1) + i;
      const b = a + sides + 1;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aKg', new BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 竹の葉の房：小枝の先から、細長い菱形の葉が扇形に垂れる（小枝 10 本 × 葉 5 枚）。
 * 法線は房の中心からの向き（上寄り）にして、房全体が空の光を柔らかく受けるようにする。
 * r01-world-周1: 指摘「竹の葉が一枚の三角の影絵（黒い棘）」 三角 70 枚 → 菱形の葉を小枝ごとに扇形に
 */
function leafClusterGeometry(seed: number): BufferGeometry {
  const r = rng(seed);
  const pos: number[] = [];
  const nor: number[] = [];
  const kg: number[] = [];
  const uv: number[] = [];
  const push = (p: V3, e: number, u: number, v: number): void => {
    pos.push(...p);
    const n = new Vector3(p[0], p[1] + 0.35, p[2]).normalize();
    nor.push(n.x, n.y, n.z);
    kg.push(0, 0, e, 0);
    uv.push(u, v);
  };
  for (let t = 0; t < 10; t++) {
    const a = r() * Math.PI * 2;
    const d = 0.1 + r() * 0.45;
    const tip: V3 = [Math.cos(a) * d, (r() - 0.4) * 0.45, Math.sin(a) * d];
    const e = Math.min(1, Math.max(0, 0.45 + tip[1] * 1.2));
    for (let k = 0; k < 5; k++) {
      const fan = a + (k - 2) * 0.42 + (r() - 0.5) * 0.3;
      const L = 0.11 + r() * 0.06;
      const W = 0.017 + r() * 0.006;
      const droop = -0.06 - r() * 0.07;
      const dx = Math.cos(fan);
      const dz = Math.sin(fan);
      const px = -dz * W;
      const pz = dx * W;
      const base = tip;
      const mid: V3 = [base[0] + dx * L * 0.32, base[1] + droop * 0.25, base[2] + dz * L * 0.32];
      const end: V3 = [base[0] + dx * L, base[1] + droop, base[2] + dz * L];
      const m1: V3 = [mid[0] + px, mid[1], mid[2] + pz];
      const m2: V3 = [mid[0] - px, mid[1], mid[2] - pz];
      // 菱形（根元・幅の広い所の左右・先）を2枚の三角で
      push(base, e, 0, 0);
      push(m1, e, 1, 0.32);
      push(end, e, 0.5, 1);
      push(base, e, 0, 0);
      push(end, e, 0.5, 1);
      push(m2, e, 0, 0.32);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aKg', new BufferAttribute(new Float32Array(kg), 4));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  return g;
}

export interface Plants {
  meshes: InstancedMesh[];
}

export function buildPlants(stage: StageDef, bark: MeshBuilder, mats: WorldMaterials): Plants {
  const meshes: InstancedMesh[] = [];
  // ---- 松 ----
  const pads: PadPlace[] = [];
  for (const p of stage.props) if (p.kind === 'pine') pine(bark, pads, p);
  if (pads.length) meshes.push(instanced(lumpGeometry(11, 3, 0.2), mats.pine, pads.map((p) => p.m), pads.map((p) => [p.tint, p.tint, 0, 0]), 'pinePads', true));

  // ---- 植え込み：中心の大きな丸と、縁の小さな丸 ----
  const bushM: Matrix4[] = [];
  const bushI: number[][] = [];
  for (const h of stage.hides) {
    const r = rng(seedOf(`bush-${h.id}`));
    const R = h.radius;
    const put = (x: number, z: number, rad: number, ht: number): void => {
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6.28);
      bushM.push(new Matrix4().compose(new Vector3(x, ht * 0.42, z), q, new Vector3(rad, ht * 0.62, rad * (0.9 + r() * 0.2))));
      bushI.push([r(), r(), 0, 0]);
    };
    put(h.center.x, h.center.z, R * 0.78, 1.15 + r() * 0.15);
    const n = R > 1.25 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      put(h.center.x + Math.cos(a) * R * 0.55, h.center.z + Math.sin(a) * R * 0.55, R * (0.42 + r() * 0.12), 0.8 + r() * 0.2);
    }
  }
  if (bushM.length) meshes.push(instanced(lumpGeometry(23, 2, 0.06), mats.bush, bushM, bushI, 'bushes', true));

  // ---- 竹林 ----
  const culmM: Matrix4[] = [];
  const culmI: number[][] = [];
  const leafM: Matrix4[] = [];
  const leafI: number[][] = [];
  for (const bb of stage.bamboo) {
    const r = rng(seedOf(`bamboo-${bb.id}`));
    const area = (bb.rect.x1 - bb.rect.x0) * (bb.rect.z1 - bb.rect.z0);
    // r01-world-周1: 指摘「竹林がまばらな棒」 見た目の本数をデータの目安の 1.5 倍に（当たりと暗さはデータのまま）
    const n = Math.round(area * bb.density * 1.5);
    for (let i = 0; i < n; i++) {
      const x = bb.rect.x0 + r() * (bb.rect.x1 - bb.rect.x0);
      const z = bb.rect.z0 + r() * (bb.rect.z1 - bb.rect.z0);
      const pathX = -33 + Math.sin(z * 0.35) * 0.35;
      if (Math.abs(x - pathX) < 0.85) continue;
      if (x < -35.25) continue;
      if (Math.abs(z + 12) < 0.45 && x > -30.4) continue;
      const rad = 0.045 + r() * 0.03;
      const h = 6.5 + r() * 2.8;
      const tilt = (r() - 0.5) * 0.12;
      const ta = r() * 6.28;
      const m = new Matrix4()
        .makeRotationAxis(new Vector3(Math.cos(ta), 0, Math.sin(ta)), tilt)
        .multiply(new Matrix4().makeScale(rad, h, rad));
      m.setPosition(x, 0, z);
      culmM.push(m);
      culmI.push([r(), r(), rad, h]);
      // 上の方に葉の房
      const nl = 4 + Math.floor(r() * 3);
      for (let k = 0; k < nl; k++) {
        const hy = h * (0.55 + (k / nl) * 0.45) + (r() - 0.5) * 0.4;
        const off = 0.25 + r() * 0.5;
        const a = r() * 6.28;
        const top = new Vector3(0, hy / h, 0).applyMatrix4(m);
        const lm = new Matrix4().compose(
          new Vector3(top.x + Math.cos(a) * off, top.y, top.z + Math.sin(a) * off),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6.28),
          new Vector3(1.1 + r() * 0.5, 1, 1.1 + r() * 0.5),
        );
        leafM.push(lm);
        leafI.push([r(), r(), 1, top.y]);
      }
    }
  }
  if (culmM.length) meshes.push(instanced(culmGeometry(), mats.bamboo, culmM, culmI, 'bamboo', true));
  if (leafM.length) meshes.push(instanced(leafClusterGeometry(5), mats.bambooLeaf, leafM, leafI, 'bambooLeaves', true));
  return { meshes };
}

function instanced(geo: BufferGeometry, mat: MeshStandardMaterial, ms: Matrix4[], inst: number[][], name: string, shadow: boolean): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, ms.length);
  ms.forEach((m, i) => mesh.setMatrixAt(i, m));
  const a = new Float32Array(ms.length * 4);
  inst.forEach((v, i) => a.set(v.slice(0, 4), i * 4));
  geo.setAttribute('aKgInst', new InstancedBufferAttribute(a, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  return mesh;
}
