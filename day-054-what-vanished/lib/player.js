// 歩く人（カメラ）。ドラッグで見回し、押した床まで歩き、キーやスティックでも歩ける。
// 画面の入力は app.js が拾って、ここには「どちらへ・どれだけ」だけを渡す。
import { HOUSE } from './plan.js';

const WALK_SPEED = 1.7; // m/秒
const TURN_SPEED = 110; // 度/秒（キーで向きを変えるとき）
const RAD = Math.PI / 180;

export class Player {
  constructor(grid) {
    this.grid = grid;
    this.reset();
  }

  reset(at = HOUSE.start) {
    this.x = at.x;
    this.z = at.z;
    this.yaw = at.yaw;
    this.pitch = at.pitch ?? -6;
    this.path = null;
    this.goal = null;
    this.faceYaw = null;
    this.bob = 0;
    this.speed = 0;
    this.lastLook = -Infinity;
    this.clock = 0;
    this.blockedFor = 0;
    this.replans = 0;
    this.failed = false;
    this.sweep = null;
    this.sweepAfter = false;
  }

  setGrid(grid) {
    this.grid = grid;
    this.stop();
    // 消えた物の分だけ歩ける場所が広がる。今いる場所が塞がることはないが、念のため寄せる
    if (!grid.isFree(this.x, this.z)) {
      const p = grid.nearestFree(this.x, this.z);
      if (p) [this.x, this.z] = p;
    }
  }

  /** 見回す（度） */
  look(dYaw, dPitch) {
    this.yaw = (this.yaw + dYaw) % 360;
    this.pitch = Math.max(-62, Math.min(55, this.pitch + dPitch));
    this.lastLook = this.clock;
    this.faceYaw = null;
    this.sweep = null;
    this.sweepAfter = false;
  }

  /**
   * その場で部屋を見回す（右へ75度→左へ75度→もとの向き、2.6秒）。
   * 着いた直後は入口脇が背中側の死角になる（評価の2周目で、台所の入口脇の猫の置物を2回入って一度も見なかった）
   */
  lookAround(baseYaw = this.yaw) {
    this.sweep = { t: 0, dur: 2.6, base: baseYaw, amp: 75 };
  }

  /** 向きだけ変える（今いる部屋を見取り図で押したとき） */
  faceTo(yaw, { sweep = false } = {}) {
    this.stop();
    this.faceYaw = yaw;
    this.sweepAfter = sweep;
  }

  /**
   * 押した場所まで歩く。道が無ければ false。
   * faceYaw を渡すと、着いたあとその向きへ向き直る（見取り図で部屋へ行くとき、家具の方を向く）。
   */
  walkTo(x, z, { faceYaw = null, sweep = false } = {}) {
    this.sweep = null;
    const path = this.grid.path(this.x, this.z, x, z);
    if (!path || path.length < 2) {
      // 既に着いているなら、向きだけ直す
      if (path && faceYaw !== null) this.faceTo(faceYaw, { sweep });
      return !!path;
    }
    this.path = path.slice(1);
    this.goal = [x, z];
    this.faceYaw = faceYaw;
    this.sweepAfter = sweep;
    this.blockedFor = 0;
    this.replans = 0;
    this.failed = false;
    return true;
  }

  stop() {
    this.path = null;
    this.goal = null;
    this.faceYaw = null;
    this.sweep = null;
    this.sweepAfter = false;
  }

  get walking() {
    return this.speed > 0.05;
  }

  turnToward(want, dt, rate = 4) {
    const diff = ((want - this.yaw + 540) % 360) - 180;
    this.yaw += diff * Math.min(1, dt * rate);
    return Math.abs(diff);
  }

