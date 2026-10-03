// OWNER: city
// 通りの暮らしの形（車・人・小物・船）を三角形の並びで組む道具（r01-city で lifeGeometry.ts から分けた）。
// 頂点の属性：aPaint（1 = インスタンスの色を塗る車体・上着、2 = 上着の色から決めるズボン）、aSurf（粗さ・金属度）、aEmit（灯火の光）。
// 箱と押し出し（平らな面）に加えて、輪を連ねた面（grid）・回転体（lathe）・管（tube）を、隣の点から決めた滑らかな法線で描ける。
// 車と人を箱の組み合わせで作ると玩具に見えた（メインループの所見）ので、丸みのある形はこちらで作る。
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';

export type V3 = [number, number, number];

const _e1 = new Vector3();
const _e2 = new Vector3();

// three.js (MIT) の箱を一度だけ展開し、街の各部品へ伸縮する。
// 参照作品と一致していた手書きの6面・頂点順は使用しない。
const unitBox = new BoxGeometry(1, 1, 1).toNonIndexed();
const boxPositions = unitBox.getAttribute('position');
const boxNormals = unitBox.getAttribute('normal');

export class LifeSoup {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly paint: number[] = [];
  private readonly surf: number[] = [];
  private readonly emit: number[] = [];
  color = new Color(1, 1, 1);
  paintMode = 0;
  rough = 0.7;
  metal = 0;
  glow = 0;

  set(hex: number | Color, paintMode = 0, rough = 0.7, metal = 0, glow = 0): this {
    this.color = hex instanceof Color ? hex.clone() : new Color().setHex(hex);
    this.paintMode = paintMode;
    this.rough = rough;
    this.metal = metal;
    this.glow = glow;
    return this;
  }

