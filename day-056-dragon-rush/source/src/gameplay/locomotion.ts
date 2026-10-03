// OWNER: gameplay
// 竜の体の動き：地上の歩き・走り、離陸・飛行・上昇・下降・急降下・着地。瞬間に最高速にはしないが、入力への追従は速くする。
// 地上の速度は常に体の向きに沿わせる（横滑りしない）。遅いときは速く、速いときは少しゆっくり向きを変える。
// 建物の壁に触れている間（wall、contact.ts が書く）は、壁へ向かう入力を壁に沿う向きへ直す（r02-controls：張り付かない）。
// r03-roster：数値は怪獣ごとの設定（config/creatures/ の motion と body）から読む。紅竜の設定は config/locomotion.ts の表そのもの。
// 飛べない怪獣（焔角）の Space は「屈む → 放物線で跳ぶ → のしかかる」（mode 'jump'）。着地は landing.slam で知らせる。
import { CREATURE_CONFIG, type BodyShape, type CreatureMotion } from '../config/creatures';
import { LOCOMOTION as L } from '../config/locomotion';
import type { Foot } from '../core/events';
import { approach, approachAngle, wrapAngle } from '../core/springs';
import type { DragonMode, Gait } from '../dragon/intent';
import { DEG, clamp, forwardOf, lerp, localToWorld, vec3, yawOf, type Vec3 } from './math';

export interface MoveInput {
  /** 進みたい向き（ワールドの水平、長さ 0〜1） */
  moveX: number;
  moveZ: number;
  ascendPressed: boolean;
  ascendHeld: boolean;
  /** 空中で押し続けて降りる（C） */
  descendHeld: boolean;
  /** 地上では走る、空中では急降下 */
  sprintHeld: boolean;
  /** 攻撃中などで移動を遅くする倍率 */
  speedScale: number;
  /** 攻撃で体を向けたい向き（null なら進む向きに従う） */
  faceYaw: number | null;
  /** 攻撃の向き直りの速さ（rad/s、null ならふだんの旋回の速さ） */
  faceRate: number | null;
  /** 怒りの急降下を始める */
  rageDive: boolean;
}

export type DiveKind = 'normal' | 'rage';

export interface Landing {
  pos: Vec3;
  fallSpeed: number;
  impact: number;
  dive: DiveKind | null;
  /** 跳んで着地した（のしかかり） */
  slam: boolean;
}

/** 1刻みの間に起きたこと（遊びの側が出来事に直す）。 */
export interface BodyEvents {
  steps: { foot: Foot; pos: Vec3 }[];
  flaps: number[];
  landing: Landing | null;
  /** この刻みで跳び上がった（焔角の Space。屈み終えた瞬間） */
  jumped: boolean;
}

export const emptyBodyEvents = (): BodyEvents => ({ steps: [], flaps: [], landing: null, jumped: false });

/** 始まりの位置と向き（Game が街から決める。gameplay/aim.ts の spawnView）。 */
export interface Spawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const defaultSpawn = (): Spawn => ({ x: L.spawn.x, y: L.spawn.y, z: L.spawn.z, yaw: L.spawn.headingDeg * DEG });

export interface BodyBounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

/** 触れている壁の手がかり：外向きの法線（建物から体へ）・正面から当たったときに回り込む側（±1）・残り秒数。 */
export interface WallHint {
  nx: number;
  nz: number;
  side: number;
  ttl: number;
}

/** 跳ぶ段階（焔角）：屈む・上がる・落ちる。time はその段階に入ってからの秒数、duration はその段階の長さの目安。 */
export interface JumpState {
  phase: 'none' | 'crouch' | 'rise' | 'fall';
  time: number;
  duration: number;
}

export class DragonBody {
  readonly pos = vec3();
  readonly vel = vec3();
  yaw = 0;
  /** 水平の速さ（向きに沿う） */
  speed = 0;
  mode: DragonMode = 'air';
  diveKind: DiveKind | null = null;
  groundY = 0;
  flapPhase = 0;
  flapStrength = 0.5;
  gaitPhase = 0;
  gait: Gait = 'idle';
  pitch = 0;
  roll = 0;
  landingImpact = 0;
  /** 着地の硬直の残り秒数（0 で動ける） */
  landingTimer = 0;
  readonly wall: WallHint = { nx: 0, nz: 0, side: 1, ttl: 0 };
  readonly jump: JumpState = { phase: 'none', time: 0, duration: 0 };
  /** 急降下をやめた直後の引き起こし：上下の速さを戻す強さ（m/s²）と残り秒数 */
  private pullUpRate = 0;
  private pullUpTime = 0;
  /** 動きの数値と体の寸法（怪獣ごと。setCreature で替える） */
  motion: CreatureMotion;
  shape: BodyShape;

