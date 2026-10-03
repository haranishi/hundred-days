// OWNER: dragon
// 操作する怪獣の本番モデル（tools/blender/build_creature.py が作る GLB）を読み、意図（DragonIntent）から姿勢を作る。
// 遊びの側からは applyIntent（意図の口）と mouthWorld（炎の出どころ）だけを呼ぶ。撮影は setPose（クリップの1コマ＋調整）と
// measure（その姿勢での足の裏・頭・口の位置）を使う。読み込みは非同期なので、App.init が ready を待ってから使う。
// r03-roster：紅竜だけでなく雷翼・焔角も同じ作りで動かす。骨の並び（首・尾・翼の先・足）は GLB の userData.creature.chains から読み、
// 紅竜（chains を持たない r00c の GLB）は名前の約束で引く。紅竜の見た目と動きは r00c のまま（同じ骨・同じ材質・同じ数値）。
import { type AnimationClip, type Bone, Group, LOD, type Material, type Object3D, Quaternion, Sphere, Vector3 } from 'three';
import { CREATURE_CONFIG, type ClipName, type CreatureConfig } from '../config/creatures';
import { DRAGON_ASSET as A, DRAGON_CONTACT as C, DRAGON_MOTION as M, type DragonPose } from '../config/dragon';
import { damped, smoothDamp, type Damped } from '../core/springs';
import { publicBase } from '../core/publicBase';
import { loadCreatureAsset, type CreatureMeta } from '../creatures/creatureAsset';
import { CREATURES } from '../creatures/roster';
import type { MaterialKit } from '../render/materials';
import { AnimState, type CreatureClipTable } from './animState';
import { pointInBone } from './asset';
import { ContactShadows, type ContactSpot } from './contactShadow';
import { createDragonMaterials, type DragonUniforms } from './dragonMaterial';
import type { DragonIntent } from './intent';
import { PosePlayer } from './posePlayer';
import { DragonProcedural, rotateBoneWorld, type ProceduralBones } from './procedural';
import { ProbeRecorder } from './probe';

const DEG = Math.PI / 180;

/** 姿勢の目印（竜の局所の座標：+x 左・+y 上・+z 前、原点は胴の中心）。 */
export interface DragonMeasure {
  /** 足の裏のいちばん低い高さ */
  lowestY: number;
  /** 頭の付け根・頭の前と上の向き・口の中 */
  headBase: Vector3;
  headForward: Vector3;
  headUp: Vector3;
  mouth: Vector3;
}

interface Loaded {
  meta: CreatureMeta;
  bones: Map<string, Bone>;
  player: PosePlayer;
  state: AnimState;
  proc: DragonProcedural;
  pbones: ProceduralBones;
  lod: LOD;
  mouthUpper: Vector3;
  mouthLower: Vector3;
  restJaw: Quaternion;
}

/** 紅竜（r00c の GLB。chains を持たない）の骨の並び。 */
const KURENAI_CHAINS = {
  neck: Array.from({ length: 7 }, (_, i) => `neck_0${i + 1}`),
  tail: Array.from({ length: 10 }, (_, i) => `tail_${String(i + 1).padStart(2, '0')}`),
  head: 'head',
  jaw: 'jaw',
  wingTips: [1, 2, 3, 4].flatMap((k) => [`wing_f${k}b_L`, `wing_f${k}b_R`]),
};

export class Dragon {
  readonly root = new Group();
  /** GLB を読み終えて、姿勢を作れるようになったら解決する */
  readonly ready: Promise<void>;
  readonly creature: CreatureConfig;
  private loaded: Loaded | null = null;
  private uniforms: DragonUniforms | null = null;
  private readonly lean: { pitch: Damped; roll: Damped } = { pitch: damped(), roll: damped() };
  private leanFirst = true;
  private throat = 0;
  private glowTime = 0;
  private readonly probe = new ProbeRecorder();
  /** 足もとの接地の影と、その地面の高さ（遊びでは意図の groundY、撮影では道の高さ 0） */
  private readonly contacts = new ContactShadows(5);
  private readonly spots: ContactSpot[] = Array.from({ length: 5 }, () => ({ x: 0, z: 0, dirX: 0, dirZ: 1, length: 0, width: 0, strength: 0, core: 0 }));
  private groundY = 0;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();

  constructor(kit: MaterialKit, creature: CreatureConfig = CREATURE_CONFIG.kurenai) {
    this.creature = creature;
    this.root.name = creature.id === 'kurenai' ? 'dragon' : `creature-${creature.id}`;
    this.root.rotation.order = 'YXZ';
    this.ready = this.load(kit);
  }

