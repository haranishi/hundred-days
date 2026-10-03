// OWNER: dragon
// クリップの上に重ねる手続きの動き：首・尾・翼の指の二次運動（遅れて付いてくるばね）・首と頭の注視・口の開き・足の接地（地面への簡単な IK）。
// どれも骨の回転を「世界の空間での回転」として骨の付け根で足す（rotateBoneWorld）。骨のロールや局所の軸に依らない。
// r03-roster：首と尾の骨の数は怪獣ごと（紅竜・雷翼は首7・尾10、焔角は首5・尾6）。GLB の userData.creature.chains から並びを読み、
// 狙いの配分（aimShare）も怪獣ごとに渡す。翼の先の無い怪獣（焔角）は wingTips が空。
// r06-motion：二次運動を「骨の列ごとのばね」（SecondaryChainSim）に作り直した。規則と値の意味は config/dragon.ts の SecondaryChain。
import { type Bone, type Object3D, Quaternion, Vector3 } from 'three';
import { DRAGON_MOTION as M, DRAGON_SECONDARY, type SecondaryChain, type SecondaryMotion } from '../config/dragon';
import { damped, smoothDamp, wrapAngle, type Damped } from '../core/springs';
import type { DragonIntent } from './intent';

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const follow = (v: number, target: number, tau: number, dt: number): number => (dt <= 0 ? v : target + (v - target) * Math.exp(-dt / Math.max(1e-4, tau)));

// 回す関数専用の作業用（呼ぶ側の作業用と共有すると、渡した回転が途中で書き換わる）
const _rbParent = new Quaternion();
const _rbOut = new Quaternion();
const _q = new Quaternion();
const _id = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e = new Vector3();

/** 骨を、世界の空間の回転 delta で、骨の付け根を中心に回す（子の骨も付いてくる）。 */
export function rotateBoneWorld(bone: Bone, delta: Quaternion): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_rbParent);
  _rbOut.copy(_rbParent).invert().multiply(delta).multiply(_rbParent).multiply(bone.quaternion);
  bone.quaternion.copy(_rbOut);
  bone.updateMatrixWorld(true);
}

/** 骨の世界の向きを q にする（親の向きはそのまま）。 */
function setBoneWorldQuaternion(bone: Bone, q: Quaternion): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_rbParent);
  bone.quaternion.copy(_rbParent.invert().multiply(q));
  bone.updateMatrixWorld(true);
}

/** 2本の骨の IK：付け根 a から長さ l1・l2 で target へ届く中の関節。pole は曲がる向き。 */
export function solveTwoBone(a: Vector3, l1: number, l2: number, target: Vector3, pole: Vector3, out: Vector3): Vector3 {
  const d = _d.subVectors(target, a);
  const dist = clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  d.normalize();
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const v = _e.copy(pole).addScaledVector(d, -pole.dot(d));
  if (v.lengthSq() < 1e-8) v.set(0, 0, 1).addScaledVector(d, -d.z);
  v.normalize();
  return out.copy(a).addScaledVector(d, l1 * cosA).addScaledVector(v, l1 * sinA);
}

// ---------------------------------------------------------------------------------------------
// 二次運動（r06-motion）：首・尾・翼の指の骨の列が、体の動きに遅れて付いてくる。
// 1. 追いかけ：列の骨はどれも、ワールドの向きが「親（すでに遅れている）とクリップが決める向き」をばねで追う。段ごとの遅れ
//    （2ζ/ω 秒）は先の骨ほど大きく、合計が lag になるので、遅れは付け根から先へ積み上がる。クリップの動き（翼を畳む・広げる）も同じ遅れで追う
// 2. しなり：列全体の曲がり（体の局所の回転ベクトル）を減衰振動で持つ。体の加速度・旋回の速さの変わり・一歩の踏み込みで揺らし、
//    先の骨ほど大きく配る。追いかけの前に足すので、しなりも付け根から先へ遅れて伝わる
// どちらも一定の入力のもとで厳密に解く（刻みの大きさに依らず安定。早回しでも発散しない）
// ---------------------------------------------------------------------------------------------

