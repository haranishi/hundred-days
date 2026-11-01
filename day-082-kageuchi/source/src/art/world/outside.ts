// OWNER: world-art
// ステージの外の飾り：明智勢の篝火の列（decor.armyCamps）と、白地に水色桔梗の旗（decor.banners、揺れる）。
// 篝火は fire.ts の遠くの炎（種類 2）と、地面の照り返し（加算の板）で見せる。灯りの数は増やさない。
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  ShaderMaterial,
  type MeshStandardMaterial,
} from 'three';
import type { StageDef } from '../../stage/types';
import { kgMaterial } from '../render/materials';
import { SKY_PARS_GLSL, SKY_UNIFORMS } from '../render/sky';
import type { Builders } from './buildings';
import type { FlameDef, SmokeDef } from './fire';
import { MeshBuilder, rng, seedOf } from './geometry';
import { PART } from './materialsLib';
import { buildKido, streetOpenings } from './vistas';

/** 水色桔梗の紋を描いた旗の布（白地）。CanvasTexture は flipY を明示する（既定では上下が反転する）。 */
function bannerTexture(): CanvasTexture {
  const W = 128;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d が使えない');
  g.fillStyle = '#ece8dc';
  g.fillRect(0, 0, W, H);
  // 布のむら（決まった位置の薄い筋）
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(120,110,90,${0.015 + ((i * 37) % 7) * 0.004})`;
    g.fillRect((i * 37) % W, (i * 91) % H, 3, 1);
  }
  const crest = (cx: number, cy: number, R: number): void => {
    g.save();
    g.translate(cx, cy);
    // 花びら5枚（先が尖った幅広の花びら）
    g.fillStyle = '#5aa6d6';
    for (let k = 0; k < 5; k++) {
      g.save();
      g.rotate((k * Math.PI * 2) / 5);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(R * 0.55, -R * 0.08, R * 0.62, -R * 0.62, R * 0.2, -R * 0.92);
      g.lineTo(0, -R * 1.02);
      g.lineTo(-R * 0.2, -R * 0.92);
      g.bezierCurveTo(-R * 0.62, -R * 0.62, -R * 0.55, -R * 0.08, 0, 0);
      g.fill();
      g.restore();
    }
    // 花びらの筋と、中心の白い星
    g.strokeStyle = '#ece8dc';
    g.lineWidth = R * 0.07;
    for (let k = 0; k < 5; k++) {
      g.save();
      g.rotate((k * Math.PI * 2) / 5);
      g.beginPath();
      g.moveTo(0, -R * 0.18);
      g.lineTo(0, -R * 0.72);
      g.stroke();
      g.restore();
    }
    g.fillStyle = '#ece8dc';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? R * 0.2 : R * 0.08;
      const a = (k * Math.PI) / 5 - Math.PI / 2;
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  };
  crest(W / 2, 92, 46);
  crest(W / 2, 300, 34);
  const t = new CanvasTexture(c);
  t.flipY = true;
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** 陣幕：白地に紺の二本の筋、3m おきに水色桔梗の紋。 */
function jinmakuTexture(): CanvasTexture {
  const W = 512;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d が使えない');
  g.fillStyle = '#e8e3d6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1e2a4a';
  g.fillRect(0, 14, W, 12);
  g.fillRect(0, H - 26, W, 12);
  // 紋（花びら5枚の簡略）
  const cx = W / 2;
  const cy = H / 2 + 2;
  const R = 28;
  g.fillStyle = '#5aa6d6';
  for (let k = 0; k < 5; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((k * Math.PI * 2) / 5);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(R * 0.55, -R * 0.08, R * 0.62, -R * 0.62, R * 0.2, -R * 0.92);
    g.lineTo(0, -R * 1.02);
    g.lineTo(-R * 0.2, -R * 0.92);
    g.bezierCurveTo(-R * 0.62, -R * 0.62, -R * 0.55, -R * 0.08, 0, 0);
    g.fill();
    g.restore();
  }
  const t = new CanvasTexture(c);
  t.flipY = true;
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** 兵の影（足元が原点、高さ 1：円柱の体と陣笠）。 */
function soldierGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0, 0, 0, 0.2, 0.16, 0.86, 7, false);
  b.cylinder(0, 0.86, 0, 0.09, 0.09, 0.06, 6, false);
  b.cylinder(0, 0.9, 0, 0.26, 0.02, 0.1, 8, true);
  return b.build();
}

const JIN_VERTEX = /* glsl */ `
{
  // 布が風でわずかにたわむ（上の縁は綱で張られて動かない）
  float sway = (1.0 - uv.y) * 0.08 * sin(uKgTime * 1.3 + transformed.x * 0.7 + transformed.z * 0.5 + aKg.y * 6.0);
  transformed.x += sway;
  transformed.z += sway * 0.6;
}
`;

const BANNER_VERTEX = /* glsl */ `
{
  // 竿から離れるほど大きく、布の面と直角（aKg.zw）に波打つ（uv.x：竿側 0 → 外 1）
  // r02-fix-visual: 指摘「旗が動いて見えない」 竿から外へ走る波＋速い小さなはためき＋ゆっくりした煽り
  float k = uv.x;
  float ph = uKgTime * 2.6 + transformed.y * 1.3 + aKg.y * 6.0 - k * 3.0;
  float gust = 0.7 + 0.3 * sin(uKgTime * 0.41 + aKg.y * 9.0);
  float wave = k * gust * (0.22 * sin(ph) + 0.08 * sin(ph * 2.3 + 1.0) + 0.035 * sin(uKgTime * 9.1 + transformed.y * 4.0 + aKg.y * 3.0));
  transformed.xz += aKg.zw * wave;
  // 外の縁は少し持ち上がり、下がる（布の重み）
  transformed.y += k * k * 0.06 * sin(ph * 0.5 + 0.7);
}
`;

const GLOW_VERTEX = /* glsl */ `
attribute vec4 aKgInst;
varying vec2 vUv;
varying vec3 vWorld;
varying float vSeed;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vUv = uv;
  vWorld = wp.xyz;
  vSeed = aKgInst.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const GLOW_FRAGMENT = /* glsl */ `
${SKY_PARS_GLSL}
varying vec2 vUv;
varying vec3 vWorld;
varying float vSeed;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float f = pow(max(0.0, 1.0 - r), 2.2);
  float fl = 0.85 + 0.15 * sin(uKgTime * 6.0 + vSeed * 40.0);
  vec3 col = vec3(1.0, 0.42, 0.13) * 0.32 * f * fl;
  float T = exp(-kgFogDepth(cameraPosition, vWorld));
  gl_FragColor = vec4(col * T, 1.0);
}
`;

// 霧ににじむ篝火の暈（r02-fix-visual）：炎の高さに置く、カメラを向く加算の円。遠くの陣の火も、霧の中の光の点として読める
const HALO_VERTEX = /* glsl */ `
attribute vec4 aKgInst;    // x 種, y 大きさ（m）
varying vec2 vUv;
varying vec3 vWorld;
varying float vSeed;
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + 1e-5);
  vec3 up = cross(toCam, right);
  vec3 p = c + (right * position.x + up * position.y) * aKgInst.y;
  vUv = uv;
  vWorld = c;
  vSeed = aKgInst.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const HALO_FRAGMENT = /* glsl */ `
${SKY_PARS_GLSL}
varying vec2 vUv;
varying vec3 vWorld;
varying float vSeed;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float f = pow(max(0.0, 1.0 - r), 2.6);
  float fl = 0.82 + 0.18 * sin(uKgTime * 6.3 + vSeed * 40.0) * sin(uKgTime * 2.9 + vSeed * 13.0);
  float T = exp(-kgFogDepth(cameraPosition, vWorld));
  // 霧が濃いほど暈は広く残り、芯（炎そのもの）は霧に沈む
  vec3 col = vec3(1.0, 0.44, 0.14) * 0.2 * f * fl * (0.55 + 0.45 * T);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Outside {
  glows: InstancedMesh;
  /** 篝火と松明の暈（霧ににじむ光の点）。r02-fix-visual */
  halos: InstancedMesh;
  jinmaku: Mesh;
  soldiers: InstancedMesh;
  banners: Mesh;
  bannerMaterial: MeshStandardMaterial;
  flames: FlameDef[];
  smokes: SmokeDef[];
}

export function buildOutside(bd: Builders, stage: StageDef): Outside {
  const flames: FlameDef[] = [];
  const smokes: SmokeDef[] = [];
  const glowM: Matrix4[] = [];
  const glowI: number[] = [];
  // 陣：隊ごとに陣幕で三方を囲み（開いた側は寺へ向ける）、中に篝火を2つ、まわりに兵の影。
  // r01-world-周3: 指摘「陣の篝火が等間隔の格子に並ぶ」 列 → 隊ごとの群れ（ずらした格子の上に、間引いて置く）
  const jin = new MeshBuilder();
  const soldierM: Matrix4[] = [];
  // 暈（霧ににじむ光）：位置と大きさ
  const haloM: Matrix4[] = [];
  const haloI: number[] = [];
  const halo = (x: number, y: number, z: number, size: number, seed: number): void => {
    haloM.push(new Matrix4().setPosition(x, y, z));
    haloI.push(seed, size, 0, 0);
  };
  const fire = (x: number, z: number, sz: number, r: () => number): void => {
    flames.push({ base: [x, 0.9, z], w: 0.9 * sz, h: 1.7 * sz, seed: r(), from: -1, kind: 2 });
    if (r() < 0.35) smokes.push({ base: [x, 2.2, z], size: 2.6, rise: 16, seed: r(), from: -1, density: 0.16 });
    glowM.push(new Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, 0.04, z).multiply(new Matrix4().makeScale(9 * sz, 9 * sz, 1)));
    glowI.push(r(), 0, 0, 0);
    bd.iron.kg = [PART.iron.iron, 3, 0, 0];
    bd.iron.cylinder(x, 0, z, 0.35, 0.3, 0.9, 6, true);
    halo(x, 1.5 * sz + 0.6, z, 4.2 * sz, r());
  };
  // 松明（兵が持つ・地に立てる）：細い竿の先の小さな炎
  const torch = (x: number, z: number, r: () => number, haloSize = 2.2): void => {
    bd.wood.kg = [PART.wood.timber, 77, 0, 0.05];
    bd.wood.cylinder(x, 0, z, 0.03, 0.025, 1.75, 5, true);
    flames.push({ base: [x, 1.72, z], w: 0.3, h: 0.62, seed: r(), from: -1, kind: 2 });
    halo(x, 1.95, z, haloSize, r());
  };
  for (const [ci, c] of stage.decor.armyCamps.entries()) {
    const r = rng(seedOf(`camp-${ci}`));
    const step = 15;
    for (let gz = c.z0 + 7; gz < c.z1 - 4; gz += step * 0.8) {
      for (let gx = c.x0 + 7; gx < c.x1 - 4; gx += step) {
        if (r() < 0.22) continue;
        const ux = gx + (r() - 0.5) * 6 + (Math.floor((gz - c.z0) / (step * 0.8)) % 2) * step * 0.5;
        const uz = gz + (r() - 0.5) * 5;
        if (ux > c.x1 - 3) continue;
        // 寺の方角を向く
        const face = Math.atan2(-uz, -ux);
        const w = 9 + r() * 4;
        const d = 6 + r() * 2;
        const cs = Math.cos(face);
        const sn = Math.sin(face);
        // 陣幕：寺と反対側と左右の三方（布の高さ 1.7m）
        const P = (a: number, b: number): [number, number] => [ux + cs * a - sn * b, uz + sn * a + cs * b];
        const curtain = (a0: number, b0: number, a1: number, b1: number): void => {
          const p0 = P(a0, b0);
          const p1 = P(a1, b1);
          const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          jin.kg = [0, r(), 0, 0];
          jin.grid(Math.max(2, Math.round(len / 1.5)), 1, (u, v) => {
            const x = p0[0] + (p1[0] - p0[0]) * u;
            const z = p0[1] + (p1[1] - p0[1]) * u;
            return { p: [x, 0.25 + 1.7 * (1 - v), z], uv: [(u * len) / 3, 1 - v] };
          });
        };
        curtain(-d / 2, -w / 2, -d / 2, w / 2);
        curtain(-d / 2, w / 2, d / 2, w / 2);
        curtain(d / 2, -w / 2, -d / 2, -w / 2);
        // 篝火2つと、まわりの兵
        for (const k of [-0.25, 0.25]) {
          const p = P(d * 0.15, w * k);
          fire(p[0], p[1], 0.8 + r() * 0.4, r);
          const n = 2 + Math.floor(r() * 3);
          for (let i = 0; i < n; i++) {
            const a = r() * Math.PI * 2;
            const rr = 1.0 + r() * 0.8;
            const h = 1.55 + r() * 0.2;
            soldierM.push(new Matrix4().compose(new Vector3(p[0] + Math.cos(a) * rr, 0, p[1] + Math.sin(a) * rr), new Quaternion(), new Vector3(1, h, 1)));
          }
        }
      }
    }
    // 陣のあいだにもまばらな篝火（見張り）
    for (let i = 0; i < 6; i++) fire(c.x0 + r() * (c.x1 - c.x0), c.z0 + r() * (c.z1 - c.z0), 0.7, r);
  }
  // ---- 通りの先（vistas.ts の開口）：木戸と、その向こうに控える明智勢 ----
  // 木戸の 4〜8m 先に松明の兵と幟（見下ろし 48° でも開口に近づけば画面に入る）、11〜14m に篝火、22〜34m に篝火と幟の列。
  // r03-fix-visual: 指摘「遊ぶ角度では通りの先の明智勢が画面の上の端にかかるだけ」 遊ぶカメラは木戸に着いても地面を木戸の先 約 14m までしか
  //   映さないので、前の列 4.2〜7.6m→3.0〜6.0m、中ほどの篝火 11.5〜14m→7.5〜9.5m（大きさ 1.0→1.15）に寄せ、松明の暈を 2.2→3.0m にする
  // 幟は低め（竿 5m・布 1.8〜4.8m）にして、見下ろし 25〜35° の画面の上の端より下に布が来るようにする
  const vistaBanners: { x: number; z: number; h: number; dx: number; dz: number }[] = [];
  for (const [vi, o] of streetOpenings(stage).entries()) {
    buildKido(bd, o);
    const r = rng(seedOf(`vista-${vi}`));
    const P = (a: number, h: number): [number, number] => [o.cx + o.ax * a + o.ox * h, o.cz + o.az * a + o.oz * h];
    const half = o.width / 2;
    // 前の列：兵と松明
    const nf = 4 + Math.floor(r() * 3);
    for (let i = 0; i < nf; i++) {
      const [x, z] = P((r() - 0.5) * (o.width - 1.2), 3.0 + r() * 3.0);
      soldierM.push(new Matrix4().compose(new Vector3(x, 0, z), new Quaternion(), new Vector3(1, 1.58 + r() * 0.16, 1)));
    }
    for (const a of [-half * 0.45, half * 0.4]) {
      const [x, z] = P(a + (r() - 0.5) * 0.6, 3.6 + r() * 1.2);
      torch(x, z, r, 3.0);
    }
    for (const a of [-half + 0.7, half - 0.7]) {
      const [x, z] = P(a, 6.5 + r() * 1.5);
      vistaBanners.push({ x, z, h: 5.0, dx: o.ax, dz: o.az });
    }
    // 中ほど：篝火と、まわりの兵
    {
      const [x, z] = P((r() - 0.5) * half, 7.5 + r() * 2.0);
      fire(x, z, 1.15, r);
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2;
        soldierM.push(new Matrix4().compose(new Vector3(x + Math.cos(a) * 1.4, 0, z + Math.sin(a) * 1.4), new Quaternion(), new Vector3(1, 1.6, 1)));
      }
    }
    // 奥：篝火2つと幟2本
    for (let i = 0; i < 2; i++) {
      const [x, z] = P((i === 0 ? -1 : 1) * half * (0.6 + r() * 0.8), 22 + i * 7 + r() * 4);
      fire(x, z, 0.9, r);
      const [bx, bz] = P((i === 0 ? 1 : -1) * half * 0.7, 24 + i * 6);
      vistaBanners.push({ x: bx, z: bz, h: 5.6, dx: o.ax, dz: o.az });
    }
  }

  const glowGeo = new PlaneGeometry(1, 1);
  glowGeo.setAttribute('aKgInst', new InstancedBufferAttribute(new Float32Array(glowI), 4));
  const glowMat = new ShaderMaterial({
    name: 'kg-campGlow',
    uniforms: { ...SKY_UNIFORMS },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const glows = new InstancedMesh(glowGeo, glowMat, glowM.length);
  glowM.forEach((m, i) => glows.setMatrixAt(i, m));
  glows.instanceMatrix.needsUpdate = true;
  glows.computeBoundingSphere();
  glows.name = 'campGlows';
  glows.renderOrder = 5;
  const haloGeo = new PlaneGeometry(1, 1);
  haloGeo.setAttribute('aKgInst', new InstancedBufferAttribute(new Float32Array(haloI), 4));
  const haloMat = new ShaderMaterial({
    name: 'kg-campHalo',
    uniforms: { ...SKY_UNIFORMS },
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const halos = new InstancedMesh(haloGeo, haloMat, Math.max(1, haloM.length));
  haloM.forEach((m, i) => halos.setMatrixAt(i, m));
  halos.count = haloM.length;
  halos.instanceMatrix.needsUpdate = true;
  halos.frustumCulled = false;
  halos.name = 'campHalos';
  halos.renderOrder = 6;

  const jinMat = kgMaterial(
    { color: 0xffffff, roughness: 0.92, metalness: 0, side: DoubleSide, map: jinmakuTexture() },
    { key: 'jinmaku', attr: true, amb: null, vertex: JIN_VERTEX },
  );
  const jinmaku = new Mesh(jin.build(), jinMat);
  jinmaku.name = 'jinmaku';
  jinmaku.castShadow = false;
  jinmaku.receiveShadow = true;
  const soldierGeo = soldierGeometry();
  const soldierMat = kgMaterial({ color: 0x17181c, roughness: 0.85, metalness: 0 }, { key: 'soldier', amb: null });
  const soldiers = new InstancedMesh(soldierGeo, soldierMat, Math.max(1, soldierM.length));
  soldierM.forEach((m, i) => soldiers.setMatrixAt(i, m));
  soldiers.count = soldierM.length;
  soldiers.instanceMatrix.needsUpdate = true;
  soldiers.computeBoundingSphere();
  soldiers.name = 'soldiers';

  // 旗（幟）：竿と横木、白地に水色桔梗の布
  const cloth = new MeshBuilder();
  const r = rng(seedOf('banners'));
  // r01-world-周3: 指摘「旗が町屋の屋根に隠れる」 竿 4.6-5.2 → 7.2-8.0m（屋根の上に布が出る長い幟）。通りの先の幟は低め（r02-fix-visual）
  const allBanners = [
    ...stage.decor.banners.map((b) => {
      const toward = Math.atan2(-b.z, -b.x);
      return { x: b.x, z: b.z, h: 7.2 + r() * 0.8, dx: Math.cos(toward + Math.PI / 2), dz: Math.sin(toward + Math.PI / 2), len: 3.1 };
    }),
    ...vistaBanners.map((b) => ({ ...b, h: b.h + r() * 0.4, len: 3.0 })),
  ];
  for (const [i, b] of allBanners.entries()) {
    const h = b.h;
    bd.wood.kg = [PART.wood.timber, 50 + i, 0, 0];
    bd.wood.cylinder(b.x, 0, b.z, 0.045, 0.04, h + 0.2, 6, true);
    // 布は竿の横に垂らす（陣の旗は寺の方へ向けた面、通りの先の旗は通りから見える面）。uv.x は竿側 0 → 外 1
    const w = 0.72;
    const top = h - 0.05;
    const bottom = top - b.len;
    const dx = b.dx;
    const dz = b.dz;
    bd.wood.kg = [PART.wood.timber, 60 + i, 1, 0];
    const m = new Matrix4().makeRotationY(-Math.atan2(dz, dx)).setPosition(b.x + dx * w * 0.5, top + 0.03, b.z + dz * w * 0.5);
    bd.wood.setMatrix(m);
    bd.wood.box([0, 0, 0], [w + 0.1, 0.05, 0.05]);
    bd.wood.setMatrix(null);
    cloth.kg = [0, r(), -dz, dx];
    const seg = 10;
    cloth.grid(
      4,
      seg,
      (u, v) => {
        const y = bottom + (top - bottom) * (1 - v);
        return { p: [b.x + dx * (0.04 + u * w), y, b.z + dz * (0.04 + u * w)], uv: [u, 1 - v] };
      },
      false,
    );
  }
  const bannerMaterial = kgMaterial(
    { color: 0xffffff, roughness: 0.9, metalness: 0, side: DoubleSide, map: bannerTexture() },
    { key: 'banner', attr: true, amb: null, vertex: BANNER_VERTEX },
  );
  const banners = new Mesh(cloth.build(), bannerMaterial);
  banners.name = 'banners';
  banners.castShadow = true;
  banners.receiveShadow = true;
  return { glows, halos, jinmaku, soldiers, banners, bannerMaterial, flames, smokes };
}