  private async load(kit: MaterialKit): Promise<void> {
    const c = this.creature;
    const v = c.view;
    const asset = await loadCreatureAsset(CREATURES[c.id], publicBase);
    const mats = createDragonMaterials(kit, v.material);
    this.uniforms = mats.uniforms;
    const { bones, meta } = asset;
    const bone = (name: string): Bone => {
      const b = bones.get(name);
      if (!b) throw new Error(`${c.name}の骨組みに ${name} が無い`);
      return b;
    };
    const chains = meta.chains ?? KURENAI_CHAINS;
    // 目印を骨の局所へ直す（休みの姿勢のうちに）
    asset.rig.updateMatrixWorld(true);
    const P = meta.points;
    const snoutLocal = pointInBone(bone(P.snout.bone), P.snout.pos);
    const mouthUpper = pointInBone(bone(P.mouthUpper.bone), P.mouthUpper.pos);
    const mouthLower = pointInBone(bone(P.mouthLower.bone), P.mouthLower.pos);
    const feet = (['HL', 'FL', 'HR', 'FR'] as const).map((k) => {
      const f = meta.feet[k] as CreatureMeta['feet'][string] & { sole?: number };
      const toe = bone(f.toe);
      // 足の甲の高さ（胴の中心から）。報告に足の厚み（sole）があれば、足の裏からの高さで持つ（標本と同じ）
      const restBallY = f.sole !== undefined ? meta.ground + f.sole : toe.getWorldPosition(new Vector3()).y;
      return { chain: [bone(f.chain[0]), bone(f.chain[1]), bone(f.chain[2])] as [Bone, Bone, Bone], toe, restBallY };
    });
    const pbones: ProceduralBones = {
      neck: chains.neck.map(bone),
      head: bone(chains.head),
      jaw: bone(chains.jaw),
      tail: chains.tail.map(bone),
      wingTips: (chains.wingTips ?? []).map((name) => ({ bone: bone(name), side: name.endsWith('_R') ? (-1 as const) : (1 as const) })),
      feet,
      snoutLocal,
    };
    // 材質を差し替え、近景と遠景を LOD にまとめる。骨は曲がるので、描画の外れ判定は大きめの球で固定する
    const levels = [0, 1].map((level) => {
      const g = new Group();
      g.name = c.id === 'kurenai' ? `dragonLod${level}` : `${c.id}Lod${level}`;
      for (const m of asset.lod[level]) {
        m.material = (m.material as Material).name.endsWith('_membrane') ? mats.membrane : mats.skin;
        m.castShadow = true;
        m.receiveShadow = true;
        m.boundingSphere = new Sphere(new Vector3(0, 0, 0), v.boundsRadius);
        g.add(m);
      }
      return g;
    });
    const emptied: Object3D[] = [];
    asset.rig.traverse((o) => {
      if (v.lods.includes(o.userData.name as string)) emptied.push(o);
    });
    for (const o of emptied) o.removeFromParent();
    const lod = new LOD();
    lod.name = c.id === 'kurenai' ? 'dragonLod' : `${c.id}Lod`;
    lod.addLevel(levels[0], 0);
    lod.addLevel(levels[1], v.lodDistance);
    this.root.add(asset.rig, lod, this.contacts.mesh);
    const boneList = [...bones.values()];
    const player = new PosePlayer(boneList, asset.clips as Map<ClipName, AnimationClip>, v.wingLegs);
    this.loaded = {
      meta,
      bones,
      player,
      state: new AnimState(meta.clips as CreatureClipTable, { anim: v.anim, specialClip: v.specialClip }),
      // r06-motion：首・尾・翼の指の二次運動の値と、一歩ごとの揺れに使う足の位相を渡す
      proc: new DragonProcedural(pbones, this.root, meta.ground, v.aimShare, v.secondary, c.body.feet.map((f) => ({ foot: f.foot, phase: f.phase }))),
      pbones,
      lod,
      mouthUpper,
      mouthLower,
      restJaw: bone(chains.jaw).quaternion.clone(),
    };
    player.applySingle('idle', 0);
    this.root.updateMatrixWorld(true);
  }

  /** そのクリップが GLB にあるか（撮影の姿勢を選ぶのに使う）。読み込み前は false。 */
  hasClip(name: string): boolean {
    return this.loaded !== null && name in this.loaded.meta.clips;
  }