/** 一歩の踏み込みの強さが頭打ちになる速さ（m/s。歩きと走りの間。突進で尾が暴れすぎない） */
const STEP_PACE_CAP = 12;
/** 制動の振りに使う前後の加速の上限（m/s²。遊びの側の止まる・走り出すは 30 前後） */
const BRAKE_ACCEL_CAP = 40;

/** 先の骨ほど大きい重み（i+1 に比例、合計 1）。遅れとしなりの配り方。 */
export function tipWeighted(n: number): number[] {
  const sum = (n * (n + 1)) / 2;
  return Array.from({ length: n }, (_, i) => (i + 1) / sum);
}

/** 減衰振動 y'' = -ω²y - 2ζωy'（ベクトルの各成分）を dt だけ厳密に進める（0 < ζ < 1）。y と v を書き換える。 */
export function stepDamped(y: Vector3, v: Vector3, omega: number, zeta: number, dt: number): void {
  const z = clamp(zeta, 0.01, 0.98);
  const wd = omega * Math.sqrt(1 - z * z);
  const decay = Math.exp(-z * omega * dt);
  const c = Math.cos(wd * dt);
  const s = Math.sin(wd * dt);
  const zw = z * omega;
  for (const k of ['x', 'y', 'z'] as const) {
    const A = y[k];
    const B = (v[k] + zw * A) / wd;
    y[k] = decay * (A * c + B * s);
    v[k] = decay * ((B * wd - zw * A) * c - (A * wd + zw * B) * s);
  }
}

/** 柔らかい頭打ち：上限の6割までは素通し、その先は上限へ近づく（傾きは連続）。 */
export function softLimit(x: number, limit: number): number {
  const knee = 0.6 * limit;
  if (x <= knee) return x;
  return knee + (limit - knee) * Math.tanh((x - knee) / (limit - knee));
}

function limitLength(v: Vector3, limit: number): Vector3 {
  const l = v.length();
  if (l > 1e-9) v.multiplyScalar(softLimit(l, limit) / l);
  return v;
}

/** 回転ベクトル（軸 × 角、rad）→ 四元数 */
function quatFromRotVec(v: Vector3, out: Quaternion): Quaternion {
  const a = v.length();
  if (a < 1e-9) return out.identity();
  return out.setFromAxisAngle(_axis.copy(v).divideScalar(a), a);
}

/** 四元数 → 回転ベクトル（短い向き） */
function rotVecFromQuat(q: Quaternion, out: Vector3): Vector3 {
  const sign = q.w < 0 ? -1 : 1;
  const x = q.x * sign;
  const y = q.y * sign;
  const z = q.z * sign;
  const s = Math.hypot(x, y, z);
  if (s < 1e-9) return out.set(2 * x, 2 * y, 2 * z);
  return out.set(x, y, z).multiplyScalar((2 * Math.atan2(s, q.w * sign)) / s);
}

const _axis = new Vector3();
const _s1 = new Vector3();
const _s2 = new Vector3();
const _s3 = new Vector3();
const _s4 = new Vector3();
const _y = new Vector3();
const _v = new Vector3();
const _swingOut = new Vector3();
const _sq1 = new Quaternion();
const _sq2 = new Quaternion();
const _sq3 = new Quaternion();
const _sq4 = new Quaternion();

/** 二次運動の1コマの入力（体の側から。ベクトルは体の局所：+x 左・+y 上・+z 前）。 */
export interface SecondaryInput {
  /** 遊びの時刻の進み（秒）。0 なら状態を進めずに、今のずれを掛け直すだけ */
  dt: number;
  /** 体（竜の根）のワールドの向き */
  bodyQuat: Quaternion;
  /** 体の加速度（m/s²） */
  accel: Vector3;
  /** このコマの旋回の速さの変わり（rad/s、上から見て反時計回りが正） */
  turnDelta: number;
  /** 技の重み（0〜1） */
  attack: number;
  /** 空中の重み（0〜1） */
  air: number;
  /** 水平の速さ（m/s。一歩の踏み込みの強さ） */
  speed: number;
  /** このコマに着いた足：後ろ足と前足それぞれ、左 +1・右 -1・両方 0・無し null */
  hindStep: number | null;
  frontStep: number | null;
}

