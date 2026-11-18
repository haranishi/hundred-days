/**
 * 部屋の主の試合（GameSession の Host 版。docs/05「物理は部屋の主の端末で回す」）。
 *
 * - Simulation をこの端末で回す。時間は端末の描画の間隔ではなく、サーバーの時計（試合開始からのミリ秒）で進める。
 *   Simulation は time=0 から3秒のカウントダウンを数えるので、sim.time が「3＋試合の経過秒」に追いつくように刻む
 * - 参加者から届いた「自分の様子」（種類1）はそのキャラの目標の姿勢に、「意図」（種類4）は押した・離したの入力にする
 * - 毎秒15回、店の様子（種類2）と、その間に起きた出来事（種類3）を参加者へ送る
 * - 時間切れ（や forceEnd）で結果が出たら、最後の様子を送ってから final を送る
 */
import type { GameSession } from '../../client/contracts';
import type { NetLink } from '../../client/net/link';
import type { RoomClientEvent } from '../../client/net/room-client';
import type { InputState } from '../../shared/input';
import { EMPTY_INPUT } from '../../shared/input';
import {
  BIN_INTENT,
  BIN_SELF,
  decodeIntents,
  decodeSelfState,
  encodeEvents,
  SNAPSHOT_HZ,
  STALE_FRAME_MS,
  StoreFrameEncoder,
  type IntentKind,
  type RoomView,
} from '../../shared/protocol';
import { MATCH, PHYSICS } from '../../shared/rules/tuning';
import type { GameEvent, MatchResult, WorldStatic, WorldView } from '../../shared/view';
import { Simulation } from '../sim/Simulation';

/** 店の様子を送る間隔（ミリ秒） */
const SEND_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
/** 1フレームで追いつく刻みの上限（これより遅れた分は次のフレームで追う） */
const MAX_STEPS_PER_FRAME = PHYSICS.maxSubsteps;
/** 参加者1人につき溜めておく押した・離したの上限（連打でも数秒分） */
const MAX_PENDING_EDGES = 64;

/** 参加者1人ぶんの、届いた入力の控え */
interface Remote {
  /**
   * まだシミュレーションに渡していない押した・離した（届いた順）。due は渡してよい時刻（試合開始からのミリ秒・主の時計）。
   * 参加者は1/15秒ごとにまとめて送るので、届いた順に詰めて渡すと連打の間隔が縮み、ベルの「速すぎる連打」に当たる。
   * 本人が押した時刻（t）の間隔をそのまま保って渡す
   */
  edges: { kind: IntentKind; due: number }[];
  /** 最後に並べた押した・離したの、本人の時刻と渡す時刻 */
  prevT: number;
  prevDue: number;
  /** いま押しているか（押した・離したを渡すたびに変わる。溜まりが無いときは「自分の様子」の値に合わせる） */
  held: boolean;
  /** 最後に押した・離したを渡したときの刻みの数（同じ刻みに2つ重ねて、連打を1回に潰さないため） */
  fedAtStep: number;
  /** 最後に受け取った「自分の様子」の連番（古いものが後から来たら捨てる） */
  lastSeq: number;
}

export interface HostSessionOptions {
  link: NetLink;
  /** countdown になったときの部屋の形（round・seed・startAt・duration・顔ぶれ） */
  room: RoomView;
}

export class HostSession implements GameSession {
  readonly mode = 'host' as const;
  readonly mySlot: number;
  readonly world: WorldStatic;
  readonly round: number;
  /** 試験用の窓口（window.__SY__ の teleport・forceEnd）がこれを使う */
  readonly sim: Simulation;

  private readonly link: NetLink;
  private readonly encoder: StoreFrameEncoder;
  private readonly remotes = new Map<number, Remote>();
  private readonly offs: (() => void)[] = [];
  private outbox: GameEvent[] = [];
  private nextSendAt = Number.NEGATIVE_INFINITY;
  private lastT = Number.NEGATIVE_INFINITY;
  private eventSeq = 0;
  private finalSent = false;
  /** 部屋が試合を終えた（host-left・打ち切り）。もう時計を進めない */
  private stopped = false;
  private roomResult: MatchResult | null = null;
  private connected = new Map<number, boolean>();

