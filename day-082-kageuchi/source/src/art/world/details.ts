// OWNER: world-art
// 使われ方に沿って足す細部（r01-world-周2）：
// ・土塀の外の足元の溝（石で縁取り、底は濡れて暗い）と、門の前の渡し石
// ・塀と建物の足元の雑草の株（接地の暗がりと合わせて、壁が地面に立って見える）
// ・信長の座の緋毛氈（青と緑の庭に赤を一つ）
// ・蛍（旧暦六月二日は蛍の季節。池と苔の上と竹林の縁で、ゆっくり明滅する。灯りの数は増やさない）
// ・水抜き穴の目印（r03-fix-visual）：穴の床を通る濡れた暗い石の樋と、そこから外の溝へ流れ出る細い水の筋
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type MeshStandardMaterial,
} from 'three';
import type { StageDef, WallDef } from '../../stage/types';
import { kgMaterial } from '../render/materials';
import { SKY_PARS_GLSL, SKY_UNIFORMS } from '../render/sky';
import type { Builders } from './buildings';
import type { V3 } from './geometry';
import { MeshBuilder, rng, seedOf } from './geometry';
import { PART } from './materialsLib';

/** 寺の内側の中心（外向きの判定用） */
function temple(stage: StageDef): { cx: number; cz: number; inside: (x: number, z: number) => boolean } {
  const ws = stage.walls.filter((w) => w.kind === 'dobei');
  const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
  const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, inside: (x, z) => x > x0 && x < x1 && z > z0 && z < z1 };
}

function frame(w: WallDef) {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz);
  return { len, ux: dx / len, uz: dz / len, nx: -dz / len, nz: dx / len };
}

/** 土塀の外の溝と、門の前の渡し石。 */
function ditches(bd: Builders, stage: StageDef): void {
  const T = temple(stage);
  for (const w of stage.walls) {
    if (w.kind !== 'dobei') continue;
    const f = frame(w);
    const mx = (w.a.x + w.b.x) / 2;
    const mz = (w.a.z + w.b.z) / 2;
    const out = f.nx * (mx - T.cx) + f.nz * (mz - T.cz) > 0 ? 1 : -1;
    const t = w.thickness / 2;
    const P = (s: number, off: number): [number, number] => [w.a.x + f.ux * s + f.nx * off * out, w.a.z + f.uz * s + f.nz * off * out];
    const strip = (mb: MeshBuilder, o0: number, o1: number, y0: number, y1: number): void => {
      const a = P(-t, o0);
      const b = P(f.len + t, o1);
      const x0 = Math.min(a[0], b[0]);
      const x1 = Math.max(a[0], b[0]);
      const z0 = Math.min(a[1], b[1]);
      const z1 = Math.max(a[1], b[1]);
      mb.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], 'px,nx,py,pz,nz');
    };
    const seed = seedOf(`ditch-${w.id}`) % 97;
    bd.stoneLow.kg = [PART.stone.cut, seed, 0.62, 0.09];
    strip(bd.stoneLow, t + 0.08, t + 0.19, -0.02, 0.07);
    strip(bd.stoneLow, t + 0.55, t + 0.66, -0.02, 0.06);
    bd.stoneLow.kg = [PART.stone.wet, seed, 0, 0];
    strip(bd.stoneLow, t + 0.19, t + 0.55, -0.02, 0.006);
  }
  // 門の前の渡し石（溝をまたぐ平たい石）
  for (const g of stage.gates) {
    if (g.kind !== 'large' && !stage.walls.some((w) => w.kind === 'dobei' && Math.hypot(w.a.x - g.center.x, w.a.z - g.center.z) < g.width)) continue;
    const yaw = (g.facingDeg * Math.PI) / 180;
    const ox = Math.cos(yaw);
    const oz = Math.sin(yaw);
    const cx = g.center.x + ox * 1.05;
    const cz = g.center.z + oz * 1.05;
    bd.stoneLow.kg = [PART.stone.cut, 7, 0.9, 0.12];
    const wide = g.width + 0.4;
    bd.stoneLow.box([cx, 0.04, cz], Math.abs(ox) > 0.5 ? [0.7, 0.1, wide] : [wide, 0.1, 0.7]);
  }
}

