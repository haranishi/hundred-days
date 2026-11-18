/**
 * 試合のシミュレーション（DOM と three を使わない。Node の試験でもそのまま回る）。
 * - 物理は60Hzの固定刻み（1フレームの追いつきは最大4回）
 * - キャラは運動学の剛体＋カプセル。移動は KCC で「動かない物だけ」と当て、剛体を次の位置へ動かす。
 *   こうすると、自分も CPU もネットの参加者（puppet）も、同じやり方で商品を押しのける
 * - 商品は動く剛体。触った人を記録し、商品どうしがぶつかったら引き継ぐ（連鎖で崩れても落とした人に点が入る）
 * - 悪事は systems/ に1つずつ、店員と客は ai/ に。点・コンボ・目立ち度・達成は rules/scoring.ts を通す
 * - mode='self' はネットの参加者の端末用：動かない物とカートだけを持ち、自分のキャラだけを動かす（点は部屋の主が数える）
 */
import type { InputState } from '../../shared/input';
import { EMPTY_INPUT } from '../../shared/input';
import { buildWorldStatic, faceOfProp, storeLayout, type StoreLayout } from '../../shared/layout/store';
import { misdeedById, type MisdeedId, type ScoreKind, type SecretId } from '../../shared/rules/misdeeds';
import { ScoreBook, buildMatchResult, type AwardResult } from '../../shared/rules/scoring';
import { ACTION, AVATAR, BOWLING, CLERK, FALL, MATCH, PHYSICS, SCORE, SWEEP } from '../../shared/rules/tuning';
import { streamRng, type Rng } from '../../shared/rng';
import type { ActionPrompt, AnimName, AvatarView, CartView, GameEvent, MatchResult, ModelKey, PeelView, Phase, StationsView, Vec3, WorldStatic, WorldView } from '../../shared/view';
import { NavGrid } from './nav/grid';
import { GROUP, addStatic, createCartBody, createPropBody, createWorld, groups, loadRapier, yawQuat, type Collider, type R, type World } from './physics';
import { createSystems } from './systems/index';
import { dismount, mount } from './systems/cart';
import { createNpcs } from './ai/npcs';
import type { AvatarOrder, AvatarPose, AvatarState, CartState, MisdeedSystem, NpcAgent, Offer, PropState, SimContext, SimMode } from './types';

export type { AvatarOrder, AvatarPose, NpcAgent, SimMode } from './types';

export interface SimPlayer {
  slot: number;
  kind: 'human' | 'cpu';
  name: string;
  character: ModelKey;
  /** 移動の速さの倍率（CPUの強さ） */
  speedScale?: number;
}

export interface SimOptions {
  seed: number;
  /** 試合の長さ（秒） */
  duration?: number;
  players: SimPlayer[];
  /** 'full'（既定）か 'self'（ネットの参加者の端末） */
  mode?: SimMode;
  /** 悪事の一覧（省略時は systems/index.ts の登録どおり） */
  systems?: MisdeedSystem[];
  /** 店員・店長・客を出すか（既定は出す。試験で悪事だけを確かめるときに切る） */
  npcs?: boolean;
}

/** 入力を自分で作るもの（CPU） */
export interface Controller {
  input(sim: Simulation, av: AvatarState, dt: number): InputState;
}

const HALF_H = (AVATAR.height - AVATAR.radius * 2) / 2;
/** 足元からカプセルの中心までの高さ */
export const CENTER_Y = HALF_H + AVATAR.radius;
const COS_TILT = Math.cos((FALL.tiltDegrees * Math.PI) / 180);
const MAX_KNOCK_SFX_PER_STEP = 6;
/** 持った物を置く所（足元から、前へ・上へ） */
const HOLD_FORWARD = 0.5;
const HOLD_UP = 0.62;

/** self のとき、部屋の主の案内（悪事）から、押したときの見た目を決める */
const ACTION_ANIM: Partial<Record<MisdeedId, AnimName>> = {
  sweep: 'sweep',
  pyramid: 'kick',
  bell: 'bell',
  samples: 'eat',
  bowling: 'throw',
  banana: 'pick-up',
  pa: 'pa',
  tantrum: 'tantrum',
};

export class Simulation implements SimContext {
  readonly R: R;
  readonly world: World;
  readonly mode: SimMode;
  readonly layout: StoreLayout;
  readonly statics: WorldStatic;
  readonly nav: NavGrid;
  readonly fx: Rng;
  readonly memo = new Map<string, unknown>();
  readonly duration: number;
  readonly avatars: AvatarState[] = [];
  readonly props: PropState[] = [];
  readonly carts: CartState[] = [];
  readonly npcs: NpcAgent[] = [];
  readonly systems: MisdeedSystem[];
  time = 0;
  phase: Phase = 'countdown';
  lastSpurt = false;
  /** 刻みの数（試験用） */
  steps = 0;

  private events: GameEvent[] = [];
  private acc = 0;
  private readonly kcc: import('@dimforge/rapier3d-compat').KinematicCharacterController;
  private readonly propByHandle = new Map<number, PropState>();
  private readonly controllers = new Map<number, Controller>();
  private readonly pending = new Map<number, InputState>();
  private readonly transforms: Float32Array;
  private readonly hidden: Uint8Array;
  private readonly productCount: number;
  private movedProducts = 0;
  private countdownMark = Math.ceil(MATCH.countdown) + 1;
  private knockSfx = 0;
  private resultCache: MatchResult | null = null;

  static async create(opts: SimOptions): Promise<Simulation> {
    const R = await loadRapier();
    return new Simulation(R, opts);
  }