/**
 * 骨の列1本の二次運動。bones は付け根から先の順で、親子につながっていること（先の骨は前の骨の子）。
 * feet は、この列を揺らす踏み込み（尾は後ろ足、首と翼は前足）。
 */
export class SecondaryChainSim {
  private readonly lagShare: number[];
  private readonly swingShare: number[];
  private readonly err: Vector3[];
  private readonly vel: Vector3[];
  private readonly prevTarget: Quaternion[];
  /** しなり（体の局所の回転ベクトル、rad）とその速さ */
  readonly swing = new Vector3();
  private readonly swingVel = new Vector3();
  private fresh = true;
  /** 先の骨の先端（先の骨の局所） */
  private readonly tipLocal: Vector3;

  constructor(
    readonly bones: Bone[],
    readonly spec: SecondaryChain,
    readonly feet: 'hind' | 'front',
  ) {
    const n = bones.length;
    this.lagShare = tipWeighted(n);
    this.swingShare = tipWeighted(n);
    this.err = Array.from({ length: n }, () => new Vector3());
    this.vel = Array.from({ length: n }, () => new Vector3());
    this.prevTarget = Array.from({ length: n }, () => new Quaternion());
    this.tipLocal = new Vector3(0, bones[n - 1].position.length(), 0);
  }

  /** 次のコマで、今の目標の向きから始め直す（跳び・やり直し）。 */
  reset(): void {
    this.fresh = true;
    this.swing.set(0, 0, 0);
    this.swingVel.set(0, 0, 0);
    for (const e of this.err) e.set(0, 0, 0);
    for (const v of this.vel) v.set(0, 0, 0);
  }

  /** 遅れの段の長さ（秒）：空中と技の最中で変わる */
  private lagScale(input: SecondaryInput): number {
    const s = this.spec;
    return (1 + (s.airLag - 1) * input.air) / (1 + 3 * s.attackDamp * input.attack);
  }

