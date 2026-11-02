// OWNER: chars-art
// 人物の動き。姿勢の契約（CharacterSnap）から、毎コマ連続に骨の姿勢を組み立てる。
// 1コマの順番（spiderbench の「滑らかさの契約」の考え方を借り、数値は自分で決めた）：
//   根を置く → 見た目の向きをばねで追わせる → 層の重みを 0.25〜0.3 秒で動かす → 足運び（接地足は世界に固定）
//   → 各層の姿勢（歩き・座る・居眠り・倒れ・動作）→ 重みで混ぜる → 頭の向き → 地面への置き直し
//   → 脚の IK（接地足へ）→ 腕の IK（槍・柄・膝・提灯へ。重み1で解いて回転を混ぜる）→ 付属品と揺れ物 → 骨へ書く
import { type Bone, type Object3D, Quaternion, Vector3 } from 'three';
import { rotYFromYaw, type ActionKind, type CharacterKind, type CharacterSnap } from '../../../contract/snapshot';
import type { KindAsset } from '../asset';
import { BLEND, CLOSE_COMBAT, GAIT, LANTERN, POSE_TABLE, POSTURE, SPEAR_CARRY, SWAY, type Posture, type SpearCarry } from '../config';
import { B, BONE_COUNT, PARENT } from '../rig';
import { clamp, clamp01, DEG, frac, hashString, lerp, rng, smin, smoothstep, TAU } from '../util/math';
import { damped, KickSpring, Pendulum, smoothDamp, smoothDampAngle, wrapAngle } from '../util/springs';
import { Gait, type GaitInput, type RestFeet } from './gait';
import { newTwoBoneOut, solveTwoBone, toLocal } from './ik';
import { blendPoses, Globals, Pose, setDeg } from './pose';
import { DOWN_TRACK, DOZE_TRACK, FALLEN_TRACK, has, NOBU_DOWN_TRACK, sample, SIT_TRACK, STAGGER_DOWN_TRACK, STRIKE_KATANA, TRACKS, UPPER_ONLY, upperMask, type Track } from './poses';

/** 手の行き先（層ごとに出して、重みで混ぜる）。 */
class HandSpec {
  pointW = 0;
  readonly point = new Vector3();
  axisW = 0;
  readonly axis = new Vector3(0, 0, 1);
  spearW = 0;
  spearS = 1;
  hiltW = 0;
  sayaW = 0;
  tsukaW = 0;
  kneeW = 0;
  lanternW = 0;
  clear(): void {
    this.pointW = this.axisW = this.spearW = this.hiltW = this.sayaW = this.tsukaW = this.kneeW = this.lanternW = 0;
    this.point.set(0, 0, 0);
    this.axis.set(0, 0, 0);
    this.spearS = 0;
  }
  /** o を重み w で足す（あとで normalize で割る）。 */
  addScaled(o: HandSpec, w: number): void {
    this.pointW += o.pointW * w;
    this.point.addScaledVector(o.point, o.pointW * w);
    this.axisW += o.axisW * w;
    this.axis.addScaledVector(o.axis, o.axisW * w);
    this.spearW += o.spearW * w;
    this.spearS += o.spearS * o.spearW * w;
    this.hiltW += o.hiltW * w;
    this.sayaW += o.sayaW * w;
    this.tsukaW += o.tsukaW * w;
    this.kneeW += o.kneeW * w;
    this.lanternW += o.lanternW * w;
  }
  normalize(): void {
    if (this.pointW > 1e-5) this.point.multiplyScalar(1 / this.pointW);
    if (this.axisW > 1e-5) this.axis.normalize();
    if (this.spearW > 1e-5) this.spearS /= this.spearW;
  }
}

/** 骨以外に、層が出す値（槍・手・刀・小石・足の留め・光の弧）。 */
class Extra {
  spearW = 0;
  readonly butt = new Vector3();
  readonly dir = new Vector3(0, 1, 0);
  readonly hand = [new HandSpec(), new HandSpec()];
  draw = 0;
  rev = 0;
  pebble = 0;
  plant = 0;
  arc = 0;
  clear(): void {
    this.spearW = 0;
    this.butt.set(0, 0, 0);
    this.dir.set(0, 0, 0);
    this.hand[0].clear();
    this.hand[1].clear();
    this.draw = this.rev = this.pebble = this.plant = this.arc = 0;
  }
  addScaled(o: Extra, w: number): void {
    this.spearW += o.spearW * w;
    this.butt.addScaledVector(o.butt, o.spearW * w);
    this.dir.addScaledVector(o.dir, o.spearW * w);
    this.hand[0].addScaled(o.hand[0], w);
    this.hand[1].addScaled(o.hand[1], w);
    this.draw += o.draw * w;
    this.rev += o.rev * w;
    this.pebble += o.pebble * w;
    this.plant += o.plant * w;
    this.arc += o.arc * w;
  }
  finish(): void {
    if (this.spearW > 1e-5) {
      this.butt.multiplyScalar(1 / this.spearW);
      this.dir.normalize();
    }
    this.hand[0].normalize();
    this.hand[1].normalize();
  }
}

/** 揺れ物（袖の袋・頭巾の垂れ・髪・羽織・袖の板）。付け根の加速度で振り子を揺らす。 */
class Dangle {
  readonly pend: Pendulum;
  readonly prev = new Vector3();
  readonly vel = new Vector3();
  init = false;
  constructor(
    readonly bone: number,
    length: number,
    zeta: number,
    /** 重さで真下へ垂れる割合（0 なら親の回転のまま）。 */
    readonly gravity: number,
    /** 振れの大きさの倍率。 */
    readonly gain: number,
  ) {
    this.pend = new Pendulum(length, zeta);
  }
}

type LayerId = 0 | 1 | 2 | 3 | 4;
const L_LOCO = 0;
const L_SIT = 1;
const L_DOZE = 2;
const L_DOWN = 3;
const L_ACT = 4;

const SPINE_BONES = new Set<number>([B.hips, B.spine, B.chest, B.neck, B.head]);
const POSTURE_KEYS = Object.keys(POSE_TABLE.calm) as (keyof Posture)[];
const NO_MASKS: (Float32Array | null)[] = [null, null, null, null];
const UPPER_MASK = upperMask();

/** 確認ページが足の滑りを測るための中身。 */
export interface AnimDebug {
  /** 足ごと：接地しているか、支点（足の骨から見た位置）。 */
  contact: { planted: boolean; pivot: Vector3 }[];
  plantW: number;
  locoW: number;
  moving: boolean;
  phase: number;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _qa = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _zAxis = new Vector3(0, 0, 1);

export class Animator {
  readonly kind: CharacterKind;
  readonly rest: Vector3[];
  private first = true;
  private px = 0;
  private pz = 0;
  private prevVis = 0;
  private readonly visRot = damped(0);
  private readonly speed = damped(0);
  private dirX = 0;
  private dirZ = 1;
  // 重み（形を整える前の 0→1）
  private readonly w = { loco: 1, sit: 0, doze: 0, down: 0, act: 0, crouch: 0, calm: 1, susp: 0, alert: 0, lantern: 0, spear: 0, sword: 0 };
  private actKind: ActionKind | null = null;
  private actT = 0;
  private staggerDown = false;
  private locoWasOff = false;
  readonly gait = new Gait();
  // ばね
  private readonly accelLean = new KickSpring(SWAY.accelLeanHz, SWAY.accelLeanZeta);
  private readonly turnRoll = damped(0);
  private readonly hipsLift = damped(0.9);
  private readonly head = damped(0);
  private readonly armL = new KickSpring(1.6, 0.5);
  private readonly armR = new KickSpring(1.6, 0.5);
  private readonly spearTilt = [new KickSpring(1.8, 0.35), new KickSpring(1.8, 0.35)];
  private readonly nodKick = new KickSpring(3.2, 0.35);
  private prevSpeed = 0;
  private breath = 0;
  private exert = 0;
  private nodClock = 0;
  private time = 0;
  // 人ごとの違い（id から種を作る）
  private cadMul = 1;
  private armAmp = 1;
  private nodPeriod = 3.2;
  private idlePhase = 0;
  private leanBias = 0;
  /** 動いている度合い（速さから。構えの足幅を弱めるのに使う）。 */
  private moveW = 0;
  // 姿勢
  private readonly layers: Pose[];
  private readonly extras: Extra[];
  private readonly stanceMix: Pose;
  private readonly stanceLayers: Pose[];
  private readonly pair: Pose[];
  private readonly pairW = [1, 0];
  private readonly pairM: (Float32Array | null)[] = [null, null];
  private readonly gin: GaitInput = { x: 0, z: 0, rotY: 0, dirX: 0, dirZ: 1, speed: 0, disp: 0 };
  private readonly stanceExtra = new Extra();
  private readonly final: Pose;
  private readonly ex = new Extra();
  readonly G = new Globals();
  private readonly ik = newTwoBoneOut();
  private readonly ankle = [new Vector3(), new Vector3()];
  private readonly footQ = [new Quaternion(), new Quaternion()];
  private readonly legLimit = [0, 0];
  // r02-chars-周2: 指摘「提灯の振れが大きすぎる」 減衰比 0.12→0.22、振れの上限は Pendulum の limit で 0.75 rad
  private readonly lanternPend = new Pendulum(LANTERN.hang, 0.3, 9.8, 0.75);
  private readonly lanternPrev = new Vector3();
  private readonly lanternVel = new Vector3();
  /** 根（足もと）の世界の速度と加速度（提灯を歩き・止まりで揺らすのに使う）。 */
  private readonly rootVel = new Vector3();
  private readonly rootAcc = new Vector3();
  private turnRateNow = 0;
  private prevTurn = 0;
  private lanternInit = false;
  private readonly dangles: Dangle[] = [];
  private readonly spearPos = new Vector3();
  private readonly spearDir = new Vector3(0, 1, 0);
  private readonly spearBase = new Vector3(0, 1, 0);
  private readonly hipsPrev = new Vector3();
  private readonly hipsVel = new Vector3();
  private readonly tmpFoot = { x: 0, z: 0 };
  readonly debug: AnimDebug;
  /** 刀の光の弧の強さ（0→1）。character.ts が読む。 */
  arc = 0;
  draw = 0;
  /** 人物が横たわっている度合い（接地の暗がりを細長くする）。 */
  lying = 0;
  private hasSpear: boolean;
  private hasSword: boolean;
  private tailLen: number;

