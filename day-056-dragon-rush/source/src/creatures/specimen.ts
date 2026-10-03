// OWNER: creatures
// 撮影用の標本：怪獣の GLB を読み、材質を付け、クリップの1コマを骨に書いて街に置く（IK・ばね・注視は掛けない）。
// ?specimen= の撮影（src/harness/specimenRunner.ts）だけが使う。遊びの竜（src/dragon/dragon.ts）とは別の物で、紅竜の見た目も同じ材質で出る。
import { type AnimationClip, type Bone, Group, LOD, type Material, type Object3D, Sphere, Vector3 } from 'three';
import { DRAGON_ASSET, DRAGON_CONTACT as C, type DragonClipName } from '../config/dragon';
import { pointInBone } from '../dragon/asset';
import { ContactShadows, type ContactSpot } from '../dragon/contactShadow';
import { createDragonMaterials, type DragonUniforms } from '../dragon/dragonMaterial';
import { PosePlayer } from '../dragon/posePlayer';
import type { MaterialKit } from '../render/materials';
import { loadCreatureAsset, type CreatureAsset, type CreatureMeta } from './creatureAsset';
import type { CreatureSpec } from './roster';

const DEG = Math.PI / 180;

/**
 * 札の影絵の姿勢の名前（?clip=card。tools/silhouettes.mjs が撮る）。GLB には無い名前で、怪獣の設定の card（元のクリップ・時刻・
 * 向きの回し）を借りて置く（r04-roster2：焔角だけ斜め前から撮るため。撮影の口 src/harness には手を入れずに済む）。
 */
export const CARD_CLIP = 'card';

/** 姿勢の目印（標本の局所の座標：+x 左・+y 上・+z 前、原点は胴の中心）。 */
export interface SpecimenMeasure {
  /** 足の裏のいちばん低い高さ */
  lowestY: number;
  headBase: Vector3;
  headForward: Vector3;
  mouth: Vector3;
  /** 頭の長さ（頭の付け根 → 鼻先、m） */
  headLength: number;
}

interface Foot {
  name: string;
  toe: Bone;
  ankle: Bone;
  /** 足を地面に置いたとき、足の甲（指の骨の付け根）が足の裏からどれだけ上にあるか（m） */
  sole: number;
}

/** クリップの時刻を、輪になるクリップは周に、一度きりのクリップは長さの中に収める。 */
export function clipTime(meta: CreatureMeta, clip: string, t: number): number {
  const c = meta.clips[clip];
  if (!c) throw new Error(`クリップ ${clip} が無い`);
  if (c.loop) return ((t % c.duration) + c.duration) % c.duration;
  return Math.min(Math.max(t, 0), c.duration);
}

export class Specimen {
  readonly root = new Group();
  readonly meta: CreatureMeta;
  private readonly player: PosePlayer;
  private readonly uniforms: DragonUniforms;
  private readonly feet: Foot[];
  private readonly head: Bone;
  private readonly jaw: Bone;
  private readonly snoutLocal: Vector3;
  private readonly mouthUpper: Vector3;
  private readonly mouthLower: Vector3;
  private readonly contacts = new ContactShadows(5);
  /** 置くときに足す向き（度）。札の影絵の姿勢（CARD_CLIP）のときだけ設定の card.turnDeg */
  private turn = 0;
  private readonly spots: ContactSpot[] = Array.from({ length: 5 }, () => ({ x: 0, z: 0, dirX: 0, dirZ: 1, length: 0, width: 0, strength: 0, core: 0 }));
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();

  static async load(spec: CreatureSpec, kit: MaterialKit, baseUrl: string): Promise<Specimen> {
    return new Specimen(spec, await loadCreatureAsset(spec, baseUrl), kit);
  }

