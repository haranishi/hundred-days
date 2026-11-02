// OWNER: core
// 仮の3D表示（グレーボックス）。ステージのデータから、箱・円柱・簡単な屋根・池・植え込み・竹・灯りの PointLight・空の色と霧を作る。
// 人物は種類で色分けしたカプセルと向きの印。統合で art の表示に差し替わるので、作り込みはしない（遊びを確かめられる見た目まで）。
// カメラとプレイヤーの間の壁・屋根は、薄く透かす（art の透かしの代わり。カメラは寄せない）。
import * as THREE from 'three';
import { rotYFromYaw, type CharacterKind, type CharacterSnap, type SimSnapshot } from '../contract/snapshot';
import type { StageDef, SurfaceKind } from '../stage/types';
import type { GameView } from './GameView';

const SURFACE_COLOR: Record<SurfaceKind, string> = { gravel: '#7d8494', stone: '#5e6168', moss: '#2f3e2d', dirt: '#4a3f33' };
const KIND_COLOR: Record<CharacterKind, string> = { player: '#2a2438', ashigaru: '#2c3f68', samurai: '#6a2f28', ranmaru: '#7a45a0', nobunaga: '#ece6d6' };
const LANTERN_COLOR = new THREE.Color(1.0, 0.7, 0.4);
/** 灯りの強さの目安：ゲームの intensity × 半径² にこれを掛けた値（カンデラ）。 */
const LIGHT_GAIN = 1.4;

interface CharVis {
  root: THREE.Group;
  pose: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshLambertMaterial;
  lantern: THREE.Mesh;
  stool: THREE.Mesh | null;
  kind: CharacterKind;
}

