/**
 * 買い物客（docs/03・docs/01）。カゴを持って店の中を歩き回り、売り場で少し立ち止まる。
 * 近くで悪事が起きると吹き出し（「あらあら」など）。放送がジャックされたら3秒止まる。
 * 客は倒れず、点にもならない（買い物客は巻き込まない＝docs/01「やらないこと」）。バナナの皮は避けて歩く。
 */
import { PA } from '../../../shared/rules/tuning';
import type { Rng } from '../../../shared/rng';
import type { AnimName, ModelKey, NpcState, NpcView, Vec3 } from '../../../shared/view';
import type { P2 } from '../nav/grid';
import { GROUP, groups, type RigidBody } from '../physics';
import { activePeels } from '../systems/banana';
import type { NpcAgent, SimContext } from '../types';
import { Walker, stepToward } from './walker';

const SPEED = 1.3;
const REACT_RANGE = 6;
const REACTIONS: NpcView['bubble'][] = ['あらあら', 'あらあら', '…', '?'];

export class Shopper implements NpcAgent {
  readonly role = 'shopper' as const;
  readonly pos: Vec3;
  yaw = 0;
  anim: AnimName = 'idle';
  state: NpcState = 'wander';
  bubble: NpcView['bubble'] = null;
  private readonly body: RigidBody;
  private readonly walker = new Walker();
  private waitUntil = 0;
  private reactUntil = 0;
  private bubbleUntil = 0;

  constructor(
    ctx: SimContext,
    readonly id: number,
    readonly character: ModelKey,
    private readonly points: readonly P2[],
    private readonly rng: Rng,
    start: P2,
  ) {
    this.pos = { x: start.x, y: 0, z: start.z };
    this.body = ctx.world.createRigidBody(ctx.R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, 0.8, start.z));
    ctx.world.createCollider(ctx.R.ColliderDesc.capsule(0.5, 0.3).setCollisionGroups(groups(GROUP.avatar, 0xffff)), this.body);
    this.waitUntil = rng.range(0, 2);
  }

  step(ctx: SimContext, dt: number): void {
    if (this.bubble && ctx.time > this.bubbleUntil) this.bubble = null;
    if (ctx.time < this.reactUntil) {
      this.state = 'react';
      this.anim = 'sad';
      this.place();
      return;
    }
    this.state = 'wander';
    if (ctx.time < this.waitUntil) {
      this.anim = 'idle';
      this.place();
      return;
    }
    if (this.walker.done) this.pickGoal(ctx);
    const wp = this.walker.next(this.pos);
    if (!wp) {
      // 着いた：売り場で少し立ち止まる
      this.waitUntil = ctx.time + this.rng.range(1.5, 4);
      this.walker.clear();
      this.anim = 'idle';
      this.place();
      return;
    }
    // 進む先にバナナの皮があれば、止まって別の所へ行く
    const dx = wp.x - this.pos.x;
    const dz = wp.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const ahead = { x: this.pos.x + (dx / len) * 0.7, z: this.pos.z + (dz / len) * 0.7 };
    if (activePeels(ctx).some((p) => Math.hypot(p.x - ahead.x, p.z - ahead.z) < 0.75)) {
      this.walker.clear();
      this.waitUntil = ctx.time + 0.6;
      this.anim = 'idle';
      this.place();
      return;
    }
    const yaw = stepToward(this.pos, wp, SPEED, dt);
    if (yaw !== null) this.yaw = yaw;
    this.anim = 'walk';
    this.place();
  }

  private pickGoal(ctx: SimContext): void {
    for (let i = 0; i < 4; i++) {
      const p = this.rng.pick(this.points);
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 2) continue;
      if (this.walker.setGoal(ctx.nav, this.pos, p)) return;
    }
  }

  private place(): void {
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: 0.8, z: this.pos.z });
  }

  onMisdeed(ctx: SimContext, _slot: number, pos: Vec3): void {
    if (Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) > REACT_RANGE || ctx.time < this.reactUntil) return;
    this.reactUntil = ctx.time + 1.2;
    this.yaw = Math.atan2(pos.x - this.pos.x, pos.z - this.pos.z);
    this.bubble = this.rng.pick(REACTIONS);
    this.bubbleUntil = ctx.time + 1.6;
  }

  onPa(ctx: SimContext): void {
    this.reactUntil = ctx.time + PA.shopperFreeze;
    this.bubble = '?';
    this.bubbleUntil = ctx.time + PA.shopperFreeze;
  }

  view(): NpcView {
    return { id: this.id, role: 'shopper', character: this.character, pos: { ...this.pos }, yaw: this.yaw, anim: this.anim, state: this.state, target: null, bubble: this.bubble };
  }
}
