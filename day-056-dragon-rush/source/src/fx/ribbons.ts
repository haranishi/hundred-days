// OWNER: fx
// 帯（折れ線に幅を付けた面）をまとめて1つのメッシュで描く（r03-roster）。雷の筋はカメラを向く帯、地割れの筋は地面に寝た帯。
// 帯は生まれた時刻と寿命を持ち、毎コマ頂点を書き直す（数十本・数千頂点まで）。足す合成（光る筋）と掛ける合成（黒い裂け目）がある。
// 何も無いときは描かない（visible = false）ので、紅竜で遊ぶ間は描画命令が増えない。
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  SrcColorFactor,
  Vector3,
  ZeroFactor,
  type Camera,
} from 'three';
import { FX_LAYER } from '../render/softParticles';

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSide;
varying vec4 vColor;
varying float vSide;
void main() {
  vColor = aColor;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 );
}
`;

// 帯の縁ほど弱く（横の断面は丸い山）。足す合成は色 × 明るさ、掛ける合成は 1 から色の暗さへ
const FRAG_ADD = /* glsl */ `
varying vec4 vColor;
varying float vSide;
void main() {
  float e = 1.0 - abs( vSide );
  float a = e * e * ( 3.0 - 2.0 * e );
  gl_FragColor = vec4( vColor.rgb * ( vColor.a * a ), 1.0 );
}
`;

const FRAG_MUL = /* glsl */ `
varying vec4 vColor;
varying float vSide;
void main() {
  float e = 1.0 - abs( vSide );
  float a = e * e * ( 3.0 - 2.0 * e );
  gl_FragColor = vec4( mix( vec3( 1.0 ), vColor.rgb, vColor.a * a ), 1.0 );
}
`;

export interface Ribbon {
  /** 折れ線の点（x, y, z の並び） */
  points: number[];
  width: number;
  color: readonly [number, number, number];
  /** 生まれた時刻と寿命（秒） */
  born: number;
  life: number;
  /** またたき（Hz。0 で一定）と、始めの明るさを保つ秒数（その後、寿命の終わりへ弱まる） */
  flickerHz: number;
  hold: number;
  /** 地面に寝た帯（地割れ）。false ならカメラを向く帯（雷） */
  flat: boolean;
  /** 始点から終点へ伸びる秒数（0 で最初から全部） */
  grow: number;
  /** 始点の点を毎コマ置き直す（雷の出どころを頭の動きに付いて行かせる）。null なら動かさない */
  anchor: (() => Vector3) | null;
  /** 先へ細くする（雷の枝） */
  taper: boolean;
}

const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _v = new Vector3();
const _n = new Vector3();

export class RibbonField {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly ribbons: Ribbon[] = [];
  private readonly pos: BufferAttribute;
  private readonly col: BufferAttribute;
  private readonly side: BufferAttribute;
  private primed = false;

  constructor(
    private readonly maxVerts: number,
    blend: 'add' | 'multiply',
    name: string,
  ) {
    const g = new BufferGeometry();
    const make = (n: number): BufferAttribute => {
      const a = new BufferAttribute(new Float32Array(maxVerts * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = make(3);
    this.col = make(4);
    this.side = make(1);
    g.setAttribute('position', this.pos);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aSide', this.side);
    const idx = new Uint32Array((maxVerts / 2) * 6);
    for (let q = 0; q < maxVerts / 2 - 1; q++) {
      const o = q * 6;
      const v = q * 2;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v + 1;
      idx[o + 4] = v + 3;
      idx[o + 5] = v + 2;
    }
    g.setIndex(new BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: blend === 'add' ? FRAG_ADD : FRAG_MUL,
      transparent: true,
      depthWrite: false,
      side: 2,
      blending: blend === 'add' ? AdditiveBlending : CustomBlending,
      ...(blend === 'multiply' ? { blendSrc: ZeroFactor, blendDst: SrcColorFactor } : {}),
      ...(blend === 'multiply' ? { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } : {}),
    });
    material.name = name;
    this.mesh = new Mesh(g, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = blend === 'add' ? 11 : 6;
    this.mesh.visible = false;
    // r04-fx2（引き継ぎ）：光る帯（雷）は火の粉と同じ順（11）で煙の後に描くため、粒子と同じ別のパス（FxPass）で描く。黒い裂け目は地面の一部なので層 0 のまま
    if (blend === 'add') this.mesh.layers.set(FX_LAYER);
  }

  get count(): number {
    return this.ribbons.length;
  }

  add(r: Ribbon): void {
    this.ribbons.push(r);
    // 古いものから捨てる（頂点の上限を超えないように）
    let verts = this.ribbons.reduce((s, x) => s + (x.points.length / 3) * 2 + 4, 0);
    while (verts > this.maxVerts && this.ribbons.length > 1) {
      const old = this.ribbons.shift() as Ribbon;
      verts -= (old.points.length / 3) * 2 + 4;
    }
  }

  clear(): void {
    this.ribbons.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.visible = this.primed;
  }

  /** シェーダーを先に作らせるため、見えない小さな帯を1本だけ置く。 */
  prime(on: boolean): void {
    this.primed = on;
    if (on) {
      const p = this.pos.array as Float32Array;
      p.fill(0, 0, 12);
      (this.col.array as Float32Array).fill(0, 0, 16);
      this.pos.needsUpdate = true;
      this.col.needsUpdate = true;
      this.mesh.geometry.setDrawRange(0, 6);
    }
    this.mesh.visible = on || this.ribbons.length > 0;
  }

  /** 時刻 time の姿で頂点を書き直す（寿命の尽きた帯は捨てる）。 */
  update(time: number, camera: Camera): void {
    for (let i = this.ribbons.length - 1; i >= 0; i--) if (time - this.ribbons[i].born > this.ribbons[i].life) this.ribbons.splice(i, 1);
    const pos = this.pos.array as Float32Array;
    const col = this.col.array as Float32Array;
    const sid = this.side.array as Float32Array;
    let v = 0;
    const cam = camera.position;
    /** 頂点を1つ書く */
    const put = (x: number, y: number, z: number, r: number, g: number, b: number, a: number, sd: number): void => {
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      col[v * 4] = r;
      col[v * 4 + 1] = g;
      col[v * 4 + 2] = b;
      col[v * 4 + 3] = a;
      sid[v] = sd;
      v++;
    };
    for (const r of this.ribbons) {
      const n = r.points.length / 3;
      if (n < 2 || v + n * 2 + 4 > this.maxVerts) continue;
      const age = time - r.born;
      const fade = age < r.hold ? 1 : Math.max(0, 1 - (age - r.hold) / Math.max(1e-3, r.life - r.hold));
      const flick = r.flickerHz > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(age * r.flickerHz * Math.PI + r.born * 17.3)) : 1;
      const k = fade * flick;
      const shown = r.grow > 0 ? Math.min(1, age / r.grow) : 1;
      const last = Math.max(1, Math.min(n - 1, Math.ceil(shown * (n - 1))));
      if (r.anchor) {
        const a = r.anchor();
        r.points[0] = a.x;
        r.points[1] = a.y;
        r.points[2] = a.z;
      }
      // 帯と帯の間は、始点と終点を2つずつ重ねた頂点で切り離す（面積の無い三角形になり、帯どうしをつなぐ面が出ない）
      const first = v;
      v += 2;
      for (let i = 0; i <= last; i++) {
        _a.set(r.points[i * 3], r.points[i * 3 + 1], r.points[i * 3 + 2]);
        const j0 = Math.max(0, i - 1);
        const j1 = Math.min(last, i + 1);
        _d.set(r.points[j1 * 3] - r.points[j0 * 3], r.points[j1 * 3 + 1] - r.points[j0 * 3 + 1], r.points[j1 * 3 + 2] - r.points[j0 * 3 + 2]).normalize();
        if (r.flat) _n.set(-_d.z, 0, _d.x).normalize();
        else {
          _v.subVectors(cam, _a);
          _n.crossVectors(_d, _v).normalize();
        }
        const w = (r.width * (r.taper ? 1 - (0.85 * i) / Math.max(1, n - 1) : 1)) / 2;
        for (const sd of [-1, 1]) {
          _b.copy(_a).addScaledVector(_n, sd * w);
          put(_b.x, _b.y, _b.z, r.color[0], r.color[1], r.color[2], k, sd);
        }
      }
      // 先頭の切り離し（最初の頂点を2つ）と、末尾の切り離し（最後の頂点を2つ）
      for (let q = 0; q < 2; q++) {
        pos.copyWithin((first + q) * 3, (first + 2) * 3, (first + 3) * 3);
        col.copyWithin((first + q) * 4, (first + 2) * 4, (first + 3) * 4);
        sid[first + q] = -1;
      }
      const lx = pos[(v - 1) * 3];
      const ly = pos[(v - 1) * 3 + 1];
      const lz = pos[(v - 1) * 3 + 2];
      put(lx, ly, lz, 0, 0, 0, 0, 1);
      put(lx, ly, lz, 0, 0, 0, 0, 1);
    }
    const quads = Math.max(0, v / 2 - 1);
    this.mesh.geometry.setDrawRange(0, quads * 6);
    for (const a of [this.pos, this.col, this.side]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, v) * a.itemSize);
      a.needsUpdate = true;
    }
    this.mesh.visible = this.primed || v > 0;
  }
}