/** 雑草の株の元（細い葉 9 枚。高さ 1、根元が原点）。aKg.z は露出。 */
function tuftGeometry(): BufferGeometry {
  const r = rng(91);
  const pos: number[] = [];
  const nor: number[] = [];
  const kg: number[] = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const lean = 0.25 + r() * 0.45;
    const h = 0.6 + r() * 0.4;
    const w = 0.05 + r() * 0.03;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * w;
    const pz = dx * w;
    const tip: V3 = [dx * lean, h, dz * lean];
    const b0: V3 = [px, 0, pz];
    const b1: V3 = [-px, 0, -pz];
    pos.push(...b0, ...b1, ...tip);
    for (let k = 0; k < 3; k++) {
      nor.push(dx * 0.4, 0.9, dz * 0.4);
      kg.push(0, 0, k === 2 ? 1 : 0.35, 0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('aKg', new BufferAttribute(new Float32Array(kg), 4));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/** 塀と建物の足元の雑草（石畳と門の前は避ける）。 */
function weeds(stage: StageDef, grass: MeshStandardMaterial): InstancedMesh {
  const r = rng(seedOf('weeds'));
  const ms: Matrix4[] = [];
  const inst: number[] = [];
  const onStone = (x: number, z: number): boolean => stage.surfaces.some((s) => s.kind === 'stone' && x > s.rect.x0 - 0.4 && x < s.rect.x1 + 0.4 && z > s.rect.z0 - 0.4 && z < s.rect.z1 + 0.4);
  const nearGate = (x: number, z: number): boolean => stage.gates.some((g) => Math.hypot(x - g.center.x, z - g.center.z) < g.width * 0.75 + 0.8);
  const put = (x: number, z: number, s: number): void => {
    if (onStone(x, z) || nearGate(x, z)) return;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r() * 6.28);
    ms.push(new Matrix4().compose(new Vector3(x, 0, z), q, new Vector3(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5))));
    inst.push(r(), r(), 0, 0);
  };
  for (const w of stage.walls) {
    if (w.kind === 'town') continue;
    const f = frame(w);
    const t = w.thickness / 2 + (w.kind === 'dobei' ? 0.1 : 0.06);
    for (let s = 0.3; s < f.len; s += 0.55 + r() * 0.6) {
      for (const side of [1, -1]) {
        if (r() < 0.45) continue;
        const off = t + 0.02 + r() * 0.16;
        put(w.a.x + f.ux * s + f.nx * off * side, w.a.z + f.uz * s + f.nz * off * side, 0.16 + r() * 0.16);
      }
    }
  }
  for (const b of stage.buildings) {
    const fp = b.footprint;
    const per = 2 * (fp.x1 - fp.x0 + fp.z1 - fp.z0);
    for (let k = 0; k < per / 0.9; k++) {
      if (r() < 0.5) continue;
      const u = r() * per;
      const W = fp.x1 - fp.x0;
      const D = fp.z1 - fp.z0;
      const o = 0.05 + r() * 0.15;
      let x = 0;
      let z = 0;
      if (u < W) [x, z] = [fp.x0 + u, fp.z0 - o];
      else if (u < W + D) [x, z] = [fp.x1 + o, fp.z0 + (u - W)];
      else if (u < 2 * W + D) [x, z] = [fp.x1 - (u - W - D), fp.z1 + o];
      else [x, z] = [fp.x0 - o, fp.z1 - (u - 2 * W - D)];
      put(x, z, 0.14 + r() * 0.14);
    }
  }
  const geo = tuftGeometry();
  const mesh = new InstancedMesh(geo, grass, ms.length);
  ms.forEach((m, i) => mesh.setMatrixAt(i, m));
  geo.setAttribute('aKgInst', new InstancedBufferAttribute(new Float32Array(inst.length ? inst : [0, 0, 0, 0]), 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'weeds';
  return mesh;
}

/** 信長の座の緋毛氈。 */
function mat(stage: StageDef): Mesh | null {
  const n = stage.guards.find((g) => g.role === 'target');
  if (!n) return null;
  const material = kgMaterial(
    { color: 0xffffff, roughness: 0.95, metalness: 0 },
    {
      key: 'mosen',
      amb: null,
      color: /* glsl */ `
{
  // 毛足のむらと、縁の擦れ
  float n = kgNoise(vKgUv * 40.0) * 0.5 + kgNoise(vKgUv * 9.0) * 0.5;
  vec2 e = min(vKgUv, 1.0 - vKgUv);
  float edge = 1.0 - smoothstep(0.0, 0.04, min(e.x, e.y));
  diffuseColor.rgb = vec3(0.34, 0.025, 0.022) * (0.82 + 0.3 * n) * (1.0 - 0.3 * edge);
}`,
    },
  );
  const b = new MeshBuilder();
  b.box([0, 0.008, 0], [1.9, 0.016, 1.0], 'py,px,nx,pz,nz');
  const g = b.build();
  // 上の面の uv を 0..1 に
  const uv = g.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 0.95) / 1.9, (uv.getY(i) + 0.5) / 1.0);
  const mesh = new Mesh(g, material);
  const yaw = (n.facingDeg * Math.PI) / 180;
  mesh.position.set(n.start.x + Math.cos(yaw) * 0.25, 0, n.start.z + Math.sin(yaw) * 0.25);
  mesh.rotation.y = -yaw;
  mesh.receiveShadow = true;
  mesh.name = 'mosen';
  return mesh;
}

const FIREFLY_VERTEX = /* glsl */ `
attribute vec4 aBase;
uniform float uKgTime;
uniform float uKgPx;
varying float vBright;
varying vec3 vWorld;
void main() {
  float s = aBase.w;
  vec3 p = aBase.xyz + vec3(sin(uKgTime * 0.31 + s * 11.0) * 0.7, sin(uKgTime * 0.47 + s * 7.0) * 0.25, cos(uKgTime * 0.27 + s * 5.0) * 0.7);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // ゆっくり明滅する（数秒に一度、0.6 秒ほど光る）
  float ph = fract(uKgTime * (0.18 + 0.12 * fract(s * 3.7)) + s);
  vBright = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.3, ph));
  vWorld = p;
  gl_PointSize = max(2.0, uKgPx * 0.07 / max(-mv.z, 0.5));
}
`;
const FIREFLY_FRAGMENT = /* glsl */ `
${SKY_PARS_GLSL}
varying float vBright;
varying vec3 vWorld;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float m = exp(-d * d * 4.0);
  if (m * vBright < 0.01) discard;
  vec3 col = vec3(0.55, 1.0, 0.22) * 2.6 * vBright * m;
  float T = exp(-kgFogDepth(cameraPosition, vWorld));
  gl_FragColor = vec4(col * T, 1.0);
}
`;

/** 蛍：池のまわり、苔の上、竹林の縁。 */
function fireflies(stage: StageDef): Points {
  const r = rng(seedOf('fireflies'));
  const base: number[] = [];
  const pond = stage.ponds[0];
  const add = (x: number, z: number): void => {
    base.push(x, 0.35 + r() * 1.2, z, r());
  };
  if (pond) for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.8 + r() * 0.9;
    add(pond.center.x + Math.cos(a) * pond.rx * d, pond.center.z + Math.sin(a) * pond.rz * d);
  }
  for (let i = 0; i < 14; i++) add(-26 + r() * 44, -29 + r() * 14);
  for (const bb of stage.bamboo) for (let i = 0; i < 10; i++) add(bb.rect.x1 + 0.5 + r() * 3, bb.rect.z0 + r() * (bb.rect.z1 - bb.rect.z0));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array((base.length / 4) * 3), 3));
  g.setAttribute('aBase', new BufferAttribute(new Float32Array(base), 4));
  const material = new ShaderMaterial({
    name: 'kg-firefly',
    uniforms: { ...SKY_UNIFORMS, uKgPx: { value: 720 } },
    vertexShader: FIREFLY_VERTEX,
    fragmentShader: FIREFLY_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pts = new Points(g, material);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  pts.renderOrder = 12;
  return pts;
}

/**
 * 水抜き穴の目印（r03-fix-visual）。指摘（体験 TOP3）「東の小路から見ると、7m 手前でも塀の足元の小さな影にしか見えない」
 * 穴の床に濡れた暗い石の樋を通し、そこから外の溝へ細い水の筋を流す。水は空を少し映し、流れに沿って細いきらめきが下る
 * （月明かりを拾うつもりの弱い発光。灯りは増やさず、明るさの判定も変えない）。溝は ditches が塀の外に掘ったものを使う。
 */
function drainTrickle(bd: Builders, stage: StageDef): Mesh | null {
  const w = stage.walls.find((x) => x.crawl);
  if (!w) return null;
  const T = temple(stage);
  const f = frame(w);
  const mx = (w.a.x + w.b.x) / 2;
  const mz = (w.a.z + w.b.z) / 2;
  const out = f.nx * (mx - T.cx) + f.nz * (mz - T.cz) > 0 ? 1 : -1;
  const t = w.thickness / 2;
  const mid = f.len / 2;
  // 塀の座標（s：塀に沿って、o：外向き）→ 世界の xz
  const P = (s: number, o: number): [number, number] => [w.a.x + f.ux * s + f.nx * o * out, w.a.z + f.uz * s + f.nz * o * out];
  // 樋：穴の床を内から外の溝の縁まで（濡れた石。底は地面よりわずかに低く暗い）
  const seed = seedOf(`drain-${w.id}`) % 97;
  bd.stoneLow.kg = [PART.stone.wet, seed, 0, 0];
  const a = P(mid - 0.3, -t - 0.25);
  const b = P(mid + 0.3, t + 0.1);
  bd.stoneLow.box([(a[0] + b[0]) / 2, -0.004, (a[1] + b[1]) / 2], [Math.abs(b[0] - a[0]) || 0.6, 0.02, Math.abs(b[1] - a[1]) || 0.6], 'py');
  bd.stoneLow.kg = [PART.stone.cut, seed, 0.62, 0.09];
  for (const side of [-1, 1]) {
    const c0 = P(mid + side * 0.36, -t - 0.25);
    const c1 = P(mid + side * 0.3, t + 0.1);
    bd.stoneLow.box([(c0[0] + c1[0]) / 2, 0.02, (c0[1] + c1[1]) / 2], [Math.max(0.1, Math.abs(c1[0] - c0[0])), 0.06, Math.max(0.1, Math.abs(c1[1] - c0[1]))]);
  }
  // 水の筋の道：穴の中 → 樋 → 溝の内の縁石を越える → 溝の底を下流（塀に沿って s の大きい方）へ
  const path: [number, number, number, number][] = [
    // s, o, 高さ, 幅
    [mid - 0.02, -t - 0.15, 0.012, 0.16],
    [mid + 0.0, 0.0, 0.012, 0.2],
    [mid + 0.03, t + 0.06, 0.012, 0.2],
    [mid + 0.06, t + 0.14, 0.074, 0.17],
    [mid + 0.12, t + 0.3, 0.012, 0.18],
    [mid + 0.45, t + 0.37, 0.011, 0.15],
    [mid + 1.1, t + 0.34, 0.011, 0.13],
    [mid + 1.9, t + 0.38, 0.011, 0.12],
    [mid + 2.8, t + 0.35, 0.011, 0.1],
    [mid + 3.8, t + 0.37, 0.011, 0.08],
    [mid + 4.8, t + 0.36, 0.011, 0.05],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < path.length; i++) {
    const [s, o, y, wd] = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const p0 = P(prev[0], prev[1]);
    const p1 = P(next[0], next[1]);
    let dx = p1[0] - p0[0];
    let dz = p1[1] - p0[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const c = P(s, o);
    if (i > 0) {
      const q = P(path[i - 1][0], path[i - 1][1]);
      dist += Math.hypot(c[0] - q[0], c[1] - q[1]);
    }
    for (const side of [-1, 1]) {
      pos.push(c[0] - dz * side * wd * 0.5, y, c[1] + dx * side * wd * 0.5);
      nor.push(0, 1, 0);
      uv.push(dist, side < 0 ? 0 : 1);
    }
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  // 三角の向きを上へそろえる（どちら向きでも見えるよう両面）
  const m = kgMaterial(
    { color: 0xffffff, roughness: 0.1, metalness: 0, emissive: 0xffffff, side: DoubleSide },
    {
      key: 'trickle',
      amb: [100, 101],
      color: 'diffuseColor.rgb = vec3(0.012, 0.014, 0.018);',
      roughness: 'roughnessFactor = 0.08;',
      // 流れに沿って下るきらめき（細い筋が途切れながら流れる）と、縁ほど薄い水の照り。強さは夜の地面の数倍まで
      emissive: `{
  float kgAcross = 1.0 - abs(vKgUv.y * 2.0 - 1.0);
  float kgFlow = vKgUv.x * 5.0 - uKgTime * 1.7;
  float kgN = kgNoise(vec2(kgFlow, vKgUv.y * 2.3 + 3.1)) * kgNoise(vec2(kgFlow * 1.9 + 7.0, vKgUv.y * 4.0));
  float kgGlint = smoothstep(0.34, 0.62, kgN) * smoothstep(0.15, 0.7, kgAcross);
  float kgEnd = 1.0 - smoothstep(4.2, 5.4, vKgUv.x);
  // 穴の口（流れの始め 1.5m）ほど強く光らせ、場所の目印にする
  float kgMouth = 1.0 - smoothstep(0.2, 1.6, vKgUv.x);
  totalEmissiveRadiance = vec3(0.32, 0.4, 0.55) * (0.016 * kgAcross + (0.1 + 0.12 * kgMouth) * kgGlint) * kgEnd;
}`,
    },
  );
  const mesh = new Mesh(g, m);
  mesh.name = 'trickle';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export interface Details {
  weeds: InstancedMesh;
  mosen: Mesh | null;
  /** 水抜き穴から流れ出る水の筋（穴が無いステージでは null） */
  trickle: Mesh | null;
  fireflies: Points;
  grass: MeshStandardMaterial;
  setViewportHeight(px: number): void;
}

export function buildDetails(bd: Builders, stage: StageDef, grass: MeshStandardMaterial): Details {
  ditches(bd, stage);
  const ff = fireflies(stage);
  return {
    trickle: drainTrickle(bd, stage),
    weeds: weeds(stage, grass),
    mosen: mat(stage),
    fireflies: ff,
    grass,
    setViewportHeight(px: number): void {
      (ff.material as ShaderMaterial).uniforms.uKgPx.value = px;
    },
  };
}
