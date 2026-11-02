// OWNER: chars-art
// 人物の部品の形を作る道具。どれも three の BufferGeometry を返し、builder がまとめる。
// 主役はロフト（輪切りの楕円を線に沿って並べた筒）：胴・手足・袖・袴・槍の柄をこれで作る。
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { DEG } from '../util/math';

export interface Ring {
  c: Vector3;
  rx: number;
  rz: number;
}

export function ring(x: number, y: number, z: number, rx: number, rz = rx): Ring {
  return { c: new Vector3(x, y, z), rx, rz };
}

export interface LoftOpts {
  capStart?: boolean;
  capEnd?: boolean;
  /** 楕円の rx の軸の向きの手がかり（線の向きに直交するよう直す）。既定は +X。 */
  ref?: Vector3;
}

const _t = new Vector3();
const _x = new Vector3();
const _z = new Vector3();
const _tmp = new Vector3();

/**
 * ロフト：輪の列を筒にする。各輪は線の接線に直交する面の楕円で、u は正面（+Z 側）から一周、v は線に沿った長さの割合。
 * 法線は楕円の向きと半径の変わり方から解析的に出す（継ぎ目に陰の段が出ないように）。
 */
export function loft(rings: readonly Ring[], seg: number, opts: LoftOpts = {}): BufferGeometry {
  const n = rings.length;
  const ref = opts.ref ?? new Vector3(1, 0, 0);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // 長さの累積（v に使う）
  const acc: number[] = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + rings[i].c.distanceTo(rings[i - 1].c));
  const total = Math.max(1e-6, acc[n - 1]);
  const frames: { t: Vector3; x: Vector3; z: Vector3 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = rings[Math.max(0, i - 1)].c;
    const b = rings[Math.min(n - 1, i + 1)].c;
    _t.subVectors(b, a).normalize();
    _x.copy(ref).addScaledVector(_t, -ref.dot(_t));
    if (_x.lengthSq() < 1e-6) _x.set(0, 0, 1).addScaledVector(_t, -_t.z);
    _x.normalize();
    _z.crossVectors(_x, _t).normalize();
    frames.push({ t: _t.clone(), x: _x.clone(), z: _z.clone() });
  }
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    const f = frames[i];
    const ia = Math.max(0, i - 1);
    const ib = Math.min(n - 1, i + 1);
    const dl = Math.max(1e-5, acc[ib] - acc[ia]);
    const slope = ((rings[ib].rx + rings[ib].rz) / 2 - (rings[ia].rx + rings[ia].rz) / 2) / dl;
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const s = Math.sin(th);
      const c = Math.cos(th);
      _tmp.copy(r.c).addScaledVector(f.x, r.rx * s).addScaledVector(f.z, r.rz * c);
      pos.push(_tmp.x, _tmp.y, _tmp.z);
      // 楕円の外向きの法線（陰関数の勾配）に、半径の傾きの分だけ線の向きを混ぜる
      const nx = s / Math.max(1e-4, r.rx);
      const nz = c / Math.max(1e-4, r.rz);
      const inv = 1 / Math.max(1e-6, Math.hypot(nx, nz));
      _tmp.set(0, 0, 0).addScaledVector(f.x, nx * inv).addScaledVector(f.z, nz * inv).addScaledVector(f.t, -slope).normalize();
      nor.push(_tmp.x, _tmp.y, _tmp.z);
      uv.push(k / seg, acc[i] / total);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * row + k;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (i: number, dir: 1 | -1) => {
    const r = rings[i];
    const f = frames[i];
    const center = pos.length / 3;
    pos.push(r.c.x, r.c.y, r.c.z);
    nor.push(f.t.x * dir, f.t.y * dir, f.t.z * dir);
    uv.push(0.5, 0.5);
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      _tmp.copy(r.c).addScaledVector(f.x, r.rx * Math.sin(th)).addScaledVector(f.z, r.rz * Math.cos(th));
      pos.push(_tmp.x, _tmp.y, _tmp.z);
      nor.push(f.t.x * dir, f.t.y * dir, f.t.z * dir);
      uv.push(0.5 + 0.5 * Math.sin(th), 0.5 + 0.5 * Math.cos(th));
    }
    for (let k = 0; k < seg; k++) {
      if (dir > 0) idx.push(center, center + 1 + k, center + 2 + k);
      else idx.push(center, center + 2 + k, center + 1 + k);
    }
  };
  if (opts.capStart) cap(0, -1);
  if (opts.capEnd) cap(n - 1, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** 楕円体（中心が原点）。 */
export function ellipsoid(rx: number, ry: number, rz: number, ws = 16, hs = 12): BufferGeometry {
  const g = new SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

export function box(w: number, h: number, d: number, sw = 1, sh = 1, sd = 1): BufferGeometry {
  return new BoxGeometry(w, h, d, sw, sh, sd);
}

/** 円柱（Y 軸。中心が原点）。 */
export function cyl(rTop: number, rBot: number, h: number, seg = 12, hs = 1, open = false): BufferGeometry {
  return new CylinderGeometry(rTop, rBot, h, seg, hs, open);
}

/** 旋盤（Y 軸のまわりに輪郭 [半径, 高さ] を回す）。 */
export function lathe(profile: readonly [number, number][], seg = 24): BufferGeometry {
  const g = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(Math.max(0, r), y)),
    seg,
  );
  // LatheGeometry の正面は +Z ではないので、u=0 が正面に来るよう回しておく
  g.rotateY(Math.PI / 2);
  return g;
}

/**
 * 曲げた板（草摺・袖の板・貼り紙用）。幅 w・高さ h・厚さ th の箱を、後ろ（-Z）に中心のある円柱面に沿って曲げる。
 * bend は板の幅が占める角（ラジアン）。flare は下端で幅を何割広げるか。上端の中心が原点。
 */
export function bentPlate(w: number, h: number, th: number, bend: number, flare = 0, sw = 6, sh = 2): BufferGeometry {
  const g = th > 0 ? new BoxGeometry(w, h, th, sw, sh, 1) : new PlaneGeometry(w, h, sw, sh);
  g.translate(0, -h / 2, 0);
  const P = g.getAttribute('position');
  const R = bend > 1e-4 ? w / bend : 0;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    x *= 1 + flare * Math.max(0, -y / h);
    if (R > 0) {
      const a = x / R;
      P.setXYZ(i, (R + z) * Math.sin(a), y, (R + z) * Math.cos(a) - R);
    } else {
      P.setXYZ(i, x, y, z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** 線に沿った細い管（紐・竿）。 */
export function tube(points: readonly Vector3[], radius: number, seg = 6, steps = 8): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => p.clone()));
  return new TubeGeometry(curve, steps, radius, seg, false);
}

/** 位置・回転（度、XYZ 以外の順も可）・大きさから行列を作る。 */
export function mat(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
  order: 'XYZ' | 'YXZ' | 'ZXY' | 'XZY' | 'YZX' | 'ZYX' = 'XYZ',
): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(rx * DEG, ry * DEG, rz * DEG, order));
  return new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(sx, sy, sz));
}

/** 2つの行列をかける（a・b の順に、b を先に効かせる）。 */
export function mul(a: Matrix4, b: Matrix4): Matrix4 {
  return new Matrix4().multiplyMatrices(a, b);
}

/** 形に行列をかけた複製を返す（元は変えない）。 */
export function moved(g: BufferGeometry, m: Matrix4): BufferGeometry {
  return g.clone().applyMatrix4(m);
}
