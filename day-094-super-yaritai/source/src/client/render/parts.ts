/**
 * コードで組む部品（docs/04「自作する部品」）：サービスカウンター・特売台・ワゴン・試食台・バナナの台・放送ブース・マイク・ベル・
 * 出入口の枠・レジのベルト・天井の蛍光灯・トイレットペーパー。
 * 形は箱と円柱を組み合わせ、頂点の色で塗る（材質は1つで済み、まとめて描ける）。原点は底面の中心、単位はメートル。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../../shared/view';
import { PALETTE, tintColor } from './palette';

type Part = THREE.BufferGeometry;

function paint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = src.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  out.setAttribute('normal', src.getAttribute('normal'));
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

/** 底面の中心が (x, y, z) の箱 */
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

function cyl(r: number, h: number, x: number, y: number, z: number, color: string, seg = 14, rTop = r): Part {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg);
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

function sphere(r: number, x: number, y: number, z: number, color: string, half = false): Part {
  const g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI);
  g.translate(x, y, z);
  return paint(g, color);
}

function merge(parts: Part[]): THREE.BufferGeometry {
  return mergeGeometries(parts, false)!;
}

/** 部品の形を作る（大きさはその置き物の外形） */
export function buildPart(model: string, size: Vec3, tint?: string): THREE.BufferGeometry {
  const { x: w, y: h, z: d } = size;
  const main = tintColor(tint);
  switch (model) {
    case 'pc/counter':
      return merge([
        box(w, h - 0.08, d, 0, 0, 0, main),
        box(w + 0.08, 0.08, d + 0.08, 0, h - 0.08, 0, PALETTE.wood),
        box(w * 0.96, 0.12, 0.02, 0, h * 0.55, -d / 2 - 0.005, PALETTE.white),
        box(w, 0.08, d * 0.9, 0, 0, 0, PALETTE.metalDark),
      ]);
    case 'pc/sale-table':
      return merge([
        box(w, h - 0.06, d, 0, 0, 0, main),
        box(w + 0.06, 0.06, d + 0.06, 0, h - 0.06, 0, PALETTE.white),
        box(w * 0.98, 0.07, 0.02, 0, h * 0.2, d / 2 + 0.005, PALETTE.yellow),
      ]);
    case 'pc/wagon': {
      const parts = [box(w, h - 0.2, d, 0, 0.2, 0, main), box(w, 0.04, d, 0, h - 0.04, 0, PALETTE.wood)];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) parts.push(cyl(0.08, 0.16, sx * (w / 2 - 0.15), 0, sz * (d / 2 - 0.15), PALETTE.ink, 10));
        parts.push(box(0.06, 0.16, d, sx * (w / 2 - 0.03), h, 0, PALETTE.wood));
      }
      parts.push(box(w, 0.16, 0.06, 0, h, -d / 2 + 0.03, PALETTE.wood), box(w, 0.16, 0.06, 0, h, d / 2 - 0.03, PALETTE.wood));
      return merge(parts);
    }
    case 'pc/sample-table': {
      const parts = [box(w, 0.06, d, 0, h - 0.06, 0, PALETTE.wood), box(w + 0.04, 0.22, d + 0.04, 0, h - 0.24, 0, PALETTE.white)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.06, h - 0.06, 0.06, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), PALETTE.woodDark));
      parts.push(cyl(0.3, 0.03, 0, h, 0, PALETTE.white, 18));
      return merge(parts);
    }
    case 'pc/banana-table':
      return merge([box(w, h - 0.05, d, 0, 0, 0, PALETTE.wood), box(w + 0.06, 0.05, d + 0.06, 0, h - 0.05, 0, main), box(w * 0.9, 0.16, 0.02, 0, h * 0.55, d / 2 + 0.005, PALETTE.yellow)]);
    case 'pc/booth-wall':
      return merge([box(w, h, d, 0, 0, 0, main), box(w + 0.01, 0.12, d + 0.01, 0, 0, 0, PALETTE.woodDark), box(w + 0.01, 0.06, d + 0.01, 0, h - 0.06, 0, PALETTE.red)]);
    case 'pc/booth-desk':
      return merge([box(w, 0.06, d, 0, h - 0.06, 0, PALETTE.wood), box(w * 0.95, h - 0.06, d * 0.9, 0, 0, 0, PALETTE.woodDark)]);
    case 'pc/mic':
      return merge([cyl(0.1, 0.03, 0, 0, 0, PALETTE.ink, 12), cyl(0.018, h - 0.1, 0, 0.03, 0, PALETTE.metalDark, 6), sphere(0.07, 0, h - 0.05, 0, PALETTE.ink)]);
    case 'pc/bell':
      return merge([cyl(0.13, 0.05, 0, 0, 0, PALETTE.bellBase, 16), sphere(0.11, 0, 0.05, 0, PALETTE.bell, true), cyl(0.025, 0.05, 0, 0.15, 0, PALETTE.bellBase, 8)]);
    case 'pc/door-post':
      return merge([box(w, h, d, 0, 0, 0, PALETTE.white), box(w + 0.01, 0.2, d + 0.01, 0, h * 0.45, 0, PALETTE.red)]);
    case 'pc/lintel':
      return box(w, h, d, 0, 0, 0, main);
    case 'pc/conveyor':
      return merge([box(w, h - 0.04, d, 0, 0, 0, PALETTE.metal), box(w * 0.85, 0.04, d * 0.97, 0, h - 0.04, 0, PALETTE.conveyor)]);
    case 'pc/light-band':
      // 壁の上端の照明帯（光る帯と、上下の細い縁）
      return merge([box(w, h, d, 0, 0, 0, PALETTE.lightTube), box(w, 0.03, d + 0.02, 0, -0.03, 0, PALETTE.metal), box(w, 0.03, d + 0.02, 0, h, 0, PALETTE.metal)]);
    case 'pc/toilet-pack': {
      const r = w / 4 - 0.005;
      const parts: Part[] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cyl(r, h, sx * (w / 4), 0, sz * (d / 4), PALETTE.toiletPaper, 12));
      parts.push(box(w + 0.01, h * 0.3, d + 0.01, 0, h * 0.35, 0, PALETTE.toiletBand));
      return merge(parts);
    }
    case 'pc/toilet-roll':
      return merge([cyl(w / 2, h, 0, 0, 0, PALETTE.toiletPaper, 16), cyl(w / 2 + 0.006, h * 0.18, 0, h * 0.5, 0, PALETTE.pinBand, 16), cyl(w * 0.16, 0.012, 0, h, 0, PALETTE.metalDark, 10)]);
    default:
      return box(w, h, d, 0, 0, 0, main);
  }
}
