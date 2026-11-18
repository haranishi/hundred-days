/**
 * 参加者の試合（GameSession の Guest 版。docs/05_ネット対戦.md）。
 *
 * - 自分のキャラだけは手元の Simulation（mode:'self'。動かない物とカートだけを持つ）で即座に動かす。
 *   主と同じく、sim.time が「3＋試合の経過秒」に追いつくように刻む（カウントダウンと開店がそろう）
 * - 毎秒15回「自分の様子」（種類1）を主へ送り、押した・離した・ジャンプ・ダッシュは「意図」（種類4）にまとめる（1/15秒に1通まで）
 * - 主から届いた店の様子（種類2）を WorldMirror で組み立て直し、SnapshotBuffer で約100ms前を補間して描く。
 *   自分（と自分が乗っているカート）は手元の値で上書きし、点数・コンボ・案内などは「いちばん新しい1枚」を使う（HUD を遅らせない）
 * - 捕まった・滑ったは主が決める。届いた出来事を手元の Simulation への言いつけ（applyOrder）にする
 * - 主の final で結果。host-left（または主の様子が22秒届かない）なら、最後の1枚から結果を作る
 */
import type { GameSession } from '../../client/contracts';
import type { NetLink } from '../../client/net/link';
import type { RoomClientEvent } from '../../client/net/room-client';
import { SnapshotBuffer } from '../../client/net/snapshot-buffer';
import type { InputState } from '../../shared/input';
import { storeLayout } from '../../shared/layout/store';
import {
  BIN_EVENTS,
  BIN_STORE,
  decodeEvents,
  decodeStoreFrame,
  encodeIntents,
  encodeSelfState,
  homeTransforms,
  HOST_SILENT_MS,
  SNAPSHOT_HZ,
  STALE_FRAME_MS,
  WorldMirror,
  type Intent,
  type MirrorSnapshot,
  type RoomView,
} from '../../shared/protocol';
import { resultFromView } from '../../shared/rules/scoring';
import { MATCH, PHYSICS } from '../../shared/rules/tuning';
import type { AvatarView, CartView, GameEvent, MatchResult, Phase, WorldStatic, WorldView } from '../../shared/view';
import { Simulation, type AvatarPose } from '../sim/Simulation';

/** 自分の様子・意図を送る間隔（ミリ秒） */
const SEND_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
/** 主の様子がこれだけ届かなければ、自分で結果を出す（部屋の判定＝20秒より少し後。ふつうは部屋が先に知らせる） */
const HOST_SILENT_FALLBACK_MS = HOST_SILENT_MS + 2000;
/** 乗ったつもりのカートを、主の店で別の人が使っている（取り合いに負けた）状態がこれだけ続いたら降りる（hooks-ready.md） */
const CART_MISMATCH_MS = 500;
/** 滑ったときに動けない秒数（主の決め方と同じ。hooks-ready.md） */
const SLIP_SECONDS = 1.5;
/** 主の店で動けないのに、手元の位置がこれより離れていたら、主の位置へ置き直す（捕まった知らせを取りこぼしたとき） */
const STUN_DIVERGE_M = 2;

export interface GuestSessionOptions {
  link: NetLink;
  /** countdown になったときの部屋の形（round・seed・startAt・duration・顔ぶれ） */
  room: RoomView;
}

/** 試験用の窓口（window.__SY__）が sim として使う。参加者の端末では自分のキャラだけを動かせる */
export interface GuestDebugHandle {
  teleport(slot: number, x: number, z: number): void;
  face(slot: number, yaw: number): void;
  /** 試合を終えるのは主だけ。参加者では何もしない */
  end(): void;
  setController(): void;
}

export class GuestSession implements GameSession {
  readonly mode = 'guest' as const;
  readonly mySlot: number;
  readonly world: WorldStatic;
  readonly round: number;
  readonly duration: number;
  /** 試験用の窓口が使う（teleport・face は手元のキャラを動かす） */
  readonly sim: GuestDebugHandle;
  /** 手元で自分だけを動かす Simulation（mode:'self'） */
  readonly self: Simulation;