  private constructor(opts: HostSessionOptions, sim: Simulation) {
    this.link = opts.link;
    this.sim = sim;
    this.world = sim.statics;
    this.round = opts.room.round;
    this.mySlot = opts.link.slot ?? 0;
    this.encoder = new StoreFrameEncoder(this.world);
    for (const m of opts.room.members) {
      this.connected.set(m.slot, m.connected);
      if (m.slot !== this.mySlot) {
        this.remotes.set(m.slot, { edges: [], prevT: Number.NEGATIVE_INFINITY, prevDue: Number.NEGATIVE_INFINITY, held: false, fedAtStep: -1, lastSeq: -1 });
      }
    }
    this.offs.push(this.link.on((e) => this.onRoomEvent(e)));
    this.offs.push(this.link.onBinary((d) => this.onBinary(d)));
  }

  static async create(opts: HostSessionOptions): Promise<HostSession> {
    const { room } = opts;
    if (room.seed === null) throw new Error('HostSession: 試合が始まっていない部屋からは作れない');
    const sim = await Simulation.create({
      seed: room.seed,
      duration: room.duration,
      players: room.members.map((m) => ({ slot: m.slot, kind: 'human' as const, name: m.name, character: m.character })),
    });
    return new HostSession(opts, sim);
  }

  update(dt: number, input: InputState): WorldView {
    // 時間はサーバーの時計で進める（描画の間隔 dt には左右されない。全員の残り時間がそろう）
    void dt;
    this.feedRemotes();
    this.sim.setInput(this.mySlot, input);
    const mt = this.link.matchTime();
    if (mt !== null && !this.stopped) this.advanceTo(MATCH.countdown + mt / 1000);
    const view = this.sim.view(this.mySlot);
    // view は出来事を空にするので、送る分を写しておく（描画と音には view.events をそのまま使う）
    for (const e of view.events) this.outbox.push(e);
    // 結果を送ったあと（部屋が終えたあとも）は送らない。もう一回の直後に、前の試合の終わりの様子が次の試合へ混ざらないように
    if (mt !== null && !this.finalSent && !this.stopped) this.maybeSend(view, mt);
    this.maybeFinish(view);
    return view;
  }

  result(): MatchResult | null {
    return this.roomResult ?? this.sim.result();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.sim.dispose();
  }

  // ───────── 時間を進める ─────────

  private advanceTo(target: number): void {
    const h = 1 / PHYSICS.hz;
    let n = 0;
    while (this.sim.time + h <= target + 1e-9 && n < MAX_STEPS_PER_FRAME) {
      this.sim.step(h);
      n++;
    }
  }

  // ───────── 参加者の入力 ─────────

  private onBinary(data: Uint8Array): void {
    if (data[0] === BIN_SELF) {
      const s = decodeSelfState(data);
      const r = s ? this.remotes.get(s.slot) : undefined;
      if (!s || !r || s.seq <= r.lastSeq || this.isStale(s.t)) return;
      r.lastSeq = s.seq;
      // 届いた姿勢へ、速さの上限で丸めながら KCC で追いつく（壁は抜けない・商品は押しのける。core の口）
      this.sim.setPuppet(s.slot, { pos: s.pos, vel: s.vel, yaw: s.yaw, anim: s.anim, ridingCart: s.ridingCart, holding: s.holding });
      // 押した・離したが溜まっていなければ、押しているかを本人の値にそろえる（つなぎ直しで取りこぼしても戻る）
      if (r.edges.length === 0) r.held = s.actionHeld;
      return;
    }
    if (data[0] === BIN_INTENT) {
      const f = decodeIntents(data);
      const r = f ? this.remotes.get(f.slot) : undefined;
      if (!f || !r || f.intents.some((it) => this.isStale(it.t))) return;
      const now = this.simMs();
      for (const it of f.intents) {
        if (r.edges.length >= MAX_PENDING_EDGES) break;
        // 前の押した・離したからの間隔を保つ（ただし今より前にはしない。間隔は1秒より長ければ数えない）
        const gap = it.t - r.prevT;
        const due = gap >= 0 && gap < 1000 ? Math.max(now, r.prevDue + gap) : now;
        r.edges.push({ kind: it.kind, due });
        r.prevT = it.t;
        r.prevDue = due;
      }
    }
  }