  private constructor(
    readonly spec: CreatureSpec,
    asset: CreatureAsset,
    kit: MaterialKit,
  ) {
    this.root.name = `specimen-${spec.id}`;
    this.root.rotation.order = 'YXZ';
    this.meta = asset.meta;
    const bone = (name: string): Bone => {
      const b = asset.bones.get(name);
      if (!b) throw new Error(`${spec.name}の骨組みに ${name} が無い`);
      return b;
    };
    const mats = createDragonMaterials(kit, spec.material);
    this.uniforms = mats.uniforms;
    // 目印を骨の局所へ直す（休みの姿勢のうちに）
    asset.rig.updateMatrixWorld(true);
    const P = asset.meta.points;
    this.head = bone(P.snout.bone);
    this.jaw = bone(P.jawTip.bone);
    this.snoutLocal = pointInBone(this.head, P.snout.pos);
    this.mouthUpper = pointInBone(bone(P.mouthUpper.bone), P.mouthUpper.pos);
    this.mouthLower = pointInBone(bone(P.mouthLower.bone), P.mouthLower.pos);
    this.feet = Object.entries(asset.meta.feet).map(([name, f]) => {
      const toe = bone(f.toe);
      const restY = toe.getWorldPosition(new Vector3()).y;
      const sole = (f as { sole?: number }).sole ?? restY - asset.meta.ground;
      return { name, toe, ankle: bone(f.chain[2]), sole };
    });
    const levels = [0, 1].map((level) => {
      const g = new Group();
      g.name = `${spec.id}Lod${level}`;
      for (const m of asset.lod[level]) {
        m.material = (m.material as Material).name.endsWith('_membrane') ? mats.membrane : mats.skin;
        m.castShadow = true;
        m.receiveShadow = true;
        // 骨で曲がる（翼を広げる）ので、描画の外れ判定は大きめの球で固定する
        m.boundingSphere = new Sphere(new Vector3(0, 0, 0), DRAGON_ASSET.boundsRadius + 10);
        g.add(m);
      }
      return g;
    });
    const emptied: Object3D[] = [];
    asset.rig.traverse((o) => {
      if (spec.lods.includes(o.userData.name as string)) emptied.push(o);
    });
    for (const o of emptied) o.removeFromParent();
    const lod = new LOD();
    lod.addLevel(levels[0], 0);
    lod.addLevel(levels[1], DRAGON_ASSET.lodDistance);
    this.root.add(asset.rig, lod, this.contacts.mesh);
    // 札の影絵の姿勢：元のクリップの時刻表と中身を借りる（一度きりのクリップとして、時刻は長さの中に収める）
    const card = spec.card;
    const base = asset.meta.clips[card.clip];
    const baseClip = asset.clips.get(card.clip);
    if (!base || !baseClip) throw new Error(`${spec.name}の札の姿勢のクリップ ${card.clip} が無い`);
    this.meta.clips[CARD_CLIP] = { ...base, loop: false };
    const clips = new Map(asset.clips);
    clips.set(CARD_CLIP, baseClip);
    // 骨の並びとクリップの読み方は紅竜の PosePlayer と同じ（クリップの名前は怪獣ごとに違うので、型だけ広げて渡す）
    this.player = new PosePlayer([...asset.bones.values()], clips as unknown as Map<DragonClipName, AnimationClip>);
    this.pose('idle', 0);
  }

  hasClip(name: string): boolean {
    return name in this.meta.clips;
  }

  /** クリップの1コマを骨に書く。戻り値は実際に使った時刻。札の影絵の姿勢は、設定の card の時刻から数える。 */
  pose(clip: string, t: number): number {
    const card = clip === CARD_CLIP;
    this.turn = card ? this.spec.card.turnDeg : 0;
    const time = clipTime(this.meta, clip, card ? this.spec.card.t + t : t);
    this.player.applySingle(clip as DragonClipName, time);
    this.root.updateMatrixWorld(true);
    return time;
  }

  /** 置き場所。yaw は +z（南）を 0 に、上から見て反時計回りの度。地面の高さ groundY に接地の影を置く。 */
  place(position: Vector3, yawDeg: number, pitchDeg = 0, rollDeg = 0, groundY = 0): void {
    this.root.position.copy(position);
    this.root.rotation.set(pitchDeg * DEG, (yawDeg + this.turn) * DEG, rollDeg * DEG);
    this.root.updateMatrixWorld(true);
    this.updateContacts(groundY);
  }

