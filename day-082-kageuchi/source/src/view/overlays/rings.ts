// OWNER: core
// 物音の輪（出てから 1 秒で消える）・小石の放物線と着地の輪（狙っている間）・飛んでいる小石。
// r02-fix-play:
//   足音の輪 旧：半径に比例して太る白い帯（走りの 7m で幅 0.5m。路面に引いた白線に見えた）
//            新：画面で約 2px の細い線。外へ広がりながら消える（半径は 0.55 秒で届き、届く前から薄れ始める）
//   狙いの輪と放物線 旧：深さで隠れる（門の屋根の下の着地点が見えない）
//                  新：深さで隠さない写しを薄く先に描き、その上に深さで隠れる本体を描く（遮られた所は薄く見える）
import * as THREE from 'three';
import type { NoiseSnap, SimSnapshot, StoneSnap } from '../../contract/snapshot';
import { NOISE, STONE } from '../../config/rules';
import { OVERLAY } from '../../config/view';

const RING_POOL = 40;
const ARC_POINTS = 32;

/** 足音の輪：板の上で、中心からの距離（m）が半径に一致する所だけを、画面で一定の太さの線として描く。 */
const RING_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uScale;
uniform float uRadius;
uniform float uWidthPx;
varying vec2 vP;
void main() {
  float d = length(vP) * uScale;
  float px = max(fwidth(d), 1e-4);
  float a = 1.0 - smoothstep(0.5 * uWidthPx * px, (0.5 * uWidthPx + 1.0) * px, abs(d - uRadius));
  a *= uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class NoiseLayer {
  private readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly geo: THREE.PlaneGeometry;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'noise';
    parent.add(this.group);
    // 板は半径 1 の円を覆う正方形。拡大の倍率を uScale に渡す
    this.geo = new THREE.PlaneGeometry(2, 2);
    this.geo.rotateX(-Math.PI / 2);
    const R = OVERLAY.noiseRing;
    for (let i = 0; i < RING_POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(...R.color) },
          uOpacity: { value: 0 },
          uScale: { value: 1 },
          uRadius: { value: 1 },
          uWidthPx: { value: R.widthPx },
        },
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const m = new THREE.Mesh(this.geo, mat);
      m.renderOrder = 4;
      m.visible = false;
      m.frustumCulled = false;
      this.rings.push(m);
      this.group.add(m);
    }
  }

  update(noises: readonly NoiseSnap[]): void {
    const R = OVERLAY.noiseRing;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const n = noises[noises.length - 1 - i];
      if (!n || n.age >= NOISE.ringLife) {
        r.visible = false;
        continue;
      }
      const u = n.age / NOISE.ringLife;
      // 広がる：growTime 秒で半径に届く（はじめ速く、届く間際はゆっくり）
      const g = Math.min(1, n.age / R.growTime);
      const radius = n.radius * (R.startFrac + (1 - R.startFrac) * (1 - (1 - g) * (1 - g)));
      // 消える：広がっている途中から薄れ始める
      const fade = 1 - smoothstep(R.fadeFrom, 1, u);
      const scale = radius + 0.5;
      r.scale.set(scale, 1, scale);
      r.position.set(n.x, 0.08, n.z);
      const un = (r.material as THREE.ShaderMaterial).uniforms;
      un.uScale.value = scale;
      un.uRadius.value = radius;
      un.uOpacity.value = R.opacity * fade;
      r.visible = true;
    }
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  dispose(): void {
    this.geo.dispose();
    for (const r of this.rings) (r.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 深さで隠れる本体と、深さで隠さない薄い写し（遮られた所だけ薄く見える）の組。 */
interface Pair<T extends THREE.Object3D> {
  front: T;
  ghost: T;
}

function basicPair(geo: THREE.BufferGeometry, order: number): Pair<THREE.Mesh> {
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false }));
  const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
  front.renderOrder = order + 1;
  ghost.renderOrder = order;
  return { front, ghost };
}

export class AimLayer {
  private readonly group = new THREE.Group();
  private readonly arc: Pair<THREE.Line>;
  private readonly arcPos: THREE.BufferAttribute;
  private readonly arcMat = new THREE.LineDashedMaterial({ dashSize: 0.35, gapSize: 0.2, transparent: true, depthWrite: false, fog: false });
  private readonly arcGhostMat = new THREE.LineDashedMaterial({ dashSize: 0.35, gapSize: 0.2, transparent: true, depthWrite: false, depthTest: false, fog: false });
  private readonly target: Pair<THREE.Mesh>;
  private readonly reach: Pair<THREE.Mesh>;
  private readonly stones: THREE.Mesh[] = [];
  private readonly valid = new THREE.Color('#c9a75b');
  private readonly invalid = new THREE.Color('#8a5048');

