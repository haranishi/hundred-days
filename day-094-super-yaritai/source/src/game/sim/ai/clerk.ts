/**
 * 店員と店長（docs/03「目立ち度と店員」）。
 * 巡回 → 気づく（「！」）→ 追う → 確保（「！」から1秒たつまでは手を出さない。0.6秒その場でつかみ、
 * サービスカウンターへ連れ戻し・3秒・目立ち度とコンボを0・持ち物を落とす）→ 5秒休む。
 * 気づく条件：目立ち度30以上の人が9m以内で見えている、または6m以内で悪事が起きた。開店20秒は追わない。
 * 4秒見失うとあきらめ、逃げ切った人に+100。放送がジャックされたら10秒ブースへ向かう。バナナで3秒転ぶ。
 * 店長は残り60秒でスタッフ扉から出てくる（{t:'manager'}）。
 */
import { CLERK, MATCH, PA } from '../../../shared/rules/tuning';
import type { AnimName, ModelKey, NpcState, NpcView, Vec3 } from '../../../shared/view';
import type { P2 } from '../nav/grid';
import { GROUP, groups, type RigidBody } from '../physics';
import { freezerAt } from '../systems/freezer';
import type { AvatarState, NpcAgent, SimContext } from '../types';
import { Walker, stepToward } from './walker';

const CENTER_Y = 0.8;
/** 追っている人へ、道を引き直す間隔 */
const REPATH = 0.4;
/** 「！」を出して立ち止まる秒 */
const NOTICE_TIME = 0.5;

export class Clerk implements NpcAgent {
  readonly pos: Vec3;
  yaw = Math.PI;
  anim: AnimName = 'idle';
  state: NpcState = 'patrol';
  target: number | null = null;
  bubble: NpcView['bubble'] = null;
  hidden: boolean;
  private readonly body: RigidBody;
  private readonly walker = new Walker();
  private routeI = 0;
  private stateUntil = 0;
  private slippedUntil = -Infinity;
  private lostFor = 0;
  private repathAt = 0;
  private bubbleUntil = 0;
  private heard: { slot: number; t: number } | null = null;
  /** 「！」を出した時刻（ここから CLERK.catchDelay 秒は捕まえない） */
  private noticedAt = -Infinity;