  private readonly link: NetLink;
  private readonly mirror: WorldMirror;
  private readonly buffer = new SnapshotBuffer();
  private readonly offs: (() => void)[] = [];
  private readonly members: RoomView['members'];
  private latest: MirrorSnapshot | null = null;
  private pending: { t: number; e: GameEvent }[] = [];
  private immediate: GameEvent[] = [];
  private res: MatchResult | null = null;
  private lastFrameAt: number;
  private selfSeq = 0;
  private intentSeq = 0;
  private nextSelfAt = Number.NEGATIVE_INFINITY;
  private lastIntentAt = Number.NEGATIVE_INFINITY;
  private intents: Intent[] = [];
  private cartMismatchSince: number | null = null;
  private bootstrap: WorldView | null = null;

  private constructor(opts: GuestSessionOptions, self: Simulation) {
    const { room } = opts;
    this.link = opts.link;
    this.self = self;
    this.round = room.round;
    this.duration = room.duration;
    this.members = room.members;
    this.mySlot = opts.link.slot ?? 0;
    this.world = self.statics;
    this.mirror = new WorldMirror(this.world, this.mySlot);
    this.mirror.setMembers(room.members);
    this.lastFrameAt = opts.link.localNow();
    this.sim = {
      teleport: (slot, x, z) => {
        if (slot === this.mySlot) this.self.teleport(slot, x, z);
      },
      face: (slot, yaw) => {
        if (slot === this.mySlot) this.self.face(slot, yaw);
      },
      end: () => {},
      setController: () => {},
    };
    this.offs.push(this.link.on((e) => this.onRoomEvent(e)));
    this.offs.push(this.link.onBinary((d) => this.onBinary(d)));
  }

  static async create(opts: GuestSessionOptions): Promise<GuestSession> {
    const { room, link } = opts;
    if (room.seed === null) throw new Error('GuestSession: 試合が始まっていない部屋からは作れない');
    const mySlot = link.slot ?? 0;
    const me = room.members.find((m) => m.slot === mySlot);
    const self = await Simulation.create({
      seed: room.seed,
      duration: room.duration,
      mode: 'self',
      players: [{ slot: mySlot, kind: 'human', name: me?.name ?? `${mySlot + 1}P`, character: me?.character ?? 'ch/character-female-b' }],
    });
    return new GuestSession(opts, self);
  }

  update(dt: number, input: InputState): WorldView {
    // 時間はサーバーの時計で進める（描画の間隔 dt には左右されない）
    void dt;
    const now = this.link.localNow();
    const mt = this.link.matchTime();
    const newest = this.latest?.view ?? null;
    const hostMe = newest?.avatars.find((a) => a.slot === this.mySlot);
    const phase = this.phase(mt ?? -1);

    if (newest) {
      this.self.syncCarts(newest.carts, this.mySlot);
      this.self.syncFromHost(this.mySlot, hostMe);
      this.obeyHost(hostMe, newest.carts, now);
    }
    this.self.setInput(this.mySlot, input);
    if (mt !== null && phase !== 'ended') this.advanceTo(MATCH.countdown + mt / 1000);
    const pose = this.self.pose(this.mySlot);

    if (mt !== null && pose && phase !== 'ended') this.sendInputs(input, pose, mt, now);
    if (phase === 'playing' && !this.res && now - this.lastFrameAt > HOST_SILENT_FALLBACK_MS) this.endFromLastView();

    return this.compose(phase, mt ?? -1, now, hostMe, pose);
  }

  result(): MatchResult | null {
    return this.res;
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.self.dispose();
  }

  // ───────── 段階と時間 ─────────

  private phase(mt: number): Phase {
    if (this.res || this.latest?.view.phase === 'ended') return 'ended';
    return mt < 0 ? 'countdown' : 'playing';
  }

  private advanceTo(target: number): void {
    const h = 1 / PHYSICS.hz;
    let n = 0;
    while (this.self.time + h <= target + 1e-9 && n < PHYSICS.maxSubsteps) {
      this.self.step(h);
      n++;
    }
  }

  // ───────── 主の決定に従う ─────────

