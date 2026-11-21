import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.js';
import { buildFishModel, visitPieceMeshes } from '../lib/pieces.js';

// 同じFLF位置の頂点を1 µm未満の精度で溶接し、材質境界とインスタンスをまたいで数えます。
export function measure(object) {
  const edges = new Map(), vertices = new Map();
  let triangles = 0, volume = 0, area = 0, degenerate = 0, badAttributes = 0, normalError = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], centroid = [0,0,0];
  const matrix = new THREE.Matrix4(), instance = new THREE.Matrix4(), vec = new THREE.Vector3();
  visitPieceMeshes(object, mesh => {
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry, pos = g.attributes.position, normal = g.attributes.normal;
    for (const name of ['position', 'normal', 'uv', 'aSeg']) {
      if (g.attributes[name]?.count !== pos.count || !g.attributes[name]?.array.every(Number.isFinite)) badAttributes++;
    }
    for (let i = 0; i < normal.count; i++) {
      normalError = Math.max(normalError, Math.abs(1 - Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))));
    }
    const copies = mesh.isInstancedMesh ? mesh.count : 1;
    for (let copy = 0; copy < copies; copy++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(copy, instance); matrix.multiply(instance); }
      const points = [], ids = [];
      for (let j = 0; j < pos.count; j++) {
        const p = vec.fromBufferAttribute(pos, j).applyMatrix4(matrix).toArray();
        points.push(p);
        const key = p.map(x => Math.round(x * 1e6)).join(',');
        if (!vertices.has(key)) vertices.set(key, vertices.size);
        ids.push(vertices.get(key));
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
      const index = g.index?.array ?? points.map((_, i) => i);
      for (let j = 0; j < index.length; j += 3) {
        const ia = index[j], ib = index[j + 1], ic = index[j + 2];
        const a = points[ia], b = points[ib], c = points[ic];
        const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
        const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        const faceArea = Math.hypot(...n) / 2;
        if (faceArea < 1e-14 || new Set([ids[ia], ids[ib], ids[ic]]).size !== 3) degenerate++;
        triangles++; area += faceArea;
        volume += (a[0]*n[0] + a[1]*n[1] + a[2]*n[2]) / 6;
        for (let k = 0; k < 3; k++) centroid[k] += faceArea * (a[k] + b[k] + c[k]) / 3;
        for (const [from, to] of [[ids[ia],ids[ib]], [ids[ib],ids[ic]], [ids[ic],ids[ia]]]) {
          const key = Math.min(from,to) + ',' + Math.max(from,to);
          const edge = edges.get(key) ?? { count: 0, direction: 0 };
          edge.count++; edge.direction += from < to ? 1 : -1;
          edges.set(key, edge);
        }
      }
    }
  });
  let boundary = 0, nonmanifold = 0, twisted = 0;
  for (const e of edges.values()) {
    if (e.count === 1) boundary++;
    if (e.count > 2) nonmanifold++;
    if (e.count === 2 && e.direction) twisted++;
  }
  return { triangles, volume, area, centroid: centroid.map(x => x / area), min, max, boundary, nonmanifold, twisted,
    degenerate, normalError, badAttributes, closed: boundary === 0 && nonmanifold === 0 && twisted === 0 && degenerate === 0 };
}

// 閉じたメッシュとは独立に、吻から尾ビレの付け根までの超楕円断面を数値積分します。
export function envelopeVolume(anatomy) {
  const axial = 512, vertical = 128;
  let sum = 0;
  for (let i = 0; i < axial; i++) {
    const pr = anatomy.profile((i + 0.5) / axial);
    for (let j = 0; j < vertical; j++) {
      const t = (j + 0.5) / vertical;
      sum += 2 * pr.half * (pr.top * (1 - t ** pr.nTop) ** (1 / pr.nTop)
        + pr.bottom * (1 - t ** pr.nBottom) ** (1 / pr.nBottom));
    }
  }
  return sum * anatomy.SL / (axial * vertical);
}

function report(id, quality) {
  const fish = buildFishModel(id, {quality});
  const rows = [], lower = [Infinity,Infinity,Infinity], upper = [-Infinity,-Infinity,-Infinity];
  const vector = p => p.map(v => v.toFixed(2)).join(', ');
  let triangles = 0, volume = 0;
  for (const piece of Object.values(fish.pieces)) {
    const m = measure(piece.object);
    rows.push({ 部品: piece.id, 三角形: m.triangles, '体積 cm³': m.closed ? m.volume.toFixed(4) : '—',
      形: m.closed ? '閉' : '開', 境界辺: m.boundary, '最小座標 cm': vector(m.min), '最大座標 cm': vector(m.max) });
    triangles += m.triangles;
    if (m.closed) volume += m.volume;
    for (let j = 0; j < 3; j++) { lower[j] = Math.min(lower[j], m.min[j]); upper[j] = Math.max(upper[j], m.max[j]); }
  }
  rows.push({ 部品: '合計', 三角形: triangles, '体積 cm³': volume.toFixed(4), 形: '', 境界辺: '',
    '最小座標 cm': vector(lower), '最大座標 cm': vector(upper) });
  console.table(rows);
  const outer = envelopeVolume(fish.anatomy);
  console.log(`標準体長 ${fish.anatomy.SL.toFixed(3)} cm、全長 ${fish.anatomy.TL.toFixed(3)} cm。`);
  console.log(`吻から尾ビレの付け根までの外形は ${outer.toFixed(3)} cm³ です。閉じた部品の体積合計との差は ${(100 * (volume / outer - 1)).toFixed(2)}% です。`);
  console.log('体積合計は皮の開いた面を除き、目やヒレを含む各立体の符号付き体積を足した値です。');
  fish.dispose();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { report(process.argv[2] ?? 'aji', process.argv[3] ?? 'standard'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