  /** 1コマ：しなりを進め、列の骨の回転を書き換える（クリップの姿勢がすでに骨に書かれていること）。 */
  update(input: SecondaryInput): void {
    const s = this.spec;
    const dt = input.dt > 1e-6 ? input.dt : 0;
    if (dt > 0 && !this.fresh) this.advanceSwing(input, dt);
    const damp = 1 - s.attackDamp * input.attack;
    const swingOut = limitLength(_swingOut.copy(this.swing), s.maxDeg * DEG).multiplyScalar(damp);
    const scale = this.lagScale(input);
    const parent = this.bones[0].parent;
    if (!parent) return;
    const parentQ = parent.getWorldQuaternion(_sq1);
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      // 目標：親（すでに遅れている）× クリップ。しなりの分を、体の局所の回転として付け根で足す
      const target = _sq2.copy(parentQ).multiply(bone.quaternion);
      _s4.copy(swingOut).multiplyScalar(this.swingShare[i]).applyQuaternion(input.bodyQuat);
      target.premultiply(quatFromRotVec(_s4, _sq3));
      const e = this.err[i];
      const w = this.vel[i];
      if (this.fresh) {
        e.set(0, 0, 0);
        w.set(0, 0, 0);
      } else if (dt > 0) {
        // 目標の回る速さ（ワールド、rad/s）。追いかけは 2ζ/ω 秒だけ遅れて同じ速さで回る（つり合い）
        const omegaT = rotVecFromQuat(_sq4.copy(target).multiply(_sq3.copy(this.prevTarget[i]).invert()), _s1).divideScalar(dt);
        const lag = Math.max(1e-3, s.lag * this.lagShare[i] * scale);
        const omega = (2 * s.followZeta) / lag;
        const eStar = _s2.copy(omegaT).multiplyScalar(lag);
        const y = _y.copy(eStar).sub(e);
        const v = _v.copy(w).sub(omegaT);
        stepDamped(y, v, omega, s.followZeta, dt);
        e.copy(eStar).sub(y);
        w.copy(omegaT).add(v);
        // 段ごとの上限は、遅れの配り方と同じ割合（合計が maxDeg）
        limitLength(e, s.maxDeg * DEG * this.lagShare[i]);
      }
      this.prevTarget[i].copy(target);
      // 見せる向き = 目標から、遅れの分だけ戻した向き
      const shown = _sq4.copy(quatFromRotVec(_s2.copy(e).negate(), _sq3)).multiply(target);
      bone.quaternion.copy(_sq3.copy(parentQ).invert().multiply(shown));
      parentQ.copy(shown);
    }
    this.bones[0].updateMatrixWorld(true);
    this.fresh = false;
  }

  /** しなり：体の加速度・旋回の速さの変わり・踏み込みで揺らし、減衰振動で進める（体の局所）。 */
  private advanceSwing(input: SecondaryInput, dt: number): void {
    const s = this.spec;
    const damp = 1 - s.attackDamp * input.attack;
    // 列の向き（付け根 → 先、体の局所）。クリップの姿勢から
    const base = this.bones[0].getWorldPosition(_s1);
    const tip = this.bones[this.bones.length - 1].localToWorld(_s2.copy(this.tipLocal));
    const inv = _sq3.copy(input.bodyQuat).invert();
    const dir = tip.sub(base).applyQuaternion(inv).normalize();
    // 慣性：取り残される向きへ回す（列の向き × 加速度の逆）。前後の減速では尾の先を上げ、首の先を下げる。
    // 横の加速（歩きながら曲がるときの遠心）は使わない：旋回の遅れ（内側へ取り残される）と打ち消し合い、遅れが見えなくなる
    const alpha = _s4.copy(dir).cross(_s3.set(0, -input.accel.y, -input.accel.z)).multiplyScalar(s.inertia * DEG * damp);
    // 制動の振りは、続けて減速する間（止まる・走り出す）だけに効かせる。着地で前の速さが1コマで落ちる衝撃には頭打ちを掛け、
    // 尾を跳ね上げない（着地は上下の慣性で尾を沈める）
    alpha.x += s.brake * DEG * damp * clamp(-input.accel.z, -BRAKE_ACCEL_CAP, BRAKE_ACCEL_CAP);
    // 旋回の始まりは遅れ、止まると先へ振れ抜ける（速さの変わりは1コマの衝撃として足す）
    this.swingVel.y -= s.turn * DEG * damp * input.turnDelta;
    // 一歩の踏み込み：先が下がる向き（列の向き × 下）と、足の左右で逆の横揺れ
    const side = this.feet === 'hind' ? input.hindStep : input.frontStep;
    if (side !== null) {
      // 強さは速さに比例して頭打ちあり。先が下がる軸の長さは「列の向きが水平に近いほど 1」（真下へ垂れた列は下へは振れない）
      const pace = Math.min(input.speed, STEP_PACE_CAP);
      const droop = _s1.copy(dir).cross(_s3.set(0, -1, 0));
      this.swingVel.addScaledVector(droop, s.step.pitch * DEG * damp * pace);
      this.swingVel.y += side * s.step.yaw * DEG * damp * pace;
    }
    // 一定の角加速度 alpha のもとでの減衰振動：つり合いの位置 alpha/ω² からのずれを厳密に進める
    const omega = 2 * Math.PI * s.swingHz;
    const eq = _s2.copy(alpha).divideScalar(omega * omega);
    const y = _s3.copy(this.swing).sub(eq);
    stepDamped(y, this.swingVel, omega, s.swingZeta, dt);
    this.swing.copy(eq).add(y);
    limitLength(this.swing, 1.5 * s.maxDeg * DEG);
  }
}

