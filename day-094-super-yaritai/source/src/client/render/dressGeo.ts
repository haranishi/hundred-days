/**
 * 作り込み（dressing.ts・decor.ts）の形の道具。頂点の色で塗った形を作り、1つにまとめて描く前提（原点は底面の中心）。
 */
import * as THREE from 'three';

export type G = THREE.BufferGeometry;

export function paint(g: G, color: string | THREE.Color): G {
  const src = g.index ? g.toNonIndexed() : g;
  const c = typeof color === 'string' ? new THREE.Color(color) : color;
  const n = src.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  out.setAttribute('normal', src.getAttribute('normal'));
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string | THREE.Color): G {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

export function cyl(r: number, h: number, x: number, y: number, z: number, color: string | THREE.Color, seg = 8): G {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

/** 床に寝かせた四角（上向き） */
export function floorQuad(x0: number, z0: number, x1: number, z1: number, y: number, color: string | THREE.Color): G {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return paint(g, color);
}

/** 平らな多角形（+z を向く）。点は反時計回り（中心から扇で張る） */
export function flatPoly(points: readonly [number, number][], z: number, color: string | THREE.Color): G {
  const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
  const pos: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    pos.push(cx, cy, z, a[0], a[1], z, b[0], b[1], z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const n = new Float32Array(pos.length);
  for (let i = 2; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return paint(g, color);
}

/** ガラスの照り：斜めの細い平行四辺形（+z を向く） */
export function glint(cx: number, y0: number, y1: number, width: number, slant: number, z: number, color: string): G {
  const h = y1 - y0;
  const a = cx - width / 2;
  const b = cx + width / 2;
  return flatPoly(
    [
      [a, y0],
      [b, y0],
      [b + slant * h, y1],
      [a + slant * h, y1],
    ],
    z,
    color,
  );
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

/** ローカルの形（中心が原点・+z が正面）を、置き場所と向きへ */
export function place(g: G, f: { pos: { x: number; y: number; z: number }; yaw: number }): G {
  tmpQ.setFromAxisAngle(UP, f.yaw);
  tmpM.compose(new THREE.Vector3(f.pos.x, f.pos.y, f.pos.z), tmpQ, ONE);
  return g.applyMatrix4(tmpM);
}

/** 同じ入力なら同じ値（0..1）。飾りのばらつきを毎回同じにする */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x3c6ef372, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
