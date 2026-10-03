// OWNER: creatures
// 怪獣の GLB（tools/blender/build_creature.py が作る）を読み、骨・近景と遠景のメッシュ・クリップ・目印をまとめて返す。
// 紅竜の src/dragon/asset.ts と同じ読み方を、怪獣ごとの名前（roster.ts）で行う。クリップの名前は怪獣ごとに違う（焔角は jump・stomp）。
import type { AnimationClip, Bone, BufferGeometry, Object3D, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ClipMeta } from '../dragon/animState';
import type { CreatureSpec } from './roster';

export interface CreatureFoot {
  toe: string;
  chain: [string, string, string];
  touch: number;
  /** 足の甲（指の骨の付け根）が足の裏からどれだけ上にあるか（m）。雷翼・焔角の GLB だけにある */
  sole?: number;
}

export interface CreatureMeta {
  version: number;
  id?: string;
  clips: Record<string, ClipMeta & { cycle?: number; maxSlide?: number }>;
  feet: Record<string, CreatureFoot>;
  /** 休みの姿勢の足の裏の高さ（原点 = 胴の中心から、m） */
  ground: number;
  points: Record<'snout' | 'jawTip' | 'mouthUpper' | 'mouthLower', { bone: string; pos: [number, number, number] }>;
  /** 首・尾・翼の先の骨の並び（雷翼・焔角だけ。紅竜は名前の約束で引く） */
  chains?: { neck: string[]; tail: string[]; head: string; jaw: string; wingTips?: string[]; club?: string };
}

export interface CreatureAsset {
  rig: Object3D;
  bones: Map<string, Bone>;
  lod: [SkinnedMesh[], SkinnedMesh[]];
  clips: Map<string, AnimationClip>;
  meta: CreatureMeta;
}

// glTF の頂点の属性（下線で始まる名前）→ シェーダーの名前。_emit・_line は発光を持つ怪獣だけにある
const ATTRS: [string, string, boolean][] = [
  ['_part', 'aPart', true],
  ['_belly', 'aBelly', true],
  ['_memb', 'aMemb', true],
  ['_glow', 'aGlow', true],
  ['_along', 'aAlong', true],
  ['_scale', 'aScale', true],
  ['_emit', 'aEmit', false],
  ['_line', 'aLine', false],
];

function renameAttributes(g: BufferGeometry, spec: CreatureSpec): void {
  for (const [from, to, required] of ATTRS) {
    const a = g.getAttribute(from);
    if (!a) {
      if (required || spec.material.emit) throw new Error(`${spec.name}の GLB に頂点の属性 ${from} が無い（npm run build:creatures で作り直す）`);
      continue;
    }
    g.setAttribute(to, a);
    g.deleteAttribute(from);
  }
}

export async function loadCreatureAsset(spec: CreatureSpec, baseUrl: string): Promise<CreatureAsset> {
  const gltf = await new GLTFLoader().loadAsync(`${baseUrl}${spec.url}`);
  const rig = gltf.scene.getObjectByName(spec.rig);
  if (!rig) throw new Error(`${spec.name}の GLB に ${spec.rig} が無い`);
  const raw = rig.userData[spec.metaKey];
  if (typeof raw !== 'string') throw new Error(`${spec.name}の GLB に userData.${spec.metaKey}（クリップ・目印）が無い`);
  const meta = JSON.parse(raw) as CreatureMeta;
  const bones = new Map<string, Bone>();
  rig.traverse((o) => {
    if ((o as Bone).isBone) bones.set(o.name, o as Bone);
  });
  // GLTFLoader は節の名前を一意に付け替えるので、節の元の名前（userData.name）で近景と遠景を見分ける
  const lod: [SkinnedMesh[], SkinnedMesh[]] = [[], []];
  gltf.scene.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    let p: Object3D | null = m;
    while (p && !spec.lods.includes(p.userData.name as string)) p = p.parent;
    if (!p) return;
    renameAttributes(m.geometry, spec);
    lod[p.userData.name === spec.lods[1] ? 1 : 0].push(m);
  });
  if (lod[0].length === 0 || lod[1].length === 0) throw new Error(`${spec.name}の GLB に近景と遠景のメッシュがそろっていない`);
  const clips = new Map<string, AnimationClip>();
  for (const name of Object.keys(meta.clips)) {
    const clip = gltf.animations.find((a) => a.name === name);
    if (!clip) throw new Error(`${spec.name}の GLB にクリップ ${name} が無い`);
    clips.set(name, clip);
  }
  return { rig, bones, lod, clips, meta };
}