  /**
   * input: { forward, strafe, turn }（それぞれ -1〜1。forward は前が+、strafe は右が+、turn は右回りが+）
   * 戻り値: 歩いた距離（m）
   */
  update(dt, input = {}) {
    this.clock += dt;
    const forward = input.forward || 0;
    const strafe = input.strafe || 0;
    if (input.turn) this.look(-input.turn * TURN_SPEED * dt, 0);
    let mx = 0;
    let mz = 0;
    let following = false;
    if (forward || strafe) {
      this.stop();
      const len = Math.min(1, Math.hypot(forward, strafe));
      const yaw = this.yaw * RAD;
      // yaw=0 で北（-z）を向く。右は +x
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const scale = len / (Math.hypot(forward, strafe) || 1);
      mx = (fx * forward + rx * strafe) * scale;
      mz = (fz * forward + rz * strafe) * scale;
    } else if (this.path) {
      following = true;
      // 見通せる一番先の角へ向かう（道順から少しずれても、角をかすめない）
      while (this.path.length > 1 && this.grid.clearLine(this.x, this.z, this.path[1][0], this.path[1][1], 0.04)) this.path.shift();
      const [tx, tz] = this.path[0];
      const dx = tx - this.x;
      const dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        this.path.shift();
        if (!this.path.length) this.path = null;
      } else {
        mx = dx / dist;
        mz = dz / dist;
        // 見回した直後でなければ、歩く向きへ顔を向ける
        if (this.clock - this.lastLook > 0.9) this.turnToward(Math.atan2(-mx, -mz) / RAD, dt);
        if (dist < WALK_SPEED * dt) {
          mx *= dist / (WALK_SPEED * dt);
          mz *= dist / (WALK_SPEED * dt);
        }
      }
    }
    // 着いたら、決めてある向きへ向き直り、頼まれていれば部屋を見回す
    if (!this.path && this.faceYaw !== null && !(forward || strafe)) {
      if (this.turnToward(this.faceYaw, dt, 5) < 0.5) {
        const base = this.faceYaw;
        this.faceYaw = null;
        if (this.sweepAfter) this.lookAround(base);
        this.sweepAfter = false;
      }
    }
    if (this.sweep && !(forward || strafe) && !this.path) {
      const sw = this.sweep;
      sw.t = Math.min(sw.dur, sw.t + dt);
      this.yaw = sw.base + sw.amp * Math.sin((sw.t / sw.dur) * Math.PI * 2);
      if (sw.t >= sw.dur) this.sweep = null;
    }
    const want = Math.hypot(mx, mz) * WALK_SPEED;
    this.speed += (want - this.speed) * Math.min(1, dt * 10);
    if (want === 0 && !this.path) this.speed *= Math.max(0, 1 - dt * 12);
    const step = this.speed * dt;
    const n = Math.hypot(mx, mz) || 1;
    const [nx, nz] = this.grid.move(this.x, this.z, (mx / n) * step, (mz / n) * step);
    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx;
    this.z = nz;
    this.bob += moved * 5.2;
    // 道順を追っているのに進めないときは、今いる場所から引き直す。3回だめなら「着けなかった」
    if (following && this.path && step > 0.004 && moved < step * 0.25) {
      this.blockedFor += dt;
      if (this.blockedFor > 0.3) {
        this.blockedFor = 0;
        const goal = this.goal;
        const face = this.faceYaw;
        if (goal && this.replans < 3) {
          this.replans += 1;
          const path = this.grid.path(this.x, this.z, goal[0], goal[1]);
          if (path && path.length >= 2) this.path = path.slice(1);
          else this.path = null;
          this.faceYaw = face;
        } else {
          this.failed = true;
          this.path = null;
        }
      }
    } else if (moved > step * 0.5) {
      this.blockedFor = 0;
    }
    return moved;
  }

  /** 見取り図の移動で着けなかったときの最後の手：行き先へ移す（画面は app.js が一瞬暗くする） */
  jumpTo(x, z, yaw = null) {
    const p = this.grid.nearestFree(x, z, 1.5);
    if (!p) return false;
    [this.x, this.z] = p;
    if (yaw !== null) this.yaw = yaw;
    this.stop();
    this.speed = 0;
    this.failed = false;
    return true;
  }

  /** カメラの位置と向き（bob は歩くときの頭の上下） */
  pose(reducedMotion = false) {
    const bobY = reducedMotion ? 0 : Math.sin(this.bob) * 0.018 * Math.min(1, this.speed / WALK_SPEED);
    return { x: this.x, y: HOUSE.eyeHeight + bobY, z: this.z, yaw: this.yaw, pitch: this.pitch };
  }
}