  constructor(
    readonly asset: KindAsset,
    readonly bones: Bone[],
  ) {
    this.kind = asset.kind;
    this.rest = asset.offsets;
    this.layers = [0, 1, 2, 3, 4].map(() => new Pose(this.rest));
    this.extras = [0, 1, 2, 3, 4].map(() => new Extra());
    this.stanceMix = new Pose(this.rest);
    this.final = new Pose(this.rest);
    this.stanceLayers = this.layers.slice(0, 4);
    this.pair = [this.stanceMix, this.layers[L_ACT]];
    this.hasSpear = this.kind === 'ashigaru';
    this.hasSword = this.kind === 'player' || this.kind === 'samurai' || this.kind === 'ranmaru';
    this.tailLen = 0.12;
    const k = this.kind;
    if (k === 'ranmaru' || k === 'nobunaga') {
      this.dangles.push(new Dangle(B.sleeveL, 0.24, 0.16, 0.8, 1), new Dangle(B.sleeveR, 0.24, 0.16, 0.8, 1));
    }
    if (k === 'player' || k === 'samurai' || k === 'ranmaru') this.dangles.push(new Dangle(B.tailA, 0.12, 0.2, 0.45, 1.2));
    if (k === 'nobunaga') {
      this.dangles.push(new Dangle(B.tailA, 0.08, 0.3, 0, 0.5));
      this.dangles.push(new Dangle(B.cape, 0.42, 0.25, 0.3, 0.7));
    }
    if (k === 'samurai') this.dangles.push(new Dangle(B.sodeL, 0.2, 0.3, 0.15, 0.8), new Dangle(B.sodeR, 0.2, 0.3, 0.15, 0.8));
    this.debug = {
      contact: [
        { planted: true, pivot: new Vector3() },
        { planted: true, pivot: new Vector3() },
      ],
      plantW: 1,
      locoW: 1,
      moving: false,
      phase: 0,
    };
  }

  // ------------------------------------------------------------------ 1コマ