/** 決定的な乱数（竹や陣の篝火の置き方を毎回同じにする）。 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 切妻の屋根（三角柱）。中心が原点、軒の高さ h0・棟の高さ h1、棟は axis の向き。 */
function gableRoof(w: number, d: number, h0: number, h1: number, axis: 'x' | 'z'): THREE.BufferGeometry {
  const W = w / 2;
  const D = d / 2;
  const v: number[] = [];
  const quad = (a: number[], b: number[], c: number[], e: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...e);
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  if (axis === 'x') {
    quad([-W, h0, D], [W, h0, D], [W, h1, 0], [-W, h1, 0]);
    quad([W, h0, -D], [-W, h0, -D], [-W, h1, 0], [W, h1, 0]);
    tri([-W, h0, -D], [-W, h0, D], [-W, h1, 0]);
    tri([W, h0, D], [W, h0, -D], [W, h1, 0]);
  } else {
    quad([W, h0, D], [W, h0, -D], [0, h1, -D], [0, h1, D]);
    quad([-W, h0, -D], [-W, h0, D], [0, h1, D], [0, h1, -D]);
    tri([-W, h0, D], [W, h0, D], [0, h1, D]);
    tri([W, h0, -D], [-W, h0, -D], [0, h1, -D]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uDawn;
uniform float uFire;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
  // 東（+X）の地平だけがわずかに白む
  c += uDawn * pow(max(d.x, 0.0), 3.0) * pow(1.0 - h, 5.0);
  c = mix(c, vec3(0.55, 0.16, 0.05), uFire * pow(1.0 - h, 2.5) * 0.7);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class GreyboxView implements GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly overlayRoot = new THREE.Group();
  private camera: THREE.PerspectiveCamera | null = null;
  private readonly chars = new Map<string, CharVis>();
  private readonly lanternLights: THREE.PointLight[] = [];
  private readonly tmpV2 = new THREE.Vector2();
  private readonly tmpV3 = new THREE.Vector3();
  private readonly skyUniforms = {
    uZenith: { value: new THREE.Color('#050a1c') },
    uHorizon: { value: new THREE.Color('#1b2440') },
    uDawn: { value: new THREE.Color('#3a3550') },
    uFire: { value: 0 },
  };
  private readonly fireLight: THREE.PointLight;
  private readonly flames: THREE.Mesh[] = [];
  /** 透かし：画面の上でプレイヤーのまわりの円の内側、プレイヤーより手前の面だけを網点で抜く（カメラは寄せない）。 */
  private readonly seeUniforms = {
    uSeeCenter: { value: new THREE.Vector2(-1e5, -1e5) },
    uSeeRadius: { value: 0 },
    uSeeDepth: { value: 0 },
  };
  private readonly patched = new WeakSet<THREE.Material>();
  private playerPos = new THREE.Vector3();
  private hasPlayer = false;
  private time = 0;
  private lastStats = { calls: 0, triangles: 0 };

  constructor(canvas: HTMLCanvasElement, stage: StageDef) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.add(this.overlayRoot);
    this.overlayRoot.name = 'overlays';
    this.scene.fog = new THREE.Fog(new THREE.Color('#141c33'), 45, 170);

    this.buildSky();
    this.buildLights(stage);
    this.buildGround(stage);
    this.buildWalls(stage);
    this.buildGates(stage);
    this.buildBuildings(stage);
    this.buildProps(stage);
    this.buildPlants(stage);
    this.buildDecor(stage);
    this.fireLight = new THREE.PointLight(new THREE.Color(1.0, 0.45, 0.15), 0, 70, 1.6);
    this.fireLight.position.set(1, 9, -26);
    this.scene.add(this.fireLight);
  }

  // ------------------------------------------------------------------ 作る

  private buildSky(): void {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  private buildLights(stage: StageDef): void {
    // r01-core: 撮影で暗がりの 8 割が真っ黒だったので、空の光を強めた 0.75→2.6、主光 0.35→0.9
    this.scene.add(new THREE.HemisphereLight(new THREE.Color('#6a80c4'), new THREE.Color('#1a1c26'), 2.6));
    const moon = new THREE.DirectionalLight(new THREE.Color('#9fb2e6'), 0.9);
    moon.position.set(60, 80, -10);
    this.scene.add(moon);
    for (const l of stage.lights) {
      const pl = new THREE.PointLight(new THREE.Color(...l.color), l.intensity * l.radius * l.radius * LIGHT_GAIN, l.radius * 1.35, 2);
      pl.position.set(l.pos.x, l.height, l.pos.z);
      this.scene.add(pl);
    }
    // 手提灯の枠：番兵の数ぶんを最初に作り、使わない間は強さ 0（灯りの数を変えるとシェーダーが作り直しになる）
    const n = stage.guards.filter((g) => g.lantern).length;
    for (let i = 0; i < n; i++) {
      const pl = new THREE.PointLight(LANTERN_COLOR, 0, 5 * 1.35, 2);
      this.scene.add(pl);
      this.lanternLights.push(pl);
    }
  }

  private buildGround(stage: StageDef): void {
    const b = stage.bounds;
    const ppm = 8;
    const w = (b.x1 - b.x0) * ppm;
    const h = (b.z1 - b.z0) * ppm;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = SURFACE_COLOR[stage.surfaceDefault];
    g.fillRect(0, 0, w, h);
    for (const s of stage.surfaces) {
      g.fillStyle = SURFACE_COLOR[s.kind];
      g.fillRect((s.rect.x0 - b.x0) * ppm, (s.rect.z0 - b.z0) * ppm, (s.rect.x1 - s.rect.x0) * ppm, (s.rect.z1 - s.rect.z0) * ppm);
    }
    // 暗い場所（竹林・軒下・通り）は、空の明るさの比で地面を暗くする（仮の表示は空の光が一様なので、ここで差を出す）
    for (const d of stage.darkZones) {
      const k = Math.pow(Math.min(1, d.ambient / stage.baseAmbient), 0.6);
      g.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(3)})`;
      g.fillRect((d.rect.x0 - b.x0) * ppm, (d.rect.z0 - b.z0) * ppm, (d.rect.x1 - d.rect.x0) * ppm, (d.rect.z1 - d.rect.z0) * ppm);
    }
    // 粒の揺らぎ（平らに見えないように）
    const r = rng(7);
    for (let i = 0; i < 26000; i++) {
      const a = r() * 0.08;
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
      g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    tex.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    this.scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: '#1d1a17' }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    this.scene.add(outer);
  }

  private addOccluder(m: THREE.Mesh): THREE.Mesh {
    this.seeThroughMaterial(m.material as THREE.Material);
    this.scene.add(m);
    return m;
  }

  /** 材質に、透かしの網点の抜きを足す（シェーダーは一度だけ作る。毎コマは uniform を書き換えるだけ）。 */
  private seeThroughMaterial(mat: THREE.Material): void {
    if (this.patched.has(mat)) return;
    this.patched.add(mat);
    const u = this.seeUniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vSeeDepth;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSeeDepth = -mvPosition.z;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSeeDepth;\nuniform vec2 uSeeCenter;\nuniform float uSeeRadius;\nuniform float uSeeDepth;')
        .replace(
          'void main() {',
          `void main() {
  if (uSeeRadius > 0.0 && vSeeDepth < uSeeDepth - 0.3) {
    float dn = distance(gl_FragCoord.xy, uSeeCenter) / uSeeRadius;
    if (dn < 1.0) {
      vec2 cell = floor(gl_FragCoord.xy / 3.0);
      float pat = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      if (pat > dn * dn * 0.85) discard;
    }
  }`,
        );
    };
    mat.customProgramCacheKey = () => 'kg-see-through';
  }

  private buildWalls(stage: StageDef): void {
    const colors = { dobei: '#8d7b59', itabei: '#3f3026', town: '#2f2b2b' } as const;
    const cap = new THREE.MeshLambertMaterial({ color: '#25272e' });
    for (const w of stage.walls) {
      const dx = w.b.x - w.a.x;
      const dz = w.b.z - w.a.z;
      const len = Math.hypot(dx, dz);
      const y0 = w.crawl ? 0.9 : 0;
      // 外周の町屋の壁は 2.4m に下げて描く（当たりと視線はデータの高さのまま）。構図 start・gate のカメラが
      // 町屋の壁のすぐ外の低い位置にあり、データの高さ 5.5m で描くと画面を塞ぐため。
      // r01-integrate: 構図 start・gate のカメラが通りの内側へ移ったので、町屋の壁を 2.4m に抑える暫定の処置をやめてデータの高さで描く
      const top = w.height;
      const hgt = top - y0;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len + (w.crawl ? 0 : w.thickness), hgt, w.thickness), new THREE.MeshLambertMaterial({ color: colors[w.kind] }));
      mesh.position.set((w.a.x + w.b.x) / 2, y0 + hgt / 2, (w.a.z + w.b.z) / 2);
      mesh.rotation.y = Math.atan2(-dz, dx);
      this.addOccluder(mesh);
      if (w.kind !== 'itabei') {
        const capMesh = new THREE.Mesh(new THREE.BoxGeometry(len + w.thickness + 0.2, 0.28, w.thickness + 0.45), w.kind === 'town' ? new THREE.MeshLambertMaterial({ color: '#1c1d22' }) : cap.clone());
        capMesh.position.set(mesh.position.x, top + 0.1, mesh.position.z);
        capMesh.rotation.y = mesh.rotation.y;
        this.addOccluder(capMesh);
      }
    }
  }

  private buildGates(stage: StageDef): void {
    const wood = new THREE.MeshLambertMaterial({ color: '#3a2a20' });
    for (const g of stage.gates) {
      const f = (g.facingDeg * Math.PI) / 180;
      const ax = -Math.sin(f);
      const az = Math.cos(f);
      const h = g.kind === 'large' ? 4.4 : 3.3;
      for (const s of [1, -1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, h, 10), wood);
        p.position.set(g.center.x + (ax * g.width * s) / 2, h / 2, g.center.z + (az * g.width * s) / 2);
        this.addOccluder(p);
      }
      const roof = new THREE.Mesh(gableRoof(g.width + 1.8, 2.4, 0, 1.1, 'x'), new THREE.MeshLambertMaterial({ color: '#23252c', side: THREE.DoubleSide }));
      roof.position.set(g.center.x, h, g.center.z);
      roof.rotation.y = Math.atan2(-az, ax);
      this.addOccluder(roof);
    }
  }

  private buildBuildings(stage: StageDef): void {
    const bodyColor: Record<string, string> = { hondo: '#5b4737', shoin: '#6b5845', kuri: '#56483a', kura: '#c9c2b2', shoro: '#3a2a20' };
    const roofMat = new THREE.MeshLambertMaterial({ color: '#24262d', side: THREE.DoubleSide });
    for (const b of stage.buildings) {
      const f = b.footprint;
      const w = f.x1 - f.x0;
      const d = f.z1 - f.z0;
      const cx = (f.x0 + f.x1) / 2;
      const cz = (f.z0 + f.z1) / 2;
      if (b.open) {
        const wood = new THREE.MeshLambertMaterial({ color: bodyColor.shoro });
        for (const [x, z] of [[f.x0 + 0.3, f.z0 + 0.3], [f.x1 - 0.3, f.z0 + 0.3], [f.x0 + 0.3, f.z1 - 0.3], [f.x1 - 0.3, f.z1 - 0.3]]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, b.eaveHeight, 8), wood);
          p.position.set(x, b.eaveHeight / 2, z);
          this.scene.add(p);
        }
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.3, 14), new THREE.MeshLambertMaterial({ color: '#3d4a3c' }));
        bell.position.set(cx, b.eaveHeight - 1.1, cz);
        this.scene.add(bell);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, b.eaveHeight, d), new THREE.MeshLambertMaterial({ color: bodyColor[b.kind] ?? '#555' }));
        body.position.set(cx, b.eaveHeight / 2, cz);
        this.addOccluder(body);
        // 正面の障子・窓を内から光らせる
        const glowW = b.kind === 'shoin' ? w * 0.9 : b.kind === 'kuri' ? 3 : 0;
        if (glowW > 0) {
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowW, b.kind === 'shoin' ? 2.1 : 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.34, 0.13) }));
          const off = 0.03;
          if (b.facing === 's') glow.position.set(cx, 1.4, f.z1 + off);
          else if (b.facing === 'n') {
            glow.position.set(cx, 1.4, f.z0 - off);
            glow.rotation.y = Math.PI;
          } else if (b.facing === 'w') {
            glow.position.set(f.x0 - off, 1.6, cz - 4);
            glow.rotation.y = -Math.PI / 2;
          } else {
            glow.position.set(f.x1 + off, 1.6, cz);
            glow.rotation.y = Math.PI / 2;
          }
          this.scene.add(glow);
        }
      }
      const roof = new THREE.Mesh(gableRoof(w + 1.8, d + 1.8, 0, b.ridgeHeight - b.eaveHeight, b.ridgeAxis), roofMat);
      roof.position.set(cx, b.eaveHeight, cz);
      this.addOccluder(roof);
    }
  }

  private buildProps(stage: StageDef): void {
    const stoneMat = new THREE.MeshLambertMaterial({ color: '#6f6f72' });
    const ironMat = new THREE.MeshLambertMaterial({ color: '#2b2622' });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.18) });
    const paperMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.5) });
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#3b2d22' });
    const pineMat = new THREE.MeshLambertMaterial({ color: '#1f3322' });
    for (const p of stage.props) {
      const g = new THREE.Group();
      g.position.set(p.pos.x, 0, p.pos.z);
      g.rotation.y = ((p.rotDeg ?? 0) * Math.PI) / 180;
      const s = p.scale ?? 1;
      switch (p.kind) {
        case 'brazier': {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 6), ironMat);
          leg.position.y = 0.55;
          const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.24, 0.28, 10), ironMat);
          bowl.position.y = 1.15;
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.65, 8), flameMat);
          flame.position.y = 1.6;
          this.flames.push(flame);
          g.add(leg, bowl, flame);
          break;
        }
        case 'stoneLantern': {
          const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), stoneMat);
          base.position.y = 0.15;
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), stoneMat);
          shaft.position.y = 0.55;
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), paperMat);
          box.position.y = 0.98;
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.32, 4), stoneMat);
          roof.position.y = 1.32;
          roof.rotation.y = Math.PI / 4;
          g.add(base, shaft, box, roof);
          break;
        }
        case 'pine': {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 3.2 * s, 7), trunkMat);
          trunk.position.y = 1.6 * s;
          trunk.rotation.z = 0.12;
          g.add(trunk);
          this.seeThroughMaterial(trunkMat);
          this.seeThroughMaterial(pineMat);
          const r = rng(Math.round((p.pos.x + 100) * 37 + (p.pos.z + 100) * 11));
          for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.1 * s, 10, 6), pineMat);
            leaf.scale.set(1.3, 0.45, 1.1);
            leaf.position.set((r() - 0.5) * 2.2 * s, (2.4 + i * 0.75) * s, (r() - 0.5) * 2.2 * s);
            g.add(leaf);
          }
          break;
        }
        case 'rock': {
          const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(0.3, p.radius) * s, 0), stoneMat);
          rock.scale.set(1, 0.65, 1);
          rock.position.y = 0.25 * s;
          g.add(rock);
          break;
        }
        case 'andon': {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.34), paperMat);
          box.position.y = 0.55;
          g.add(box);
          break;
        }
      }
      this.scene.add(g);
    }
  }

  private buildPlants(stage: StageDef): void {
    const bushMat = new THREE.MeshLambertMaterial({ color: '#2c4524' });
    this.seeThroughMaterial(bushMat);
    for (const h of stage.hides) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(h.radius, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), bushMat);
      m.scale.y = 0.85 / h.radius;
      m.position.set(h.center.x, 0, h.center.z);
      this.scene.add(m);
    }
    for (const p of stage.ponds) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshLambertMaterial({ color: '#0d1724', emissive: new THREE.Color('#06101c') }));
      water.rotation.x = -Math.PI / 2;
      water.scale.set(p.rx, p.rz, 1);
      water.position.set(p.center.x, 0.03, p.center.z);
      this.scene.add(water);
    }
    for (const b of stage.bamboo) {
      const area = (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0);
      const n = Math.round(area * b.density);
      const geo = new THREE.CylinderGeometry(0.045, 0.06, 7.5, 5);
      geo.translate(0, 3.75, 0);
      const bambooMat = new THREE.MeshLambertMaterial({ color: '#3d5e35' });
      this.seeThroughMaterial(bambooMat);
      const inst = new THREE.InstancedMesh(geo, bambooMat, n);
      const r = rng(31);
      const m = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < n * 3 && k < n; i++) {
        const x = b.rect.x0 + r() * (b.rect.x1 - b.rect.x0);
        const z = b.rect.z0 + r() * (b.rect.z1 - b.rect.z0);
        // 獣道（x≈-33）には竹を立てない
        if (Math.abs(x + 33) < 1.1) continue;
        m.makeRotationZ((r() - 0.5) * 0.06);
        m.setPosition(x, 0, z);
        inst.setMatrixAt(k++, m);
      }
      inst.count = k;
      this.scene.add(inst);
    }
  }

  private buildDecor(stage: StageDef): void {
    const fire = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.15) });
    const geo = new THREE.BoxGeometry(0.6, 0.9, 0.6);
    const pts: [number, number][] = [];
    const r = rng(5);
    for (const c of stage.decor.armyCamps) {
      for (let x = c.x0; x < c.x1; x += 7) for (let z = c.z0; z < c.z1; z += 9) pts.push([x + r() * 4, z + r() * 4]);
    }
    const inst = new THREE.InstancedMesh(geo, fire, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => inst.setMatrixAt(i, m.makeTranslation(x, 0.6, z)));
    this.scene.add(inst);
    const cloth = new THREE.MeshLambertMaterial({ color: '#d8d4c8', emissive: new THREE.Color('#202430') });
    for (const b of stage.decor.banners) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.5, 5), new THREE.MeshLambertMaterial({ color: '#2a221c' }));
      pole.position.set(b.x, 2.25, b.z);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.04), cloth);
      flag.position.set(b.x + 0.5, 3.0, b.z);
      this.scene.add(pole, flag);
    }
    // 山並み：東（mountainsDeg の幅）は高く、ほかは低い。霧を受けない影
    const mtn = new THREE.MeshBasicMaterial({ color: '#070912', fog: false });
    const [m0, m1] = stage.decor.mountainsDeg;
    for (let a = -180; a < 180; a += 9) {
      const east = a >= m0 && a <= m1;
      const h = east ? 34 + 14 * Math.sin(a * 0.11) : 14 + 6 * Math.sin(a * 0.3);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(east ? 48 : 40, h, 5), mtn);
      const rad = (a * Math.PI) / 180;
      cone.position.set(Math.cos(rad) * 260, h / 2 - 2, Math.sin(rad) * 260);
      this.scene.add(cone);
    }
  }

  // ------------------------------------------------------------------ 人物

  private makeChar(c: CharacterSnap): CharVis {
    const root = new THREE.Group();
    const pose = new THREE.Group();
    root.add(pose);
    const bodyMat = new THREE.MeshLambertMaterial({ color: KIND_COLOR[c.kind] });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.0, 4, 10), bodyMat);
    body.position.y = 0.77;
    pose.add(body);
    const head = new THREE.Group();
    head.position.y = 1.38;
    pose.add(head);
    // 向きの印：頭の前に明るい箱
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), new THREE.MeshBasicMaterial({ color: c.kind === 'nobunaga' ? '#8a7a5a' : '#e9dfc4' }));
    nose.position.set(0, 0, 0.27);
    head.add(nose);
    if (c.kind === 'ashigaru') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.22, 12), new THREE.MeshLambertMaterial({ color: '#141418' }));
      hat.position.y = 0.26;
      head.add(hat);
    }
    if (c.pose.weapon === 'spear') {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 3.0, 5), new THREE.MeshLambertMaterial({ color: '#4a3a2a' }));
      spear.position.set(0.32, 1.35, 0.1);
      pose.add(spear);
    } else if (c.pose.weapon === 'katana') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.85), new THREE.MeshLambertMaterial({ color: '#1a1a1e' }));
      blade.position.set(0.3, 0.85, 0);
      blade.rotation.x = 0.4;
      pose.add(blade);
    }
    // 手提灯：番兵の前 0.35m・右 0.2m・高さ 0.9m（モデルは +Z が正面、右は −X）
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.48) }));
    lantern.position.set(-0.2, 0.9, 0.35);
    lantern.visible = false;
    root.add(lantern);
    let stool: THREE.Mesh | null = null;
    if (c.kind === 'nobunaga') {
      stool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.42), new THREE.MeshLambertMaterial({ color: '#2a2018' }));
      stool.position.y = 0.21;
      root.add(stool);
    }
    this.scene.add(root);
    return { root, pose, head, body, bodyMat, lantern, stool, kind: c.kind };
  }

  private updateChar(v: CharVis, c: CharacterSnap): void {
    v.root.position.set(c.x, 0, c.z);
    v.root.rotation.y = rotYFromYaw(c.yaw);
    v.head.rotation.y = -c.pose.headYaw;
    v.lantern.visible = c.pose.lantern;
    // 構え：しゃがむ・座る・居眠りは縮め、倒れたら横に寝かせる
    let sy = 1;
    let lean = 0;
    let lie = 0;
    let liftY = 0;
    switch (c.pose.stance) {
      case 'crouch':
        sy = 0.62;
        break;
      case 'sit':
        sy = 0.66;
        liftY = 0.12;
        break;
      case 'doze':
        sy = 0.55;
        lean = 0.35 + 0.08 * Math.sin(this.time * 1.3);
        break;
      case 'down':
        lie = 1;
        break;
    }
    const a = c.pose.action;
    if (a && (a.kind === 'takedownVictim' || a.kind === 'struck')) lie = Math.max(lie, a.t);
    if (a && a.kind === 'assassinateVictim') {
      lean = Math.max(lean, (Math.PI / 2) * a.t);
      lie = 0;
    }
    v.pose.scale.set(1, sy, 1);
    v.pose.position.y = liftY + lie * 0.27;
    v.pose.rotation.set(lean, 0, (lie * Math.PI) / 2);
    const em = c.pose.awareness === 'alert' ? '#5a0c08' : c.pose.awareness === 'suspicious' ? '#3a2a06' : '#000000';
    v.bodyMat.emissive.set(em);
  }

  // ------------------------------------------------------------------ 毎コマ

  update(dt: number, snap: SimSnapshot, camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.time += dt;
    const seen = new Set<string>();
    this.hasPlayer = false;
    for (const c of snap.characters) {
      let v = this.chars.get(c.id);
      if (!v) {
        v = this.makeChar(c);
        this.chars.set(c.id, v);
      }
      v.root.visible = true;
      this.updateChar(v, c);
      seen.add(c.id);
      if (c.kind === 'player') {
        this.playerPos.set(c.x, 1.0, c.z);
        this.hasPlayer = true;
      }
    }
    for (const [id, v] of this.chars) if (!seen.has(id)) v.root.visible = false;
    this.lanternLights.forEach((pl, i) => {
      const l = snap.lights[i];
      if (l) {
        pl.position.set(l.x, l.y, l.z);
        pl.intensity = l.intensity * l.radius * l.radius * LIGHT_GAIN;
      } else {
        pl.intensity = 0;
      }
    });
    // 篝火の揺れ（見た目だけ）
    this.flames.forEach((f, i) => f.scale.set(1, 0.85 + 0.2 * Math.sin(this.time * 9 + i * 1.7), 1));
    const fin = snap.finale ?? 0;
    const fire = Math.max(0, Math.min(1, (fin - 0.2) / 0.8));
    this.skyUniforms.uFire.value = fire;
    this.fireLight.intensity = fire * 9000;
    // 演出の全景では透かしを切る
    if (snap.finale !== null) this.hasPlayer = false;
    this.seeThrough(camera);
  }

  /** 透かしの円の中心と半径（画面の画素）と、プレイヤーの奥行きを、カメラから決める。 */
  private seeThrough(camera: THREE.PerspectiveCamera): void {
    const u = this.seeUniforms;
    if (!this.hasPlayer) {
      u.uSeeRadius.value = 0;
      return;
    }
    const size = this.renderer.getDrawingBufferSize(this.tmpV2);
    const ndc = this.tmpV3.copy(this.playerPos).project(camera);
    if (ndc.z > 1 || ndc.z < -1) {
      u.uSeeRadius.value = 0;
      return;
    }
    u.uSeeCenter.value.set((ndc.x * 0.5 + 0.5) * size.x, (ndc.y * 0.5 + 0.5) * size.y);
    u.uSeeRadius.value = size.y * 0.15;
    u.uSeeDepth.value = -this.tmpV3.copy(this.playerPos).applyMatrix4(camera.matrixWorldInverse).z;
  }

  render(): void {
    if (!this.camera) return;
    this.renderer.render(this.scene, this.camera);
    this.lastStats = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  stats(): { calls: number; triangles: number; programs: number } {
    return { ...this.lastStats, programs: this.renderer.info.programs?.length ?? 0 };
  }

  whenReady(): Promise<void> {
    return Promise.resolve();
  }

  /** 仮の表示は積算する物が無いので、重ねと HUD が新しい状態で描かれるまでの数コマだけ待つ。 */
  setShotMode(): number {
    return 3;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}