  private constructor(R: R, opts: SimOptions) {
    this.R = R;
    this.mode = opts.mode ?? 'full';
    this.duration = opts.duration ?? MATCH.duration;
    this.layout = storeLayout();
    this.statics = buildWorldStatic(opts.seed);
    this.nav = NavGrid.fromLayout(this.layout);
    this.fx = streamRng(opts.seed, 'fx');
    this.world = createWorld(R);
    addStatic(R, this.world, this.layout);
    if (this.mode === 'full') {
      for (const def of this.statics.props) {
        const { body, collider } = createPropBody(R, this.world, def);
        const p: PropState = { def, body, collider, owner: null, touchT: -Infinity, sweepSlot: null, sweepT: -Infinity, scored: false, moved: false, hidden: false, locked: false, heldBy: null, face: faceOfProp(def), ccdUntil: 0 };
        this.props.push(p);
        this.propByHandle.set(collider.handle, p);
      }
    }
    for (const def of this.statics.carts) {
      const { body, collider } = createCartBody(R, this.world, def);
      // 参加者の端末では、カートは部屋の主の見え方の位置に置くだけ（押しても動かない）
      if (this.mode === 'self') body.setBodyType(R.RigidBodyType.KinematicPositionBased, false);
      this.carts.push({ id: def.id, body, collider, rider: null, yaw: def.home.yaw, speed: 0, lastRider: null, lastRideT: -Infinity, meterAcc: 0, crashT: -Infinity, remoteRider: null, stuckFor: 0, mountedAt: -Infinity });
    }
    this.productCount = this.statics.props.filter((p) => p.kind === 'product').length;
    this.kcc = this.world.createCharacterController(0.02);
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(AVATAR.stepHeight, 0.2, false);
    this.kcc.enableSnapToGround(0.25);
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    for (const p of opts.players) this.addAvatar(p);
    const all = opts.systems ?? createSystems();
    this.systems = this.mode === 'self' ? all.filter((s) => s.local) : all;
    this.transforms = new Float32Array(this.statics.props.length * 7);
    this.hidden = new Uint8Array(this.statics.props.length);
    for (const sys of this.systems) sys.init?.(this);
    if (this.mode === 'full' && opts.npcs !== false) for (const n of createNpcs(this)) this.npcs.push(n);
    this.settleProps();
    this.syncTransforms(true);
  }

  // ───────── 組み立て ─────────

  /**
   * 置いた商品を、定位置のまま眠らせる。
   * Rapier は最初の刻みで接触ができると眠っている物まで起こすので、最初の1刻みだけ重力なしで回して接触を作り、
   * 速さを0にして眠らせ直す。こうすると、触られるまで定位置から動かない（ネットの鍵も小さくなる）
   */
  private settleProps(): void {
    const g = this.world.gravity;
    this.world.gravity = { x: 0, y: 0, z: 0 };
    this.world.step();
    this.world.gravity = g;
    const zero = { x: 0, y: 0, z: 0 };
    for (const p of this.props) {
      p.body.setLinvel(zero, false);
      p.body.setAngvel(zero, false);
      p.body.sleep();
    }
    for (const c of this.carts) {
      if (!c.body.isDynamic()) continue;
      c.body.setLinvel(zero, false);
      c.body.setAngvel(zero, false);
      c.body.sleep();
    }
  }