export interface ProceduralBones {
  neck: Bone[];
  head: Bone;
  jaw: Bone;
  tail: Bone[];
  wingTips: { bone: Bone; side: 1 | -1 }[];
  /** 足：付け根から甲までの3本・指の骨・休みの姿勢での足の甲の高さ（胴の中心から、m） */
  feet: { chain: [Bone, Bone, Bone]; toe: Bone; restBallY: number }[];
  /** 鼻先（頭の骨の局所） */
  snoutLocal: Vector3;
}

/** 歩きの位相（0〜1、4歩で1周）の上で、各足が着く位相（config/creatures の body.feet と同じ並び）。 */
export interface FootPhase {
  foot: 'HL' | 'FL' | 'HR' | 'FR';
  phase: number;
}

const DEFAULT_FEET: readonly FootPhase[] = [
  { foot: 'HL', phase: 0 },
  { foot: 'FL', phase: 0.25 },
  { foot: 'HR', phase: 0.5 },
  { foot: 'FR', phase: 0.75 },
];

export class DragonProcedural {
  private readonly aimYaw: Damped = damped();
  private readonly aimPitch: Damped = damped();
  private readonly aimWeight: Damped = damped();
  private jawOpen = 0;
  private grounded = 0;
  private first = true;
  private readonly chains: SecondaryChainSim[] = [];
  private readonly prevPos = new Vector3();
  private readonly prevVel = new Vector3();
  private prevYaw = 0;
  private prevYawRate = 0;
  private prevGait = 0;
  private readonly input: SecondaryInput = {
    dt: 0,
    bodyQuat: new Quaternion(),
    accel: new Vector3(),
    turnDelta: 0,
    attack: 0,
    air: 0,
    speed: 0,
    hindStep: null,
    frontStep: null,
  };

  constructor(
    private readonly bones: ProceduralBones,
    private readonly root: Object3D,
    /** 休みの姿勢の足の裏の高さ（胴の中心から、m）。足の甲の高さとの差が足の厚み */
    private readonly modelGround: number,
    /** 首と頭で狙いを向ける配分（首の3本目から先・頭の順）。既定は紅竜 */
    private readonly aimShare: readonly number[] = M.aim.share,
    /** 首・尾・翼の指の二次運動の値。既定は紅竜 */
    secondary: SecondaryMotion = DRAGON_SECONDARY,
    /** 足が着く位相（一歩ごとの揺れ） */
    private readonly footPhases: readonly FootPhase[] = DEFAULT_FEET,
  ) {
    this.chains.push(new SecondaryChainSim(bones.tail, secondary.tail, 'hind'));
    this.chains.push(new SecondaryChainSim([...bones.neck, bones.head], secondary.neck, 'front'));
    // 翼の指：先の節（wing_f?b）とその親（wing_f?a）の2本。指の番号で値を引く（前縁の指から）
    if (secondary.wing.length > 0) {
      for (const t of bones.wingTips) {
        const a = t.bone.parent as Bone | null;
        if (!a || !(a as Bone).isBone) continue;
        const k = Number(/wing_f(\d+)b_/.exec(t.bone.name)?.[1] ?? 1);
        const spec = secondary.wing[Math.min(secondary.wing.length - 1, Math.max(0, k - 1))];
        this.chains.push(new SecondaryChainSim([a, t.bone], spec, 'front'));
      }
    }
  }

  /** 遊びの1コマ分：意図とクリップの姿勢（すでに骨に書かれている）に、手続きの動きを足す。attack は技のクリップの重み（0〜1）。 */
  update(it: DragonIntent, dt: number, info: { jawClip: number; aimScale: number; attack: number }): void {
    this.readMotion(it, dt, info.attack);
    this.grounded = this.first ? (it.grounded ? 1 : 0) : follow(this.grounded, it.grounded ? 1 : 0, 0.15, dt);
    this.input.air = 1 - this.grounded;
    this.root.updateMatrixWorld(true);
    this.springs(dt);
    this.aim(it, dt, info.aimScale);
    this.jaw(it, dt, info.jawClip);
    this.feet(it);
    this.first = false;
  }