  /** 発光の脈の時刻（秒）と、喉の光（0〜1）。 */
  setGlow(simTime: number, throat: number): void {
    this.uniforms.uTime.value = simTime;
    this.uniforms.uThroat.value = throat;
  }

  /** いまの姿勢での目印（標本の局所の座標）。 */
  measure(): SpecimenMeasure {
    const pos = this.root.position.clone();
    const quat = this.root.quaternion.clone();
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.updateMatrixWorld(true);
    let lowestY = Infinity;
    for (const f of this.feet) lowestY = Math.min(lowestY, f.toe.getWorldPosition(this.tmpA).y - f.sole);
    const headBase = this.head.getWorldPosition(new Vector3());
    const snout = this.head.localToWorld(this.snoutLocal.clone());
    const headLength = snout.distanceTo(headBase);
    const headForward = snout.sub(headBase).normalize();
    const mouth = this.mouthWorld(new Vector3());
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.root.updateMatrixWorld(true);
    return { lowestY, headBase, headForward, mouth, headLength };
  }

  /** 口の中（上顎と下顎の目印の間）のワールド座標。 */
  mouthWorld(out: Vector3): Vector3 {
    const upper = this.head.localToWorld(this.tmpA.copy(this.mouthUpper));
    const lower = this.jaw.localToWorld(this.tmpB.copy(this.mouthLower));
    return out.lerpVectors(upper, lower, DRAGON_ASSET.mouthJawMix);
  }

  /** 足の甲（指の骨の付け根）のワールド座標と、そこから足の裏までの高さ。足の滑りを測る道具が読む。 */
  footPositions(): { name: string; x: number; y: number; z: number; sole: number }[] {
    return this.feet.map((f) => {
      const p = f.toe.getWorldPosition(this.tmpA);
      return { name: f.name, x: p.x, y: p.y, z: p.z, sole: f.sole };
    });
  }

  /** 足もとの接地の影（紅竜の dragon.ts と同じ置き方。大きさは怪獣ごとの倍率）。 */
  private updateContacts(ground: number): void {
    const k = this.spec.contactScale;
    const fwd = this.tmpB.set(0, 0, 1).applyQuaternion(this.root.quaternion);
    const fLen = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fLen;
    const fz = fwd.z / fLen;
    this.feet.slice(0, 4).forEach((f, i) => {
      const ball = f.toe.getWorldPosition(this.tmpA);
      const ankle = f.ankle.getWorldPosition(new Vector3());
      let dx = ball.x - ankle.x;
      let dz = ball.z - ankle.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        dx /= len;
        dz /= len;
      } else {
        dx = fx;
        dz = fz;
      }
      const up = Math.min(1, Math.max(0, ball.y - ground - f.sole) / C.liftFade);
      // 前脚（名前が F で始まる）は少し小さく（紅竜の dragon.ts と同じ）
      const size = k * (f.name.startsWith('F') ? C.frontScale : 1) * (1 + C.spread * up);
      const s = this.spots[i];
      s.x = ball.x + dx * C.foot.forward * k;
      s.z = ball.z + dz * C.foot.forward * k;
      s.dirX = dx;
      s.dirZ = dz;
      s.length = C.foot.length * size;
      s.width = C.foot.width * size;
      s.strength = C.foot.strength * (1 - up * up * (3 - 2 * up));
      s.core = C.foot.core * (1 - up);
    });
    const hb = Math.max(0, this.root.position.y - ground + this.meta.ground);
    const kb = Math.min(1, hb / C.body.fade);
    const b = this.spots[4];
    b.x = this.root.position.x + fx * C.body.forward * k;
    b.z = this.root.position.z + fz * C.body.forward * k;
    b.dirX = fx;
    b.dirZ = fz;
    b.length = C.body.length * k * (1 + 0.3 * kb);
    b.width = C.body.width * k * (1 + 0.3 * kb);
    b.strength = C.body.strength * (1 - kb * kb * (3 - 2 * kb));
    b.core = 0;
    this.contacts.update(this.root, ground, this.spots);
  }
}
