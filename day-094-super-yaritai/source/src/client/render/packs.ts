/**
 * まとめ売りの商品（round3 D1）：水のボトル6本パック・赤い缶6個のトレー。コードで組み、頂点の色で塗る。
 * 動く商品の予算（約350個）は1段3個までなので、細いボトルや缶を1個ずつ並べると棚がすき間だらけに見える。
 * 6本を1個の商品（当たり判定は箱1つ）にまとめて、同じ数で棚が埋まって見えるようにする。原点は底面の中心、+z が正面。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CODE_PROP_SIZE } from '../../shared/layout/catalog';
import { PALETTE } from './palette';

function paint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = src.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  out.setAttribute('normal', src.getAttribute('normal'));
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

function cyl(r: number, h: number, x: number, y: number, z: number, color: string, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

/** 3列×2列の置き場所（外形 w×d の中に、半径 r の物を並べる） */
function grid(w: number, d: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) out.push([(i - 1) * (w / 3), (k - 0.5) * (d / 2)]);
  return out.filter(([x, z]) => Math.abs(x) + r <= w / 2 + 1e-6 && Math.abs(z) + r <= d / 2 + 1e-6);
}

/** まとめ売りの形。知らない鍵なら null（parts.ts の部品として描く） */
export function buildPack(model: string): THREE.BufferGeometry | null {
  const s = CODE_PROP_SIZE[model];
  if (!s) return null;
  const [w, h, d] = s;
  switch (model) {
    case 'pc/water-pack': {
      // 透明なボトル（白に薄い水色）に青いラベルとふた。真ん中に白い帯（包み）
      const r = Math.min(w / 6, d / 4) - 0.004;
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, z] of grid(w, d, r)) {
        parts.push(cyl(r, h - 0.06, x, 0, z, PALETTE.drinkClear), cyl(r + 0.003, 0.09, x, h * 0.3, z, PALETTE.blue), cyl(r * 0.4, 0.06, x, h - 0.06, z, PALETTE.blue, 6));
      }
      parts.push(box(w + 0.01, 0.05, d + 0.01, 0, h * 0.62, 0, PALETTE.white));
      return mergeGeometries(parts, false)!;
    }
    case 'pc/can-tray': {
      // 段ボールの浅いトレーに赤い缶6個（ふたは銀）
      const r = Math.min(w / 6, d / 4) - 0.004;
      const tray = 0.05;
      const parts: THREE.BufferGeometry[] = [box(w, tray, d, 0, 0, 0, PALETTE.wood), box(w + 0.004, tray * 0.5, 0.004, 0, tray * 0.25, d / 2, PALETTE.red)];
      for (const [x, z] of grid(w, d, r)) parts.push(cyl(r, h - 0.032, x, 0.02, z, PALETTE.red), cyl(r - 0.006, 0.012, x, h - 0.012, z, PALETTE.metal));
      return mergeGeometries(parts, false)!;
    }
    default:
      return null;
  }
}