  constructor(
    private readonly bounds: BodyBounds,
    public spawn: Spawn = defaultSpawn(),
    creature = CREATURE_CONFIG.kurenai,
  ) {
    this.motion = creature.motion;
    this.shape = creature.body;
    this.reset();
  }

  /** 怪獣を替える（始める前・結果の画面だけ。呼んだ後に reset する）。 */
  setCreature(creature: typeof CREATURE_CONFIG.kurenai, spawn: Spawn): void {
    this.motion = creature.motion;
    this.shape = creature.body;
    this.spawn = spawn;
    this.reset();
  }

  /** 立っているときの体の中心の高さ（足の裏から、m） */
  get bodyHeight(): number {
    return this.shape.bodyHeight;
  }

  /** 突進している（焔角：地上の走りで、速さが突進の下限以上） */
  get charging(): boolean {
    const c = this.motion.charge;
    return c !== null && this.mode === 'ground' && this.gait === 'run' && this.speed >= c.minSpeed;
  }

  reset(): void {
    this.pos.x = this.spawn.x;
    this.pos.y = this.spawn.y;
    this.pos.z = this.spawn.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = this.spawn.yaw;
    this.speed = 0;
    // 飛べない怪獣は地面の上から始める（Game が地面に立つ高さの spawn を渡す）
    this.mode = this.motion.canFly ? 'air' : 'ground';
    this.groundY = this.motion.canFly ? this.groundY : this.spawn.y - this.shape.bodyHeight;
    this.diveKind = null;
    this.flapPhase = 0;
    this.flapStrength = 0.6;
    this.gaitPhase = 0;
    this.gait = 'idle';
    this.pitch = 0;
    this.roll = 0;
    this.landingImpact = 0;
    this.landingTimer = 0;
    this.wall.ttl = 0;
    this.jump.phase = 'none';
    this.jump.time = 0;
    this.jump.duration = 0;
    this.pullUpRate = 0;
    this.pullUpTime = 0;
  }

  get grounded(): boolean {
    return this.mode === 'ground' || this.mode === 'landing';
  }

  get altitude(): number {
    return this.pos.y - this.shape.bodyHeight - this.groundY;
  }

  /** 始まる前（クリック待ち）：その場で羽ばたいて浮かんでいる（飛べない怪獣は地面で待つ）。 */
  hover(dt: number): void {
    this.flapPhase = (this.flapPhase + this.motion.air.flapHzClimb * dt) % 1;
    this.flapStrength = 0.8;
  }

  update(dt: number, input: MoveInput, groundAt: (x: number, z: number) => number, ev: BodyEvents): void {
    this.landingImpact = Math.max(0, this.landingImpact - 2.2 * dt);
    this.wall.ttl = Math.max(0, this.wall.ttl - dt);
    this.groundY = groundAt(this.pos.x, this.pos.z);
    if (input.rageDive && !this.grounded) this.enterDive('rage');
    switch (this.mode) {
      case 'ground':
        this.updateGround(dt, input, ev);
        break;
      case 'landing':
        this.landingTimer -= dt;
        this.speed = approach(this.speed, 0, this.motion.ground.decel * dt);
        this.moveHorizontal(dt);
        this.pos.y = this.groundY + this.shape.bodyHeight;
        if (this.landingTimer <= 0) {
          this.landingTimer = 0;
          this.mode = 'ground';
        }
        break;
      case 'air':
        this.updateAir(dt, input, ev);
        break;
      case 'dive':
        this.updateDive(dt, input, ev);
        break;
      case 'jump':
        this.updateJump(dt, input, ev);
        break;
    }
    this.clampToBounds();
  }