  update(dtIn: number, snap: CharacterSnap, root: Object3D): void {
    const dt = clamp(dtIn, 0, 0.1);
    const pose = snap.pose;
    const rotY = rotYFromYaw(snap.yaw);
    root.position.set(snap.x, 0, snap.z);
    root.rotation.y = rotY;
    let dx = snap.x - this.px;
    let dz = snap.z - this.pz;
    let disp = Math.hypot(dx, dz);
    if (this.first || disp > GAIT.teleport) {
      // r00-anim: 指摘「最初のコマで原点からの移動を速さに数え、脚が大きく開いた」 初期化したコマの移動量は 0
      this.resetAll(snap, rotY);
      dx = dz = disp = 0;
    }
    this.px = snap.x;
    this.pz = snap.z;
    this.time += dt;
    if (dt > 0) {
      const vx = dx / dt;
      const vz = dz / dt;
      this.rootAcc.set((vx - this.rootVel.x) / dt, 0, (vz - this.rootVel.z) / dt);
      this.rootVel.set(vx, 0, vz);
    }

    // 見た目の向き：ゲームの向きが1コマで跳んでも、体はばねで追う（根は契約どおりゲームの向き）
    // r02-chars-周2: 指摘「止まったまま向きを変えると体が速く回りすぎ、提灯が上限まで振れる」
    //   止まっている時は 0.22 秒・毎秒 6 rad まで、動いている時は 0.09 秒・毎秒 14 rad まで（速さで混ぜる）
    const yawMove = smoothstep(0.4, 2.2, this.speed.value);
    if (dt > 0) smoothDampAngle(this.visRot, rotY, lerp(BLEND.yawTimeStill, BLEND.yawTime, yawMove), dt, lerp(BLEND.yawMaxSpeedStill, BLEND.yawMaxSpeed, yawMove));
    this.visRot.value = rotY + wrapAngle(this.visRot.value - rotY);
    const vis = this.visRot.value;
    const turnRate = dt > 0 ? wrapAngle(vis - this.prevVis) / dt : 0;
    this.prevVis = vis;
    this.turnRateNow = turnRate;

    // 速さと動く向き
    const meas = dt > 0 ? disp / dt : 0;
    smoothDamp(this.speed, meas > pose.speed + 0.4 ? meas : pose.speed, 0.07, dt);
    const speed = Math.max(0, this.speed.value);
    if (disp > 1e-5) {
      const k = 1 - Math.exp(-dt / 0.06);
      this.dirX += (dx / disp - this.dirX) * k;
      this.dirZ += (dz / disp - this.dirZ) * k;
      const l = Math.hypot(this.dirX, this.dirZ) || 1;
      this.dirX /= l;
      this.dirZ /= l;
    }
    const accel = dt > 0 ? (speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = speed;
    this.exert = Math.max(this.exert * Math.exp(-dt / 5), speed / 5.2);

    this.moveW = smoothstep(0.05, 0.6, speed);
    this.updateWeights(dt, snap);
    const sw = this.stanceWeights();
    const aW = smoothstep(0, 1, this.w.act);
    const actTrack = this.actKind ? (this.actKind === 'stagger' && this.staggerDown ? STAGGER_DOWN_TRACK : this.actKind === 'strike' && this.hasSword ? STRIKE_KATANA : TRACKS[this.actKind]) : null;
    const upperOnly = this.actKind ? UPPER_ONLY[this.actKind] : true;
    const actPlant = actTrack ? sample(actTrack, 'plant', this.actT, upperOnly ? 1 : 0) : 1;
    // r07統合: 肘打ち前の踏み込みは実座標の移動で足運びを更新し、両足を貼り付けない。
    const freezeFeet = aW > 0.01 && !upperOnly && this.actKind !== 'melee';

    // 足運び（歩き・止まりの層が効いている間だけ）
    const rest = this.restFeet();
    const gin = this.gin;
    gin.x = snap.x;
    gin.z = snap.z;
    gin.rotY = vis;
    gin.dirX = this.dirX;
    gin.dirZ = this.dirZ;
    gin.speed = speed;
    gin.disp = disp;
    if (sw[L_LOCO] > 0.001) {
      if (this.locoWasOff) {
        this.gait.reset(gin, rest);
        this.locoWasOff = false;
      }
      if (!freezeFeet) this.gait.update(dt, gin, smoothstep(0, 1, this.w.crouch), this.cadMul, rest);
    } else this.locoWasOff = true;
    this.footTargets(snap, vis);

    // 各層
    this.breath += dt * TAU * (0.22 + 0.42 * this.exert);
    this.nodClock += dt;
    const breathDeg = (0.7 + 1.6 * this.exert) * Math.sin(this.breath);
    if (sw[L_LOCO] > 0) this.evalLoco(this.layers[L_LOCO], this.extras[L_LOCO], dt, speed, accel, turnRate, breathDeg);
    if (sw[L_SIT] > 0) this.evalSit(this.layers[L_SIT], this.extras[L_SIT], breathDeg);
    if (sw[L_DOZE] > 0) this.evalDoze(this.layers[L_DOZE], this.extras[L_DOZE], dt);
    if (sw[L_DOWN] > 0) this.evalDown(this.layers[L_DOWN], this.extras[L_DOWN]);
    if (actTrack && aW > 0) this.evalTrack(actTrack, this.actT, this.layers[L_ACT], this.extras[L_ACT], upperOnly ? 1 : 0);

    // 混ぜる：まず構えの層どうし、次に動作の層（上半身だけの動作は脚と腰に効かせない）
    blendPoses(this.stanceMix, this.stanceLayers, sw, NO_MASKS);
    this.stanceExtra.clear();
    for (let l = 0; l < 4; l++) if (sw[l] > 0) this.stanceExtra.addScaled(this.extras[l], sw[l]);
    if (actTrack && aW > 0) {
      this.pairW[0] = Math.max(1 - aW, 1e-4);
      this.pairW[1] = aW;
      this.pairM[1] = upperOnly ? UPPER_MASK : null;
      blendPoses(this.final, this.pair, this.pairW, this.pairM);
      this.ex.clear();
      this.ex.addScaled(this.stanceExtra, 1 - aW);
      this.ex.addScaled(this.extras[L_ACT], aW);
    } else {
      this.final.copy(this.stanceMix);
      this.ex.clear();
      this.ex.addScaled(this.stanceExtra, 1);
    }
    this.ex.finish();

    // 頭の向き（体に対する headYaw）を胸・首・頭に分ける。倒れている間は効かせない
    const lookW = 1 - smoothstep(0, 1, this.w.down) - (freezeFeet ? aW * 0.8 : 0);
    if (dt > 0) smoothDamp(this.head, pose.headYaw, BLEND.headTime, dt);
    const h = this.head.value * clamp01(lookW);
    if (Math.abs(h) > 1e-5) {
      this.premulYaw(B.chest, -h * 0.18);
      this.premulYaw(B.neck, -h * 0.32);
      this.premulYaw(B.head, -h * 0.5);
    }

    // 足を地面に留める重み：歩き・止まりの層 × 動作が足を留めるか
    const plantW = sw[L_LOCO] * (1 - aW * (1 - actPlant));
    this.G.compute(this.final);
    this.groundClamp(plantW, sw, freezeFeet ? aW * (1 - actPlant) : 0);
    this.legIK(plantW);
    this.carryAndHands(dt, snap);
    this.secondary(dt, snap, vis);

    // 骨へ書く。base は見た目の向きの補正（根の向きとの差）だけを持つ
    const bones = this.bones;
    for (let i = 1; i < BONE_COUNT; i++) {
      bones[i].quaternion.copy(this.final.q[i]);
      bones[i].position.copy(this.final.p[i]);
    }
    bones[0].position.set(0, 0, 0);
    bones[0].rotation.set(0, wrapAngle(vis - rotY), 0);
    // 横たわる度合い：倒れの重みのうち動作が覆っていない分と、倒れて終わる動作の終わりの方
    const fallEnd = this.actKind === 'stagger' && this.staggerDown ? smoothstep(...CLOSE_COMBAT.fall, this.actT) * aW : this.actKind && (this.actKind === 'takedownVictim' || this.actKind === 'assassinateVictim' || this.actKind === 'struck') ? smoothstep(0.7, 0.95, this.actT) * aW : 0;
    this.lying = Math.max(smoothstep(0, 1, this.w.down) * (1 - aW), fallEnd);
    this.debug.plantW = plantW;
    this.debug.locoW = sw[L_LOCO];
    this.debug.moving = this.gait.moving;
    this.debug.phase = this.gait.phase;
  }

  // ------------------------------------------------------------------ 初期化と重み

  private resetAll(snap: CharacterSnap, rotY: number): void {
    if (this.first) {
      const r = rng(hashString(snap.id));
      this.cadMul = 0.95 + r() * 0.1;
      this.armAmp = 0.85 + r() * 0.3;
      this.nodPeriod = 2.8 + r() * 0.9;
      this.idlePhase = r() * TAU;
      this.leanBias = (r() - 0.5) * 3;
      this.breath = r() * TAU;
      this.nodClock = r() * this.nodPeriod;
    }
    this.first = false;
    this.px = snap.x;
    this.pz = snap.z;
    this.visRot.value = rotY;
    this.visRot.velocity = 0;
    this.prevVis = rotY;
    this.speed.value = snap.pose.speed;
    this.speed.velocity = 0;
    this.dirX = Math.sin(rotY);
    this.dirZ = Math.cos(rotY);
    this.head.value = snap.pose.headYaw;
    this.head.velocity = 0;
    this.prevSpeed = snap.pose.speed;
    // 重みは今の姿勢にそろえる（最初のコマで混ぜ始めない）
    this.updateWeights(1e3, snap);
    this.gait.reset({ x: snap.x, z: snap.z, rotY, dirX: this.dirX, dirZ: this.dirZ, speed: 0, disp: 0 }, this.restFeet());
    this.locoWasOff = false;
    this.lanternInit = false;
    for (const d of this.dangles) {
      d.init = false;
      d.pend.reset();
    }
    this.accelLean.reset();
    this.armL.reset();
    this.armR.reset();
  }

  private updateWeights(dt: number, snap: CharacterSnap): void {
    const p = snap.pose;
    const W = this.w;
    const mv = (cur: number, tgt: number, T: number) => (dt >= 1e2 ? tgt : cur + clamp(tgt - cur, -dt / T, dt / T));
    // r01-chars-周1: 指摘「当て身・討ち取りの後、倒れへ移る瞬間に元の構え（立つ・座る）が一瞬出て体が起き上がる」
    //   倒れて終わる動作の間は、動作の層が全身を覆ったら構えの層を先に「倒れ」へ切り替えておく（動作の最後と倒れの姿は同じ）
    if (p.action?.kind === 'stagger') this.staggerDown = p.stance === 'down';
    else if (p.action || this.actKind !== 'stagger') this.staggerDown = false;
    const staggerFalls = p.action?.kind === 'stagger' && this.staggerDown;
    const fallsDown = p.action !== null && (p.action.kind === 'takedownVictim' || p.action.kind === 'assassinateVictim' || p.action.kind === 'struck' || staggerFalls);
    // r07-chars: 2撃目は初コマからstance=down。怯み層が覆うまで立位を保ち、早すぎる崩れを防ぐ。
    const st = fallsDown && W.act > 0.99 ? 'down' : staggerFalls ? 'stand' : p.stance;
    W.loco = mv(W.loco, st === 'stand' || st === 'crouch' ? 1 : 0, BLEND.stance);
    W.sit = mv(W.sit, st === 'sit' ? 1 : 0, BLEND.stance);
    W.doze = mv(W.doze, st === 'doze' ? 1 : 0, BLEND.stance);
    W.down = mv(W.down, st === 'down' ? 1 : 0, BLEND.stance);
    W.crouch = mv(W.crouch, st === 'crouch' ? 1 : 0, BLEND.stance);
    W.calm = mv(W.calm, p.awareness === 'calm' ? 1 : 0, BLEND.awareness);
    W.susp = mv(W.susp, p.awareness === 'suspicious' ? 1 : 0, BLEND.awareness);
    W.alert = mv(W.alert, p.awareness === 'alert' ? 1 : 0, BLEND.awareness);
    W.lantern = mv(W.lantern, p.lantern ? 1 : 0, 0.25);
    W.spear = mv(W.spear, p.weapon === 'spear' && this.hasSpear ? 1 : 0, BLEND.weapon);
    W.sword = mv(W.sword, this.hasSword && p.weapon !== 'none' ? 1 : 0, BLEND.weapon);
    if (p.action) {
      if (this.actKind !== p.action.kind && W.act > 0.05 && dt < 1e2) {
        // 動作が別の動作へ直接変わった：前の動作の重みを残さず、新しい動作で入り直す
        W.act = 0;
      }
      this.actKind = p.action.kind;
      this.actT = clamp01(p.action.t);
      W.act = mv(W.act, 1, BLEND.actionIn);
    } else {
      // 終わった動作は最後の t のまま、重みを下ろしながら評価し続ける
      if (this.actKind) this.actT = this.actT > 0.5 ? 1 : this.actT;
      W.act = mv(W.act, 0, BLEND.actionOut);
      if (W.act <= 0) this.actKind = null;
    }
  }

  /** 構えの層（歩き・座る・居眠り・倒れ）の重み。S 字に曲げてから合計1にそろえる。 */
  private readonly swBuf = [1, 0, 0, 0];
  private stanceWeights(): number[] {
    const s = this.swBuf;
    s[0] = smoothstep(0, 1, this.w.loco);
    s[1] = smoothstep(0, 1, this.w.sit);
    s[2] = smoothstep(0, 1, this.w.doze);
    s[3] = smoothstep(0, 1, this.w.down);
    const sum = s[0] + s[1] + s[2] + s[3];
    if (sum < 1e-4) {
      s[0] = 1;
      s[1] = s[2] = s[3] = 0;
    } else for (let i = 0; i < 4; i++) s[i] /= sum;
    return s;
  }

  /** いまの構え（種類・立つ／しゃがむ・平常／不審／発見を混ぜたもの）。 */
  private readonly postureBuf: Posture = { ...POSE_TABLE.calm };
  private posture(): Posture {
    const P = this.postureBuf;
    const W = this.w;
    const keys = POSTURE_KEYS;
    const isGuard = this.kind === 'ashigaru' || this.kind === 'samurai' || this.kind === 'ranmaru';
    const sum = W.calm + W.susp + W.alert || 1;
    for (const k of keys) {
      let stand: number;
      if (isGuard) stand = (POSE_TABLE.calm[k] * W.calm + POSE_TABLE.suspicious[k] * W.susp + POSE_TABLE.alert[k] * W.alert) / sum;
      else if (this.kind === 'player') stand = POSE_TABLE.playerStand[k];
      else stand = (POSE_TABLE.nobuStand[k] * W.calm + POSE_TABLE.suspicious[k] * W.susp + POSE_TABLE.alert[k] * W.alert) / sum;
      P[k] = lerp(stand, POSE_TABLE.crouch[k], smoothstep(0, 1, W.crouch));
    }
    // r01-chars-周1: 指摘「発見して走る足軽の脚が大開きになり、足が 2.0 m/s 滑る」
    //   構えの足幅・前後・半身・腰の落としを、動いている間は平常へ寄せる（走りながら踏ん張った構えはしない）。 そのまま → 動きに応じて 85% 寄せる
    const mv = this.moveW * (1 - smoothstep(0, 1, W.crouch));
    if (mv > 0 && isGuard) {
      const c = POSE_TABLE.calm;
      P.fwdL = lerp(P.fwdL, c.fwdL, mv * 0.85);
      P.fwdR = lerp(P.fwdR, c.fwdR, mv * 0.85);
      P.latW = lerp(P.latW, c.latW, mv * 0.85);
      P.hanmi = lerp(P.hanmi, c.hanmi, mv * 0.7);
      P.drop = lerp(P.drop, c.drop + 0.03, mv * 0.75);
    }
    P.lean += this.leanBias;
    return P;
  }

  private restFeet(): RestFeet {
    const P = this.posture();
    const hx = this.asset.dims.hipX;
    return { latL: hx + P.latW, latR: hx + P.latW, fwdL: P.fwdL, fwdR: P.fwdR, outDeg: P.out };
  }

  // ------------------------------------------------------------------ 足：世界の接地点 → base の足首と足の向き

  private footTargets(snap: CharacterSnap, vis: number): void {
    const d = this.asset.dims;
    const c = Math.cos(vis);
    const s = Math.sin(vis);
    for (let i = 0; i < 2; i++) {
      const f = this.gait.feet[i];
      const pitch = f.pitch * DEG;
      // 支点：つま先が上ならかかと、かかとが上ならつま先の付け根
      const toePivot = d.toe * 0.82;
      const pivotFwd = pitch > 0 ? -d.heel : pitch < 0 ? toePivot : 0;
      const fs = Math.sin(f.rotY);
      const fc = Math.cos(f.rotY);
      const pvx = f.x + fs * pivotFwd;
      const pvz = f.z + fc * pivotFwd;
      // 支点から足首まで（足の向きの座標で）を、つま先の上がりで回す
      const oy = d.ankleY;
      const oz = -pivotFwd;
      const cy = Math.cos(-pitch);
      const sy = Math.sin(-pitch);
      const ry = oy * cy - oz * sy;
      const rz = oy * sy + oz * cy;
      const wx = pvx + fs * rz;
      const wz = pvz + fc * rz;
      const wy = ry + f.height;
      // 世界 → base（根の位置を引き、見た目の向きの逆に回す）
      const rx = wx - snap.x;
      const rzz = wz - snap.z;
      this.ankle[i].set(rx * c - rzz * s, wy, rx * s + rzz * c);
      setDeg(this.footQ[i], -f.pitch, (wrapAngle(f.rotY - vis) * 180) / Math.PI, 0, 'YXZ');
      // 足の滑りを測るための支点（足の骨から見た位置）
      const dc = this.debug.contact[i];
      dc.planted = f.planted;
      dc.pivot.set(0, -d.ankleY, pivotFwd);
    }
    void this.tmpFoot;
  }

  // ------------------------------------------------------------------ 層：歩き・止まり

  private evalLoco(out: Pose, ex: Extra, dt: number, speed: number, accel: number, turnRate: number, breath: number): void {
    out.reset();
    ex.clear();
    const P = this.posture();
    const g = this.gait;
    const run = g.params.run;
    const moveW = smoothstep(0.05, 0.6, speed);
    const fast = clamp01((speed - 1.0) / 1.8);
    const beta = g.params.duty;
    const pL = frac(g.phase);
    const c1 = Math.cos(TAU * pL);
    const sway = Math.cos(TAU * (pL - beta / 2));
    const crouch = smoothstep(0, 1, this.w.crouch);
    const d = this.asset.dims;
    // 前傾：構え＋歩きの速さ＋加速度（ばね）
    const leanMove = lerp(lerp(POSTURE.leanWalk[0], POSTURE.leanWalk[1], fast), POSTURE.leanRun, run) * moveW * (1 - crouch * 0.6);
    const aLean = this.accelLean.update(dt, clamp(accel, -20, 20) * SWAY.accelLeanDeg * (0.4 + 0.6 * moveW));
    smoothDamp(this.turnRoll, clamp(turnRate, -4, 4) * SWAY.turnRollDeg * smoothstep(1.0, 4.0, speed), 0.12, dt);
    // 腰の高さ：構えで下げ、走りは沈む。走りは宙に浮く間だけ少し上がる
    let hipsY = this.rest[B.hips].y - P.drop - POSTURE.walkDropFast * fast * moveW * (1 - run) - POSTURE.runDrop * run * moveW;
    hipsY += POSTURE.runFlightRise * run * moveW * -Math.cos(2 * TAU * (pL - beta / 2));
    const idle = (1 - moveW) * 0.008 * Math.sin(this.time * 1.05 + this.idlePhase);
    const hx = SWAY.latSway * sway * moveW * (1 - run) * (1 - crouch * 0.5) + idle;
    const hz = -0.02 * crouch + 0.05 * run * moveW;
    hipsY = this.reachLimit(hipsY, hx, hz);
    // 腰を下げるのは即座に（接地足に届かせるため）、上げるのはばねで（制約が外れた瞬間に跳ねないように）
    if (dt > 0 && hipsY > this.hipsLift.value) smoothDamp(this.hipsLift, hipsY, 0.07, dt);
    else {
      this.hipsLift.value = hipsY;
      this.hipsLift.velocity = 0;
    }
    hipsY = this.hipsLift.value;
    out.p[B.hips].set(hx, hipsY, hz);
    const yawAmp = lerp(SWAY.pelvisYawWalk, SWAY.pelvisYawRun, run) * moveW;
    const pelYaw = -yawAmp * c1 - P.hanmi * 0.55;
    const pelRoll = SWAY.pelvisRoll * sway * moveW * (1 - run) + this.turnRoll.value * 0.5 + (1 - moveW) * 1.2 * Math.sin(this.time * 1.05 + this.idlePhase);
    const pelPitch = P.lean * 0.15 + leanMove * 0.15 + aLean * 0.2;
    setDeg(out.q[B.hips], pelPitch, pelYaw, pelRoll, 'YXZ');
    const spX = P.lean * 0.45 + leanMove * 0.42 + aLean * 0.4 + breath * 0.25;
    const chX = P.lean * 0.4 + leanMove * 0.43 + aLean * 0.4 + breath;
    const spY = yawAmp * c1 * 0.45 - P.hanmi * 0.2;
    const chY = yawAmp * c1 * 0.85 - P.hanmi * 0.25;
    setDeg(out.q[B.spine], spX, spY, -pelRoll * 0.6 + this.turnRoll.value * 0.3, 'YXZ');
    setDeg(out.q[B.chest], chX, chY, -pelRoll * 0.3, 'YXZ');
    // 首と頭：目線の世界の傾きを gaze に保つ（前傾しても前を見る）。体のひねりも頭では打ち消す
    const bodyPitch = pelPitch + spX + chX;
    const neckX = P.neck;
    const headX = P.gaze - bodyPitch - neckX;
    // 体（骨盤＋腹＋胸）のひねりを首と頭で打ち消して、顔は進む向きへ
    const counter = -(pelYaw + spY + chY);
    setDeg(out.q[B.neck], neckX, counter * 0.5, 0, 'YXZ');
    setDeg(out.q[B.head], headX, counter * 0.45, 0, 'YXZ');
    // 呼吸で肩が上がる
    setDeg(out.q[B.shoulderL], 0, 0, breath * 0.5, 'XZY');
    setDeg(out.q[B.shoulderR], 0, 0, -breath * 0.5, 'XZY');
    // 空いた腕の振り（脚の位相から読み、遅れて行き過ぎるばねに通す。ばねの速さは歩調に合わせる）
    const amp = lerp(lerp(SWAY.armSwingWalk[0], SWAY.armSwingWalk[1], fast), SWAY.armSwingRun, run) * moveW * this.armAmp * (1 - crouch * 0.6);
    this.armL.hz = this.armR.hz = Math.max(1.2, g.params.cadence * 0.75);
    const aL = this.armL.update(dt, -amp * c1);
    const aR = this.armR.update(dt, amp * c1);
    const elbow = P.elbow + SWAY.runElbow * run * moveW;
    setDeg(out.q[B.upperArmL], -(P.armFwd + aL), 0, P.armAbd + run * 6, 'XZY');
    setDeg(out.q[B.upperArmR], -(P.armFwd + aR), 0, -(P.armAbd + run * 6), 'XZY');
    setDeg(out.q[B.foreArmL], -(elbow + Math.max(0, aL) * 0.5), 0, 0, 'XZY');
    setDeg(out.q[B.foreArmR], -(elbow + Math.max(0, aR) * 0.5), 0, 0, 'XZY');
    // 脚の IK が外れた時の逃げ道：腿と脛を少し曲げておく
    setDeg(out.q[B.thighL], -10 * crouch, 0, 3, 'XZY');
    setDeg(out.q[B.thighR], -10 * crouch, 0, -3, 'XZY');
    ex.plant = 1;
    this.locoCarry(ex, P, out.p[B.hips], moveW, d.hipX);
  }

  /** 脚が届く高さまで腰を下げる（接地足と、着地間近の振り出し足）。 */
  private reachLimit(hipsY: number, hx: number, hz: number): number {
    const d = this.asset.dims;
    const L = (d.thigh + d.shin) * 0.985;
    let lim = 10;
    for (let i = 0; i < 2; i++) {
      const f = this.gait.feet[i];
      const a = this.ankle[i];
      const jx = hx + (i === 0 ? d.hipX : -d.hipX);
      const hd = Math.hypot(a.x - jx, a.z - hz);
      const maxJ = a.y + Math.sqrt(Math.max(0, L * L - hd * hd));
      let li = maxJ + d.hipDrop;
      // r01-chars-周1: 指摘「足が離れた瞬間に腰が 0.43m→0.83m へ1コマで跳ねる」
      //   振り出しの中ほどだけ制約を外し、離れた直後と着地の直前はなめらかに効かせる。 離れた瞬間に外す → 振り出しの 0〜35% で薄める
      if (!f.planted) li += 0.6 * Math.min(smoothstep(0, 0.12, f.prog), 1 - smoothstep(0.55, 0.95, f.prog));
      this.legLimit[i] = li;
      lim = i === 0 ? li : smin(lim, li, 0.05);
    }
    return Math.max(this.rest[B.hips].y - 0.5, smin(hipsY, lim, 0.03));
  }

  /** 歩き・止まりの層の持ち物：槍・提灯・刀の構え。 */
  private locoCarry(ex: Extra, P: Posture, hips: Vector3, moveW: number, _hipX: number): void {
    const W = this.w;
    const R = ex.hand[0];
    const L = ex.hand[1];
    if (this.hasSpear && W.spear > 0) {
      const lan = smoothstep(0, 1, W.lantern);
      const sum = W.calm + W.susp + W.alert || 1;
      const add = (c: SpearCarry, w: number) => {
        if (w <= 1e-4) return;
        spearFromCarry(c, hips, _v, _v2);
        const sw = w * W.spear;
        ex.spearW += sw;
        ex.butt.addScaledVector(_v, sw);
        ex.dir.addScaledVector(_v2, sw);
        if (c.R) {
          R.spearW += sw;
          R.spearS += c.s * sw;
          R.axisW += sw;
          R.axis.addScaledVector(_v2, sw);
        }
        if (c.L) {
          const sl = c.R ? c.s + _v3.fromArray(c.L).sub(_v.fromArray(c.R)).length() : c.s;
          spearFromCarry(c, hips, _v, _v2);
          L.spearW += sw;
          L.spearS += sl * sw;
          L.axisW += sw;
          L.axis.addScaledVector(_v2, sw);
        }
      };
      add(SPEAR_CARRY.calm, (W.calm / sum) * (1 - moveW) * (1 - lan));
      add(SPEAR_CARRY.calmWalk, (W.calm / sum) * moveW * (1 - lan));
      add(SPEAR_CARRY.suspicious, (W.susp / sum) * (1 - lan));
      add(SPEAR_CARRY.alert, (W.alert / sum) * (1 - lan));
      add(SPEAR_CARRY.calmLeft, (W.calm / sum) * (1 - moveW) * lan);
      add(SPEAR_CARRY.calmLeftWalk, (W.calm / sum) * moveW * lan);
      add(SPEAR_CARRY.suspiciousLeft, (W.susp / sum) * lan);
      add(SPEAR_CARRY.alertLeft, (W.alert / sum) * lan);
      // add は重みを掛けたまま足したので、ここで割り戻して1つの持ち方にする
      if (ex.spearW > 1e-5) {
        ex.butt.multiplyScalar(1 / ex.spearW);
        ex.dir.normalize();
        ex.spearW = W.spear;
      }
      for (const hd of [R, L]) {
        if (hd.spearW > 1e-5) {
          hd.spearS /= hd.spearW;
          hd.axis.normalize();
          hd.axisW = 1;
        }
      }
      // 混ぜた後の重みは、持っている手の重みそのまま（spearW は 0→1）
    }
    if (W.lantern > 0 && this.kind === 'ashigaru') {
      R.lanternW = smoothstep(0, 1, W.lantern);
      R.spearW *= 1 - R.lanternW;
    }
    if (this.hasSword && this.kind !== 'player' && W.sword > 0) {
      const sum = W.calm + W.susp + W.alert || 1;
      const calm = W.calm / sum;
      const susp = W.susp / sum;
      const alert = W.alert / sum;
      // 平常：左手を鞘の口に。不審：右手を柄に。発見：抜いて中段（右手は臍の前、左手は柄の下）
      L.sayaW = (calm + susp) * W.sword * (1 - smoothstep(0, 1, W.crouch));
      R.hiltW = susp * W.sword;
      if (alert > 0) {
        R.pointW = alert * W.sword;
        R.point.set(hips.x - 0.04, hips.y + 0.2, hips.z + 0.34);
        R.axisW = alert * W.sword;
        // r01-chars-周1: 指摘「中段の切っ先が高すぎて八相に見える」 上向き 38° → 約 27°
        R.axis.set(0.04, 0.45, 0.89).normalize();
        L.tsukaW = alert * W.sword;
        ex.draw = smoothstep(0.35, 0.8, alert);
      }
    }
    void P;
  }

  // ------------------------------------------------------------------ 層：座る・居眠り・倒れ・動作

  private evalSit(out: Pose, ex: Extra, breath: number): void {
    this.evalTrack(SIT_TRACK, 0, out, ex, 0);
    // 不審は身を乗り出し、発見は背を伸ばして膝から手を離す
    const W = this.w;
    const sum = W.calm + W.susp + W.alert || 1;
    const susp = W.susp / sum;
    const alert = W.alert / sum;
    _q.copy(out.q[B.chest]);
    setDeg(_q2, breath + 6 * susp - 5 * alert, 0, 0, 'YXZ');
    out.q[B.chest].multiply(_q2);
    setDeg(_q2, 8 * susp - 8 * alert, 0, 0, 'YXZ');
    out.q[B.neck].multiply(_q2);
    ex.hand[0].kneeW *= 1 - alert;
    ex.hand[1].kneeW *= 1 - alert;
  }

  private evalDoze(out: Pose, ex: Extra, dt: number): void {
    this.evalTrack(DOZE_TRACK, 0, out, ex, 0);
    // 頭がこくりと落ち、はっと戻る（戻る瞬間に小さく行き過ぎる）
    const ph = (this.nodClock % this.nodPeriod) / this.nodPeriod;
    let nod: number;
    if (ph < 0.8) nod = 20 * smoothstep(0, 0.8, ph) ** 1.6;
    else if (ph < 0.86) {
      nod = 20 * (1 - smoothstep(0.8, 0.86, ph));
      if (ph - dt / this.nodPeriod < 0.8) this.nodKick.kick(-60);
    } else nod = 0;
    const kick = this.nodKick.update(dt, 0);
    const slow = Math.sin(this.breath * 0.6) * 2.2;
    setDeg(_q2, nod + kick, 0, 0, 'YXZ');
    out.q[B.head].multiply(_q2);
    setDeg(_q2, nod * 0.35 + slow, 0, 0, 'YXZ');
    out.q[B.neck].multiply(_q2);
    setDeg(_q2, slow * 0.5, 0, 0, 'YXZ');
    out.q[B.chest].multiply(_q2);
  }

  private evalDown(out: Pose, ex: Extra): void {
    this.evalTrack(this.kind === 'player' ? FALLEN_TRACK : this.kind === 'nobunaga' ? NOBU_DOWN_TRACK : DOWN_TRACK, 0, out, ex, 0);
    // ゆっくりした浅い呼吸だけ
    setDeg(_q2, Math.sin(this.breath * 0.7) * 1.2, 0, 0, 'YXZ');
    out.q[B.chest].multiply(_q2);
  }

  /** キーの列を t で読み、姿勢と持ち物に書く。plantDefault は足を留める値の既定（上半身だけの動作は1）。 */
  private evalTrack(tr: Track, t: number, out: Pose, ex: Extra, plantDefault: number): void {
    out.reset();
    ex.clear();
    for (const i of tr.bones) {
      const name = BONE_NAME_BY_INDEX[i];
      const x = sample(tr, `${name}.x`, t, 0);
      const y = sample(tr, `${name}.y`, t, 0);
      const z = sample(tr, `${name}.z`, t, 0);
      setDeg(out.q[i], x, y, z, SPINE_BONES.has(i) ? 'YXZ' : 'XZY');
    }
    if (has(tr, 'hips.p0')) out.p[B.hips].set(sample(tr, 'hips.p0', t, 0), sample(tr, 'hips.p1', t, this.rest[B.hips].y), sample(tr, 'hips.p2', t, 0));
    if (has(tr, 'hips.r0')) setDeg(out.q[B.hips], sample(tr, 'hips.r0', t, 0), sample(tr, 'hips.r1', t, 0), sample(tr, 'hips.r2', t, 0), 'YXZ');
    for (let s = 0; s < 2; s++) {
      const n = s === 0 ? 'R' : 'L';
      const hd = ex.hand[s];
      hd.pointW = clamp01(sample(tr, `${n}.pointW`, t, 0));
      if (hd.pointW > 0) hd.point.set(sample(tr, `${n}.p0`, t, 0), sample(tr, `${n}.p1`, t, 1), sample(tr, `${n}.p2`, t, 0.3));
      if (has(tr, `${n}.a0`)) {
        hd.axisW = 1;
        hd.axis.set(sample(tr, `${n}.a0`, t, 0), sample(tr, `${n}.a1`, t, 0), sample(tr, `${n}.a2`, t, 1)).normalize();
      }
      hd.spearW = clamp01(sample(tr, `${n}.spearW`, t, 0));
      hd.spearS = sample(tr, `${n}.s`, t, 1);
      hd.hiltW = clamp01(sample(tr, `${n}.hiltW`, t, 0));
      hd.sayaW = clamp01(sample(tr, `${n}.sayaW`, t, 0));
      hd.tsukaW = clamp01(sample(tr, `${n}.tsukaW`, t, 0));
      hd.kneeW = clamp01(sample(tr, `${n}.kneeW`, t, 0));
    }
    if (has(tr, 'spear.w')) {
      ex.spearW = clamp01(sample(tr, 'spear.w', t, 0));
      ex.butt.set(sample(tr, 'spear.b0', t, 0), sample(tr, 'spear.b1', t, 0), sample(tr, 'spear.b2', t, 0));
      ex.dir.set(sample(tr, 'spear.d0', t, 0), sample(tr, 'spear.d1', t, 1), sample(tr, 'spear.d2', t, 0)).normalize();
    }
    ex.draw = clamp01(sample(tr, 'draw', t, 0));
    ex.rev = clamp01(sample(tr, 'rev', t, 0));
    ex.pebble = clamp01(sample(tr, 'pebble', t, 0));
    ex.plant = clamp01(sample(tr, 'plant', t, plantDefault));
    ex.arc = clamp01(sample(tr, 'arc', t, 0));
  }

  private premulYaw(bone: number, rad: number): void {
    _q.setFromAxisAngle(_up, rad);
    this.final.q[bone].premultiply(_q);
  }

  // ------------------------------------------------------------------ 地面・脚・腕

  /** 横たわる・座り込む姿勢では、体のいちばん低い点が地面に触れるよう腰を上下に置き直す。立っている間は何もしない。 */
  private groundClamp(plantW: number, sw: number[], fallW: number): void {
    if (plantW > 0.999) return;
    const G = this.G;
    const P = PROBES;
    let minY = 10;
    for (let k = 0; k < P.length; k++) {
      const [bone, r, ox, oy, oz] = P[k];
      _v.set(ox, oy, oz).applyQuaternion(G.q[bone]).add(G.p[bone]);
      minY = Math.min(minY, _v.y - r);
    }
    // 座り込む層（居眠り・倒れ・崩れる動作）は地面へ引き寄せ、ほかは沈みだけを押し戻す
    const restW = clamp01(sw[L_DOZE] + sw[L_DOWN] + fallW);
    const dy = (-minY * restW + Math.max(0, -minY) * (1 - restW)) * (1 - plantW);
    if (Math.abs(dy) < 1e-5) return;
    this.final.p[B.hips].y += dy;
    this.G.computeFrom(this.final, B.hips);
  }

  private legIK(plantW: number): void {
    if (plantW <= 1e-3) {
      this.debug.contact[0].planted = false;
      this.debug.contact[1].planted = false;
      return;
    }
    const d = this.asset.dims;
    const G = this.G;
    const F = this.final;
    for (let i = 0; i < 2; i++) {
      const th = i === 0 ? B.thighL : B.thighR;
      const sn = i === 0 ? B.shinL : B.shinR;
      const ft = i === 0 ? B.footL : B.footR;
      // 膝の向き：足の向き（つま先）と体の前の間。少し外へ
      _v3.set(0, 0, 1).applyQuaternion(this.footQ[i]);
      _v3.y = 0;
      _v3.normalize().multiplyScalar(0.7).add(_v2.set(i === 0 ? 0.25 : -0.25, 0, 0.6)).normalize();
      solveTwoBone(G.p[th], d.thigh, d.shin, this.ankle[i], _v3, true, this.ik, 0.9995);
      toLocal(G.q[PARENT[th]], this.ik.gA, _q);
      F.q[th].slerp(_q, plantW);
      G.computeOne(F, th);
      toLocal(G.q[th], this.ik.gB, _q);
      F.q[sn].slerp(_q, plantW);
      G.computeOne(F, sn);
      toLocal(G.q[sn], this.footQ[i], _q);
      F.q[ft].slerp(_q, plantW);
      G.computeOne(F, ft);
    }
  }

  private carryAndHands(dt: number, _snap: CharacterSnap): void {
    const ex = this.ex;
    const G = this.G;
    const F = this.final;
    const d = this.asset.dims;
    // 槍：混ぜた置き場所（石突・向き）に、体の加速度で穂先が少し揺れるばねを足す
    if (this.hasSpear) {
      if (ex.spearW > 1e-4) {
        this.spearPos.copy(ex.butt);
        this.spearBase.copy(ex.dir);
      }
      this.spearDir.copy(this.spearBase);
      const hv = _v.copy(G.p[B.hips]).sub(this.hipsPrev);
      this.hipsPrev.copy(G.p[B.hips]);
      if (dt > 0) {
        hv.multiplyScalar(1 / dt);
        const ax = (hv.x - this.hipsVel.x) / dt;
        const az = (hv.z - this.hipsVel.z) / dt;
        this.hipsVel.copy(hv);
        const held = clamp01(ex.hand[0].spearW + ex.hand[1].spearW);
        const tx = this.spearTilt[0].update(dt, 0, -clamp(az, -30, 30) * 0.04 * held);
        const tz = this.spearTilt[1].update(dt, 0, clamp(ax, -30, 30) * 0.04 * held);
        _q.setFromAxisAngle(_v2.set(1, 0, 0), tx * DEG).multiply(_qa.setFromAxisAngle(_v3.set(0, 0, 1), -tz * DEG));
        this.spearDir.applyQuaternion(_q).normalize();
      }
      F.p[B.spear].copy(this.spearPos);
      F.q[B.spear].setFromUnitVectors(_up, this.spearDir);
      G.computeOne(F, B.spear);
    }
    // 鞘（不審で柄に手）・抜いた刀：抜き具合で刀身を伸ばし、鞘の柄を隠す
    this.draw = ex.draw;
    for (let s = 0; s < 2; s++) this.solveHand(s, ex.hand[s], d);
    void dt;
  }

  /** 手を行き先へ。重み1で解いてから、関節の回転を重みで混ぜる（2回まわして手首の向きも合わせる）。 */
  private solveHand(side: number, hd: HandSpec, d: KindAsset['dims']): void {
    const G = this.G;
    const F = this.final;
    const ua = side === 0 ? B.upperArmR : B.upperArmL;
    const fa = side === 0 ? B.foreArmR : B.foreArmL;
    const hn = side === 0 ? B.handR : B.handL;
    // 行き先の位置と握りの軸を、種類ごとに求めて重みで混ぜる
    const tgt = _tgt.set(0, 0, 0);
    const axis = _axis.set(0, 0, 0);
    let wsum = 0;
    let axW = 0;
    const addT = (p: Vector3, w: number, ax: Vector3 | null) => {
      if (w <= 1e-4) return;
      tgt.addScaledVector(p, w);
      wsum += w;
      if (ax) {
        axis.addScaledVector(ax, w);
        axW += w;
      }
    };
    if (hd.pointW > 0) addT(hd.point, hd.pointW, hd.axisW > 0 ? hd.axis : null);
    if (hd.spearW > 0 && this.hasSpear) {
      _p.copy(this.spearDir).multiplyScalar(hd.spearS).add(this.spearPos);
      addT(_p, hd.spearW, this.spearDir);
    }
    if (hd.hiltW > 0 || hd.sayaW > 0) {
      // 鞘の向き（parts.ts の sheathedSword と同じ）。柄は鞘の口から前上へ
      _sd.set(0.1, -0.6, -1).normalize().applyQuaternion(G.q[B.sheath]);
      if (hd.hiltW > 0) {
        _p.copy(_sd).multiplyScalar(-0.07).add(G.p[B.sheath]);
        addT(_p, hd.hiltW, _sd);
      }
      if (hd.sayaW > 0) {
        _p.copy(_sd).multiplyScalar(0.06).add(G.p[B.sheath]);
        addT(_p, hd.sayaW, _sd);
      }
    }
    if (hd.tsukaW > 0) {
      _sd.set(0, 0, 1).applyQuaternion(G.q[B.blade]);
      _p.set(0, 0, -0.13).applyQuaternion(G.q[B.blade]).add(G.p[B.blade]);
      addT(_p, hd.tsukaW, _sd);
    }
    if (hd.kneeW > 0) {
      const sn = side === 0 ? B.shinR : B.shinL;
      _p.set(0, 0.07, 0.03).applyQuaternion(G.q[sn]).add(G.p[sn]);
      _p.y += 0.04;
      addT(_p, hd.kneeW, null);
    }
    if (hd.lanternW > 0) {
      // 提灯の紙の中心を RULES.md の位置に置く：竿の先＝中心の真上、手＝竿の先から竿の向きに戻った所
      const up = LANTERN.poleUpDeg * DEG;
      _sd.set(0, Math.sin(up), Math.cos(up));
      _p.copy(LANTERN.center);
      // r02-chars-周2: 指摘「歩いても提灯がほとんど揺れない（1.4°）」 手を体の根に固定 → 腰の左右と上下の揺れに 0.7 付いていく
      _p.x += G.p[B.hips].x * 0.7;
      _p.y += LANTERN.hang + (G.p[B.hips].y - this.rest[B.hips].y) * 0.7;
      _p.addScaledVector(_sd, -LANTERN.poleLen);
      addT(_p, hd.lanternW, _sd);
    }
    if (wsum <= 1e-4) return;
    tgt.multiplyScalar(1 / wsum);
    const w = Math.min(1, wsum);
    const hasAxis = axW > 1e-4;
    if (hasAxis) axis.normalize();
    // 肘は外・下・後ろへ
    const sgn = side === 0 ? -1 : 1;
    _pole.set(sgn * 0.5, -0.62, -0.6).normalize();
    // r07-chars: 短い正面攻撃は拳を頭のそばに残し、肘を前へ出す（他の腕IKは既存のまま）。
    if (this.actKind === 'melee' && side === 0) _pole.set(...CLOSE_COMBAT.elbowPole).normalize();
    const grip = side === 0 ? _gripR.set(d.gripIn, -d.gripDown, 0) : _gripL.set(-d.gripIn, -d.gripDown, 0);
    // 1回目：いまの手の向きで手首の位置を出す → 解く → 2回目：解いた前腕から手の向きを出し直す
    _handQ.copy(G.q[hn]);
    for (let it = 0; it < 2; it++) {
      if (hasAxis) {
        _v.set(0, 0, 1).applyQuaternion(_handQ);
        _q.setFromUnitVectors(_v, axis);
        _handQ.premultiply(_q);
      }
      _wrist.copy(grip).applyQuaternion(_handQ).multiplyScalar(-1).add(tgt);
      solveTwoBone(G.p[ua], d.upperArm, d.foreArm, _wrist, _pole, false, this.ik, 0.995);
      if (it === 0) {
        _handQ.copy(this.ik.gB);
      }
    }
    toLocal(G.q[PARENT[ua]], this.ik.gA, _q);
    F.q[ua].slerp(_q, w);
    G.computeOne(F, ua);
    toLocal(G.q[ua], this.ik.gB, _q);
    F.q[fa].slerp(_q, w);
    G.computeOne(F, fa);
    toLocal(G.q[fa], _handQ, _q);
    F.q[hn].slerp(_q, w);
    G.computeFrom(F, hn);
  }

  // ------------------------------------------------------------------ 付属品と揺れ物

  private secondary(dt: number, snap: CharacterSnap, vis: number): void {
    const F = this.final;
    const G = this.G;
    const ex = this.ex;
    const bones = this.bones;
    // 刀：抜き具合で刀身の長さを伸ばし、抜いた瞬間に鞘の柄を隠す。逆手は刀身を握りの軸のまわりに半回転
    const draw = this.hasSword ? clamp01(ex.draw) : 0;
    const drawS = smoothstep(0, 1, draw);
    bones[B.blade].scale.set(1, 1, Math.max(1e-4, drawS));
    const hiltShown = this.hasSword && draw < 0.04;
    bones[B.hilt].scale.setScalar(hiltShown ? 1 : 1e-4);
    F.q[B.blade].setFromAxisAngle(_v.set(1, 0, 0), Math.PI * smoothstep(0, 1, ex.rev));
    F.p[B.blade].copy(this.rest[B.blade]);
    if (!this.hasSword) bones[B.sheath].scale.setScalar(1e-4);
    // 槍：持っていなければ隠す
    if (this.hasSpear) bones[B.spear].scale.setScalar(this.w.spear > 0.5 || ex.spearW > 0.5 ? 1 : 1e-4);
    // 小石
    bones[B.pebble].scale.setScalar(ex.pebble > 0.5 ? 1 : 1e-4);
    // 光の弧（character.ts が刀身の先の軌跡を描く）
    this.arc = ex.arc;
    // 提灯：竿の先から吊るし、支点の加速度で振り子を揺らす。持っていない時は隠す
    const lanShown = this.kind === 'ashigaru' && snapLantern(snap);
    bones[B.lantern].scale.setScalar(lanShown ? 1 : 1e-4);
    bones[B.lanternPole].scale.setScalar(lanShown ? 1 : 1e-4);
    if (lanShown) {
      const tip = _v.set(0, 0, LANTERN.poleLen).applyQuaternion(G.q[B.lanternPole]).add(G.p[B.lanternPole]);
      const held = smoothstep(0, 1, this.w.lantern) * (1 - smoothstep(0, 1, this.w.down));
      // 倒れた番兵の提灯は、手の先の地面に横倒しで置く
      _v2.set(-0.62, LANTERN.paperR + 0.02, 0.32);
      const pos = _v3.copy(_v2).lerp(tip, held);
      F.p[B.lantern].copy(pos);
      if (!this.lanternInit || dt <= 0) {
        this.lanternPrev.copy(pos);
        this.lanternVel.set(0, 0, 0);
        this.lanternInit = true;
        this.prevTurn = 0;
      }
      if (dt > 0) {
        // r02-chars-周2: 指摘「その場で向きを変えるたびに提灯が上限（43°）まで振れて騒がしい」
        //   支点の加速度を3つに分ける：①体から見た手の揺れ（歩きの上下・左右）そのまま ②体の中心の加速度（歩く・止まる）そのまま
        //   ③体の回転で支点が回る分（遠心と接線）だけ 0.3 倍。 全部そのまま → ③だけ 0.3 倍
        const vx = (pos.x - this.lanternPrev.x) / dt;
        const vy = (pos.y - this.lanternPrev.y) / dt;
        const vz = (pos.z - this.lanternPrev.z) / dt;
        let bx = (vx - this.lanternVel.x) / dt;
        const ay = (vy - this.lanternVel.y) / dt;
        let bz = (vz - this.lanternVel.z) / dt;
        this.lanternVel.set(vx, vy, vz);
        this.lanternPrev.copy(pos);
        const c = Math.cos(vis);
        const s = Math.sin(vis);
        // 体の中心の加速度：ゲームの減速は急（18 m/s² を約4コマ）なので、効きは 0.5 倍・上限 ±10 m/s²
        // （そのままだと止まるたびに 35° 以上振れる見込み。0.5 倍で約 25°、1コマで止まる台本では約 7°）
        bx += clamp((this.rootAcc.x * c - this.rootAcc.z * s) * 0.5, -10, 10);
        bz += clamp((this.rootAcc.x * s + this.rootAcc.z * c) * 0.5, -10, 10);
        const w = this.turnRateNow;
        const al = (w - this.prevTurn) / dt;
        this.prevTurn = w;
        bx += 0.3 * (-w * w * pos.x + al * pos.z);
        bz += 0.3 * (-w * w * pos.z - al * pos.x);
        this.lanternPend.update(dt, clamp(bx, -40, 40), clamp(ay, -20, 20), clamp(bz, -40, 40));
      }
      const pend = this.lanternPend;
      _q.setFromAxisAngle(_v.set(0, 0, 1), pend.roll * held).multiply(_qa.setFromAxisAngle(_v2.set(1, 0, 0), -pend.pitch * held));
      // 倒れた時は横倒し
      _q2.setFromAxisAngle(_zAxis, (1 - held) * 1.45);
      F.q[B.lantern].copy(_q2).multiply(_q);
    }
    // 笠：当て身で倒れる途中（t=0.78〜0.92）と、倒れている間は、頭から外れて頭のそばの地面に置く
    if (this.kind === 'ashigaru') {
      // r03-chars-周3: 指摘「当て身の途中（t=0.5）で笠がもう地面に落ちている」
      //   倒れて終わる動作の間は構えの層が先に「倒れ」へ移るので、倒れの重みのうち動作が覆っていない分だけを使う
      const victim = this.actKind === 'stagger' && this.staggerDown ? smoothstep(...CLOSE_COMBAT.fall, this.actT) * smoothstep(0, 1, this.w.act) : this.actKind === 'takedownVictim' ? smoothstep(0.78, 0.92, this.actT) * smoothstep(0, 1, this.w.act) : 0;
      const off = Math.max(smoothstep(0, 1, this.w.down) * (1 - smoothstep(0, 1, this.w.act)), victim);
      F.p[B.hat].copy(this.rest[B.hat]);
      F.q[B.hat].identity();
      if (off > 1e-3) {
        const hq = G.q[B.head];
        const hp = G.p[B.head];
        // 地面の上の置き場所（base から見て）と、片側の縁を地面に着けた傾き
        _v.set(hp.x - 0.08, 0.042, hp.z + 0.24);
        _q.setFromAxisAngle(_zAxis, 0.16);
        // 頭から見た相対に直してから、外れ具合で混ぜる
        _qa.copy(hq).invert();
        _v.sub(hp).applyQuaternion(_qa);
        _q2.multiplyQuaternions(_qa, _q);
        const e = smoothstep(0, 1, off);
        F.p[B.hat].lerp(_v, e);
        F.q[B.hat].slerp(_q2, e);
      }
      G.computeOne(F, B.hat);
    }
    // 揺れ物
    for (const dg of this.dangles) this.updateDangle(dg, dt, snap, vis);
    // 床几は地面に置いたまま
    F.p[B.stool].copy(this.rest[B.stool]);
    F.q[B.stool].identity();
  }

  private updateDangle(dg: Dangle, dt: number, snap: CharacterSnap, vis: number): void {
    const G = this.G;
    const F = this.final;
    const b = dg.bone;
    const pa = PARENT[b];
    // 付け根の世界の位置
    const pos = _v.copy(this.rest[b]).applyQuaternion(G.q[pa]).add(G.p[pa]);
    const world = _wl.copy(pos).applyAxisAngle(_up, vis).add(_wl2.set(snap.x, 0, snap.z));
    if (!dg.init || dt <= 0) {
      dg.prev.copy(world);
      dg.vel.set(0, 0, 0);
      dg.init = true;
    } else {
      const vx = (world.x - dg.prev.x) / dt;
      const vy = (world.y - dg.prev.y) / dt;
      const vz = (world.z - dg.prev.z) / dt;
      const ax = (vx - dg.vel.x) / dt;
      const ay = (vy - dg.vel.y) / dt;
      const az = (vz - dg.vel.z) / dt;
      dg.vel.set(vx, vy, vz);
      dg.prev.copy(world);
      const c = Math.cos(vis);
      const s = Math.sin(vis);
      dg.pend.update(dt, clamp(ax * c - az * s, -40, 40) * dg.gain, clamp(ay, -20, 20), clamp(ax * s + az * c, -40, 40) * dg.gain);
    }
    // 重さで垂れる向き（base の真下）と、親の回転の間
    _q.copy(G.q[pa]);
    if (dg.gravity > 0) _q.slerp(_qa.identity(), dg.gravity);
    _q2.setFromAxisAngle(_v2.set(0, 0, 1), dg.pend.roll).multiply(_qa.setFromAxisAngle(_v3.set(1, 0, 0), -dg.pend.pitch));
    _q.premultiply(_q2);
    toLocal(G.q[pa], _q, F.q[b]);
    G.computeOne(F, b);
    if (b === B.tailA) {
      // 2節目はさらに遅れて振れる
      F.q[B.tailB].setFromAxisAngle(_v2.set(0, 0, 1), dg.pend.roll * 0.6).multiply(_qa.setFromAxisAngle(_v3.set(1, 0, 0), -dg.pend.pitch * 0.6));
      G.computeOne(F, B.tailB);
    }
    void this.tailLen;
  }
}

/** 槍の持ち方（腰からの手の位置）から、石突の位置と穂先への向きを出す。 */
function spearFromCarry(c: SpearCarry, hips: Vector3, butt: Vector3, dir: Vector3): void {
  if (c.R && c.L) {
    dir.set(c.L[0] - c.R[0], c.L[1] - c.R[1], c.L[2] - c.R[2]).normalize();
    butt.set(hips.x + c.R[0], hips.y + c.R[1], hips.z + c.R[2]).addScaledVector(dir, -c.s);
  } else {
    const h = c.R ?? c.L ?? [0, 0, 0];
    const dd = c.dir ?? [0, 1, 0];
    dir.set(dd[0], dd[1], dd[2]).normalize();
    butt.set(hips.x + h[0], hips.y + h[1], hips.z + h[2]).addScaledVector(dir, -c.s);
    // 止まって立てた槍は、石突を地面より下へ入れない
    if (butt.y < 0.004) butt.y = 0.004;
  }
}

function snapLantern(s: CharacterSnap): boolean {
  return s.pose.lantern;
}

const BONE_NAME_BY_INDEX: string[] = (() => {
  const names: string[] = [];
  for (const [k, v] of Object.entries(B)) names[v] = k;
  return names;
})();

/** 地面に触れうる点：[骨, 半径, 骨から見た位置 x, y, z]。 */
const PROBES: [number, number, number, number, number][] = [
  [B.hips, 0.12, 0, -0.02, 0],
  [B.spine, 0.12, 0, 0.05, 0],
  [B.chest, 0.13, 0, 0.1, 0],
  [B.head, 0.1, 0, 0.072, 0.014],
  [B.upperArmL, 0.06, 0, 0, 0],
  [B.upperArmR, 0.06, 0, 0, 0],
  [B.foreArmL, 0.045, 0, 0, 0],
  [B.foreArmR, 0.045, 0, 0, 0],
  [B.handL, 0.035, 0, -0.06, 0],
  [B.handR, 0.035, 0, -0.06, 0],
  [B.shinL, 0.055, 0, 0, 0.01],
  [B.shinR, 0.055, 0, 0, 0.01],
  [B.footL, 0.0, 0, -0.075, -0.05],
  [B.footR, 0.0, 0, -0.075, -0.05],
  [B.footL, 0.0, 0, -0.06, 0.16],
  [B.footR, 0.0, 0, -0.06, 0.16],
];

const _tgt = new Vector3();
const _axis = new Vector3();
const _p = new Vector3();
const _sd = new Vector3();
const _pole = new Vector3();
const _gripR = new Vector3();
const _gripL = new Vector3();
const _wrist = new Vector3();
const _handQ = new Quaternion();
const _wl = new Vector3();
const _wl2 = new Vector3();
void ({} as LayerId);