  private addAvatar(p: SimPlayer): void {
    const spawn = this.layout.spawns[p.slot % this.layout.spawns.length]!;
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, CENTER_Y + 0.02, spawn.z));
    const collider = this.world.createCollider(
      this.R.ColliderDesc.capsule(HALF_H, AVATAR.radius).setFriction(0.3).setCollisionGroups(groups(GROUP.avatar, 0xffff)),
      body,
    );
    this.avatars.push({
      slot: p.slot,
      kind: p.kind,
      name: p.name,
      character: p.character,
      body,
      collider,
      pos: { x: spawn.x, y: 0.02, z: spawn.z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: spawn.yaw,
      grounded: true,
      input: { ...EMPTY_INPUT },
      speedScale: p.speedScale ?? 1,
      dashLeft: 0,
      dashCooldown: 0,
      dashDir: { x: 0, z: -1 },
      actionAnim: null,
      actionAnimLeft: 0,
      cooldowns: {},
      anim: 'idle',
      ridingCart: null,
      holding: null,
      stunned: 0,
      stunAnim: 'stunned',
      caughtHold: 0,
      engagedUntil: -Infinity,
      book: new ScoreBook(),
      progress: {},
      offer: null,
      sticky: null,
      connected: true,
      puppet: null,
      puppetStuck: 0,
      puppetGap: Infinity,
      hostPrompt: null,
      script: null,
    });
  }

  /** この slot の入力を CPU などに任せる */
  setController(slot: number, controller: Controller | null): void {
    if (controller) this.controllers.set(slot, controller);
    else this.controllers.delete(slot);
  }

  /** 人の入力を渡す。押した瞬間の印は、次に刻みが来るまでためておく（1フレームに刻みが0回でも取りこぼさない） */
  setInput(slot: number, input: InputState): void {
    const prev = this.pending.get(slot);
    this.pending.set(slot, {
      moveX: input.moveX,
      moveZ: input.moveZ,
      action: input.action,
      dash: input.dash || (prev?.dash ?? false),
      jump: input.jump || (prev?.jump ?? false),
      actionPressed: input.actionPressed || (prev?.actionPressed ?? false),
      actionReleased: input.actionReleased || (prev?.actionReleased ?? false),
    });
  }

  // ───────── ネット対戦の口（hooks-ready.md） ─────────

  /**
   * 【部屋の主】参加者のキャラを外から動かす。届いた姿勢へ、速さの上限で丸めながら KCC で追いつく（壁は抜けない・商品は押しのける）。
   * 乗っているカートは姿勢の ridingCart に合わせて乗せ降ろしする。捕まった・滑ったで動けない間は姿勢を無視する。
   * アクションは setInput の action 系で渡す（悪事の判定は、追いついた位置で行う）。null で手元の操作に戻す。
   */
  setPuppet(slot: number, pose: AvatarPose | null): void {
    const av = this.avatarBySlot(slot);
    if (!av) return;
    av.puppet = pose ? { pose: { ...pose, pos: { ...pose.pos }, vel: { ...pose.vel } }, at: this.time } : null;
    if (!pose) {
      av.puppetStuck = 0;
      av.puppetGap = Infinity;
    }
  }

  /** 席が外れた・戻った（外れている間は止まり、見え方の connected が false になる） */
  setConnected(slot: number, connected: boolean): void {
    const av = this.avatarBySlot(slot);
    if (!av) return;
    av.connected = connected;
    if (!connected && av.ridingCart !== null) dismount(this, av);
  }

  /** 【参加者の端末・self】自分のキャラの今の姿勢（「自分の様子」として部屋の主へ送る） */
  pose(slot: number): AvatarPose | null {
    const av = this.avatarBySlot(slot);
    if (!av) return null;
    return { pos: { ...av.pos }, vel: { ...av.vel }, yaw: av.yaw, anim: av.anim, ridingCart: av.ridingCart, holding: av.holding };
  }

  /** 【参加者の端末・self】部屋の主の言いつけに従う（乗った・降りた・捕まった・滑った・止まれ・置き直し） */
  applyOrder(slot: number, order: AvatarOrder): void {
    const av = this.avatarBySlot(slot);
    if (!av) return;
    switch (order.kind) {
      case 'caught':
        if (av.ridingCart !== null) dismount(this, av);
        this.grab(av, null);
        break;
      case 'slip':
        if (av.ridingCart !== null) dismount(this, av);
        this.stun(av, order.seconds ?? 1.5, 'slip');
        break;
      case 'stop':
        this.stun(av, order.seconds, 'stunned');
        break;
      case 'mount': {
        const cart = this.carts[order.cart];
        if (cart && av.ridingCart === null) mount(this, av, cart);
        break;
      }
      case 'dismount':
        if (av.ridingCart !== null) dismount(this, av);
        break;
      case 'teleport':
        this.teleport(slot, order.x, order.z);
        break;
    }
  }

  /** 【参加者の端末・self】部屋の主の見え方のカートを置く（自分が乗っているカートは手元で動かすので触らない） */
  syncCarts(views: readonly CartView[], mySlot: number): void {
    for (const v of views) {
      const c = this.carts[v.id];
      if (!c) continue;
      c.remoteRider = v.riderSlot !== null && v.riderSlot !== mySlot ? v.riderSlot : null;
      if (c.rider !== null) continue;
      c.body.setNextKinematicTranslation({ x: v.pos.x, y: v.pos.y, z: v.pos.z });
      c.body.setNextKinematicRotation(yawQuat(v.yaw));
      c.yaw = v.yaw;
    }
  }

  /** 【参加者の端末・self】部屋の主の見え方の自分（案内・持っている物）を写す。押したときの見た目に使う */
  syncFromHost(slot: number, host: AvatarView | undefined): void {
    const av = this.avatarBySlot(slot);
    if (!av || !host) return;
    av.hostPrompt = host.prompt;
    av.holding = host.holding;
  }

  // ───────── 時間を進める ─────────

  /** 経過秒だけ進める（60Hzの固定刻み・追いつきは最大4回） */
  advance(dt: number): void {
    const h = 1 / PHYSICS.hz;
    this.acc += Math.max(0, Math.min(dt, 0.25));
    let n = 0;
    while (this.acc >= h && n < PHYSICS.maxSubsteps) {
      this.step(h);
      this.acc -= h;
      n++;
    }
    // 追いつけないほど遅れたら、残りは捨てる（スローモーションのように進む）
    if (n === PHYSICS.maxSubsteps && this.acc >= h) this.acc = 0;
  }

  /** 試験用：秒数ぶん刻む（毎刻み cb を呼べる） */
  runFor(seconds: number, cb?: (sim: Simulation) => void): void {
    const h = 1 / PHYSICS.hz;
    const n = Math.round(seconds / h);
    for (let i = 0; i < n; i++) {
      cb?.(this);
      this.step(h);
    }
  }

  step(h: number): void {
    this.time += h;
    this.steps++;
    this.knockSfx = 0;
    this.updatePhase();
    const playing = this.phase === 'playing';
    for (const av of this.avatars) this.consumeInput(av, h);
    for (const av of this.avatars) {
      av.stunned = Math.max(0, av.stunned - h);
      if (av.caughtHold > 0) {
        av.caughtHold = Math.max(0, av.caughtHold - h);
        if (av.caughtHold === 0) this.toService(av);
      }
      if (av.actionAnimLeft > 0) {
        av.actionAnimLeft = Math.max(0, av.actionAnimLeft - h);
        if (av.actionAnimLeft === 0) av.actionAnim = null;
      }
      if (av.puppet && av.stunned <= 0) this.syncPuppetCart(av);
      av.offer = this.keepOffer(av, playing && av.stunned <= 0 && av.connected ? this.bestOffer(av) : null);
      if (av.offer && av.input.actionPressed) av.offer.system.act?.(this, av, av.offer);
      if (av.offer && av.input.action) av.offer.system.hold?.(this, av, av.offer, h);
      if (this.mode === 'self' && playing && av.stunned <= 0) this.selfActionLook(av);
    }
    for (const sys of this.systems) sys.preStep?.(this, h);
    for (const av of this.avatars) this.moveAvatar(av, h);
    for (const av of this.avatars) this.placeHeld(av);
    for (const n of this.npcs) n.step(this, h);
    this.world.step();
    if (this.mode === 'full') {
      this.trackTouches();
      this.checkProps();
    }
    for (const sys of this.systems) sys.postStep?.(this, h);
    for (const av of this.avatars) {
      if (this.time < av.engagedUntil) av.book.holdCombo(h, this.time);
      av.book.tick(h, this.time);
      if (av.book.comboExpired(this.time)) this.emit({ t: 'combo-break', slot: av.slot });
      av.anim = this.animFor(av);
    }
  }

  private consumeInput(av: AvatarState, h: number): void {
    const ctl = this.controllers.get(av.slot);
    if (ctl) {
      av.input = ctl.input(this, av, h);
      return;
    }
    const p = this.pending.get(av.slot);
    if (!p) {
      av.input = { ...EMPTY_INPUT };
      return;
    }
    av.input = { ...p };
    this.pending.set(av.slot, { ...p, dash: false, jump: false, actionPressed: false, actionReleased: false });
  }

  private updatePhase(): void {
    if (this.phase === 'countdown') {
      const left = MATCH.countdown - this.time;
      const mark = Math.ceil(left);
      if (mark < this.countdownMark && mark > 0) {
        this.countdownMark = mark;
        this.emit({ t: 'sfx', name: 'countdown' });
      }
      if (left <= 0) {
        this.phase = 'playing';
        this.emit({ t: 'phase', phase: 'playing' });
        this.emit({ t: 'sfx', name: 'go' });
      }
    } else if (this.phase === 'playing') {
      const left = this.timeLeft();
      if (!this.lastSpurt && left <= MATCH.lastSpurtAt) {
        this.lastSpurt = true;
        this.emit({ t: 'last-spurt' });
      }
      if (left <= 0) this.end();
    }
  }

  get elapsed(): number {
    return this.time - MATCH.countdown;
  }

  timeLeft(): number {
    if (this.phase === 'countdown') return Math.max(0, MATCH.countdown - this.time);
    if (this.phase === 'playing') return Math.max(0, this.duration - (this.time - MATCH.countdown));
    return 0;
  }

  /** 試合を終える（時間切れ・やめる・試験の forceEnd） */
  end(aborted = false): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    for (const av of this.avatars) {
      if (av.ridingCart !== null) dismount(this, av);
      if (av.holding !== null) this.release(av);
    }
    this.emit({ t: 'phase', phase: 'ended' });
    this.emit({ t: 'sfx', name: 'time-up' });
    this.resultCache = buildMatchResult({
      duration: this.duration,
      damage: this.damage(),
      aborted,
      players: this.avatars.map((a) => ({ slot: a.slot, kind: a.kind, name: a.name, character: a.character, book: a.book })),
    });
  }

  result(): MatchResult | null {
    return this.resultCache;
  }

  // ───────── キャラ ─────────

  private bestOffer(av: AvatarState): Offer | null {
    let best: Offer | null = null;
    for (const sys of this.systems) {
      const o = sys.offer?.(this, av);
      if (o && (!best || o.priority > best.priority)) best = o;
    }
    return best;
  }

  /**
   * 悪事の案内は、範囲を出ても ACTION.stickyTime 秒（stickyRange m 以内なら）残す。
   * 止まりぎわに滑って出た・表示を見てから押すまでの間に出た、で「蹴る」に化けないように。
   * 残すのは、ほかに案内がなく「蹴る」になるときだけ（別の悪事の案内が出ればそちらを使う）
   */
  private keepOffer(av: AvatarState, fresh: Offer | null): Offer | null {
    if (!fresh) {
      av.sticky = null;
      return null;
    }
    if (fresh.system.id !== 'kick') {
      // 残すのは、長押し・連打の悪事と、缶ピラミッドの「蹴る」・冷凍ケースの「入る」だけ
      // （乗る・降りる・持つ・転がすは、した後に案内が残ると、もう一度押したときに逆の動きになる）
      const press = fresh.prompt?.press;
      const keep = !!fresh.prompt?.misdeed && (press === 'hold' || press === 'mash' || fresh.system.id === 'pyramid' || (fresh.system.id === 'freezer' && fresh.target >= 0));
      av.sticky = keep ? { offer: fresh, until: this.time + ACTION.stickyTime, x: av.pos.x, z: av.pos.z } : null;
      return fresh;
    }
    const s = av.sticky;
    if (!s) return fresh;
    const near = Math.hypot(av.pos.x - s.x, av.pos.z - s.z) <= ACTION.stickyRange;
    if (this.time < s.until && near && av.ridingCart === null && av.holding === null && !av.script) {
      // 長押しは押している間、連打は押すたびに、残す時間を延ばす（範囲のすぐ外で長押しを続けても途切れない）
      const press = s.offer.prompt?.press;
      if ((press === 'hold' && av.input.action) || (press === 'mash' && av.input.actionPressed)) s.until = this.time + ACTION.stickyTime;
      return s.offer;
    }
    av.sticky = null;
    return fresh;
  }

  /** 参加者のキャラ：姿勢の ridingCart に合わせてカートに乗せ降ろしする */
  private syncPuppetCart(av: AvatarState): void {
    const want = av.puppet!.pose.ridingCart;
    if (want === av.ridingCart) return;
    if (av.ridingCart !== null) dismount(this, av);
    if (want !== null) {
      const cart = this.carts[want];
      if (cart && cart.rider === null) mount(this, av, cart);
    }
  }

  /** self：押したときの見た目だけを出す（点は部屋の主が数える） */
  private selfActionLook(av: AvatarState): void {
    if (av.offer && av.offer.system.id !== 'kick') return;
    const p: ActionPrompt | null = av.hostPrompt;
    const anim = (p?.misdeed && ACTION_ANIM[p.misdeed]) || 'kick';
    if (p?.press === 'hold') {
      if (av.input.action) this.playAction(av, anim, 0.15);
    } else if (av.input.actionPressed) this.playAction(av, anim);
  }

  private moveAvatar(av: AvatarState, h: number): void {
    if (av.ridingCart !== null) {
      av.body.setNextKinematicTranslation({ x: av.pos.x, y: av.pos.y + CENTER_Y, z: av.pos.z });
      return;
    }
    const Q = this.R.QueryFilterFlags;
    const flags = Q.EXCLUDE_DYNAMIC | Q.EXCLUDE_KINEMATIC | Q.EXCLUDE_SENSORS;
    if (av.script) {
      // 決まった弧で跳ぶ（冷凍ケースの縁を確実に越えるため、この間は当たり判定を見ない）
      const sc = av.script;
      const k = Math.min(1, (this.time - sc.t0) / sc.dur);
      const nx = sc.from.x + (sc.to.x - sc.from.x) * k;
      const nz = sc.from.z + (sc.to.z - sc.from.z) * k;
      const ny = sc.from.y + (sc.to.y - sc.from.y) * k + Math.sin(Math.PI * k) * sc.height;
      av.vel = { x: (nx - av.pos.x) / h, y: (ny - av.pos.y) / h, z: (nz - av.pos.z) / h };
      av.pos = { x: nx, y: ny, z: nz };
      av.grounded = false;
      if (k >= 1) {
        av.script = null;
        av.grounded = true;
        av.vel = { x: 0, y: 0, z: 0 };
      }
      av.body.setNextKinematicTranslation({ x: av.pos.x, y: av.pos.y + CENTER_Y, z: av.pos.z });
      return;
    }
    if (av.puppet && av.stunned <= 0 && av.connected) {
      // 参加者の端末が決めた位置へ寄せる。少しだけ先読みし、速さの上限で丸める
      const pose = av.puppet.pose;
      const ahead = Math.min(0.12, Math.max(0, this.time - av.puppet.at));
      const want = {
        x: pose.pos.x + pose.vel.x * ahead - av.pos.x,
        y: Math.max(0, pose.pos.y + pose.vel.y * ahead) - av.pos.y,
        z: pose.pos.z + pose.vel.z * ahead - av.pos.z,
      };
      const d = Math.hypot(want.x, want.y, want.z);
      const lim = AVATAR.remoteMaxSpeed * h;
      if (d > lim) {
        want.x *= lim / d;
        want.y *= lim / d;
        want.z *= lim / d;
      }
      this.kcc.computeColliderMovement(av.collider, want, flags);
      const mv = this.kcc.computedMovement();
      av.pos.x += mv.x;
      av.pos.y += mv.y;
      av.pos.z += mv.z;
      av.vel = { x: mv.x / h, y: mv.y / h, z: mv.z / h };
      av.yaw = pose.yaw;
      av.grounded = this.kcc.computedGrounded() || av.pos.y < 0.05;
      this.snapPuppetIfStuck(av, h);
      av.body.setNextKinematicTranslation({ x: av.pos.x, y: av.pos.y + CENTER_Y, z: av.pos.z });
      return;
    }
    const inp = av.input;
    const frozen = this.phase !== 'playing' || av.stunned > 0 || !av.connected;
    let mx = frozen ? 0 : inp.moveX;
    let mz = frozen ? 0 : inp.moveZ;
    // スイカを持ってレーンにいる間は、←→でその場で向きだけ変える（狙いを合わせる。↑↓は前後に動くだけで向きは変えない。round4 の F4）
    const aiming = !frozen && this.aimingMelon(av);
    if (aiming) {
      av.yaw -= mx * BOWLING.aimTurnRate * h;
      if (av.yaw > Math.PI) av.yaw -= Math.PI * 2;
      if (av.yaw < -Math.PI) av.yaw += Math.PI * 2;
      mx = 0;
    }
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1) {
      mx /= mlen;
      mz /= mlen;
    }
    av.dashCooldown = Math.max(0, av.dashCooldown - h);
    if (!frozen && inp.dash && av.dashCooldown <= 0) {
      av.dashLeft = AVATAR.dashTime;
      av.dashCooldown = AVATAR.dashCooldown;
      const dir = mlen > 0.1 ? { x: mx, z: mz } : { x: Math.sin(av.yaw), z: Math.cos(av.yaw) };
      const dl = Math.hypot(dir.x, dir.z) || 1;
      av.dashDir = { x: dir.x / dl, z: dir.z / dl };
      this.emit({ t: 'sfx', name: 'dash', pos: { ...av.pos } });
    }
    const dashing = av.dashLeft > 0;
    av.dashLeft = Math.max(0, av.dashLeft - h);
    const tvx = dashing ? av.dashDir.x * AVATAR.dashSpeed * av.speedScale : mx * AVATAR.runSpeed * av.speedScale;
    const tvz = dashing ? av.dashDir.z * AVATAR.dashSpeed * av.speedScale : mz * AVATAR.runSpeed * av.speedScale;
    // 空中では向きを変えにくくする（冷凍ケースへの飛び込みなど、投げ出された動きを保つ）
    const ax = tvx - av.vel.x;
    const az = tvz - av.vel.z;
    const al = Math.hypot(ax, az);
    const maxd = AVATAR.accel * h * (dashing ? 4 : 1) * (av.grounded ? 1 : 0.25);
    if (al > maxd) {
      av.vel.x += (ax / al) * maxd;
      av.vel.z += (az / al) * maxd;
    } else {
      av.vel.x = tvx;
      av.vel.z = tvz;
    }
    if (av.grounded && !frozen && inp.jump) {
      av.vel.y = AVATAR.jumpSpeed;
      av.grounded = false;
      this.emit({ t: 'sfx', name: 'jump', pos: { ...av.pos } });
    } else if (av.grounded && av.vel.y <= 0) {
      // 接地中は下向きに押し付けない。床に向かう成分があると、KCC が床に当たったとみなして横の動きまで止めることがある
      av.vel.y = 0;
    } else {
      av.vel.y -= AVATAR.gravity * h;
    }
    const want = { x: av.vel.x * h, y: av.vel.y * h, z: av.vel.z * h };
    this.kcc.computeColliderMovement(av.collider, want, flags);
    const mv = this.kcc.computedMovement();
    av.grounded = this.kcc.computedGrounded();
    av.pos.x += mv.x;
    av.pos.y += mv.y;
    av.pos.z += mv.z;
    if (av.grounded && av.vel.y < 0) av.vel.y = 0;
    if (av.vel.y > 0 && mv.y < want.y * 0.5) av.vel.y = 0;
    // 壁に沿って滑ったら、速さも実際に動いた分にそろえる（ぶつかっている間に速さがたまらないように）
    const wantH = Math.hypot(want.x, want.z);
    if (wantH > 1e-5 && Math.hypot(mv.x, mv.z) < wantH * 0.98) {
      av.vel.x = mv.x / h;
      av.vel.z = mv.z / h;
    }
    // 万一、床を抜けたら出発点へ戻す
    if (av.pos.y < -3) {
      const sp = this.layout.spawns[av.slot % this.layout.spawns.length]!;
      this.teleport(av.slot, sp.x, sp.z);
    }
    av.body.setNextKinematicTranslation({ x: av.pos.x, y: av.pos.y + CENTER_Y, z: av.pos.z });
    // 動いている向きへ振り向く（スイカで狙っている間は、向きは←→だけで変える）
    const sp = Math.hypot(mx, mz);
    if (!frozen && !aiming && (sp > 0.1 || dashing)) {
      const target = dashing ? Math.atan2(av.dashDir.x, av.dashDir.z) : Math.atan2(mx, mz);
      let d = target - av.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = AVATAR.turnRate * h;
      av.yaw += Math.max(-turn, Math.min(turn, d));
      if (av.yaw > Math.PI) av.yaw -= Math.PI * 2;
      if (av.yaw < -Math.PI) av.yaw += Math.PI * 2;
    }
  }

  /**
   * 写しが棚などに引っかかって、届いた位置へ近づけないまま0.5秒たったら、届いた位置へ置き直す。
   * 届いた位置が動かない物の中（棚の中など）なら置き直さない（ずるの位置や、計算のずれで壁に埋まった位置を受け入れない）
   */
  private snapPuppetIfStuck(av: AvatarState, h: number): void {
    const pose = av.puppet!.pose;
    const gap = Math.hypot(pose.pos.x - av.pos.x, pose.pos.z - av.pos.z);
    if (gap < AVATAR.remoteSnapDistance) {
      av.puppetStuck = 0;
      av.puppetGap = gap;
      return;
    }
    const closing = (av.puppetGap - gap) / h;
    av.puppetGap = gap;
    av.puppetStuck = closing < AVATAR.remoteStuckSpeed ? av.puppetStuck + h : 0;
    if (av.puppetStuck < AVATAR.remoteSnapAfter) return;
    av.puppetStuck = 0;
    if (!this.capsuleFree(pose.pos.x, Math.max(0.02, pose.pos.y), pose.pos.z)) return;
    av.pos = { x: pose.pos.x, y: Math.max(0.02, pose.pos.y), z: pose.pos.z };
    av.vel = { x: 0, y: 0, z: 0 };
    av.puppetGap = 0;
    const c = { x: av.pos.x, y: av.pos.y + CENTER_Y, z: av.pos.z };
    av.body.setTranslation(c, true);
  }

  /** 足元がこの位置のキャラのカプセルが、店の中で、動かない物に埋まらないか（少し細めに調べて、触れているだけなら空きとみなす） */
  private capsuleFree(x: number, y: number, z: number): boolean {
    const b = this.layout.bounds;
    if (x < b.x0 + AVATAR.radius || x > b.x1 - AVATAR.radius || z < b.z0 + AVATAR.radius || z > b.z1 - AVATAR.radius) return false;
    let hit = false;
    const shape = new this.R.Capsule(HALF_H - 0.03, AVATAR.radius - 0.03);
    this.world.intersectionsWithShape({ x, y: y + CENTER_Y, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, () => {
      hit = true;
      return false;
    }, this.R.QueryFilterFlags.ONLY_FIXED);
    return !hit;
  }

  /** スイカを持って、ボウリングのレーン（足型からピンの手前まで）にいる（←→で狙いを合わせられる） */
  aimingMelon(av: AvatarState): boolean {
    if (av.holding === null || av.ridingCart !== null || av.script) return false;
    if (this.statics.props[av.holding]?.kind !== 'watermelon') return false;
    const lane = this.layout.places.lane;
    const pins = this.layout.places.pins;
    return Math.abs(av.pos.x - lane.x) <= BOWLING.laneHalfWidth && av.pos.z <= lane.z + 2.5 && av.pos.z >= pins.z + 1.0;
  }

  /** 持っている物を手の前へ置く */
  private placeHeld(av: AvatarState): void {
    if (av.holding === null) return;
    const p = this.props[av.holding];
    if (!p || p.heldBy !== av.slot) return;
    const fx = Math.sin(av.yaw);
    const fz = Math.cos(av.yaw);
    p.body.setNextKinematicTranslation({ x: av.pos.x + fx * HOLD_FORWARD, y: av.pos.y + HOLD_UP, z: av.pos.z + fz * HOLD_FORWARD });
    p.body.setNextKinematicRotation(yawQuat(av.yaw));
  }

  private animFor(av: AvatarState): AnimName {
    if (this.phase === 'ended' && this.resultCache) return this.resultCache.winnerSlots.includes(av.slot) ? 'cheer' : 'sad';
    if (av.stunned > 0) return av.stunAnim;
    if (av.ridingCart !== null) return 'ride-cart';
    if (av.script) return 'jump';
    if (av.actionAnim && av.actionAnimLeft > 0) return av.actionAnim;
    if (av.puppet) return av.puppet.pose.anim;
    if (!av.grounded) return av.vel.y > 0 ? 'jump' : 'fall';
    if (av.holding !== null) return 'hold';
    if (av.dashLeft > 0) return 'dash';
    const sp = Math.hypot(av.vel.x, av.vel.z);
    if (sp > AVATAR.walkAnimBelow) return 'run';
    if (sp > 0.3) return 'walk';
    return 'idle';
  }

  // ───────── 商品 ─────────

  private contactWith(a: Collider, handles: number[]): number[] {
    const out: number[] = [];
    for (const hnd of handles) {
      const b = this.world.getCollider(hnd);
      if (!b) continue;
      let hit = false;
      this.world.contactPair(a, b, (m) => {
        if (m.numContacts() > 0) hit = true;
      });
      if (hit) out.push(hnd);
    }
    return out;
  }

  private propPairs(c: Collider): number[] {
    const handles: number[] = [];
    this.world.contactPairsWith(c, (other) => {
      if (this.propByHandle.has(other.handle)) handles.push(other.handle);
    });
    return handles.length ? this.contactWith(c, handles) : handles;
  }

  /** 体・カート・飛んでいる商品が触れた商品に「触った人」を付ける */
  private trackTouches(): void {
    for (const av of this.avatars) {
      for (const hnd of this.propPairs(av.collider)) {
        const p = this.propByHandle.get(hnd)!;
        if (!p.locked) this.touch(p, av.slot);
      }
    }
    for (const cart of this.carts) {
      if (cart.lastRider === null || (cart.rider === null && this.time - cart.lastRideT > FALL.ownerWindow)) continue;
      for (const hnd of this.propPairs(cart.collider)) {
        const p = this.propByHandle.get(hnd)!;
        if (!p.locked) this.touch(p, cart.lastRider);
      }
    }
    // 商品どうしの引き継ぎ：動いている商品が触れた商品へ、持ち主となぎ払いの印を渡す
    for (const p of this.props) {
      if (p.owner === null || p.locked || p.hidden || this.time - p.touchT > FALL.ownerWindow) continue;
      if (p.body.isSleeping()) continue;
      const v = p.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) < FALL.handoffSpeed) continue;
      for (const hnd of this.propPairs(p.collider)) {
        const q = this.propByHandle.get(hnd)!;
        if (q === p || q.locked) continue;
        if (q.owner !== p.owner || q.touchT < this.time - 0.2) {
          q.owner = p.owner;
          q.touchT = this.time;
        }
        if (p.sweepSlot !== null && this.time - p.sweepT <= SWEEP.tagWindow && q.sweepSlot === null) {
          q.sweepSlot = p.sweepSlot;
          q.sweepT = p.sweepT;
        }
      }
    }
  }

  /** 動いた・床に落ちたの判定。棚・台の商品が床に落ちたら初回だけ10点（なぎ払いの印があれば sweep） */
  private checkProps(): void {
    for (const p of this.props) {
      if (p.hidden || p.locked) continue;
      if (p.body.isSleeping()) continue;
      if (p.ccdUntil > 0 && this.time > p.ccdUntil) {
        p.body.enableCcd(false);
        p.ccdUntil = 0;
      }
      const t = p.body.translation();
      const q = p.body.rotation();
      const home = p.def.home.pos;
      const r11 = 1 - 2 * (q.x * q.x + q.z * q.z);
      const moved = Math.hypot(t.x - home.x, t.y - home.y, t.z - home.z) >= FALL.moveDistance || r11 < COS_TILT;
      if (moved && !p.moved) {
        p.moved = true;
        if (p.def.kind === 'product') this.movedProducts++;
      }
      if (t.y < -5) {
        // 店の外へ抜けた物は消す
        p.hidden = true;
        p.body.setEnabled(false);
        continue;
      }
      if (p.scored || !moved || p.def.kind !== 'product' || p.def.fixtureId === null) continue;
      if (this.lowestPoint(p, t, q) > FALL.floorContact) continue;
      p.scored = true;
      const owner = p.owner !== null && this.time - p.touchT <= FALL.ownerWindow ? p.owner : null;
      if (owner === null) continue;
      const swept = p.sweepSlot === owner && this.time - p.sweepT <= SWEEP.tagWindow;
      const kind: ScoreKind = swept ? 'sweep' : 'knock';
      const pos = { x: t.x, y: t.y + 0.4, z: t.z };
      if (this.award(owner, kind, SCORE.knockItem, pos) && swept) this.progress(owner, 'sweep', 1);
      if (this.knockSfx < MAX_KNOCK_SFX_PER_STEP) {
        this.knockSfx++;
        this.emit({ t: 'sfx', name: 'knock', pos, volume: 0.7 });
      }
    }
  }

  /** 物の一番低い所の高さ（回転を考える） */
  private lowestPoint(p: PropState, t: Vec3, q: { x: number; y: number; z: number; w: number }): number {
    const s = p.def.size;
    // 本体の各軸の、ワールドの上向きの成分（回転行列の2行目）
    const r10 = 2 * (q.x * q.y + q.w * q.z);
    const r11 = 1 - 2 * (q.x * q.x + q.z * q.z);
    const r12 = 2 * (q.y * q.z - q.w * q.x);
    // 当たり判定の中心は、原点から本体の上向きに半分の高さ
    const cy = t.y + r11 * (s.y / 2);
    let ext: number;
    if (p.def.shape === 'ball') ext = s.x / 2;
    else if (p.def.shape === 'cylinder') ext = Math.abs(r11) * (s.y / 2) + (s.x / 2) * Math.sqrt(Math.max(0, 1 - r11 * r11));
    else ext = Math.abs(r10) * (s.x / 2) + Math.abs(r11) * (s.y / 2) + Math.abs(r12) * (s.z / 2);
    return cy - ext;
  }

  damage(): number {
    return this.productCount > 0 && this.mode === 'full' ? this.movedProducts / this.productCount : 0;
  }

  // ───────── SimContext ─────────

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  award(slot: number, kind: ScoreKind, base: number, pos: Vec3, count = 1, heat?: number): AwardResult | null {
    if (this.phase !== 'playing' || this.mode !== 'full') return null;
    const av = this.avatarBySlot(slot);
    if (!av) return null;
    const r = av.book.award(kind, base, this.time, this.lastSpurt, count, heat);
    this.emit({ t: 'score', slot, kind, points: r.points, multiplier: r.multiplier, pos: { x: pos.x, y: pos.y, z: pos.z } });
    if (r.comboUp) {
      this.emit({ t: 'combo', slot, level: r.level, multiplier: r.multiplier });
      this.emit({ t: 'sfx', name: 'combo-up', pos: { ...av.pos } });
    }
    // 近くの店員と客に知らせる（気づく・吹き出し）
    if (kind !== 'escape') for (const n of this.npcs) n.onMisdeed?.(this, slot, pos);
    return r;
  }

  progress(slot: number, id: MisdeedId, amount: number): number {
    const av = this.avatarBySlot(slot);
    if (!av) return 0;
    if (this.phase !== 'playing' || this.mode !== 'full') return av.progress[id] ?? 0;
    const value = (av.progress[id] ?? 0) + amount;
    av.progress[id] = value;
    const goal = misdeedById(id).goal;
    if (goal.kind !== 'single' && goal.kind !== 'seconds' && value >= goal.target) this.achieve(slot, id);
    return value;
  }

  progressMax(slot: number, id: MisdeedId, value: number): void {
    const av = this.avatarBySlot(slot);
    if (!av || this.phase !== 'playing' || this.mode !== 'full') return;
    av.progress[id] = Math.max(av.progress[id] ?? 0, value);
    if (value >= misdeedById(id).goal.target) this.achieve(slot, id);
  }

  achieve(slot: number, id: MisdeedId): void {
    const av = this.avatarBySlot(slot);
    if (!av || this.phase !== 'playing' || this.mode !== 'full') return;
    const r = av.book.achieve(id);
    if (!r) return;
    this.emit({ t: 'achieve', slot, id, bonus: r.bonus });
    this.emit({ t: 'sfx', name: 'achieve', pos: { ...av.pos } });
    if (r.complete) {
      this.emit({ t: 'complete', slot, bonus: r.completeBonus });
      this.emit({ t: 'sfx', name: 'complete' });
    }
  }

  secret(slot: number, id: SecretId): void {
    const av = this.avatarBySlot(slot);
    if (!av || this.phase !== 'playing' || this.mode !== 'full') return;
    const bonus = av.book.secret(id);
    if (bonus === null) return;
    this.emit({ t: 'achieve', slot, id, bonus });
    this.emit({ t: 'sfx', name: 'achieve', pos: { ...av.pos } });
  }

  raiseHeat(slot: number, amount: number): void {
    const av = this.avatarBySlot(slot);
    if (av && this.phase === 'playing' && this.mode === 'full') {
      av.book.raiseHeat(amount);
      av.book.lastScoreAt = this.time;
    }
  }

  touch(prop: PropState, slot: number | null): void {
    prop.owner = slot;
    prop.touchT = this.time;
  }

  launch(prop: PropState, vel: Vec3, spin: Vec3, slot: number | null): void {
    if (prop.locked || prop.hidden) return;
    prop.body.setLinvel(vel, true);
    prop.body.setAngvel(spin, true);
    this.touch(prop, slot);
    // 速く飛ぶ物だけ CCD（壁や棚をすり抜けないように）
    if (Math.hypot(vel.x, vel.y, vel.z) > 5) {
      prop.body.enableCcd(true);
      prop.ccdUntil = this.time + 1.5;
    }
  }

  propCenter(prop: PropState): Vec3 {
    const t = prop.body.translation();
    const q = prop.body.rotation();
    const hy = prop.def.size.y / 2;
    return { x: t.x + 2 * (q.x * q.y - q.w * q.z) * hy, y: t.y + (1 - 2 * (q.x * q.x + q.z * q.z)) * hy, z: t.z + 2 * (q.y * q.z + q.w * q.x) * hy };
  }

  propOf(colliderHandle: number): PropState | undefined {
    return this.propByHandle.get(colliderHandle);
  }

  isMoved(prop: PropState): boolean {
    return prop.moved;
  }

  resetProp(prop: PropState): void {
    if (prop.heldBy !== null) {
      const av = this.avatarBySlot(prop.heldBy);
      if (av && av.holding === prop.def.id) av.holding = null;
      prop.heldBy = null;
    }
    const zero = { x: 0, y: 0, z: 0 };
    if (!prop.body.isDynamic()) prop.body.setBodyType(this.R.RigidBodyType.Dynamic, false);
    if (prop.hidden) prop.body.setEnabled(true);
    prop.body.setTranslation(prop.def.home.pos, false);
    prop.body.setRotation(yawQuat(prop.def.home.yaw), false);
    prop.body.setLinvel(zero, false);
    prop.body.setAngvel(zero, false);
    prop.body.sleep();
    if (prop.moved && prop.def.kind === 'product') this.movedProducts = Math.max(0, this.movedProducts - 1);
    prop.hidden = false;
    prop.locked = false;
    prop.moved = false;
    prop.scored = false;
    prop.owner = null;
    prop.sweepSlot = null;
  }

  hold(av: AvatarState, prop: PropState): void {
    if (av.holding !== null) this.release(av);
    prop.heldBy = av.slot;
    prop.locked = true;
    prop.owner = av.slot;
    prop.touchT = this.time;
    prop.body.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
    av.holding = prop.def.id;
  }

  release(av: AvatarState): PropState | null {
    if (av.holding === null) return null;
    const p = this.props[av.holding];
    av.holding = null;
    if (!p) return null;
    p.heldBy = null;
    p.locked = false;
    p.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    p.touchT = this.time;
    return p;
  }

  avatarBySlot(slot: number): AvatarState | undefined {
    return this.avatars.find((a) => a.slot === slot);
  }

  playAction(av: AvatarState, anim: AnimName, time: number = AVATAR.actionAnimTime): void {
    av.actionAnim = anim;
    av.actionAnimLeft = time;
  }

  engage(av: AvatarState): void {
    av.engagedUntil = Math.max(av.engagedUntil, this.time + SCORE.engageGrace);
  }

  cooldownReady(av: AvatarState, key: string): boolean {
    return (av.cooldowns[key] ?? -Infinity) <= this.time;
  }

  setCooldown(av: AvatarState, key: string, seconds: number): void {
    av.cooldowns[key] = this.time + seconds;
  }

  stun(av: AvatarState, seconds: number, anim: AnimName): void {
    av.stunned = Math.max(av.stunned, seconds);
    av.stunAnim = anim;
    av.vel = { x: 0, y: Math.min(0, av.vel.y), z: 0 };
    av.dashLeft = 0;
  }

  catchAvatar(slot: number, npc: number): void {
    const av = this.avatarBySlot(slot);
    if (!av) return;
    if (av.ridingCart !== null) dismount(this, av);
    const held = this.release(av);
    if (held) held.body.setLinvel({ x: 0, y: 1.5, z: 0 }, true);
    av.book.onCaught();
    this.grab(av, npc);
    this.emit({ t: 'caught', slot, npc });
    this.emit({ t: 'sfx', name: 'caught', pos: { ...av.pos } });
  }

  /** 捕まった：その場で grabTime 止まって（店員がつかむ）、それからサービスカウンターで caughtStun 休む */
  private grab(av: AvatarState, npc: number | null): void {
    av.script = null;
    this.stun(av, CLERK.grabTime + CLERK.caughtStun, 'caught');
    av.caughtHold = CLERK.grabTime;
    const n = npc === null ? undefined : this.npcs.find((q) => q.id === npc);
    if (n) av.yaw = Math.atan2(n.pos.x - av.pos.x, n.pos.z - av.pos.z);
  }

  private toService(av: AvatarState): void {
    const s = this.layout.places.service;
    this.teleport(av.slot, s.x, s.z);
    av.yaw = s.yaw;
  }

  // ───────── 試験用の窓口 ─────────

  teleport(slot: number, x: number, z: number): void {
    const av = this.avatarBySlot(slot);
    if (!av) return;
    if (av.ridingCart !== null) dismount(this, av);
    av.script = null;
    av.pos = { x, y: 0.02, z };
    av.vel = { x: 0, y: 0, z: 0 };
    av.grounded = true;
    const c = { x, y: CENTER_Y + 0.02, z };
    av.body.setTranslation(c, true);
    av.body.setNextKinematicTranslation(c);
  }

  face(slot: number, yaw: number): void {
    const av = this.avatarBySlot(slot);
    if (av) av.yaw = yaw;
  }

  // ───────── 見え方 ─────────

  private syncTransforms(all = false): void {
    const tr = this.transforms;
    if (this.mode === 'self') return;
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i]!;
      this.hidden[i] = p.hidden ? 1 : 0;
      if (!all && !p.locked && p.body.isSleeping()) continue;
      const t = p.body.translation();
      const q = p.body.rotation();
      const o = i * 7;
      tr[o] = t.x;
      tr[o + 1] = t.y;
      tr[o + 2] = t.z;
      tr[o + 3] = q.x;
      tr[o + 4] = q.y;
      tr[o + 5] = q.z;
      tr[o + 6] = q.w;
    }
  }

  private avatarView(av: AvatarState, localSlot: number): AvatarView {
    const local = av.slot === localSlot;
    return {
      slot: av.slot,
      kind: av.kind,
      name: av.name,
      character: av.character,
      pos: { x: av.pos.x, y: av.pos.y, z: av.pos.z },
      yaw: av.yaw,
      anim: av.anim,
      holding: av.holding,
      ridingCart: av.ridingCart,
      stunned: av.stunned,
      score: av.book.score,
      combo: av.book.comboView(this.time),
      heat: av.book.heat,
      achieved: [...av.book.achieved],
      secrets: [...av.book.secrets],
      isLocal: local,
      prompt: local ? (av.offer?.prompt ?? null) : null,
      connected: av.connected,
      progress: { ...av.progress },
    };
  }

  /** 描画とHUDが読む見え方。出来事は渡したら空にする */
  view(localSlot: number): WorldView {
    this.syncTransforms();
    const stations: StationsView = {
      pyramid: { collapsed: false, rebuildIn: 0 },
      bowling: { pinsDown: 0, resetIn: 0 },
      samples: { left: 8, refillIn: 0 },
      watermelons: { left: 6, refillIn: 0 },
      pa: { activeSlot: null, holdProgress: 0, cooldown: 0 },
      freezerSlots: [],
    };
    const peels: PeelView[] = [];
    for (const sys of this.systems) {
      sys.stations?.(this, stations);
      sys.peels?.(this, peels);
    }
    const events = this.events;
    this.events = [];
    return {
      phase: this.phase,
      timeLeft: this.timeLeft(),
      duration: this.duration,
      lastSpurt: this.lastSpurt,
      avatars: this.avatars.map((a) => this.avatarView(a, localSlot)),
      npcs: this.npcs.filter((n) => !n.hidden).map((n) => n.view()),
      propTransforms: this.transforms,
      propHidden: this.hidden,
      carts: this.carts.map((c) => {
        const t = c.body.translation();
        const v = c.body.linvel();
        const q = c.body.rotation();
        return { id: c.id, pos: { x: t.x, y: t.y, z: t.z }, yaw: c.rider !== null ? c.yaw : 2 * Math.atan2(q.y, q.w), riderSlot: c.rider ?? c.remoteRider, speed: c.rider !== null ? c.speed : Math.hypot(v.x, v.z) };
      }),
      peels,
      stations,
      events,
      damage: this.damage(),
    };
  }

  dispose(): void {
    this.world.free();
  }
}