  private moveHorizontal(dt: number): void {
    const f = forwardOf(this.yaw);
    this.vel.x = f.x * this.speed;
    this.vel.z = f.z * this.speed;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  /**
   * 向かいたい向き。攻撃の向き（faceYaw）が最優先。壁に触れていて、進みたい向きが壁へ向かうなら、壁に沿う向きへ直す
   * （正面からなら、contact.ts が決めた近い方の角へ回り込む）。地上で入力が無いときは今の向きのまま。
   */
  private desiredYaw(input: MoveInput, want: number): number {
    if (input.faceYaw !== null) return input.faceYaw;
    const moving = want > 0.1;
    let dx = moving ? input.moveX : Math.sin(this.yaw);
    let dz = moving ? input.moveZ : Math.cos(this.yaw);
    const w = this.wall;
    if (w.ttl > 0 && (moving || (!this.grounded && this.speed > 1))) {
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const into = dx * w.nx + dz * w.nz;
      if (into < 0) {
        let tx = dx - into * w.nx;
        let tz = dz - into * w.nz;
        if (Math.hypot(tx, tz) < 0.3) {
          tx = -w.nz * w.side;
          tz = w.nx * w.side;
        }
        return yawOf(tx, tz);
      }
    }
    return moving ? yawOf(dx, dz) : this.yaw;
  }

  private updateGround(dt: number, input: MoveInput, ev: BodyEvents): void {
    const G = this.motion.ground;
    const want = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    const desired = this.desiredYaw(input, want);
    const diff = wrapAngle(desired - this.yaw);
    let target = want * (input.sprintHeld ? G.runSpeed : G.walkSpeed) * input.speedScale;
    if (Math.abs(diff) > G.sharpTurnDeg * DEG) target = Math.min(target, G.walkSpeed * 0.3);
    // 屈んでいる間（跳ぶ前）は止まっていく
    const J = this.motion.jump;
    if (this.jump.phase === 'crouch') target = 0;
    const k = clamp(this.speed / G.runSpeed, 0, 1);
    const rate = input.faceRate ?? lerp(G.turnSlowDeg, G.turnFastDeg, k) * DEG;
    this.yaw = approachAngle(this.yaw, desired, rate * dt);
    const accel = target > this.speed ? (input.sprintHeld ? G.runAccel : G.accel) : G.decel;
    this.speed = approach(this.speed, target, accel * dt);
    this.moveHorizontal(dt);
    this.pos.y = this.groundY + this.shape.bodyHeight;
    this.vel.y = 0;
    this.pitch = approach(this.pitch, 0, 0.5 * dt);
    this.roll = approach(this.roll, 0, 0.8 * dt);
    this.gait = this.speed < 0.5 ? 'idle' : this.speed > (G.walkSpeed + G.runSpeed) / 2 ? 'run' : 'walk';
    this.advanceGait(dt, ev);
    if (J && this.jump.phase === 'crouch') {
      this.jump.time += dt;
      if (this.jump.time >= this.jump.duration) this.leap(J, input, ev);
      return;
    }
    if (input.ascendPressed) {
      if (J) {
        // 跳ぶ：まず屈む（この間に向きと速さを決め直せる）
        this.jump.phase = 'crouch';
        this.jump.time = 0;
        this.jump.duration = J.crouch;
        return;
      }
      if (!this.motion.canFly) return;
      this.mode = 'air';
      this.vel.y = this.motion.air.takeoffSpeed;
      this.flapPhase = 0;
      ev.flaps.push(1);
    }
  }

  /** 屈み終えた：前への速さを範囲に収め、放物線で跳び上がる。 */
  private leap(J: NonNullable<CreatureMotion['jump']>, input: MoveInput, ev: BodyEvents): void {
    const want = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    if (want > 0.1) this.yaw = yawOf(input.moveX, input.moveZ);
    this.speed = clamp(Math.max(this.speed, J.forwardMin + (J.forwardMax - J.forwardMin) * want), J.forwardMin, J.forwardMax);
    this.mode = 'jump';
    this.vel.y = J.launchSpeed;
    this.jump.phase = 'rise';
    this.jump.time = 0;
    this.jump.duration = J.launchSpeed / J.gravity;
    this.gait = 'idle';
    ev.jumped = true;
  }

  /** 跳んでいる間：重力で弧を描き、向きは少しだけ変えられる。落ちて地面に着いたら、のしかかりの着地。 */
  private updateJump(dt: number, input: MoveInput, ev: BodyEvents): void {
    const J = this.motion.jump;
    if (!J) {
      this.mode = 'air';
      return;
    }
    const want = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    this.yaw = approachAngle(this.yaw, this.desiredYaw(input, want), J.steerDeg * DEG * dt);
    this.vel.y -= J.gravity * dt;
    this.moveHorizontal(dt);
    this.pos.y += this.vel.y * dt;
    this.jump.time += dt;
    if (this.jump.phase === 'rise' && this.vel.y <= 0) {
      this.jump.phase = 'fall';
      this.jump.time = 0;
    }
    this.pitch = approach(this.pitch, clamp(Math.atan2(this.vel.y, Math.max(this.speed, 10)) * 0.35, -0.25, 0.25), 1.2 * dt);
    this.roll = approach(this.roll, 0, 1.0 * dt);
    if (this.vel.y <= 0 && this.pos.y - this.shape.bodyHeight <= this.groundY) this.land(null, ev, true);
  }

  private advanceGait(dt: number, ev: BodyEvents): void {
    if (this.speed < 0.3) return;
    const G = this.motion.ground;
    const stride = lerp(G.strideWalk, G.strideRun, clamp((this.speed - G.walkSpeed) / (G.runSpeed - G.walkSpeed), 0, 1));
    const prev = this.gaitPhase;
    const next = prev + (this.speed / stride) * dt;
    for (const foot of this.shape.feet) {
      // 位相 foot.phase を（1周の折り返しも含めて）またいだら、その足が着いた
      const crossed = (prev < foot.phase && next >= foot.phase) || (prev < foot.phase + 1 && next >= foot.phase + 1);
      if (crossed) ev.steps.push({ foot: foot.foot, pos: localToWorld(this.pos, this.yaw, foot.x, -this.shape.bodyHeight, foot.z) });
    }
    this.gaitPhase = next % 1;
  }

  private updateAir(dt: number, input: MoveInput, ev: BodyEvents): void {
    const A = this.motion.air;
    // Space は Shift より強い：両方押していたら上がる（急降下の途中で Space を押してもやめられる）
    if (input.sprintHeld && !input.ascendHeld && this.altitude > this.motion.dive.minAltitude) {
      this.enterDive('normal');
      this.updateDive(dt, input, ev);
      return;
    }
    const want = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    const desired = this.desiredYaw(input, want);
    const diff = wrapAngle(desired - this.yaw);
    const before = this.yaw;
    this.yaw = approachAngle(this.yaw, desired, (input.faceRate ?? A.turnDeg * DEG) * dt);
    const yawRate = wrapAngle(this.yaw - before) / Math.max(dt, 1e-6);
    let target = want > 0.1 ? A.cruiseSpeed * want * input.speedScale : A.hoverSpeed;
    let accel = target > this.speed ? A.accel : A.decel;
    // 大きく向きを変える間は速さを落として小さく回る（直径40m以内）
    if (want > 0.1 && Math.abs(diff) > A.sharpTurnDeg * DEG) {
      target = Math.min(target, A.cruiseSpeed * want * A.sharpTurnScale);
      if (this.speed > target) accel = A.sharpTurnBrake;
    }
    this.speed = approach(this.speed, target, accel * dt);
    // 上下：Space で上がり続け、C で降り、何も押さなければ滑空の沈みへ戻る
    let vTarget = A.glideSink;
    let vAccel = A.glideAccel;
    if (input.ascendHeld) {
      vTarget = A.climbSpeed;
      vAccel = A.climbAccel;
    } else if (input.descendHeld) {
      vTarget = -A.descendSpeed;
      vAccel = A.descendAccel;
    }
    if (input.ascendPressed) {
      // 羽ばたき1回：沈んでいるときだけ少し持ち上げる（足しはしない。連打で急上昇しない）
      if (this.vel.y > -12) this.vel.y = Math.max(this.vel.y, A.flapKick);
      this.flapPhase = 0;
      ev.flaps.push(1);
    }
    if (this.pullUpTime > 0) {
      vAccel = Math.max(vAccel, this.pullUpRate);
      this.pullUpTime -= dt;
    }
    this.vel.y = approach(this.vel.y, vTarget, vAccel * dt);
    if (this.altitude > A.ceiling) this.vel.y = Math.min(this.vel.y, -1);
    this.moveHorizontal(dt);
    this.pos.y += this.vel.y * dt;
    // 羽ばたき：上昇中・ゆっくり飛ぶときは速く強く、巡航はゆったり
    const climbing = input.ascendHeld || this.vel.y > 1 || this.speed < 14;
    const hz = climbing ? A.flapHzClimb : A.flapHzCruise;
    const prev = this.flapPhase;
    this.flapPhase = (prev + hz * dt) % 1;
    this.flapStrength = approach(this.flapStrength, climbing ? 0.95 : 0.45, 1.5 * dt);
    if (prev < 0.25 && this.flapPhase >= 0.25) ev.flaps.push(this.flapStrength);
    this.roll = approach(this.roll, clamp(-yawRate * 0.9, -A.bankMaxDeg * DEG, A.bankMaxDeg * DEG), 1.2 * dt);
    this.pitch = approach(this.pitch, clamp(Math.atan2(this.vel.y, Math.max(this.speed, 10)) * 0.7, -0.4, 0.4), 1.0 * dt);
    if (this.vel.y <= 0 && this.pos.y - this.shape.bodyHeight <= this.groundY) this.land(null, ev);
  }

  private enterDive(kind: DiveKind): void {
    if (this.mode === 'dive' && this.diveKind === 'rage') return;
    this.mode = 'dive';
    this.diveKind = kind;
    this.pullUpTime = 0;
    if (kind === 'rage') this.vel.y = Math.min(this.vel.y, -20);
  }

  /** 急降下をやめる：空中へ戻し、上下の速さを exitSeconds で滑空の沈みまで引き起こす。 */
  private exitDive(): void {
    const D = this.motion.dive;
    const A = this.motion.air;
    this.mode = 'air';
    this.diveKind = null;
    this.pullUpTime = D.exitSeconds;
    this.pullUpRate = Math.max(A.glideAccel, (A.glideSink - this.vel.y) / D.exitSeconds);
  }

  private updateDive(dt: number, input: MoveInput, ev: BodyEvents): void {
    const D = this.motion.dive;
    if (this.diveKind === 'normal' && (!input.sprintHeld || input.ascendHeld) && this.altitude > D.minAltitude) {
      this.exitDive();
      this.updateAir(dt, input, ev);
      return;
    }
    const fall = this.diveKind === 'rage' ? D.rageFallSpeed : D.fallSpeed;
    this.vel.y = approach(this.vel.y, -fall, D.fallAccel * dt);
    this.speed = approach(this.speed, D.forwardSpeed, 20 * dt);
    const want = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    this.yaw = approachAngle(this.yaw, this.desiredYaw(input, want), (input.faceRate ?? D.turnDeg * DEG) * dt);
    this.moveHorizontal(dt);
    this.pos.y += this.vel.y * dt;
    this.flapStrength = approach(this.flapStrength, 0.1, 2 * dt);
    this.pitch = approach(this.pitch, -0.75, 1.6 * dt);
    this.roll = approach(this.roll, 0, 1.5 * dt);
    if (this.pos.y - this.shape.bodyHeight <= this.groundY) this.land(this.diveKind, ev);
  }

  private land(dive: DiveKind | null, ev: BodyEvents, slam = false): void {
    const LD = this.motion.landing;
    const fallSpeed = Math.max(0, -this.vel.y);
    const impact = clamp(fallSpeed / LD.fullImpactSpeed, 0, 1);
    this.pos.y = this.groundY + this.shape.bodyHeight;
    this.vel.y = 0;
    this.speed *= LD.keepSpeed;
    this.mode = 'landing';
    this.diveKind = null;
    this.pullUpTime = 0;
    this.jump.phase = 'none';
    this.jump.time = 0;
    this.landingTimer = LD.recoverBase + LD.recoverPerImpact * impact;
    this.landingImpact = Math.max(this.landingImpact, 0.2 + 0.8 * impact);
    this.pitch = 0.12 * impact;
    ev.landing = { pos: { x: this.pos.x, y: this.groundY, z: this.pos.z }, fallSpeed, impact, dive, slam };
  }

  private clampToBounds(): void {
    const b = this.bounds;
    const x = clamp(this.pos.x, b.xMin, b.xMax);
    const z = clamp(this.pos.z, b.zMin, b.zMax);
    if (x !== this.pos.x || z !== this.pos.z) {
      this.pos.x = x;
      this.pos.z = z;
      // 端では前へ進まない（向きはそのまま、速さを落とす）
      this.speed = Math.min(this.speed, 4);
    }
  }
}