  constructor(parent: THREE.Object3D) {
    this.group.name = 'aim';
    parent.add(this.group);
    const geo = new THREE.BufferGeometry();
    this.arcPos = new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3);
    this.arcPos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.arcPos);
    this.arc = { front: new THREE.Line(geo, this.arcMat), ghost: new THREE.Line(geo, this.arcGhostMat) };
    this.arc.front.renderOrder = 6;
    this.arc.ghost.renderOrder = 5;
    const tgeo = new THREE.RingGeometry(0.32, 0.45, 40);
    tgeo.rotateX(-Math.PI / 2);
    this.target = basicPair(tgeo, 5);
    // 着地の音が届く範囲（半径 9m）
    const rgeo = new THREE.RingGeometry(0.985, 1.0, 96);
    rgeo.rotateX(-Math.PI / 2);
    this.reach = basicPair(rgeo, 5);
    for (const m of [this.reach.front, this.reach.ghost]) m.scale.set(NOISE.stone, 1, NOISE.stone);
    for (const o of [this.arc.front, this.arc.ghost, this.target.front, this.target.ghost, this.reach.front, this.reach.ghost]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    const sgeo = new THREE.SphereGeometry(0.07, 8, 6);
    const smat = new THREE.MeshBasicMaterial({ color: '#c9c3b5', fog: false });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(sgeo, smat);
      s.visible = false;
      this.stones.push(s);
      this.group.add(s);
    }
  }

  private show(on: boolean): void {
    for (const o of [this.arc.front, this.arc.ghost, this.target.front, this.target.ghost, this.reach.front, this.reach.ghost]) o.visible = on;
  }

  update(snap: SimSnapshot): void {
    const aim = snap.aim;
    const p = snap.characters.find((c) => c.kind === 'player');
    const show = !!aim && !!p;
    this.show(show);
    if (show && aim && p) {
      const A = OVERLAY.aim;
      const color = aim.valid ? this.valid : this.invalid;
      const set = (pair: Pair<THREE.Mesh>, opacity: number): void => {
        const f = pair.front.material as THREE.MeshBasicMaterial;
        const g = pair.ghost.material as THREE.MeshBasicMaterial;
        f.color.copy(color);
        g.color.copy(color);
        f.opacity = opacity;
        g.opacity = opacity * A.hidden;
      };
      this.arcMat.color.copy(color);
      this.arcGhostMat.color.copy(color);
      this.arcMat.opacity = aim.valid ? 0.95 : 0.6;
      this.arcGhostMat.opacity = this.arcMat.opacity * A.hidden;
      set(this.target, 0.9);
      set(this.reach, aim.valid ? 0.32 : 0.12);
      const a = this.arcPos.array as Float32Array;
      for (let i = 0; i < ARC_POINTS; i++) {
        const u = i / (ARC_POINTS - 1);
        a[i * 3] = p.x + (aim.x - p.x) * u;
        a[i * 3 + 1] = STONE.releaseHeight + (0.05 - STONE.releaseHeight) * u + 4 * STONE.arcHeight * u * (1 - u);
        a[i * 3 + 2] = p.z + (aim.z - p.z) * u;
      }
      this.arcPos.needsUpdate = true;
      // 線の長さの属性は形を分け合う写しにも効く
      this.arc.front.computeLineDistances();
      for (const m of [this.target.front, this.target.ghost, this.reach.front, this.reach.ghost]) m.position.set(aim.x, 0.07, aim.z);
    }
    this.updateStones(snap.stones);
  }

  private updateStones(stones: readonly StoneSnap[]): void {
    this.stones.forEach((m, i) => {
      const s = stones[i];
      m.visible = !!s;
      if (s) m.position.set(s.x, s.y, s.z);
    });
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  dispose(): void {
    this.arc.front.geometry.dispose();
    this.arcMat.dispose();
    this.arcGhostMat.dispose();
    this.target.front.geometry.dispose();
    this.reach.front.geometry.dispose();
    for (const pair of [this.target, this.reach]) {
      (pair.front.material as THREE.Material).dispose();
      (pair.ghost.material as THREE.Material).dispose();
    }
    this.stones[0]?.geometry.dispose();
    (this.stones[0]?.material as THREE.Material | undefined)?.dispose();
    this.group.removeFromParent();
  }
}
