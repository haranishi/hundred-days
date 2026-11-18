/**
 * 素材（Kenney の GLB）の読み込みと使い回し。
 * - 鍵 'mm/shelf-boxes' は棚の枠だけ（子ノードの商品を除く）、'mm/shelf-boxes/carton' は子ノード carton だけ
 * - 形はすべて「外形の底面の中心」が原点になるようにずらす（store.ts・catalog.ts の置き方と合わせるため）
 * - 色は各フォルダの colormap.png 1枚。フォルダごとに材質を1つだけ作り、全部の形で共有する
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PALETTE } from './palette';

const PRODUCT_NODES = new Set(['carton', 'box', 'bag', 'bottle', 'bread']);
const BASE = `${import.meta.env.BASE_URL}models/`;

export interface ModelGeometry {
  geometry: THREE.BufferGeometry;
  /** 材質が2つ以上ある形（ガラス窓など）は配列 */
  materials: THREE.Material[];
}

/** 'mm/shelf-boxes/carton' → ['mm/shelf-boxes', 'carton']、'fk/can' → ['fk/can', null] */
export function splitKey(key: string): [string, string | null] {
  const parts = key.split('/');
  if (parts.length >= 3) return [`${parts[0]}/${parts[1]}`, parts.slice(2).join('/')];
  return [key, null];
}

export class Assets {
  private readonly loader = new GLTFLoader();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly done = new Map<string, GLTF>();
  private readonly geoms = new Map<string, ModelGeometry>();
  private readonly folderMats = new Map<string, THREE.MeshLambertMaterial>();
  private glass: THREE.MeshLambertMaterial | null = null;
  private sharedClips: THREE.AnimationClip[] | null = null;
  /** 材質を作るたびに呼ぶ（透かしの仕掛けを足すため） */
  onMaterial: ((m: THREE.Material, folder: string) => void) | null = null;

  /** GLB をまとめて読む（同じファイルは1回だけ） */
  async load(keys: readonly string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const files = [...new Set(keys.filter((k) => !k.startsWith('pc/')).map((k) => splitKey(k)[0]))];
    let n = 0;
    await Promise.all(
      files.map(async (f) => {
        await this.file(f);
        n++;
        onProgress?.(n, files.length);
      }),
    );
  }

  /** その鍵の GLB を読み終えているか（コードで組む部品は常に true） */
  has(key: string): boolean {
    return key.startsWith('pc/') || this.done.has(splitKey(key)[0]);
  }

  private file(file: string): Promise<GLTF> {
    let p = this.gltfs.get(file);
    if (!p) {
      p = this.loader.loadAsync(`${BASE}${file}.glb`).then((g) => {
        this.done.set(file, g);
        return g;
      });
      this.gltfs.set(file, p);
    }
    return p;
  }

  private gltf(file: string): GLTF {
    const g = this.done.get(file);
    if (!g) throw new Error(`model not loaded: ${file}`);
    return g;
  }

  /** フォルダ（mm・fk・ch）ごとの材質。最初に見つかった colormap を使う */
  folderMaterial(folder: string, from?: THREE.Material): THREE.MeshLambertMaterial {
    let m = this.folderMats.get(folder);
    if (!m) {
      const map = from && 'map' in from ? ((from as THREE.MeshStandardMaterial).map ?? null) : null;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.MeshLambertMaterial({ map, color: 0xffffff });
      m.name = `kenney-${folder}`;
      this.onMaterial?.(m, folder);
      this.folderMats.set(folder, m);
    }
    return m;
  }

  private glassMaterial(): THREE.MeshLambertMaterial {
    if (!this.glass) {
      this.glass = new THREE.MeshLambertMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.35, depthWrite: false });
      this.onMaterial?.(this.glass, 'glass');
    }
    return this.glass;
  }

  /** 1つの形にまとめた形状（読み込み済みのものだけ） */
  geometry(key: string): ModelGeometry {
    const hit = this.geoms.get(key);
    if (hit) return hit;
    const [file, node] = splitKey(key);
    const folder = file.split('/')[0]!;
    const gltf = this.gltf(file);
    gltf.scene.updateMatrixWorld(true);
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    let found = false;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (node) {
        if (found || mesh.name !== node) return;
        found = true;
      } else if (PRODUCT_NODES.has(mesh.name)) return;
      const srcMat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      const isGlass = srcMat.name === 'glass';
      const geo = cleanGeometry(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      parts.push({ geo, mat: isGlass ? this.glassMaterial() : this.folderMaterial(folder, srcMat) });
    });
    if (parts.length === 0) throw new Error(`no mesh for ${key}`);
    const materials = [...new Set(parts.map((p) => p.mat))];
    let geometry: THREE.BufferGeometry;
    if (materials.length === 1) geometry = mergeGeometries(parts.map((p) => p.geo), false)!;
    else {
      // 材質ごとに並べ替えてから、まとめる（グループ＝材質の番号）
      const ordered = materials.map((m) => mergeGeometries(parts.filter((p) => p.mat === m).map((p) => p.geo), false)!);
      geometry = mergeGeometries(ordered, true)!;
    }
    recenter(geometry);
    const out = { geometry, materials };
    this.geoms.set(key, out);
    return out;
  }

  /** キャラ（骨入り）。呼ぶたびに複製を返す。動きは最初に読んだキャラのものを全員で使い回す（骨の名前は全員同じ） */
  character(key: string): { root: THREE.Object3D; clips: THREE.AnimationClip[] } {
    const gltf = this.gltf(key);
    if (!this.sharedClips) this.sharedClips = gltf.animations;
    const root = cloneSkinned(gltf.scene);
    const mat = this.folderMaterial(key.split('/')[0]!, firstMaterial(gltf.scene));
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.material = mat;
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    return { root, clips: this.sharedClips };
  }

  dispose(): void {
    for (const g of this.geoms.values()) g.geometry.dispose();
    for (const m of this.folderMats.values()) m.dispose();
  }
}

function firstMaterial(root: THREE.Object3D): THREE.Material | undefined {
  let found: THREE.Material | undefined;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!found && m.isMesh) found = Array.isArray(m.material) ? m.material[0] : m.material;
  });
  return found;
}

/** まとめられるよう、位置・法線・UV だけにそろえる */
function cleanGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position'));
  if (!src.getAttribute('normal')) src.computeVertexNormals();
  out.setAttribute('normal', src.getAttribute('normal'));
  const uv = src.getAttribute('uv');
  out.setAttribute('uv', uv ?? new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 2), 2));
  return out;
}

/** 外形の底面の中心を原点にする */
export function recenter(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
}
