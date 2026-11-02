// OWNER: chars-art
// 1人分の人物を作る。形（種類ごとに共有）＋骨（人物ごと）＋材質（人物ごと。プログラムは共有）を1つの SkinnedMesh にまとめ、
// 足もとの接地の暗がり（1枚の板）を添える。描画命令は人物1人につき、本体1＋接地の暗がり1（＋影の描画で本体1）、
// 討ち取りの一閃の間だけ光の弧1。
import { Group, Skeleton, SkinnedMesh, Vector3 } from 'three';
import type { ArtCharacter } from '../../contract/art';
import type { CharacterKind, CharacterSnap } from '../../contract/snapshot';
import { Animator } from './anim/animator';
import { CHAR_BOUNDS, kindAsset, type KindAsset } from './asset';
import { createContactShadow, createSlashArc, type ContactShadow, type SlashArc } from './fx';
import { atlasTexture } from './mesh/atlas';
import { LANTERN, RIM } from './config';
import { createCharacterMaterial } from './mesh/material';
import { B, createBones } from './rig';

/** 確認ページが読む中身（ゲームの側は ArtCharacter の口だけを使う）。 */
export interface CharacterInternals extends ArtCharacter {
  kind: CharacterKind;
  asset: KindAsset;
  mesh: SkinnedMesh;
  animator: Animator;
  shadow: ContactShadow;
  arc: SlashArc | null;
}

const _a = new Vector3();
const _b = new Vector3();
const SHADOW_POINTS = [B.hips, B.chest, B.head, B.footL, B.footR, B.shinL, B.shinR];

export function createCharacter(kind: CharacterKind): CharacterInternals {
  const asset = kindAsset(kind);
  const root = new Group();
  root.name = `chars-${kind}`;
  const bones = createBones(asset.offsets);
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const { material, glow, shade, rim } = createCharacterMaterial(atlasTexture());
  // r02-fix-visual: 闇の中で自分を見失わないよう、プレイヤーだけ縁の光を点ける
  rim.value.w = kind === 'player' ? 1 : 0;
  // r03-fix-visual: 指摘（体験 TOP2）「鐘楼の下など暗い所の当て身が黒い塊にしか見えない」
  //   当て身を受けている番兵にも、動作の間だけ同じ縁の光を掛ける（灯りを置くと明るさの判定が変わるので、表示だけの光にする）
  let victimRim = 0;
  const mesh = new SkinnedMesh(asset.geometry, material);
  mesh.name = `chars-${kind}-body`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.boundingSphere = CHAR_BOUNDS.clone();
  root.add(mesh);
  mesh.bind(skeleton);
  const animator = new Animator(asset, bones);
  // 接地の暗がりは base の骨の子にする（base は見た目の向きの補正だけを持つので、体の向きに付いて回る）
  const shadow = createContactShadow();
  bones[0].add(shadow.mesh);
  const arc = kind === 'player' ? createSlashArc() : null;
  if (arc) root.add(arc.mesh);
  let clock = 0;
  let hasLantern = false;
  return {
    kind,
    asset,
    mesh,
    animator,
    shadow,
    arc,
    root,
    update(dt: number, snap: CharacterSnap) {
      animator.update(dt, snap, root);
      clock += dt;
      // 提灯の紙のごく小さな揺らぎ（明かりそのものの揺れは world の PointLight が持つ）
      glow.value = 1 + 0.05 * Math.sin(clock * 11.3) + 0.03 * Math.sin(clock * 23.7 + 1.3);
      if (snap.pose.stance === 'down') glow.value *= 0.55;
      if (kind !== 'player') {
        // r07-chars: 短い正面の命中も既存の細い縁光で読ませる（世界の明るさや索敵には触れない）。
        const want = snap.pose.action?.kind === 'takedownVictim' || snap.pose.action?.kind === 'stagger' ? RIM.victim : 0;
        // 点くのは速く、消えるのはゆっくり（倒れきった後に余韻を残す）
        const rate = want > victimRim ? RIM.victimRise : RIM.victimFall;
        victimRim = want > victimRim ? Math.min(want, victimRim + rate * dt) : Math.max(want, victimRim - rate * dt);
        rim.value.w = victimRim;
      }
      hasLantern = kind === 'ashigaru' && snap.pose.lantern && snap.pose.stance !== 'down';
      // 接地の暗がり：体の主な点を地面へ落とした広がりで、丸から細長へ
      const G = animator.G;
      let cx = 0;
      let cz = 0;
      for (const i of SHADOW_POINTS) {
        cx += G.p[i].x;
        cz += G.p[i].z;
      }
      cx /= SHADOW_POINTS.length;
      cz /= SHADOW_POINTS.length;
      const fx = (G.p[B.footL].x + G.p[B.footR].x) / 2;
      const fz = (G.p[B.footL].z + G.p[B.footR].z) / 2;
      let dx = G.p[B.head].x - fx;
      let dz = G.p[B.head].z - fz;
      const span = Math.hypot(dx, dz);
      if (span > 1e-3) {
        dx /= span;
        dz /= span;
      } else {
        dx = 0;
        dz = 1;
      }
      const lying = animator.lying;
      shadow.place(cx, cz, dx, dz, Math.max(0.62, span + 0.5), 0.56 + 0.1 * lying, 0.55 - 0.08 * lying);
      // 一閃の光の弧：刀身の根元と先を、親（根）から見た位置で記録する
      if (arc && (animator.arc > 0.01 || arc.active())) {
        root.updateMatrixWorld(true);
        const blade = bones[B.blade];
        _a.set(0, 0, 0.26).applyMatrix4(blade.matrixWorld);
        _b.set(0, 0, 0.58).applyMatrix4(blade.matrixWorld);
        root.worldToLocal(_a);
        root.worldToLocal(_b);
        arc.push(_a, _b, animator.arc * Math.min(1, animator.draw * 1.2), dt);
      }
    },
    setShade(ambient: number, key: number) {
      shade.value.set(ambient, key);
    },
    lanternPaper(out: Vector3): boolean {
      if (!hasLantern) return false;
      // 紙は提灯の骨から真下へ LANTERN.hang（吊り紐＋紙の半分）。骨は振り子で傾くので、骨の向きで下へ伸ばす
      root.updateMatrixWorld(true);
      out.set(0, -LANTERN.hang, 0).applyMatrix4(bones[B.lantern].matrixWorld);
      return true;
    },
    dispose() {
      root.removeFromParent();
      material.dispose();
      skeleton.dispose();
      shadow.dispose();
      arc?.dispose();
    },
  };
}