  private vertex(p: V3, n: V3): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(this.color.r, this.color.g, this.color.b);
    this.paint.push(this.paintMode);
    this.surf.push(this.rough, this.metal);
    this.emit.push(this.glow);
  }

  /** 平らな三角形（法線は巻き順から）。 */
  tri(a: V3, b: V3, c: V3): void {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = _e1.cross(_e2).normalize();
    const nn: V3 = [n.x, n.y, n.z];
    this.vertex(a, nn);
    this.vertex(b, nn);
    this.vertex(c, nn);
  }

  /** 頂点ごとの法線を持つ三角形。巻き順は法線の向き（外）に合わせて直す。 */
  triN(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3): void {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _e1.cross(_e2);
    const s = _e1.x * (na[0] + nb[0] + nc[0]) + _e1.y * (na[1] + nb[1] + nc[1]) + _e1.z * (na[2] + nb[2] + nc[2]);
    if (s >= 0) {
      this.vertex(a, na);
      this.vertex(b, nb);
      this.vertex(c, nc);
    } else {
      this.vertex(a, na);
      this.vertex(c, nc);
      this.vertex(b, nb);
    }
  }

  /** 四角形 a→b→c→d（外から見て反時計回り）。 */
  quad(a: V3, b: V3, c: V3, d: V3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** 軸に平行な箱（底は描かない）。min・max は角の座標。 */
  box(min: V3, max: V3, bottom = false): void {
    for (let i = 0; i < boxPositions.count; i++) {
      if (!bottom && boxNormals.getY(i) < 0) continue;
      const p = min.map((low, axis) => low + (boxPositions.getComponent(i, axis) + 0.5) * (max[axis] - low)) as V3;
      const n: V3 = [boxNormals.getX(i), boxNormals.getY(i), boxNormals.getZ(i)];
      this.vertex(p, n);
    }
  }

  /**
   * 横から見た形（z-y の多角形、前が +z）を幅 w で押し出した立体。側面は多角形を三角形の扇で塞ぐ（凸の形に限る）。
   */
  prism(profile: [number, number][], w: number): void {
    const hx = w / 2;
    const n = profile.length;
    for (let i = 0; i < n; i++) {
      const [z0, y0] = profile[i];
      const [z1, y1] = profile[(i + 1) % n];
      this.quad([hx, y0, z0], [hx, y1, z1], [-hx, y1, z1], [-hx, y0, z0]);
    }
    for (let i = 1; i + 1 < n; i++) {
      const [za, ya] = profile[0];
      const [zb, yb] = profile[i];
      const [zc, yc] = profile[i + 1];
      this.tri([hx, ya, za], [hx, yc, zc], [hx, yb, zb]);
      this.tri([-hx, ya, za], [-hx, yb, zb], [-hx, yc, zc]);
    }
  }

  /**
   * 輪を連ねた滑らかな面。P[i][j]：i は輪の並び、j は輪の上の点（ringClosed なら輪は閉じる）。
   * 法線は隣の点の差から決め、center(i)（輪の内側の点）から離れる向きにそろえる。
   * paint(i, j) を渡すと、四角形（i..i+1, j..j+1）ごとに色を変えられる（窓・柱など）。
   */
  grid(P: V3[][], ringClosed: boolean, center: (i: number) => V3, paint?: (i: number, j: number) => void): void {
    const rings = P.length;
    const m = P[0].length;
    const N: V3[][] = [];
    for (let i = 0; i < rings; i++) {
      const row: V3[] = [];
      for (let j = 0; j < m; j++) {
        const jm = ringClosed ? (j - 1 + m) % m : Math.max(0, j - 1);
        const jp = ringClosed ? (j + 1) % m : Math.min(m - 1, j + 1);
        const im = Math.max(0, i - 1);
        const ip = Math.min(rings - 1, i + 1);
        const du = sub(P[i][jp], P[i][jm]);
        const dv = sub(P[ip][j], P[im][j]);
        let n = cross(du, dv);
        const len = Math.hypot(n[0], n[1], n[2]);
        const c = center(i);
        const out = sub(P[i][j], c);
        if (len < 1e-9) n = normalize(out);
        else {
          n = [n[0] / len, n[1] / len, n[2] / len];
          if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
        }
        row.push(n);
      }
      N.push(row);
    }
    const segs = ringClosed ? m : m - 1;
    for (let i = 0; i + 1 < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % m;
        if (paint) paint(i, j);
        this.triN(P[i][j], P[i + 1][j], P[i + 1][j1], N[i][j], N[i + 1][j], N[i + 1][j1]);
        this.triN(P[i][j], P[i + 1][j1], P[i][j1], N[i][j], N[i + 1][j1], N[i][j1]);
      }
    }
  }

  /** 輪の口を塞ぐ平らな扇（輪の中心へ）。n はふたの外向きの法線。 */
  cap(ring: V3[], n: V3): void {
    const c: V3 = [0, 0, 0];
    for (const p of ring) {
      c[0] += p[0] / ring.length;
      c[1] += p[1] / ring.length;
      c[2] += p[2] / ring.length;
    }
    for (let j = 0; j < ring.length; j++) this.triN(c, ring[j], ring[(j + 1) % ring.length], n, n, n);
  }

  /**
   * y を軸にした回転体（楕円の断面も可）。profile は下から上への (半径, 高さ)。半径 0 の点で閉じる。
   * sx・sz は断面の x・z の倍率、at は軸の位置。
   */
  lathe(profile: [number, number][], sides: number, at: V3 = [0, 0, 0], sx = 1, sz = 1): void {
    const P: V3[][] = profile.map(([r, y]) => {
      const ring: V3[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        ring.push([at[0] + Math.cos(a) * r * sx, at[1] + y, at[2] + Math.sin(a) * r * sz]);
      }
      return ring;
    });
    this.grid(P, true, (i) => [at[0], at[1] + profile[i][1], at[2]]);
  }

  /**
   * 点の並び（背骨）に沿った管（腕・脚）。radii は各点の半径。端は小さな球のように丸めて閉じる。
   * sides は周りの分割数。
   */
  tube(spine: V3[], radii: number[], sides: number): void {
    const P: V3[][] = [];
    const centers: V3[] = [];
    const n = spine.length;
    let ref: V3 = [1, 0, 0];
    for (let i = 0; i < n; i++) {
      const a = spine[Math.max(0, i - 1)];
      const b = spine[Math.min(n - 1, i + 1)];
      const t = normalize(sub(b, a));
      // 背骨に直交する2つの向き（前の輪からねじれないように、前の基準を投影して使う）
      let u = sub(ref, scale(t, dot(ref, t)));
      if (Math.hypot(u[0], u[1], u[2]) < 1e-4) u = Math.abs(t[1]) < 0.9 ? cross(t, [0, 1, 0]) : cross(t, [1, 0, 0]);
      u = normalize(u);
      const v = normalize(cross(t, u));
      ref = u;
      const ring: V3[] = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const c = Math.cos(ang) * radii[i];
        const s = Math.sin(ang) * radii[i];
        ring.push([spine[i][0] + u[0] * c + v[0] * s, spine[i][1] + u[1] * c + v[1] * s, spine[i][2] + u[2] * c + v[2] * s]);
      }
      P.push(ring);
      centers.push(spine[i]);
    }
    // 端を丸める：両端の外に半径の半分だけ出した点へすぼめた輪を足す
    const t0 = normalize(sub(spine[0], spine[1]));
    const t1 = normalize(sub(spine[n - 1], spine[n - 2]));
    const shrink = (ring: V3[], c: V3, t: V3, r: number): V3[] => ring.map((p) => [c[0] + (p[0] - c[0]) * 0.45 + t[0] * r * 0.55, c[1] + (p[1] - c[1]) * 0.45 + t[1] * r * 0.55, c[2] + (p[2] - c[2]) * 0.45 + t[2] * r * 0.55]);
    const start = shrink(P[0], spine[0], t0, radii[0]);
    const end = shrink(P[n - 1], spine[n - 1], t1, radii[n - 1]);
    const all = [start, ...P, end];
    const cs = [spine[0], ...centers, spine[n - 1]];
    this.grid(all, true, (i) => cs[i]);
    this.cap(start, t0);
    this.cap(end, t1);
  }

  /** 位置を (sx, sy, sz) で割って大きさ1にそろえる（法線は逆の倍率で直す）。実寸で組んでからインスタンスで伸ばす形に使う。 */
  normalizeTo(sx: number, sy: number, sz: number): this {
    for (let i = 0; i < this.pos.length; i += 3) {
      this.pos[i] /= sx;
      this.pos[i + 1] /= sy;
      this.pos[i + 2] /= sz;
      const n = normalize([this.nrm[i] * sx, this.nrm[i + 1] * sy, this.nrm[i + 2] * sz]);
      this.nrm[i] = n[0];
      this.nrm[i + 1] = n[1];
      this.nrm[i + 2] = n[2];
    }
    return this;
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aPaint', new BufferAttribute(new Float32Array(this.paint), 1));
    g.setAttribute('aSurf', new BufferAttribute(new Float32Array(this.surf), 2));
    g.setAttribute('aEmit', new BufferAttribute(new Float32Array(this.emit), 1));
    g.computeBoundingSphere();
    return g;
  }
}

export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
