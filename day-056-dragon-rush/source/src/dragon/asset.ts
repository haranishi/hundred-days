// OWNER: dragon
// 竜の GLB（tools/blender/build_dragon.py が作る）を読み、骨・近景と遠景のメッシュ・クリップ・目印をまとめて返す。
// 頂点の属性は glTF では _PART 等（下線で始まる名前）なので、シェーダーで使う名前（aPart 等）へ付け替える。
import { AnimationClip, Bone, BufferGeometry, Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRAGON_CLIPS, type DragonClipName } from '../config/dragon';
import type { ClipTable } from './animState';

export interface DragonMeta {
  version: number;
  clips: ClipTable;
  feet: Record<'HL' | 'FL' | 'HR' | 'FR', { toe: string; chain: [string, string, string]; touch: number }>;
  /** 休みの姿勢の足の裏の高さ（原点 = 胴の中心から、m） */
  ground: number;
  /** 目印（休みの姿勢の座標）と、それが付く骨 */
  points: Record<'snout' | 'jawTip' | 'mouthUpper' | 'mouthLower', { bone: string; pos: [number, number, number] }>;
}

export interface DragonAsset {
  /** アーマチュアの節（骨の親）。竜の根の子にする */
  rig: Object3D;
  bones: Map<string, Bone>;
  /** 近景（lod0）と遠景（lod1）の骨付きメッシュ。どちらも材質ごとに2つ（皮膚と膜） */
  lod: [SkinnedMesh[], SkinnedMesh[]];
  clips: Map<DragonClipName, AnimationClip>;
  meta: DragonMeta;
}

const ATTRS: [string, string][] = [
  ['_part', 'aPart'],
  ['_belly', 'aBelly'],
  ['_memb', 'aMemb'],
  ['_glow', 'aGlow'],
  ['_along', 'aAlong'],
  ['_scale', 'aScale'],
];

function renameAttributes(g: BufferGeometry): void {
  for (const [from, to] of ATTRS) {
    const a = g.getAttribute(from);
    if (!a) throw new Error(`竜の GLB に頂点の属性 ${from} が無い（npm run build:dragon で作り直す）`);
    g.setAttribute(to, a);
    g.deleteAttribute(from);
  }
}

export async function loadDragonAsset(url: string): Promise<DragonAsset> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const rig = gltf.scene.getObjectByName('dragon_rig');
  if (!rig) throw new Error('竜の GLB に dragon_rig が無い');
  const raw = rig.userData.dragon;
  if (typeof raw !== 'string') throw new Error('竜の GLB に userData.dragon（クリップの長さ・歩幅・目印）が無い');
  const meta = JSON.parse(raw) as DragonMeta;
  const bones = new Map<string, Bone>();
  rig.traverse((o) => {
    if ((o as Bone).isBone) bones.set(o.name, o as Bone);
  });
  // GLTFLoader は名前を一意にする（節 dragon_lod0 の中の面は dragon_lod0_1 など）ので、節の元の名前（userData.name）で見分ける
  const lod: [SkinnedMesh[], SkinnedMesh[]] = [[], []];
  gltf.scene.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    let p: Object3D | null = m;
    while (p && p.userData.name !== 'dragon_lod0' && p.userData.name !== 'dragon_lod1') p = p.parent;
    if (!p) return;
    renameAttributes(m.geometry);
    lod[p.userData.name === 'dragon_lod1' ? 1 : 0].push(m);
  });
  if (lod[0].length === 0 || lod[1].length === 0) throw new Error('竜の GLB に近景と遠景のメッシュがそろっていない');
  const clips = new Map<DragonClipName, AnimationClip>();
  for (const name of DRAGON_CLIPS) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) throw new Error(`竜の GLB にクリップ ${name} が無い`);
    clips.set(name, clip);
  }
  return { rig, bones, lod, clips, meta };
}

/**
 * 休みの姿勢の点を、骨の局所の座標へ直す（骨を動かしたあと、点の世界の位置を bone.localToWorld で引ける）。
 * 読み込んだ直後（アーマチュアが休みの姿勢で、根が原点にある間）に呼ぶこと。
 */
export function pointInBone(bone: Bone, restPoint: [number, number, number]): Vector3 {
  bone.updateWorldMatrix(true, false);
  return bone.worldToLocal(new Vector3(...restPoint));
}