  /** カートの取り合いに負けた・捕まった知らせを取りこぼした、を主の見え方で直す */
  private obeyHost(hostMe: AvatarView | undefined, carts: readonly CartView[], now: number): void {
    const local = this.self.avatarBySlot(this.mySlot);
    if (!local) return;
    // 乗ったつもりのカートに、主の店では自分が乗っていない状態が続いたら降りる
    const riding = local.ridingCart;
    const hostRider = riding === null ? null : (carts.find((c) => c.id === riding)?.riderSlot ?? null);
    if (riding !== null && hostRider !== this.mySlot) {
      this.cartMismatchSince ??= now;
      if (now - this.cartMismatchSince >= CART_MISMATCH_MS) {
        this.self.applyOrder(this.mySlot, { kind: 'dismount' });
        this.cartMismatchSince = null;
      }
    } else {
      this.cartMismatchSince = null;
    }
    // 主の店で動けないのに手元が自由・離れている：捕まった知らせを取りこぼした。主の位置へ置き直して止まる
    if (hostMe && hostMe.stunned > 0.2 && local.stunned <= 0) {
      if (Math.hypot(hostMe.pos.x - local.pos.x, hostMe.pos.z - local.pos.z) > STUN_DIVERGE_M) {
        this.self.applyOrder(this.mySlot, { kind: 'teleport', x: hostMe.pos.x, z: hostMe.pos.z });
      }
      this.self.applyOrder(this.mySlot, { kind: 'stop', seconds: hostMe.stunned });
    }
  }

  // ───────── 送る ─────────

  private sendInputs(input: InputState, pose: AvatarPose, mt: number, now: number): void {
    const t = Math.round(mt);
    if (input.actionPressed) this.intents.push({ kind: 'press', target: null, t });
    if (input.actionReleased) this.intents.push({ kind: 'release', target: null, t });
    if (input.jump) this.intents.push({ kind: 'jump', target: null, t });
    if (input.dash) this.intents.push({ kind: 'dash', target: null, t });
    // 意図は1/15秒に1通まで（連打はまとめ、主が押した時刻の間隔で渡し直す）。自分の様子と合わせても毎秒30通ほど
    if (this.intents.length > 0 && now - this.lastIntentAt >= SEND_INTERVAL_MS) {
      this.link.sendBinary(encodeIntents(this.intentSeq++, this.intents));
      this.intents = [];
      this.lastIntentAt = now;
    }
    if (mt < this.nextSelfAt) return;
    this.nextSelfAt = mt - this.nextSelfAt > SEND_INTERVAL_MS ? mt + SEND_INTERVAL_MS : this.nextSelfAt + SEND_INTERVAL_MS;
    this.link.sendBinary(
      encodeSelfState({
        seq: this.selfSeq++,
        t,
        pos: pose.pos,
        vel: pose.vel,
        yaw: pose.yaw,
        anim: pose.anim,
        ridingCart: pose.ridingCart,
        holding: pose.holding,
        actionHeld: input.action,
      }),
    );
  }

  // ───────── 受け取る ─────────

  private onBinary(data: Uint8Array): void {
    if (data[0] === BIN_STORE) {
      const f = decodeStoreFrame(data);
      if (!f || this.isStale(f.t)) return;
      const snap = this.mirror.apply(f);
      this.latest = snap;
      const now = this.link.localNow();
      this.buffer.push(snap, now);
      this.lastFrameAt = now;
      return;
    }
    if (data[0] === BIN_EVENTS) {
      const f = decodeEvents(data);
      if (!f || this.isStale(f.t)) return;
      for (const e of f.events) {
        // 自分が捕まった・滑ったは、絵より先に効かせる（主の決定に従う。動けなくなる理由もすぐ出す）
        if (e.t === 'caught' && e.slot === this.mySlot) {
          this.self.applyOrder(this.mySlot, { kind: 'caught' });
          this.immediate.push(e);
        } else if (e.t === 'slip' && e.slot === this.mySlot) {
          this.self.applyOrder(this.mySlot, { kind: 'slip', seconds: SLIP_SECONDS });
          this.immediate.push(e);
        } else {
          this.pending.push({ t: f.t, e });
        }
      }
    }
  }

  /** いまの試合の時計から大きくずれた時刻（もう一回の直後に届いた、前の試合のデータ） */
  private isStale(t: number): boolean {
    const mt = this.link.matchTime();
    return mt !== null && Math.abs(t - mt) > STALE_FRAME_MS;
  }

  private onRoomEvent(e: RoomClientEvent): void {
    if (e.type === 'room' && e.room.round === this.round) {
      this.mirror.setMembers(e.room.members);
      return;
    }
    if (e.type === 'welcome' && e.rejoined) {
      // つなぎ直した：差分の途中を知らないので、次の鍵までは古い値のまま描く（主が鍵を送り直す）
      this.mirror.markStale();
      return;
    }
    if (e.type === 'result' && e.round === this.round) {
      this.res = e.result;
      return;
    }
    if (e.type === 'host-left' && e.round === this.round) this.endFromLastView();
  }

