// OWNER: city
// 頂点を型付き配列に書き溜めて BufferGeometry にする道具。四角形は法線の向きから巻き順を自動で合わせる。
import { BufferAttribute, BufferGeometry } from 'three';

export type V3 = [number, number, number];

class Growable<T extends Float32Array | Uint8Array | Uint32Array> {
  data: T;
  length = 0;
  constructor(private readonly make: (n: number) => T, initial: number) {
    this.data = make(initial);
  }
  push(...values: number[]): void {
    if (this.length + values.length > this.data.length) {
      const next = this.make(Math.max(this.data.length * 2, this.length + values.length));
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    for (const v of values) this.data[this.length++] = v;
  }
  trimmed(): T {
    return this.data.slice(0, this.length) as T;
  }
}

export interface AttributeSpec {
  name: string;
  size: number;
  /** u8 は 0..1 に正規化した 8bit（色など）。f32 は浮動小数 */
  type: 'f32' | 'u8';
}

/** 1頂点ぶんの追加の属性値（名前 → 値の並び）。 */
export type VertexAttrs = Record<string, readonly number[]>;

export class MeshWriter {
  private readonly position = new Growable((n) => new Float32Array(n), 4096);
  private readonly normal = new Growable((n) => new Float32Array(n), 4096);
  private readonly extra = new Map<string, Growable<Float32Array | Uint8Array>>();
  private readonly index = new Growable((n) => new Uint32Array(n), 4096);
  private attrs: VertexAttrs = {};
  vertexCount = 0;

  constructor(private readonly specs: readonly AttributeSpec[]) {
    for (const s of specs) {
      this.extra.set(s.name, s.type === 'u8' ? new Growable((n) => new Uint8Array(n), 4096) : new Growable((n) => new Float32Array(n), 4096));
    }
  }

  get indexCount(): number {
    return this.index.length;
  }

  /** 以後に書く頂点の属性値を決める（一部だけの上書きも可）。 */
  set(attrs: VertexAttrs): void {
    this.attrs = { ...this.attrs, ...attrs };
  }

  private vertex(p: V3, n: V3, perVertex?: VertexAttrs): number {
    this.position.push(p[0], p[1], p[2]);
    this.normal.push(n[0], n[1], n[2]);
    for (const s of this.specs) {
      const v = perVertex?.[s.name] ?? this.attrs[s.name];
      if (!v || v.length < s.size) throw new Error(`MeshWriter: 属性 ${s.name} が未設定`);
      const g = this.extra.get(s.name)!;
      for (let i = 0; i < s.size; i++) g.push(s.type === 'u8' ? Math.round(Math.min(1, Math.max(0, v[i])) * 255) : v[i]);
    }
    return this.vertexCount++;
  }

  /**
   * 四角形 a→b→c→d（外から見て反時計回りを想定）。巻き順が法線と逆なら自動で反転する。
   * uv は各頂点の "aUv" 属性（4つ）。
   */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][], uvName = 'aUv'): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const i0 = this.vertex(a, n, { [uvName]: uv[0] });
    const i1 = this.vertex(b, n, { [uvName]: uv[1] });
    const i2 = this.vertex(c, n, { [uvName]: uv[2] });
    const i3 = this.vertex(d, n, { [uvName]: uv[3] });
    if (flip) this.index.push(i0, i2, i1, i0, i3, i2);
    else this.index.push(i0, i1, i2, i0, i2, i3);
  }

  tri(a: V3, b: V3, c: V3, n: V3, uv: [number, number][], uvName = 'aUv'): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const i0 = this.vertex(a, n, { [uvName]: uv[0] });
    const i1 = this.vertex(b, n, { [uvName]: uv[1] });
    const i2 = this.vertex(c, n, { [uvName]: uv[2] });
    if (flip) this.index.push(i0, i2, i1);
    else this.index.push(i0, i1, i2);
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.position.trimmed(), 3));
    g.setAttribute('normal', new BufferAttribute(this.normal.trimmed(), 3));
    for (const s of this.specs) {
      g.setAttribute(s.name, new BufferAttribute(this.extra.get(s.name)!.trimmed(), s.size, s.type === 'u8'));
    }
    g.setIndex(new BufferAttribute(this.index.trimmed(), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