  /** 位置と向き。yaw は +z（南）を 0 に、上から見て反時計回りの度。pitch は前へ倒すのが正、roll は右へ傾くのが正。 */
  place(position: Vector3, yawDeg: number, pitchDeg = 0, rollDeg = 0): void {
    this.placeRoot(position, yawDeg, pitchDeg, rollDeg);
    // 撮影は姿勢（setPose）→ 置き場所（place）の順に呼ぶので、ここで足もとの影を合わせる
    this.updateContacts();
  }

  private placeRoot(position: Vector3, yawDeg: number, pitchDeg: number, rollDeg: number): void {
    this.root.position.copy(position);
    this.root.rotation.set(pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG);
    this.root.updateMatrixWorld(true);
  }

  /** 足もとの接地の影を、いまの姿勢の足の甲と胴の位置へ置く。足が地面から離れるほど薄く広く、飛ぶと消える。 */
  private updateContacts(): void {
    const L = this.loaded;
    if (!L) return;
    const k = this.creature.view.contactScale;
    const ground = this.groundY;
    const fwd = this.axis(0, 0, 1, this.tmpB);
    const fLen = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fLen;
    const fz = fwd.z / fLen;
    L.pbones.feet.forEach((f, i) => {
      const ball = f.toe.getWorldPosition(this.tmpA);
      const ankle = f.chain[2].getWorldPosition(this.tmpB);
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
      const lift = Math.max(0, ball.y - ground - (f.restBallY - L.meta.ground));
      const up = Math.min(1, lift / C.liftFade);
      const size = k * (i % 2 === 1 ? C.frontScale : 1) * (1 + C.spread * up);
      const s = this.spots[i];
      s.x = ball.x + dx * C.foot.forward * k;
      s.z = ball.z + dz * C.foot.forward * k;
      s.dirX = dx;
      s.dirZ = dz;
      s.length = C.foot.length * size;
      s.width = C.foot.width * size;
      s.strength = C.foot.strength * (1 - up * up * (3 - 2 * up));
      // 足が上がるほど、接地の芯は消えて広い暗がりだけが残る
      s.core = C.foot.core * (1 - up);
    });
    const hb = Math.max(0, this.root.position.y - ground + L.meta.ground);
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

  /** 撮影の姿勢：クリップの1コマに、首・頭・口・尾・翼の調整を足す（ばねと足の接地は掛けない）。無いクリップは立ち姿。 */
  setPose(pose: DragonPose): void {
    const L = this.loaded;
    if (!L) return;
    const name = (pose.clip in L.meta.clips ? pose.clip : 'idle') as ClipName;
    const clip = L.meta.clips[name];
    const t = clip.loop ? ((pose.time % clip.duration) + clip.duration) % clip.duration : Math.min(Math.max(pose.time, 0), clip.duration);
    L.player.applySingle(name, t);
    this.root.updateMatrixWorld(true);
    const up = this.axis(0, 1, 0, new Vector3());
    const left = this.axis(1, 0, 0, new Vector3());
    const fwd = this.axis(0, 0, 1, new Vector3());
    const q = new Quaternion();
    const q2 = new Quaternion();
    const share = this.creature.view.aimShare;
    const chain = [...L.pbones.neck.slice(2), L.pbones.head];
    chain.forEach((b, i) => {
      q.setFromAxisAngle(up, pose.neckYaw * (share[i] ?? 0) * DEG);
      q2.setFromAxisAngle(left, -pose.neckPitch * (share[i] ?? 0) * DEG);
      rotateBoneWorld(b, q.multiply(q2));
    });
    if (pose.headPitch !== 0) rotateBoneWorld(L.pbones.head, q.setFromAxisAngle(left, -pose.headPitch * DEG));
    L.pbones.tail.forEach((b, i) => {
      const w = 0.04 + 0.012 * i;
      q.setFromAxisAngle(up, -pose.tailSwing * w * DEG);
      q2.setFromAxisAngle(left, pose.tailLift * w * DEG);
      rotateBoneWorld(b, q.multiply(q2));
    });
    const armL = L.bones.get('wing_arm_L');
    const armR = L.bones.get('wing_arm_R');
    if (pose.wingFlap !== 0 && armL && armR) {
      rotateBoneWorld(armL, q.setFromAxisAngle(fwd, pose.wingFlap * DEG));
      rotateBoneWorld(armR, q.setFromAxisAngle(fwd, -pose.wingFlap * DEG));
    }
    if (pose.jawOpen > 0) L.proc.openJawTo(pose.jawOpen * M.jaw.shotMax, this.jawClipDeg());
  }

  /** 意図から姿勢と置き場所を作る（毎コマ）。dt は遊びの時刻の進み（一時停止・撮影モードでは 0）。 */
  applyIntent(intent: DragonIntent, dt: number): void {
    const L = this.loaded;
    if (!L) return;
    L.state.update(intent, dt);
    L.player.apply(L.state);
    if (this.leanFirst) {
      this.lean.pitch.value = -intent.pitch / DEG;
      this.lean.roll.value = intent.roll / DEG;
      this.leanFirst = false;
    }
    const pitch = smoothDamp(this.lean.pitch, -intent.pitch / DEG, 0.2, dt);
    const roll = smoothDamp(this.lean.roll, intent.roll / DEG, 0.25, dt);
    const [x, y, z] = intent.position;
    this.placeRoot(this.tmpA.set(x, y, z), intent.yaw / DEG, pitch, roll);
    this.groundY = intent.groundY;
    const c = L.state.clip;
    const busy = Math.max(c.claw.weight, c.tail.weight, c.roar.weight, c.stomp.weight, c.takeoff.weight, c.land.weight, c.jump.weight);
    // r06-motion：技のクリップの重み（吐く技は 6 割）。二次運動はこの間だけ遅れと振れを絞る（離陸・着地・跳ぶは絞らない）
    const attack = Math.max(c.claw.weight, c.tail.weight, c.roar.weight, c.stomp.weight, 0.6 * c.breath.weight);
    L.proc.update(intent, dt, { jawClip: this.jawClipDeg(), aimScale: 1 - 0.8 * busy, attack });
    // 喉の光：溜め始めから光り、吐いている間は光ったまま、止めたらゆっくり消える
    const target = intent.breath.active ? 1 : Math.min(1, intent.breath.charge * 1.2);
    this.throat = dt > 0 ? target + (this.throat - target) * Math.exp(-dt / (target > this.throat ? 0.08 : 0.35)) : this.throat;
    this.glowTime += dt;
    if (this.uniforms) {
      this.uniforms.uThroat.value = this.throat;
      // 雷翼の筋・焔角の溶岩の脈（紅竜の材質は使わない）
      this.uniforms.uTime.value = this.glowTime;
    }
    this.updateContacts();
    this.probe.record(intent, L.state, dt, L.lod.getCurrentLevel());
  }

  /** 口の中（上顎の先と下顎の先の間、少し奥）のワールド座標。炎の出どころ。 */
  mouthWorld(out: Vector3): Vector3 {
    const L = this.loaded;
    if (!L) return out.copy(this.root.position);
    const upper = L.pbones.head.localToWorld(this.tmpA.copy(L.mouthUpper));
    const lower = L.pbones.jaw.localToWorld(this.tmpB.copy(L.mouthLower));
    return out.lerpVectors(upper, lower, A.mouthJawMix);
  }

  /** 姿勢 pose での目印（竜の局所の座標）。撮影の構図（足を地面に置く高さ・頭へのカメラ）に使う。 */
  measure(pose: DragonPose): DragonMeasure {
    const L = this.loaded;
    if (!L) throw new Error('怪獣の GLB を読み終える前に measure が呼ばれた');
    const pos = this.root.position.clone();
    const quat = this.root.quaternion.clone();
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.updateMatrixWorld(true);
    this.setPose(pose);
    let lowestY = Infinity;
    for (const f of L.pbones.feet) {
      const ball = f.toe.getWorldPosition(new Vector3());
      lowestY = Math.min(lowestY, ball.y - (f.restBallY - L.meta.ground));
    }
    const headBase = L.pbones.head.getWorldPosition(new Vector3());
    const snout = L.pbones.head.localToWorld(L.pbones.snoutLocal.clone());
    const headForward = snout.sub(headBase).normalize();
    const headUp = new Vector3(0, 1, 0).addScaledVector(headForward, -headForward.y).normalize();
    const mouth = this.mouthWorld(new Vector3());
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.root.updateMatrixWorld(true);
    return { lowestY, headBase, headForward, headUp, mouth };
  }

  /** クリップが今あけている口の角度（度）。休みの姿勢の回転からの角度。 */
  private jawClipDeg(): number {
    const L = this.loaded;
    if (!L) return 0;
    return L.pbones.jaw.quaternion.angleTo(L.restJaw) / DEG;
  }

  private axis(x: number, y: number, z: number, out: Vector3): Vector3 {
    return out.set(x, y, z).applyQuaternion(this.root.quaternion).normalize();
  }
}
