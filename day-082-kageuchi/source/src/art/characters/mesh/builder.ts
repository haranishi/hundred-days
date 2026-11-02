// OWNER: chars-art
// 部品（three の形）を、休みの姿勢の位置へ置いて1つの形にまとめる。頂点ごとに、色・材質の性質（粗さ・金属・発光）・
// アトラスの UV・骨の重みを持たせるので、人物1人を1つの材質と1回の描画命令で描ける。
// 骨の重みは3通り：1本の骨に固定（硬い部品）／近い骨の線分ほど強く効かせる包み（布が関節で曲がる）／関数で決める。
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { region, regionUV, type Region, type RegionName } from './atlas';

export interface Surf {
  r: number;
  m: number;
  /** 発光の係数（提灯の紙だけ）。 */
  e?: number;
  /** r07-chars: 0=無加工、1=織り布、2=漆、3=研磨金属、4=覆面（目の開口は肌）。 */
  detail?: number;
}

export type Skin =
  | { bone: number }
  | { envelope: readonly number[]; sharp?: number; bias?: Partial<Record<number, number>> }
  | { fn: (p: Vector3) => readonly (readonly [number, number])[] };

/** UV の決め方。geom は形の UV（v=0 が下）をそのまま区画へ。ほかは休みの姿勢の位置から投影する。 */
export type UVMap =
  | { kind: 'geom'; flipV?: boolean; su?: number; sv?: number }
  | { kind: 'front'; cx: number; cy: number; w: number; h: number }
  | { kind: 'top'; cx: number; cz: number; d: number }
  | { kind: 'cyl'; cx: number; cz: number; scale: number; y0: number }
  | { kind: 'flat' };

export interface PartOpts {
  color: number;
  surf: Surf;
  skin: Skin;
  region?: RegionName;
  uv?: UVMap;
  /** 位置と向きを休みの姿勢へ移す行列（省略なら単位）。 */
  matrix?: Matrix4;
}

/** 骨の線分（休みの姿勢、base から見た位置）。包みの重みで、頂点から線分までの距離を測る。 */
export interface BoneSegment {
  a: Vector3;
  b: Vector3;
}

const _p = new Vector3();
const _n = new Vector3();
const _ab = new Vector3();
const _ap = new Vector3();
const _color = new Color();
const _nm = new Matrix3();
const _uv: [number, number] = [0, 0];

function distToSegment(p: Vector3, s: BoneSegment): number {
  _ab.subVectors(s.b, s.a);
  _ap.subVectors(p, s.a);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, _ap.dot(_ab) / len2)) : 0;
  return _ap.addScaledVector(_ab, -t).length();
}

export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private surf: number[] = [];
  private detail: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];
  private count = 0;

  constructor(private readonly segments: readonly BoneSegment[]) {}

  get vertexCount(): number {
    return this.count;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  add(geom: BufferGeometry, o: PartOpts): void {
    const g = geom.index ? geom : geom;
    const P = g.getAttribute('position') as BufferAttribute;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const N = g.getAttribute('normal') as BufferAttribute;
    const U = g.getAttribute('uv') as BufferAttribute | undefined;
    const m = o.matrix ?? null;
    if (m) _nm.getNormalMatrix(m);
    const reg: Region = region(o.region ?? 'white');
    const uvm: UVMap = o.uv ?? { kind: o.region && o.region !== 'white' ? 'geom' : 'flat' };
    _color.setHex(o.color);
    const e = o.surf.e ?? 0;
    const base = this.count;
    const weights: [number, number][] = [];
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      if (m) {
        _p.applyMatrix4(m);
        _n.applyMatrix3(_nm).normalize();
      }
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      // UV（アトラスの区画の中へ）
      switch (uvm.kind) {
        case 'geom': {
          const u = U ? U.getX(i) : 0;
          const v = U ? U.getY(i) : 0;
          const s = (u * (uvm.su ?? 1)) % 1.0001;
          const tv = v * (uvm.sv ?? 1);
          regionUV(reg, s, uvm.flipV ? tv : 1 - tv, _uv);
          break;
        }
        case 'front':
          regionUV(reg, 0.5 + (_p.x - uvm.cx) / uvm.w, 0.5 - (_p.y - uvm.cy) / uvm.h, _uv);
          break;
        case 'top':
          regionUV(reg, 0.5 + (_p.x - uvm.cx) / uvm.d, 0.5 + (_p.z - uvm.cz) / uvm.d, _uv);
          break;
        case 'cyl': {
          const ang = Math.atan2(_p.x - uvm.cx, _p.z - uvm.cz); // 正面が 0
          const r = Math.hypot(_p.x - uvm.cx, _p.z - uvm.cz);
          regionUV(reg, 0.5 + (ang * Math.max(0.05, r)) / uvm.scale, (uvm.y0 - _p.y) / uvm.scale, _uv);
          break;
        }
        default:
          regionUV(reg, 0.5, 0.5, _uv);
      }
      this.uv.push(_uv[0], _uv[1]);
      this.col.push(_color.r, _color.g, _color.b);
      this.surf.push(o.surf.r, o.surf.m, e);
      this.detail.push(o.surf.detail ?? 0);
      // 骨の重み
      weights.length = 0;
      const sk = o.skin;
      if ('bone' in sk) {
        weights.push([sk.bone, 1]);
      } else if ('fn' in sk) {
        for (const [b, w] of sk.fn(_p)) weights.push([b, w]);
      } else {
        const sharp = sk.sharp ?? 4;
        for (const b of sk.envelope) {
          const d = distToSegment(_p, this.segments[b]);
          const bias = sk.bias?.[b] ?? 1;
          weights.push([b, bias / (Math.pow(d + 0.004, sharp) + 1e-12)]);
        }
      }
      weights.sort((a, b) => b[1] - a[1]);
      let sum = 0;
      for (let k = 0; k < 4 && k < weights.length; k++) sum += weights[k][1];
      for (let k = 0; k < 4; k++) {
        if (k < weights.length && sum > 0) {
          this.si.push(weights[k][0]);
          this.sw.push(weights[k][1] / sum);
        } else {
          this.si.push(0);
          this.sw.push(0);
        }
      }
      this.count++;
    }
    if (g.index) {
      const I = g.index;
      for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
    } else {
      for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSurf', new Float32BufferAttribute(this.surf, 3));
    g.setAttribute('aDetail', new Float32BufferAttribute(this.detail, 1));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    return g;
  }
}