  constructor(
    ctx: SimContext,
    readonly id: number,
    readonly role: 'clerk' | 'manager',
    readonly character: ModelKey,
    private readonly route: readonly P2[],
    start: P2,
  ) {
    this.pos = { x: start.x, y: 0, z: start.z };
    this.hidden = role === 'manager';
    this.body = ctx.world.createRigidBody(ctx.R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, CENTER_Y, start.z));
    ctx.world.createCollider(ctx.R.ColliderDesc.capsule(0.5, 0.3).setCollisionGroups(groups(GROUP.avatar, 0xffff)), this.body);
  }

  private say(ctx: SimContext, b: NpcView['bubble'], seconds: number): void {
    this.bubble = b;
    this.bubbleUntil = ctx.time + seconds;
  }

  private speed(chasing: boolean): number {
    if (!chasing) return CLERK.walkSpeed;
    return this.role === 'manager' ? CLERK.managerChaseSpeed : CLERK.chaseSpeed;
  }

  step(ctx: SimContext, dt: number): void {
    if (this.bubble && ctx.time > this.bubbleUntil) this.bubble = null;
    if (this.hidden) {
      // 店長は残り60秒で出てくる
      if (ctx.phase === 'playing' && ctx.duration - ctx.elapsed <= MATCH.managerAt) {
        this.hidden = false;
        const door = ctx.layout.places.staffDoor;
        this.pos.x = door.x;
        this.pos.z = door.z;
        this.say(ctx, '!', 1.2);
        ctx.emit({ t: 'manager' });
        ctx.emit({ t: 'sfx', name: 'notice', pos: { ...this.pos } });
      } else return;
    }
    if (ctx.phase !== 'playing') {
      this.anim = 'idle';
      this.place();
      return;
    }
    if (ctx.time < this.slippedUntil) {
      this.state = 'slipped';
      this.anim = 'slip';
      this.place();
      return;
    }
    if (this.state === 'slipped') this.state = 'patrol';
    switch (this.state) {
      case 'rest':
        this.anim = 'idle';
        if (ctx.time >= this.stateUntil) this.toPatrol();
        break;
      case 'investigate':
        this.investigate(ctx, dt);
        break;
      case 'notice': {
        const t = this.target !== null ? ctx.avatarBySlot(this.target) : undefined;
        this.anim = 'idle';
        if (t) this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        if (ctx.time >= this.stateUntil) {
          this.state = 'chase';
          this.lostFor = 0;
          this.repathAt = 0;
        }
        break;
      }
      case 'chase':
        this.chase(ctx, dt);
        // 追っている間は、頭の「！」を出し続ける（見つかったことが分かるように。round3 の C3）
        if (this.state === 'chase') this.say(ctx, '!', 0.3);
        break;
      case 'carry': {
        // つかんでいる：相手のほうを向いて、両手で押さえる
        const t = this.target !== null ? ctx.avatarBySlot(this.target) : undefined;
        if (t && t.caughtHold > 0) this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        this.anim = 'hold';
        if (ctx.time >= this.stateUntil) {
          this.state = 'rest';
          this.stateUntil = ctx.time + CLERK.restAfterCatch;
          this.target = null;
        }
        break;
      }
      default:
        this.patrol(ctx, dt);
    }
    this.place();
  }

  private place(): void {
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: CENTER_Y, z: this.pos.z });
  }

  private toPatrol(): void {
    this.state = 'patrol';
    this.target = null;
    this.walker.clear();
  }

  private walk(ctx: SimContext, dt: number, speed: number): boolean {
    const wp = this.walker.next(this.pos);
    if (!wp) return false;
    const yaw = stepToward(this.pos, wp, speed, dt);
    if (yaw !== null) this.yaw = yaw;
    void ctx;
    return true;
  }

  private patrol(ctx: SimContext, dt: number): void {
    if (this.lookForTarget(ctx)) return;
    if (this.walker.done) {
      const goal = this.route[this.routeI % this.route.length]!;
      this.routeI++;
      this.walker.setGoal(ctx.nav, this.pos, goal);
    }
    this.anim = this.walk(ctx, dt, this.speed(false)) ? 'walk' : 'idle';
  }

  private investigate(ctx: SimContext, dt: number): void {
    if (ctx.time >= this.stateUntil) {
      this.toPatrol();
      return;
    }
    const booth = ctx.layout.places.pa;
    if (this.walker.done && Math.hypot(this.pos.x - booth.x, this.pos.z - booth.z) > 2.5) this.walker.setGoal(ctx.nav, this.pos, { x: booth.x + 1.2, z: booth.z + 1.6 });
    this.anim = this.walk(ctx, dt, this.speed(true)) ? 'run' : 'idle';
  }

  /** 見えている目立つ人・近くで悪事をした人を探す。見つけたら「！」 */
  private lookForTarget(ctx: SimContext): boolean {
    if (ctx.elapsed < MATCH.friendlyOpening) return false;
    let best: AvatarState | null = null;
    for (const av of ctx.avatars) {
      if (!av.connected || (av.stunned > 0 && av.stunAnim === 'caught')) continue;
      const d = Math.hypot(av.pos.x - this.pos.x, av.pos.z - this.pos.z);
      const heard = this.heard && this.heard.slot === av.slot && ctx.time - this.heard.t < 0.6;
      const seen = av.book.heat >= CLERK.noticeHeat && d <= CLERK.sightRange && ctx.nav.lineOfSight(this.pos, av.pos);
      if (!heard && !seen) continue;
      if (!best || av.book.heat > best.book.heat) best = av;
    }
    this.heard = null;
    if (!best) return false;
    this.state = 'notice';
    this.target = best.slot;
    this.stateUntil = ctx.time + NOTICE_TIME;
    this.noticedAt = ctx.time;
    this.say(ctx, '!', 1.5);
    ctx.emit({ t: 'notice', npc: this.id, target: best.slot });
    ctx.emit({ t: 'sfx', name: 'notice', pos: { ...this.pos } });
    return true;
  }

  private chase(ctx: SimContext, dt: number): void {
    const t = this.target !== null ? ctx.avatarBySlot(this.target) : undefined;
    if (!t || !t.connected || (t.stunned > 0 && t.stunAnim === 'caught')) {
      this.toPatrol();
      return;
    }
    const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    const visible = d <= CLERK.sightRange * 1.6 && ctx.nav.lineOfSight(this.pos, t.pos);
    this.lostFor = visible ? 0 : this.lostFor + dt;
    if (this.lostFor >= CLERK.giveUpAfter) {
      // 見失った：逃げ切った人に +100
      const pos = { x: t.pos.x, y: t.pos.y + 1.8, z: t.pos.z };
      ctx.award(t.slot, 'escape', 100, pos);
      ctx.emit({ t: 'escape', slot: t.slot });
      ctx.emit({ t: 'sfx', name: 'escape', pos });
      this.say(ctx, '?', 1.5);
      this.toPatrol();
      return;
    }
    // 冷凍ケースの中は、手を伸ばして届く
    const reach = CLERK.catchRange + (freezerAt(ctx, t.pos.x, t.pos.y, t.pos.z) ? 0.7 : 0);
    const ready = ctx.time - this.noticedAt >= CLERK.catchDelay;
    if (d <= reach && ready) {
      ctx.catchAvatar(t.slot, this.id);
      this.say(ctx, 'こらー！', 2);
      this.state = 'carry';
      this.stateUntil = ctx.time + CLERK.grabTime;
      this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      this.anim = 'hold';
      this.walker.clear();
      return;
    }
    if (d <= reach * 0.8) {
      // 「！」から間もないうちは、手が届いても待つ（ここで逃げれば間に合う）
      this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      this.anim = 'idle';
      return;
    }
    const speed = this.speed(true);
    if (visible && d < 3) {
      // 近くて見えていれば、まっすぐ寄る（道の引き直しの遅れで逃がさない）
      const yaw = stepToward(this.pos, t.pos, speed, dt);
      if (yaw !== null) this.yaw = yaw;
      this.anim = 'run';
      return;
    }
    if (ctx.time >= this.repathAt) {
      this.repathAt = ctx.time + REPATH;
      this.walker.setGoal(ctx.nav, this.pos, t.pos);
    }
    this.anim = this.walk(ctx, dt, speed) ? 'run' : 'idle';
  }

  slip(ctx: SimContext): boolean {
    if (this.hidden || ctx.time < this.slippedUntil) return false;
    this.slippedUntil = ctx.time + CLERK.slipStun;
    this.state = 'slipped';
    this.target = null;
    this.walker.clear();
    this.say(ctx, '…', CLERK.slipStun);
    return true;
  }

  onPa(ctx: SimContext): void {
    if (this.hidden) return;
    this.state = 'investigate';
    this.stateUntil = ctx.time + PA.lureTime;
    this.target = null;
    this.walker.clear();
    this.say(ctx, '?', 1.5);
  }

  onMisdeed(ctx: SimContext, slot: number, pos: Vec3): void {
    if (Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z) <= CLERK.hearRange) this.heard = { slot, t: ctx.time };
  }

  view(): NpcView {
    return { id: this.id, role: this.role, character: this.character, pos: { ...this.pos }, yaw: this.yaw, anim: this.anim, state: this.state, target: this.target, bubble: this.bubble };
  }
}