  /** 体の動き（加速度・旋回の速さの変わり・踏み込み）を、意図の差から読む。跳び（やり直し・差し替え）なら二次運動を始め直す。 */
  private readMotion(it: DragonIntent, dt: number, attack: number): void {
    const inp = this.input;
    const [px, py, pz] = it.position;
    const [vx, vy, vz] = it.velocity;
    inp.dt = dt;
    inp.attack = clamp(attack, 0, 1);
    inp.speed = it.grounded ? it.speed : 0;
    inp.hindStep = null;
    inp.frontStep = null;
    inp.bodyQuat.copy(this.root.quaternion);
    inp.accel.set(0, 0, 0);
    inp.turnDelta = 0;
    if (dt <= 0 && !this.first) return;
    // 跳び：速さで説明できない移動（やり直し・怪獣の差し替え・撮影の置き直し）。二次運動を今の姿勢から始め直す
    const moved = Math.hypot(px - this.prevPos.x, py - this.prevPos.y, pz - this.prevPos.z);
    const expected = (Math.hypot(vx, vy, vz) + this.prevVel.length()) * dt;
    const jumped = !this.first && moved > expected * 2 + 30;
    if (jumped) for (const c of this.chains) c.reset();
    if (!this.first && !jumped) {
      inp.accel.set((vx - this.prevVel.x) / dt, (vy - this.prevVel.y) / dt, (vz - this.prevVel.z) / dt).applyQuaternion(_q.copy(this.root.quaternion).invert());
      const yawRate = wrapAngle(it.yaw - this.prevYaw) / dt;
      inp.turnDelta = yawRate - this.prevYawRate;
      this.prevYawRate = yawRate;
      // 一歩の踏み込み：遊びの側の歩きの位相が、足の着く位相をまたいだ
      if (it.grounded && it.speed > 0.3) {
        const g0 = this.prevGait;
        const g1 = it.gaitPhase < g0 ? it.gaitPhase + 1 : it.gaitPhase;
        for (const f of this.footPhases) {
          const crossed = (g0 < f.phase && g1 >= f.phase) || (g0 < f.phase + 1 && g1 >= f.phase + 1);
          if (!crossed) continue;
          const side = f.foot.endsWith('L') ? 1 : -1;
          if (f.foot.startsWith('H')) inp.hindStep = inp.hindStep === null ? side : 0;
          else inp.frontStep = inp.frontStep === null ? side : 0;
        }
      }
    } else this.prevYawRate = 0;
    this.prevPos.set(px, py, pz);
    this.prevVel.set(vx, vy, vz);
    this.prevYaw = it.yaw;
    this.prevGait = it.gaitPhase;
  }

  /** 首・尾・翼の指の二次運動（計測は、ここを空にした姿勢と比べる）。 */
  private springs(dt: number): void {
    this.input.dt = dt;
    for (const c of this.chains) c.update(this.input);
  }

  private aim(it: DragonIntent, dt: number, scale: number): void {
    const A = M.aim;
    const breathing = it.breath.active || it.breath.charge > 0.05;
    const wTarget = (breathing ? A.breathWeight : it.grounded ? A.idleWeight : A.idleWeight * 0.5) * scale;
    const rel = clamp(wrapAngle(it.aimYaw - it.yaw), -A.yawLimit * DEG, A.yawLimit * DEG);
    const pitch = clamp(it.aimPitch, A.pitchMin * DEG, A.pitchMax * DEG);
    if (this.first) {
      this.aimYaw.value = rel;
      this.aimPitch.value = pitch;
      this.aimWeight.value = wTarget;
    }
    const yaw = smoothDamp(this.aimYaw, rel, A.smooth, dt);
    const pit = smoothDamp(this.aimPitch, pitch, A.smooth, dt);
    const w = smoothDamp(this.aimWeight, wTarget, 0.2, dt);
    if (w < 1e-3) return;
    // 頭の今の向き（付け根 → 鼻先）と、狙いの向き（体の向き + 相対の振れ）
    const head = this.bones.head;
    head.getWorldPosition(_a);
    head.localToWorld(_b.copy(this.bones.snoutLocal));
    const cur = _b.sub(_a).normalize();
    const worldYaw = it.yaw + yaw;
    const want = _c.set(Math.sin(worldYaw) * Math.cos(pit), Math.sin(pit), Math.cos(worldYaw) * Math.cos(pit)).normalize();
    const full = new Quaternion().setFromUnitVectors(cur, want);
    const part = new Quaternion();
    const chain = [...this.bones.neck.slice(2), head];
    this.aimShare.forEach((share, i) => {
      if (!chain[i]) return;
      part.copy(_id).slerp(full, share * w);
      rotateBoneWorld(chain[i], part);
    });
  }