  private endFromLastView(): void {
    if (this.res) return;
    this.res = resultFromView(this.latest?.view ?? this.bootstrapView(), this.world, { aborted: true });
  }

  // ───────── 見え方を組み立てる ─────────

  private compose(phase: Phase, mt: number, now: number, hostMe: AvatarView | undefined, pose: AvatarPose | null): WorldView {
    const renderT = this.buffer.renderTime(now);
    const base = (renderT === null ? null : this.buffer.sample(renderT)) ?? this.bootstrapView();
    const newest = this.latest?.view ?? null;
    const avatars = base.avatars.map((a) => {
      if (a.slot !== this.mySlot) return a;
      const hud = hostMe ?? a;
      return pose ? { ...hud, pos: pose.pos, yaw: pose.yaw, anim: pose.anim, ridingCart: pose.ridingCart, isLocal: true } : { ...hud, isLocal: true };
    });
    // 自分が乗っているカートは、手元の位置で描く（主の店の様子は少し遅れて届くため）
    let carts = base.carts;
    if (pose?.ridingCart != null) {
      const local = this.self.carts[pose.ridingCart];
      if (local) {
        const t = local.body.translation();
        carts = base.carts.map((c) => (c.id === pose.ridingCart ? { ...c, pos: { x: t.x, y: t.y, z: t.z }, yaw: local.yaw, riderSlot: this.mySlot, speed: local.speed } : c));
      }
    }
    // 出来事は、描いている時刻を過ぎたものから出す（音と絵をそろえる）
    const events: GameEvent[] = this.immediate;
    this.immediate = [];
    const due = renderT === null || phase === 'ended' ? Number.POSITIVE_INFINITY : renderT;
    const keep: { t: number; e: GameEvent }[] = [];
    for (const p of this.pending) {
      if (p.t <= due) events.push(p.e);
      else keep.push(p);
    }
    this.pending = keep;
    const timeLeft = phase === 'countdown' ? Math.min(MATCH.countdown, -mt / 1000) : phase === 'playing' ? Math.max(0, this.duration - mt / 1000) : 0;
    return {
      ...base,
      phase,
      timeLeft,
      duration: this.duration,
      lastSpurt: newest?.lastSpurt ?? base.lastSpurt,
      avatars,
      carts,
      events,
      damage: newest?.damage ?? base.damage,
    };
  }

  /** 最初の店の様子が届くまでの見え方（商品は定位置、全員は出発点） */
  private bootstrapView(): WorldView {
    if (this.bootstrap) return this.bootstrap;
    const spawns = storeLayout().spawns;
    const avatars: AvatarView[] = this.members.map((m) => {
      const s = spawns[m.slot % spawns.length] ?? { x: 0, z: 11.8, yaw: Math.PI };
      return {
        slot: m.slot,
        kind: 'human',
        name: m.name,
        character: m.character,
        pos: { x: s.x, y: 0, z: s.z },
        yaw: s.yaw,
        anim: 'idle',
        holding: null,
        ridingCart: null,
        stunned: 0,
        score: 0,
        combo: { level: 0, multiplier: 1, remaining: 0 },
        heat: 0,
        achieved: [],
        secrets: [],
        isLocal: m.slot === this.mySlot,
        prompt: null,
        connected: m.connected,
      };
    });
    this.bootstrap = {
      phase: 'countdown',
      timeLeft: MATCH.countdown,
      duration: this.duration,
      lastSpurt: false,
      avatars,
      npcs: [],
      propTransforms: homeTransforms(this.world),
      propHidden: new Uint8Array(this.world.props.length),
      carts: this.world.carts.map((c) => ({ id: c.id, pos: c.home.pos, yaw: c.home.yaw, riderSlot: null, speed: 0 })),
      peels: [],
      stations: {
        pyramid: { collapsed: false, rebuildIn: 0 },
        bowling: { pinsDown: 0, resetIn: 0 },
        samples: { left: 8, refillIn: 0 },
        watermelons: { left: 6, refillIn: 0 },
        pa: { activeSlot: null, holdProgress: 0, cooldown: 0 },
        freezerSlots: [],
      },
      events: [],
      damage: 0,
    };
    return this.bootstrap;
  }
}
