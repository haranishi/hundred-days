// OWNER: world-art
// 形の組み立て道具。材質ごとに1つの MeshBuilder へ、箱・円柱・面・格子を足していき、最後に1つのジオメトリにまとめる
// （静的な物は材質ごとに1回の描画で済ませる）。uv はメートル単位で、シェーダーが寸法どおりの模様を描ける。
// aKg（vec4）は材質ごとの意味を持つ追加の属性（部位の番号・種など）。
import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Vector3 } from 'three';

export type V3 = [number, number, number];

const _p = new Vector3();
const _n = new Vector3();
const _nm = new Matrix3();

export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly kgv: number[] = [];
  private readonly lightIndices: number[] = [];
  private readonly idx: number[] = [];
  /** これから足す頂点の aKg */
  kg: [number, number, number, number] = [0, 0, 0, 0];
  /** 発光面が従う stage.lights の番号。-1 は独立した発光（町屋・炎）。 */
  lightIndex = -1;
  /** これから足す頂点に掛ける変換（null なら恒等） */
  private matrix: Matrix4 | null = null;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  setMatrix(m: Matrix4 | null): this {
    this.matrix = m;
    if (m) _nm.getNormalMatrix(m);
    return this;
  }

  private vertex(p: V3, n: V3, u: number, v: number): number {
    _p.set(p[0], p[1], p[2]);
    _n.set(n[0], n[1], n[2]);
    if (this.matrix) {
      _p.applyMatrix4(this.matrix);
      _n.applyMatrix3(_nm).normalize();
    }
    this.pos.push(_p.x, _p.y, _p.z);
    this.nor.push(_n.x, _n.y, _n.z);
    this.uv.push(u, v);
    this.kgv.push(this.kg[0], this.kg[1], this.kg[2], this.kg[3]);
    this.lightIndices.push(this.lightIndex);
    return this.pos.length / 3 - 1;
  }

  /** 四角形（反時計回りが表）。uv は各頂点に与える。 */
  quad(a: V3, b: V3, c: V3, d: V3, uvs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]], normal?: V3): this {
    const n = normal ?? faceNormal(a, b, c);
    const i0 = this.vertex(a, n, uvs[0][0], uvs[0][1]);
    const i1 = this.vertex(b, n, uvs[1][0], uvs[1][1]);
    const i2 = this.vertex(c, n, uvs[2][0], uvs[2][1]);
    const i3 = this.vertex(d, n, uvs[3][0], uvs[3][1]);
    this.idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  tri(a: V3, b: V3, c: V3, uvs: [number, number][] = [[0, 0], [1, 0], [0.5, 1]]): this {
    const n = faceNormal(a, b, c);
    const i0 = this.vertex(a, n, uvs[0][0], uvs[0][1]);
    const i1 = this.vertex(b, n, uvs[1][0], uvs[1][1]);
    const i2 = this.vertex(c, n, uvs[2][0], uvs[2][1]);
    this.idx.push(i0, i1, i2);
    return this;
  }

  /**
   * 軸に沿った箱（中心 c、大きさ s）。faces で面を選べる（'px','nx','py','ny','pz','nz'）。
   * uv は各面の横（m）と縦（m）。縦の面の v はワールドの高さ（y）にそろえる（模様の高さが箱をまたいでそろう）。
   */
  box(c: V3, s: V3, faces = 'px,nx,py,ny,pz,nz'): this {
    const [cx, cy, cz] = c;
    const hx = s[0] / 2;
    const hy = s[1] / 2;
    const hz = s[2] / 2;
    const x0 = cx - hx;
    const x1 = cx + hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const z0 = cz - hz;
    const z1 = cz + hz;
    const f = new Set(faces.split(','));
    if (f.has('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [0, 0, 1]);
    if (f.has('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]], [0, 0, -1]);
    if (f.has('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]], [1, 0, 0]);
    if (f.has('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], [-1, 0, 0]);
    if (f.has('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], [0, 1, 0]);
    if (f.has('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [0, -1, 0]);
    return this;
  }

  /** 縦の円柱（中心 x,z、下端 y0、高さ h、上下の半径 r0/r1）。uv は（周の長さ m、高さ m）。 */
  cylinder(x: number, y0: number, z: number, r0: number, r1: number, h: number, segments: number, caps = true): this {
    const base = this.vertexCount;
    const slope = (r0 - r1) / h;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const n: V3 = normalize3([ca, slope, sa]);
      const u = a * (r0 + r1) * 0.5;
      this.vertex([x + ca * r0, y0, z + sa * r0], n, u, y0);
      this.vertex([x + ca * r1, y0 + h, z + sa * r1], n, u, y0 + h);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (caps) {
      const top = this.vertex([x, y0 + h, z], [0, 1, 0], x, -z);
      const ring = this.vertexCount;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        this.vertex([x + Math.cos(a) * r1, y0 + h, z + Math.sin(a) * r1], [0, 1, 0], x + Math.cos(a) * r1, -(z + Math.sin(a) * r1));
      }
      for (let i = 0; i < segments; i++) this.idx.push(top, ring + ((i + 1) % segments), ring + i);
    }
    return this;
  }

  /**
   * 格子の面。fn(i/nu, j/nv) が位置と uv を返す。法線は隣の点から求める（向きは (du × dv)）。
   * flip で表裏を返す。
   */
  grid(nu: number, nv: number, fn: (u: number, v: number) => { p: V3; uv: [number, number] }, flip = false): this {
    const pts: { p: V3; uv: [number, number] }[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pts.push(fn(i / nu, j / nv));
    const at = (i: number, j: number): V3 => pts[Math.min(nv, Math.max(0, j)) * (nu + 1) + Math.min(nu, Math.max(0, i))].p;
    const base = this.vertexCount;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const du = sub3(at(i + 1, j), at(i - 1, j));
        const dv = sub3(at(i, j + 1), at(i, j - 1));
        let n = normalize3(cross3(du, dv));
        if (flip) n = [-n[0], -n[1], -n[2]];
        const q = pts[j * (nu + 1) + i];
        this.vertex(q.p, n, q.uv[0], q.uv[1]);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + nu + 1;
        const d = c + 1;
        if (flip) this.idx.push(a, c, b, b, c, d);
        else this.idx.push(a, b, c, b, d, c);
      }
    }
    return this;
  }

  /** 任意のジオメトリ（位置・法線・uv）を変換して足す。aKg はいまの kg。 */
  geometry(g: BufferGeometry, m: Matrix4): this {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const prev = this.matrix;
    this.setMatrix(m);
    const base = this.vertexCount;
    for (let i = 0; i < pos.count; i++) {
      this.vertex(
        [pos.getX(i), pos.getY(i), pos.getZ(i)],
        nor ? [nor.getX(i), nor.getY(i), nor.getZ(i)] : [0, 1, 0],
        uv ? uv.getX(i) : 0,
        uv ? uv.getY(i) : 0,
      );
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    this.setMatrix(prev);
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aKg', new BufferAttribute(new Float32Array(this.kgv), 4));
    g.setAttribute('aKgLight', new BufferAttribute(new Float32Array(this.lightIndices), 1));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function normalize3(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  // 長さ 0（格子の極など）は上向きにする。0 のまま渡すとシェーダーの正規化で NaN になる
  if (!(l > 1e-9)) return [0, 1, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function faceNormal(a: V3, b: V3, c: V3): V3 {
  return normalize3(cross3(sub3(b, a), sub3(c, a)));
}

/** 種つきの乱数（機能ごとに別の系列を作る。あとから足した機能で既存の絵を組み変えないため）。 */
export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 文字列から種（機能の名前ごとの系列）。 */
export function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 位置のハッシュ（0..1）。配置の判断を、区画ごとの独立した値で行う。 */
export function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** y 軸まわりに回して平行移動する変換。 */
export function placeY(x: number, y: number, z: number, rotY: number, scale = 1): Matrix4 {
  const m = new Matrix4().makeRotationY(rotY);
  if (scale !== 1) m.multiply(new Matrix4().makeScale(scale, scale, scale));
  m.setPosition(x, y, z);
  return m;
}