  private jaw(it: DragonIntent, dt: number, jawClip: number): void {
    const J = M.jaw;
    let target = 0;
    if (it.breath.active) target = J.breath;
    else if (it.breath.charge > 0.02) target = J.charge * it.breath.charge;
    if (it.roar.phase === 'windup') target = Math.max(target, J.roarWindup);
    else if (it.roar.phase !== 'none') target = Math.max(target, J.roar);
    if (it.claw.phase === 'windup' || it.claw.phase === 'active') target = Math.max(target, J.claw);
    this.jawOpen = this.first ? target : follow(this.jawOpen, target, J.smooth, dt);
    this.openJawTo(this.jawOpen, jawClip);
  }

  /** 口を deg 度まで開ける（クリップがすでに開けている分は足さない）。 */
  openJawTo(deg: number, jawClip: number): void {
    const extra = deg - jawClip;
    if (extra <= 0.2) return;
    const head = this.bones.head;
    head.getWorldPosition(_a);
    head.localToWorld(_b.copy(this.bones.snoutLocal));
    const fwd = _b.sub(_a).normalize();
    const up = _c.set(0, 1, 0).applyQuaternion(this.root.quaternion).normalize();
    const axis = _d.crossVectors(up, fwd).normalize();
    _q.setFromAxisAngle(axis, extra * DEG);
    rotateBoneWorld(this.bones.jaw, _q);
  }

  /** 足の接地：クリップの中で地面に着いている足を、遊びの側の地面の高さへ合わせる（胴の傾きや沈みで浮かせない）。 */
  private feet(it: DragonIntent): void {
    const g = this.grounded;
    if (g < 0.02) return;
    for (const f of this.bones.feet) {
      const ground = it.groundY + (f.restBallY - this.modelGround);
      const [upper, lower, meta] = f.chain;
      const ball = f.toe.getWorldPosition(_a);
      const local = this.root.worldToLocal(_b.copy(ball));
      const hClip = local.y - f.restBallY;
      const contact = 1 - smoothstepRange(0.1, M.footContact, hClip);
      const delta = (ground + Math.max(0, hClip) * (1 - contact) - ball.y) * contact * g;
      if (Math.abs(delta) < 0.01) continue;
      const hip = upper.getWorldPosition(new Vector3());
      const knee = lower.getWorldPosition(new Vector3());
      const ankle = meta.getWorldPosition(new Vector3());
      const metaWorld = meta.getWorldQuaternion(new Quaternion());
      const ankleTarget = ankle.clone().setY(ankle.y + delta);
      const l1 = hip.distanceTo(knee);
      const l2 = knee.distanceTo(ankle);
      const lineDir = _c.subVectors(ankle, hip).normalize();
      const pole = _d.subVectors(knee, hip);
      pole.addScaledVector(lineDir, -pole.dot(lineDir));
      const knee2 = solveTwoBone(hip, l1, l2, ankleTarget, pole.clone(), new Vector3());
      rotateBoneWorld(upper, new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(), knee2.clone().sub(hip).normalize()));
      const kneeNow = lower.getWorldPosition(new Vector3());
      const ankleNow = meta.getWorldPosition(new Vector3());
      rotateBoneWorld(lower, new Quaternion().setFromUnitVectors(ankleNow.sub(kneeNow).normalize(), ankleTarget.clone().sub(kneeNow).normalize()));
      setBoneWorldQuaternion(meta, metaWorld);
    }
  }
}

function smoothstepRange(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