  /** いまの試合の時計から大きくずれた時刻（前の試合のデータ） */
  private isStale(t: number): boolean {
    const mt = this.link.matchTime();
    return mt !== null && Math.abs(t - mt) > STALE_FRAME_MS;
  }

  /** 主のシミュレーションの時計で、試合開始からのミリ秒 */
  private simMs(): number {
    return (this.sim.time - MATCH.countdown) * 1000;
  }

  /** 参加者ごとに、押した・離したを1刻みに1つずつシミュレーションへ渡す */
  private feedRemotes(): void {
    const now = this.simMs();
    for (const [slot, r] of this.remotes) {
      const input: InputState = { ...EMPTY_INPUT, action: r.held };
      const next = r.edges[0];
      if (next && next.due <= now + 1e-6 && this.sim.steps !== r.fedAtStep) {
        r.edges.shift();
        const edge = next.kind;
        r.fedAtStep = this.sim.steps;
        if (edge === 'press') {
          r.held = true;
          input.action = true;
          input.actionPressed = true;
        } else if (edge === 'release') {
          r.held = false;
          input.action = false;
          input.actionReleased = true;
        } else if (edge === 'jump') {
          input.jump = true;
        } else {
          input.dash = true;
        }
      }
      this.sim.setInput(slot, input);
    }
  }

  // ───────── 送る ─────────

  private maybeSend(view: WorldView, mt: number): void {
    if (mt < this.nextSendAt) return;
    // 間隔を保つ。長く止まったあとは、まとめて送らずに今から数え直す
    this.nextSendAt = mt - this.nextSendAt > SEND_INTERVAL_MS ? mt + SEND_INTERVAL_MS : this.nextSendAt + SEND_INTERVAL_MS;
    this.send(view, mt);
  }

  private send(view: WorldView, mt: number): void {
    // 参加者の補間のため、時刻は必ず増えるようにする（時計合わせで少し戻ることがある）
    const t = Math.max(this.lastT + 1, Math.round(mt));
    this.lastT = t;
    // 参加者の案内（アクションボタンの文字）は主が作る。view では自分の分しか入っていないので足す
    const netView: WorldView = {
      ...view,
      avatars: view.avatars.map((a) => (a.slot === this.mySlot ? a : { ...a, prompt: this.sim.avatarBySlot(a.slot)?.offer?.prompt ?? null })),
    };
    this.link.sendBinary(this.encoder.encode(netView, t));
    if (this.outbox.length > 0) {
      const frames = encodeEvents(this.eventSeq, t, this.outbox);
      this.outbox = [];
      for (const f of frames) this.link.sendBinary(f);
      this.eventSeq += frames.length;
    }
  }

  private maybeFinish(view: WorldView): void {
    if (this.finalSent || this.stopped) return;
    const res = this.sim.result();
    if (!res) return;
    // 終わった様子を先に送ってから結果を送る（同じ接続なので、部屋はこの順で読む）
    const mt = this.link.matchTime();
    if (mt !== null) this.send(view, mt);
    this.finalSent = this.link.final(this.round, res);
  }

  // ───────── 部屋の知らせ ─────────

  private onRoomEvent(e: RoomClientEvent): void {
    if (e.type === 'room') {
      if (e.room.round !== this.round) return;
      for (const m of e.room.members) {
        const was = this.connected.get(m.slot);
        this.connected.set(m.slot, m.connected);
        if (m.slot !== this.mySlot) this.sim.setConnected(m.slot, m.connected);
        // 戻ってきた人は差分の途中を知らないので、次の1通を鍵にする
        if (m.connected && was === false) this.encoder.forceKeyframe();
      }
      // 席が外れた人は止めておく
      for (const [slot] of this.remotes) {
        if (!e.room.members.some((m) => m.slot === slot)) this.sim.setConnected(slot, false);
      }
      return;
    }
    if (e.type === 'result' && e.round === this.round) {
      this.roomResult = e.result;
      return;
    }
    if (e.type === 'host-left' && e.round === this.round) {
      // 部屋が試合を終えた（主が黙っていた・結果が届かなかった）。その時点の点数で結果にする
      this.stopped = true;
      if (!this.sim.result()) this.sim.end(true);
    }
  }
}
