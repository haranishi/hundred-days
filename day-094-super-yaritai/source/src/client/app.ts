/**
 * アプリの流れ：タイトル → ひとりで → 強さ → 試合 → 結果 → もう一回／タイトル（docs/02 ③）。
 * 画面は createScreens（画面と音の担当）、音は createAudio、試合は GameSession（ひとり＝LocalSession）を通す。
 * ネット対戦（第2波・ネットの担当）：友だちと（部屋を作る／あいことば・?room= のリンクで入る）→ 待合室 → 試合、
 * だれかと（20秒さがす）→ 試合。部屋の主は HostSession、参加者は GuestSession。結果のあとは主だけが「もう一回」を押せる。
 */
import { storeLayout } from '../shared/layout/store';
import { ITEMS } from '../shared/layout/catalog';
import { EMPTY_INPUT, type InputState } from '../shared/input';
import { MATCH } from '../shared/rules/tuning';
import type { CpuLevel, ModelKey, WorldView } from '../shared/view';
import type { RoomView } from '../shared/protocol/messages';
import { isValidRoomCode, normalizeRoomCode } from '../shared/roomcode';
import { LocalSession } from '../game/session/LocalSession';
import { HostSession } from '../game/session/HostSession';
import { GuestSession } from '../game/session/GuestSession';
import { loadRapier } from '../game/sim/physics';
import { PLAYER_CHARACTERS, type AudioAPI, type GameSession, type LobbyModel, type ScreensAPI } from './contracts';
import {
  createAndJoin,
  inviteUrl,
  joinFailureText,
  joinRoom,
  lobbyModelOf,
  lostText,
  matchFailureText,
  matchmake,
  noticeText,
  RoomJoinError,
  type MatchmakeHandle,
  type RoomClient,
  type RoomClientEvent,
} from './net/index';
import { createAudio } from './audio/index';
import { createScreens } from './ui/screens/index';
import { createHud, type Hud } from './ui/hud/index';
import { injectHudStyle } from './ui/hud/style';
import { createInput, type InputController } from './input/index';
import { Assets } from './render/assets';
import { GameRenderer } from './render/Renderer';
import { applyXray } from './render/xray';
import type { CameraPose, ShotName } from './render/camera';

export type AppScreen =
  | 'boot'
  | 'title'
  | 'howto'
  | 'setup'
  | 'friends'
  | 'connecting'
  | 'lobby'
  | 'matchmaking'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'ending'
  | 'results';

/** 3Dの店を「待機」で描く画面（試合のセッションを進めない） */
const IDLE_SCREENS: readonly AppScreen[] = ['boot', 'title', 'howto', 'setup', 'friends', 'connecting', 'lobby', 'matchmaking', 'loading'];

/** 店員・店長・客のキャラ（docs/04「人物の役」）。ネット対戦の試合の前に読んでおく */
const NPC_CHARACTERS = ['mm/character-employee', 'ch/character-male-d', 'ch/character-female-c', 'ch/character-male-b', 'ch/character-female-d'];

/** ネット対戦で入っている部屋 */
interface NetState {
  client: RoomClient;
  offs: (() => void)[];
  /** 待合室の画面（出している間だけ） */
  lobby: { update(model: LobbyModel): void } | null;
  /** 始めた（準備している）試合の番号。0 はまだ */
  round: number;
  reconnecting: boolean;
  /** 結果の画面の「もう一回」の出し方（変わったときだけ出し直す） */
  resultsKey: string;
}

