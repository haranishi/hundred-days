/**
 * dress の試験の道具：public/models の GLB を Node で読む（描画の担当の Assets と同じ three の GLTFLoader で）。
 * 色は「色の表のどの升を使っているか」で見る（升の並びは render/productLook.ts の説明のとおり）。
 * テクスチャの読み込みは Node ではできないので、その失敗の知らせは黙らせる。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MODELS = fileURLToPath(new URL('../../public/models', import.meta.url));

export async function loadGlb(key: string): Promise<GLTF> {
  const buf = readFileSync(resolve(MODELS, `${key}.glb`));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const err = console.error;
  const warn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  // GLTFLoader はテクスチャを読むときにブラウザの self を見る（Node では無いので、読む間だけ置く）
  const g = globalThis as { self?: unknown };
  const hadSelf = 'self' in g;
  if (!hadSelf) g.self = globalThis;
  try {
    return await new Promise<GLTF>((ok, ng) => new GLTFLoader().parse(ab, '', ok, ng));
  } finally {
    console.error = err;
    console.warn = warn;
    if (!hadSelf) delete g.self;
  }
}

/** Assets.geometry と同じ取り出し方：node 名のメッシュ1つ（なければ商品の部品を除いた全部）を、場面の座標でまとめる */
export function meshGeometry(gltf: GLTF, node: string | null): THREE.BufferGeometry {
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (node !== null && m.name !== node) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const src = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', src.getAttribute('position'));
    out.setAttribute('uv', src.getAttribute('uv'));
    parts.push(out);
  });
  if (parts.length === 0) throw new Error(`no mesh ${node}`);
  return mergeGeometries(parts.slice(0, node === null ? parts.length : 1), false)!;
}

export function meshNames(gltf: GLTF): string[] {
  const names: string[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) names.push(o.name);
  });
  return names;
}

/** 色の表の升（帯・色の組）ごとの面積の割合。'b3h7' のような鍵。facing を渡すと、その向き（法線）の面だけを数える */
export function cellShare(g: THREE.BufferGeometry, facing?: THREE.Vector3): Map<string, number> {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const out = new Map<string, number>();
  let total = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t + 2 < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1);
    c.fromBufferAttribute(pos, t + 2);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const area = cross.length() / 2;
    if (facing && cross.normalize().dot(facing) < 0.9) continue;
    const u = (uv.getX(t) + uv.getX(t + 1) + uv.getX(t + 2)) / 3;
    const v = (uv.getY(t) + uv.getY(t + 1) + uv.getY(t + 2)) / 3;
    const key = `b${Math.floor(v * 4)}h${Math.floor(u * 8)}`;
    out.set(key, (out.get(key) ?? 0) + area);
    total += area;
  }
  for (const [k, v] of out) out.set(k, v / total);
  return out;
}