export class App {
  readonly screens: ScreensAPI;
  readonly audio: AudioAPI;
  readonly assets = new Assets();
  renderer: GameRenderer | null = null;
  readonly input: InputController;
  readonly hud: Hud;
  session: GameSession | null = null;
  screen: AppScreen = 'boot';
  timeScale = 1;
  /** 試験用：次の試合の seed（null なら毎回ちがう） */
  nextSeed: number | null = null;
  /** 試験用：CPU を止める */
  cpuEnabled = true;
  lastView: WorldView | null = null;
  private settings: { level: CpuLevel; character: ModelKey } = { level: 'normal', character: 'ch/character-female-b' };
  private lastT = 0;
  private endAt = 0;
  private override: { input: Partial<InputState>; frames: number } | null = null;
  private unlocked = false;
  private ready: Promise<void> | null = null;
  /** ネット対戦の部屋（入っていなければ null） */
  private net: NetState | null = null;
  /** 部屋づくり・入室の世代（「やめる」を押したら上げて、古い結果を捨てる） */
  private joinTicket = 0;
  private matching: { handle: MatchmakeHandle; timer: ReturnType<typeof setInterval> } | null = null;

  constructor(
    private readonly stage: HTMLElement,
    private readonly hudRoot: HTMLElement,
    screensRoot: HTMLElement,
  ) {
    injectHudStyle();
    this.screens = createScreens(screensRoot);
    this.audio = createAudio();
    this.input = createInput(hudRoot);
    this.hud = createHud(hudRoot, { project: (p) => this.renderer?.project(p) ?? { x: -999, y: -999, visible: false }, mySlot: () => this.session?.mySlot ?? 0 });
    this.input.onPause = () => this.pause();
    this.hud.onPause = () => this.pause();
    // 透かしは店と商品の材質だけ（キャラには付けない）
    this.assets.onMaterial = (m, folder) => {
      if (folder !== 'ch') applyXray(m);
    };
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.audio.unlock();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.renderer?.resize());
    document.addEventListener('visibilitychange', () => {
      // ネット対戦は試合を止められない（みんなの試合が続く）ので、一時停止の画面を出さない
      if (document.hidden && this.screen === 'playing' && !this.net) this.pause();
    });
  }

  /** 3Dと物理と素材の準備（タイトルの裏で進める） */
  boot(): Promise<void> {
    if (!this.ready) this.ready = this.prepare();
    const invited = invitedRoomCode();
    if (invited) this.showFriends(invited);
    else this.showTitle();
    requestAnimationFrame((t) => this.loop(t));
    return this.ready;
  }

  private async prepare(): Promise<void> {
    this.renderer = new GameRenderer(this.stage);
    const layout = storeLayout();
    const keys = new Set<string>(['mm/shopping-cart']);
    for (const f of layout.fixtures) if (!f.model.startsWith('pc/')) keys.add(f.model);
    for (const it of Object.values(ITEMS)) if (!it.model.startsWith('pc/')) keys.add(it.model);
    await Promise.all([this.assets.load([...keys]), loadRapier()]);
    this.renderer.buildStore(this.assets, layout);
  }

  // ───────── 画面の流れ ─────────

  showTitle(): void {
    this.closeNet();
    this.stopMatchmaking();
    this.screen = 'title';
    this.endSession();
    this.hud.hide();
    this.input.setActive(false);
    this.screens.showTitle({
      muted: this.audio.muted,
      onSolo: () => this.showSetup(),
      onFriends: () => this.showFriends(),
      onRandom: () => this.startMatchmaking(),
      onHowTo: () => {
        this.screen = 'howto';
        this.screens.showHowTo({ onBack: () => this.showTitle() });
      },
      onToggleMute: () => {
        this.audio.setMuted(!this.audio.muted);
        this.showTitle();
      },
    });
    this.audio.startBgm('title');
  }

  private showSetup(): void {
    this.screen = 'setup';
    this.screens.showSoloSetup({
      onStart: (level, character) => void this.startSolo(level, character),
      onBack: () => this.showTitle(),
    });
  }

  async startSolo(level: CpuLevel, character: ModelKey): Promise<void> {
    this.closeNet();
    this.stopMatchmaking();
    this.settings = { level, character };
    this.screen = 'loading';
    this.screens.showConnecting('お店を開けています…');
    try {
      await this.ready;
      const seed = this.nextSeed ?? (Math.floor(Math.random() * 2 ** 31) >>> 0);
      const session = await LocalSession.create({ level, character, seed });
      // 店員と客も先に読む（読まないと、試合の開始後に少し遅れて現れる。ネット対戦の流れと同じ）
      await this.assets.load(session.world.props.map((p) => p.model).concat(session.sim.avatars.map((a) => a.character), NPC_CHARACTERS));
      if (!this.cpuEnabled) session.sim.setController(1, null);
      this.endSession();
      this.session = session;
      this.renderer!.startMatch(this.assets, session.world);
      this.hud.reset();
      this.hud.setTouchMode(this.input.touchMode);
      this.hud.show();
      this.input.setActive(true);
      this.screens.hide();
      this.audio.startBgm('game');
      this.audio.setBgmIntensity(0);
      this.screen = 'playing';
      this.endAt = 0;
    } catch (err) {
      console.error(err);
      this.screens.showError('お店の準備に失敗しました。もう一度お試しください', () => this.showTitle());
    }
  }

  pause(): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.input.setActive(false);
    // ネット対戦では一時停止の間も試合は続く（loop が入力なしで進める）。画面は「試合は止まりません」の形（live）、「ぬける」は部屋を出る
    this.screens.showPause({
      live: this.net !== null,
      onResume: () => {
        if (this.screen !== 'paused') return;
        this.screens.hide();
        this.input.setActive(true);
        this.screen = 'playing';
        if (!this.net) this.lastT = performance.now();
      },
      onQuit: () => this.showTitle(),
    });
  }

  private showResults(): void {
    const result = this.session?.result();
    if (!result) return;
    this.screen = 'results';
    this.input.setActive(false);
    this.hud.hide();
    this.audio.stopBgm();
    this.audio.setLoop('cart', 0);
    this.screens.showResults(result, {
      mySlot: this.session!.mySlot,
      canRematch: true,
      waitingForHost: false,
      onRematch: () => void this.startSolo(this.settings.level, this.settings.character),
      onTitle: () => this.showTitle(),
    });
  }

  // ───────── ネット対戦（第2波・ネットの担当） ─────────

  /** 友だちと：名前とキャラを決めて、部屋を作るか、あいことばで入る */
  private showFriends(presetCode?: string): void {
    this.closeNet();
    this.stopMatchmaking();
    this.endSession();
    this.hud.hide();
    this.input.setActive(false);
    this.screen = 'friends';
    this.screens.showFriendMenu({
      presetCode,
      onCreate: (name, character) => void this.openRoom(name, character),
      onJoin: (code, name, character) => void this.openRoom(name, character, code),
      onBack: () => this.showTitle(),
    });
    this.audio.startBgm('title');
  }

  /** 部屋を作って入る（code なし）か、あいことばで入る */
  private async openRoom(name: string, character: ModelKey, code?: string): Promise<void> {
    const ticket = ++this.joinTicket;
    this.screen = 'connecting';
    this.screens.showConnecting(code ? `あいことば ${code} の部屋に入っています…` : '部屋を作っています…', () => {
      this.joinTicket++;
      this.showFriends(code);
    });
    try {
      const client = code ? await joinRoom(code, name, { character }) : await createAndJoin(name, { character });
      if (ticket !== this.joinTicket) {
        client.leave();
        return;
      }
      this.enterRoom(client);
    } catch (err) {
      if (ticket !== this.joinTicket) return;
      const reason = err instanceof RoomJoinError ? err.code : 'network';
      if (!(err instanceof RoomJoinError)) console.error(err);
      this.screen = 'friends';
      this.screens.showError(joinFailureText(reason), () => this.showFriends(code));
    }
  }

  /** 名乗りが通った部屋に入る。試合が始まっていれば（相手探し）すぐ試合へ、まだなら待合室へ */
  private enterRoom(client: RoomClient): void {
    this.closeNet();
    const net: NetState = { client, offs: [], lobby: null, round: 0, reconnecting: false, resultsKey: '' };
    this.net = net;
    net.offs.push(client.on((e) => this.onNet(net, e)));
    const room = client.room;
    if (room && (room.phase === 'countdown' || room.phase === 'playing')) void this.startNetMatch(net, room);
    else this.showLobby(net);
  }

  private lobbyModel(net: NetState): LobbyModel {
    return lobbyModelOf(net.client.room, net.client.slot, net.client.code, inviteUrl(net.client.code));
  }

  private showLobby(net: NetState): void {
    this.endSession();
    this.hud.hide();
    this.input.setActive(false);
    this.screen = 'lobby';
    net.lobby = this.screens.showLobby(this.lobbyModel(net), {
      onStart: () => {
        if (!net.client.start()) this.screens.toast(noticeText('bad-message'));
      },
      onLeave: () => this.showTitle(),
      onDuration: (sec) => {
        if (sec === 90 || sec === 120 || sec === 180) net.client.configure(sec);
      },
    });
  }

  private onNet(net: NetState, e: RoomClientEvent): void {
    if (this.net !== net) return;
    switch (e.type) {
      case 'room': {
        const room = e.room;
        if ((room.phase === 'countdown' || room.phase === 'playing') && room.round !== net.round) {
          void this.startNetMatch(net, room);
        } else if (this.screen === 'lobby') {
          net.lobby?.update(this.lobbyModel(net));
        } else if (this.screen === 'results') {
          // 主が替わった・人が抜けたで「もう一回」の出し方が変わる
          this.showNetResults(net);
        }
        return;
      }
      case 'status':
        if (e.status === 'reconnecting') {
          net.reconnecting = true;
          this.screens.toast('通信が切れました。つなぎ直しています…');
        } else if (e.status === 'ok' && net.reconnecting) {
          net.reconnecting = false;
          this.screens.toast('つなぎ直しました');
        } else if (e.status === 'lost') {
          const reason = net.client.rejectionReason;
          this.closeNet();
          this.endSession();
          this.hud.hide();
          this.input.setActive(false);
          this.screen = 'title';
          this.screens.showError(lostText(reason), () => this.showTitle());
        }
        return;
      case 'notice':
        this.screens.toast(noticeText(e.code));
        return;
      default:
        return;
    }
  }

  /** 部屋が countdown になった：同じ種で店を作り、主なら HostSession、参加者なら GuestSession で試合を始める */
  private async startNetMatch(net: NetState, room: RoomView): Promise<void> {
    net.round = room.round;
    net.lobby = null;
    net.resultsKey = '';
    this.screen = 'loading';
    this.screens.showConnecting('お店を開けています…');
    try {
      await this.ready;
      const isHost = room.hostSlot !== null && room.hostSlot === net.client.slot;
      const session: GameSession = isHost ? await HostSession.create({ link: net.client, room }) : await GuestSession.create({ link: net.client, room });
      const stale = (): boolean => this.net !== net || net.round !== room.round;
      if (stale()) {
        session.dispose();
        return;
      }
      await this.assets.load(session.world.props.map((p) => p.model).concat(room.members.map((m) => m.character), NPC_CHARACTERS));
      if (stale()) {
        session.dispose();
        return;
      }
      this.endSession();
      this.session = session;
      this.renderer!.startMatch(this.assets, session.world);
      this.hud.reset();
      this.hud.setTouchMode(this.input.touchMode);
      this.hud.show();
      this.input.setActive(true);
      this.screens.hide();
      this.audio.startBgm('game');
      this.audio.setBgmIntensity(0);
      this.screen = 'playing';
      this.endAt = 0;
    } catch (err) {
      console.error(err);
      this.screens.showError('お店の準備に失敗しました。もう一度お試しください', () => this.showTitle());
    }
  }

  /** ネット対戦の結果。もう一回は主だけ（2人以上残っているとき）。参加者は「主を待っています」 */
  private showNetResults(net: NetState): void {
    const s = this.session;
    const result = s?.result();
    if (!s || !result) return;
    const room = net.client.room;
    const isHost = net.client.isHost();
    const others = room?.members.filter((m) => m.connected && m.slot !== net.client.slot).length ?? 0;
    const canRematch = isHost && others >= 1 && room?.phase === 'result';
    const waitingForHost = !isHost && others >= 1;
    const key = `${canRematch}/${waitingForHost}`;
    if (this.screen === 'results' && key === net.resultsKey) return;
    net.resultsKey = key;
    this.screen = 'results';
    this.input.setActive(false);
    this.hud.hide();
    this.audio.stopBgm();
    this.audio.setLoop('cart', 0);
    this.screens.showResults(result, {
      mySlot: s.mySlot,
      canRematch,
      waitingForHost,
      onRematch: () => {
        if (!net.client.rematch()) this.screens.toast(noticeText('bad-message'));
      },
      onTitle: () => this.showTitle(),
    });
  }

  /** だれかと：20秒さがし、見つからなければ「CPUと遊ぶ」で ひとりで（ふつう）へ */
  private startMatchmaking(): void {
    this.closeNet();
    this.stopMatchmaking();
    this.endSession();
    this.screen = 'matchmaking';
    const character = lastCharacter();
    let ui: ReturnType<ScreensAPI['showMatchmaking']> | null = null;
    const handle = matchmake({
      character,
      onStart: (client) => {
        this.stopMatchmaking();
        this.enterRoom(client);
      },
      onGiveUp: (reason) => {
        if (this.matching?.handle !== handle) return;
        clearInterval(this.matching.timer);
        ui?.setState(reason === 'timeout' ? 'timeout' : 'error');
        if (reason === 'daily-limit' || reason === 'rate-limited') this.screens.toast(matchFailureText(reason));
      },
    });
    ui = this.screens.showMatchmaking({
      onCancel: () => this.showTitle(),
      onPlayCpu: () => void this.startSolo('normal', character),
    });
    ui.setState('searching', handle.secondsLeft());
    const timer = setInterval(() => {
      if (this.matching?.handle === handle && this.screen === 'matchmaking') ui?.setState('searching', handle.secondsLeft());
    }, 250);
    this.matching = { handle, timer };
  }

  private stopMatchmaking(): void {
    const m = this.matching;
    if (!m) return;
    this.matching = null;
    clearInterval(m.timer);
    m.handle.cancel();
  }

  /** 部屋から出る（席をすぐに空ける） */
  private closeNet(): void {
    const n = this.net;
    if (!n) return;
    this.net = null;
    this.joinTicket++;
    for (const off of n.offs.splice(0)) off();
    n.client.leave();
  }

  private endSession(): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    this.renderer?.endMatch();
    this.lastView = null;
  }

  // ───────── 毎フレーム ─────────

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 1 / 60;
    this.lastT = now;
    const r = this.renderer;
    if (!r) return;
    const s = this.session;
    if (!s || IDLE_SCREENS.includes(this.screen)) {
      if (this.ready) r.idle(dt);
      return;
    }
    const running = this.screen === 'playing' || this.screen === 'ending';
    // ネット対戦は一時停止の画面を出している間も進める（主なら店の様子を送り続け、参加者なら自分の様子を送り続ける）
    const live = running || (this.net !== null && this.screen === 'paused');
    let input = running ? this.input.read() : { ...EMPTY_INPUT };
    if (this.override && this.override.frames > 0) {
      input = { ...input, ...this.override.input };
      this.override.frames--;
    }
    const view = s.update(live ? dt * this.timeScale : 0, input);
    this.lastView = view;
    this.input.setPrompt(view.avatars.find((a) => a.slot === s.mySlot)?.prompt ?? null);
    r.frame(view, dt, s.mySlot);
    this.hud.update(view, dt);
    this.playSounds(view);
    if (view.phase === 'ended' && (this.screen === 'playing' || (this.net !== null && this.screen === 'paused'))) {
      if (this.screen === 'paused') this.screens.hide();
      this.screen = 'ending';
      this.input.setActive(false);
      this.endAt = now + MATCH.endDelay * 1000;
    }
    if (this.screen === 'ending' && now >= this.endAt) {
      // ネット対戦の参加者は、主の結果が届くまで「そこまで！」のまま待つ
      if (this.net) this.showNetResults(this.net);
      else this.showResults();
    }
  }

  private lastScoreSfxAt = -Infinity;

  private playSounds(view: WorldView): void {
    const mySlot = this.session?.mySlot ?? 0;
    const me = view.avatars.find((a) => a.slot === mySlot);
    let hasLocalScore = false;
    let hasLocalMajorSfx = false;
    for (const e of view.events) {
      if (e.t === 'last-spurt') this.audio.setBgmIntensity(2);
      if (e.t === 'manager') this.audio.setBgmIntensity(1);
      if (e.t === 'combo-break' && e.slot === mySlot) {
        this.audio.play('combo-break');
        hasLocalMajorSfx = true;
        continue;
      }
      if (e.t === 'score' && e.slot === mySlot) {
        hasLocalScore = true;
        continue;
      }
      if (e.t !== 'sfx') continue;
      let volume = e.volume ?? 1;
      let pan = 0;
      let local = true;
      if (e.pos && me) {
        const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
        local = d <= 8;
        if (this.renderer) {
          // 遠くの音は小さく、画面の左右で振り分ける
          volume *= Math.max(0.2, 1 - d / 30);
          const p = this.renderer.project(e.pos);
          pan = Math.max(-1, Math.min(1, (p.x / Math.max(1, window.innerWidth)) * 2 - 1));
        }
      }
      const trivial =
        e.name === 'button' ||
        e.name === 'jump' ||
        e.name === 'dash' ||
        e.name === 'pick-up' ||
        e.name === 'throw' ||
        e.name === 'countdown' ||
        e.name === 'go' ||
        e.name === 'time-up' ||
        e.name === 'notice';
      if (local && !trivial) hasLocalMajorSfx = true;
      this.audio.play(e.name, { volume, pan });
    }
    if (hasLocalScore && !hasLocalMajorSfx) {
      const now = performance.now();
      if (now - (this.lastScoreSfxAt ?? -Infinity) >= 140) {
        this.lastScoreSfxAt = now;
        this.audio.play('score', { volume: 0.45 });
      }
    }
    const cart = me?.ridingCart != null ? view.carts.find((c) => c.id === me.ridingCart) : undefined;
    this.audio.setLoop('cart', cart ? Math.min(1, cart.speed / 10) : 0);
  }

  // ───────── 試験用 ─────────

  /** 次の数フレームだけ、自分の入力に上書きする（撮影の台本用） */
  overrideInput(input: Partial<InputState>, frames: number): void {
    this.override = { input, frames };
  }

  setShot(name: ShotName | null): void {
    this.renderer?.setShot(name);
    if (name && name !== 'S5' && name !== 'S6') this.hud.hide();
    else if (this.screen === 'playing' || this.screen === 'paused') this.hud.show();
  }

  setCameraPose(pose: CameraPose | null): void {
    this.renderer?.setCameraPose(pose);
  }

  get hudElement(): HTMLElement {
    return this.hudRoot;
  }
}

/**
 * 招待のリンク（?room=CODE）で来たときのあいことば。形が合わなければ null。
 * 読んだら URL から room を外す（試合のあとに読み込み直したとき、古い招待に戻らないように。debug などはそのまま）
 */
function invitedRoomCode(): string | null {
  try {
    const url = new URL(location.href);
    const raw = url.searchParams.get('room');
    if (raw === null) return null;
    url.searchParams.delete('room');
    history.replaceState(history.state, '', url);
    const code = normalizeRoomCode(raw);
    return isValidRoomCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** 最後に選んだキャラ（画面の担当が localStorage の sy.character に覚えている）。相手探しで使う */
function lastCharacter(): ModelKey {
  const keys = PLAYER_CHARACTERS.map((c) => c.key);
  try {
    const v = localStorage.getItem('sy.character');
    if (v && keys.includes(v)) return v;
  } catch {
    // 覚えられない端末では最初のキャラ
  }
  return keys[0] ?? 'ch/character-female-b';
}
