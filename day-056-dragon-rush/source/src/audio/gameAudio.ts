// OWNER: audio
// 遊びと音をつなぐ：出来事（core/events.ts）を購読して鳴らし、毎コマ遊びの状態を読んで、聞く位置・BGM の段階・鳴り続ける音（ブレス・燃える街・風）を合わせる。
// 遊びの側には書き込まない（読むだけ）。遊びの本体（gameplay の Game）はこの型を満たすので、そのまま渡せる。書き出しの確かめでは作り物の状態を渡す。
import { COMBO_MILESTONES, DEFAULT_MONSTER, HEAVY_COLLAPSE_VOLUME, LOOPS, ROAR_CUES, SOUNDS, SPACE, type SoundId } from '../config/audio';
import { CREATURE_CONFIG, isCreatureId } from '../config/creatures';
import { SESSION } from '../config/gameplay';
import type { BuildingEvent, EventBus, P3 } from '../core/events';
import { AudioEngine } from './engine';
import { IntensityDirector } from './intensity';
import { lowDuckFor, type DuckKind, type LowDuckCause } from './mixer';
import { resultCue } from './musicEnd';
import { listenerFrom, place } from './spatial';
import type { AudioLog } from './syncLog';
import type { LoopVoice } from './voices';

type V3 = { x: number; y: number; z: number };

/** 音が読む遊びの状態（gameplay の Game の一部分）。 */
export interface AudioGameLike {
  readonly bus: EventBus;
  readonly clock: number;
  /** timeLeft は残りのゲーム内秒（r05-audio：曲の終わりを時間切れに合わせる。無ければ始まりからの時刻で数える） */
  readonly session: { readonly phase: string; readonly timeLeft?: number };
  readonly score: { readonly rage: number; readonly rageFull: boolean; readonly combo: number };
  readonly body: { readonly pos: V3; readonly speed: number; readonly mode: string; readonly grounded: boolean };
  readonly combat: { readonly mouth: V3; readonly claw: { readonly phase: string }; readonly tail: { readonly phase: string } };
  readonly fire: { readonly burning: ReadonlySet<number>; readonly burn: ArrayLike<number> };
  readonly city: { readonly buildings: readonly { readonly footprint: { x0: number; x1: number; z0: number; z1: number }; readonly height: number }[] };
}

export interface Volumes {
  volume: number;
  bgm: number;
  sfx: number;
}

const dbToGain = (db: number): number => 10 ** (db / 20);
const tuple = (v: V3): P3 => [v.x, v.y, v.z];

/** 建物の大きさ（体積の立方根、m）から、音量と高さのずらし。大きいほど大きく低い。 */
function sizeShift(e: BuildingEvent): { gainDb: number; semis: number } {
  const s = Math.cbrt(Math.max(1, e.volume));
  const k = Math.log2(s / 25);
  const mat = e.material === 'wood' ? 2 : e.material === 'metal' ? -1.5 : 0;
  // r00d：大きい側の持ち上げは +2dB まで（+3dB では1棟の崩落だけで全体の制限器が 4.6dB 下げていた）
  return { gainDb: Math.max(-6, Math.min(2, 5 * k)), semis: Math.max(-3, Math.min(3, -2.5 * k + mat)) };
}

export class GameAudio {
  readonly engine: AudioEngine;
  readonly intensity: IntensityDirector;
  private breath: LoopVoice | null = null;
  /** r03-roster：焔角の突進の地響き（突進の間だけ鳴り続ける） */
  private charge: LoopVoice | null = null;
  private chargePos: P3 = [0, 0, 0];
  private fireNear: LoopVoice | null = null;
  private fireFar: LoopVoice | null = null;
  private wind: LoopVoice | null = null;
  private phase = 'ready';
  private quiet = false;
  private rageDive = false;
  private musicWanted = false;
  private publishAt = 0;
  /** 爪・尾の振りかぶりを見つけるための前のコマの段階 */
  private clawPhase = 'none';
  private tailPhase = 'none';
  /** 同じ建物のガラスは続けて鳴らさない（炎を浴びている間は毎刻み割れる） */
  private readonly glassAt = new Map<number, number>();
  private volumeClickAt = -Infinity;
  /** 最後に咆哮（長い・短い）を鳴らしたコンテキストの時刻（踏み切りの短い咆哮を続けて鳴らさないため） */
  private roarAt = -Infinity;
  /** 遊びが始まったゲーム内時刻（残り時間が状態に無いときに、ここから数える） */
  private sessionClock0 = 0;
  /** r06-audio：時間切れの結果の音をどう鳴らしたか（記録用） */
  private result: { kind: 'gong' | 'full'; at: number; sessionEndAt: number } | null = null;
  private readonly offs: (() => void)[] = [];

  /** ブラウザで遊ぶときの作り方。Web Audio が無ければ null（音なしで遊べる）。monster は config/audio.ts の MONSTER_SOUNDS の名前。 */
  static create(game: AudioGameLike, volumes: Volumes, monster = DEFAULT_MONSTER): GameAudio | null {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const a = new GameAudio(game, new AudioEngine(ctx, monster));
    a.setVolumes(volumes);
    // 最初のクリック（かキー）で音を起こす（ブラウザは操作の前に音を出させない）
    const wake = (): void => a.wake();
    for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, wake, { capture: true });
    void a.engine.load().catch((e: unknown) => console.warn('音を読み込めませんでした:', e));
    return a;
  }

  constructor(
    private readonly game: AudioGameLike,
    engine: AudioEngine,
  ) {
    this.engine = engine;
    this.intensity = new IntensityDirector(2.5);
    this.subscribe();
  }

  get ctx(): BaseAudioContext {
    return this.engine.ctx;
  }

  wake(): void {
    const c = this.ctx as AudioContext;
    if (c.state === 'suspended' && typeof c.resume === 'function') void c.resume().catch(() => undefined);
  }

  setVolumes(v: Volumes): void {
    this.engine.mixer.setVolumes(v.volume, v.bgm, v.sfx);
  }

  private play(id: SoundId, pos: P3 | null, ev: string, extra: { gainDb?: number; semis?: number; variant?: number; at?: number } = {}): boolean {
    // 一時停止・撮影モードの間は街と竜の音を始めない（UI の音は鳴らす）
    if (!this.engine.ready || (this.quiet && SOUNDS[id].space !== 'ui')) return false;
    return this.engine.play(id, pos, { ev, t: this.game.clock, ...extra });
  }

  /** 咆哮（長い・短い）を鳴らし、鳴らせたら時刻を覚える。 */
  private roar(id: 'roar' | 'roarShort', pos: P3, ev: string, gainDb = 0): void {
    if (this.play(id, pos, ev, { gainDb })) this.roarAt = this.ctx.currentTime;
  }

  private duck(kind: DuckKind): void {
    this.engine.mixer.duck(kind);
    this.engine.log.duck(kind, this.ctx.currentTime);
  }

  /**
   * r05-audio：重い効果音の間だけ曲の低い帯を空ける（記録には low: を付けて残す）。
   * r06-audio：引くかどうかは mixer.ts の lowDuckFor（本当に重い瞬間だけ）。v は記録に残す数（崩落の体積）
   */
  private lowDuck(cause: LowDuckCause, v?: number): void {
    if (!this.engine.ready || this.quiet) return;
    const kind = lowDuckFor(cause);
    if (!kind) return;
    const end = this.engine.mixer.lowDuck(kind);
    this.engine.log.duck(`low:${kind}`, this.ctx.currentTime, v, typeof end === 'number' ? end : undefined);
  }

  private building(id: SoundId, e: BuildingEvent, ev: string): void {
    const s = sizeShift(e);
    this.play(id, e.pos, ev, s);
  }

  private subscribe(): void {
    const bus = this.game.bus;
    const on = bus.on.bind(bus);
    this.offs.push(
      on('dragon.step', (e) => {
        // r02-audio：前足と後ろ足は別の作りの音（後ろ足は重くかかとから、前足は指が開いて爪が当たる）。走るほど強く
        this.play(e.foot[0] === 'H' ? 'stepHind' : 'stepFront', e.pos, 'dragon.step', { gainDb: Math.min(2, e.speed / 10) });
      }),
      on('dragon.wingFlap', (e) => this.play('flap', e.pos, 'dragon.wingFlap', { gainDb: 20 * Math.log10(0.45 + 0.55 * Math.min(1, e.strength)) })),
      on('dragon.land', (e) => {
        // r03-roster：焔角ののしかかり（跳んで着地）は、急降下と同じ重い着地の音
        const heavy = e.dive || e.slam === true || e.impact > 0.55;
        this.play(heavy ? 'landHeavy' : 'land', e.pos, 'dragon.land', { gainDb: heavy ? -3 + 3 * e.impact : -7 + 7 * e.impact });
        if (this.rageDive) this.duck('rageDive');
        else if (heavy) this.duck('landHeavy');
        this.lowDuck({ kind: 'land', heavy, rageDive: this.rageDive });
        this.rageDive = false;
      }),
      on('dragon.roar', (e) => {
        this.roar('roar', e.pos, 'dragon.roar');
        this.duck('roar');
        this.lowDuck({ kind: 'roar' });
      }),
      on('rage.release', (e) => {
        this.intensity.onRelease(e.t);
        if (e.kind === 'dive') {
          this.rageDive = true;
          const p = tuple(this.game.body.pos);
          this.roar('roarShort', p, 'rage.release');
          this.play('diveWind', p, 'rage.release');
        } else if (e.kind === 'fissure') {
          // r05-audio：焔角の地割れの溜め。前脚を振り上げて叩くまでの 0.58 秒に咆哮が立ち上がり、曲を引く
          this.roar('roar', tuple(this.game.body.pos), 'rage.release');
          this.duck('roar');
          this.lowDuck({ kind: 'roar' });
        }
      }),
      // r05-audio：のしかかりの踏み切り（焔角の Space）。後ろ足で地面を蹴る音と、直前に咆哮していなければ短い咆哮を少し小さく
      on('dragon.jump', (e) => {
        this.play('stepHind', e.pos, 'dragon.jump', { gainDb: ROAR_CUES.pushOffDb });
        if (this.ctx.currentTime - this.roarAt < ROAR_CUES.jump.cooldownSeconds) return;
        this.roar('roarShort', e.pos, 'dragon.jump', ROAR_CUES.jump.gainDb);
      }),
      on('dragon.breath.start', (e) => {
        this.play('breathStart', e.pos, 'dragon.breath.start');
        this.startBreath();
      }),
      on('dragon.breath.stop', (e) => {
        this.stopBreath();
        this.play('breathStop', e.pos, 'dragon.breath.stop');
      }),
      // 振りの風切りは振りかぶりの始まりで鳴らし（frame で見つける）、山が当たりの瞬間に来るようにする。出来事では当たりの音だけ
      on('dragon.claw', (e) => {
        if (e.hit) this.play('clawHit', e.pos, 'dragon.claw', { gainDb: 20 * Math.log10(Math.min(1.5, 0.8 + 0.25 * e.count)) });
      }),
      on('dragon.tail', (e) => {
        if (e.hit) this.play('tailHit', e.pos, 'dragon.tail', { gainDb: 20 * Math.log10(Math.min(1.5, 0.8 + 0.25 * e.count)) });
      }),
      on('building.crack', (e) => this.building('crack', e, 'building.crack')),
      on('building.peel', (e) => this.building('peel', e, 'building.peel')),
      on('building.tilt', (e) => this.building('tilt', e, 'building.tilt')),
      on('building.collapse', (e) => {
        this.intensity.onCollapse(e.t);
        const L = this.engine.listener;
        const d = L ? Math.hypot(e.pos[0] - L.ear[0], e.pos[1] - L.ear[1], e.pos[2] - L.ear[2]) : 0;
        const near = d < SPACE.reverbSplits[1] * 0.55;
        this.building(near ? 'collapseNear' : 'collapseFar', e, 'building.collapse');
        // ガラスの高層は、崩れるときに外壁のガラスも一緒に割れる
        if (e.material === 'glass') this.play('glass', e.pos, 'building.collapse', { gainDb: 2 });
        if (near && e.volume > HEAVY_COLLAPSE_VOLUME) this.duck('collapseNear');
        // r06-audio：近い崩落は体積を記録に残す（低い帯を引いたかどうかに関わらず。tools/audio-render.mjs が引く条件を確かめる）
        if (near && this.engine.ready && !this.quiet) this.engine.log.duck('near:collapse', this.ctx.currentTime, e.volume);
        this.lowDuck({ kind: 'collapse', near, volume: e.volume }, e.volume);
      }),
      on('glass.shatter', (e) => {
        const last = this.glassAt.get(e.id) ?? -Infinity;
        if (e.t - last < 0.35) return;
        this.glassAt.set(e.id, e.t);
        this.play('glass', e.pos, 'glass.shatter', { gainDb: 20 * Math.log10(Math.max(0.4, Math.min(1.4, e.count / 8))) });
      }),
      on('fire.ignite', (e) => this.play('fireIgnite', e.pos, 'fire.ignite')),
      on('fire.spread', (e) => this.play('fireSpread', e.pos, 'fire.spread')),
      on('combo.change', (e) => {
        const k = COMBO_MILESTONES.indexOf(e.value);
        if (k >= 0) this.play('uiCombo', null, 'combo.change', { variant: Math.min(2, k) });
      }),
      on('rage.full', () => this.play('uiRage', null, 'rage.full')),
      on('session.start', (e) => this.onSessionStart(e.creature)),
      // r03-roster：怪獣ごとの技の音（config/audio.ts の MONSTER_SOUNDS に用意した音を、その怪獣で遊ぶ間だけ鳴らす）
      // 雷翼の雷：ビルからビルへ跳ねる音（1発で最大4回跳ねるうちの1回目と3回目。最初の1本の当たりは息の持続とガラスの音が鳴らす）。
      // 跳ぶたびに弱まる雷に合わせて小さくする。全部の跳ねで鳴らすと、爪や尾の音（同じ攻撃の声の枠）を押しのけた
      on('lightning.hop', (e) => {
        if (e.id >= 0 && (e.hop === 1 || e.hop === 3)) this.play('arc', e.to, 'lightning.hop', { gainDb: e.hop === 1 ? -1 : -4 });
      }),
      on('lightning.bolt', (e) => this.play('arc', e.pos, 'lightning.bolt', { gainDb: e.index === 0 ? 2 : 0 })),
      // 焔角の溶岩の礫：吐く音（口から）と弾ける音（着いた所から）
      on('lava.launch', (e) => this.play('breathStart', e.pos, 'lava.launch')),
      on('lava.impact', (e) => this.play('breathHit', e.pos, 'lava.impact', { gainDb: e.hits > 0 ? 0 : -3 })),
      on('fissure.start', (e) => {
        this.play('fissure', e.pos, 'fissure.start');
        this.duck('landHeavy');
        this.lowDuck({ kind: 'fissure' });
      }),
      on('charge.start', (e) => {
        this.chargePos = e.pos;
        this.startCharge();
      }),
      on('charge.stop', () => this.stopCharge()),
      on('charge.shove', (e) => this.play('shove', e.pos, 'charge.shove')),
      on('session.end', () => {
        // r05-audio：最後の大太鼓がまだ先なら、71 小節目へ跳んで時間切れに合わせる
        const now = this.ctx.currentTime;
        const end = this.engine.music?.endSession(now) ?? null;
        // r06-audio：曲が最後の大太鼓を鳴らせるなら、大太鼓を抜いた銅鑼だけをその時刻に鳴らす（ドドンと二度打ちにしない）。
        // 合わせられないとき（曲が止まっている・一時停止中・大太鼓を並べられなかった）だけ、銅鑼と大太鼓2打の結果の音をすぐ鳴らす
        const cue = resultCue(now, end);
        if (cue.kind === 'gong') this.play('uiResultGong', null, 'session.end', { at: cue.at });
        else this.play('uiResult', null, 'session.end');
        this.result = { kind: cue.kind, at: Math.round(cue.at * 1e4) / 1e4, sessionEndAt: Math.round(now * 1e4) / 1e4 };
      }),
      on('ui.click', (e) => {
        // 音量のつまみは動かしている間ずっと出来事が出るので、0.25 秒に1回だけ（新しい音量で）鳴らす
        if (e.target === 'volume') {
          const now = this.ctx.currentTime;
          if (now - this.volumeClickAt < 0.25) return;
          this.volumeClickAt = now;
        }
        this.play(e.target === 'start' ? 'uiStart' : e.target === 'resume' ? 'uiResume' : 'uiClick', null, 'ui.click');
      }),
    );
  }

  private onSessionStart(creature?: string): void {
    const now = this.ctx.currentTime;
    // r03-roster：遊ぶ怪獣の音へ切り替える（始める前と結果の画面で選び直した怪獣）
    if (isCreatureId(creature)) this.engine.setMonster(CREATURE_CONFIG[creature].sound);
    // r05-audio：頂の条件も怪獣ごと
    this.intensity.setMonster(this.engine.monster);
    this.intensity.reset();
    this.roarAt = -Infinity;
    this.result = null;
    this.sessionClock0 = this.game.clock;
    this.glassAt.clear();
    this.stopBreath();
    this.stopCharge();
    this.engine.voices.stopAll(0.15);
    const m = this.engine.music;
    if (m?.started) {
      m.stop(now, 0.35);
      m.play(now + 0.4, 0);
    } else this.musicWanted = true;
  }

  private startBreath(): void {
    if (this.breath?.playing || !this.engine.ready) return;
    this.breath = this.engine.loop(this.engine.monsterBank('breathLoop'), 0.1);
    const now = this.ctx.currentTime;
    if (this.breath?.start(now + 0.06, 1, this.engine.variety.unit() * 3)) {
      this.breath.set(dbToGain(LOOPS.breath.db), 0, 18000, LOOPS.breath.fadeIn / 3, now + 0.06);
      // 吐いている間は BGM を少し引き続ける（炎の持続が曲に埋もれないように）
      this.engine.mixer.holdMusic(true, now);
      this.engine.log.duck('breathHold', now);
    }
  }

  private stopBreath(): void {
    if (!this.breath) return;
    this.breath.stop(this.ctx.currentTime, LOOPS.breath.fadeOut);
    this.breath = null;
    this.engine.mixer.holdMusic(false);
  }

  /** 突進の地響き（その怪獣に chargeLoop が無ければ鳴らさない）。 */
  private startCharge(): void {
    if (this.charge?.playing || !this.engine.ready || this.quiet) return;
    this.charge = this.engine.loop(this.engine.monsterBank('chargeLoop'), 0.15);
    const now = this.ctx.currentTime;
    if (this.charge?.start(now, 1, this.engine.variety.unit() * 3)) {
      this.charge.set(dbToGain(LOOPS.charge.db), 0, 18000, LOOPS.charge.fadeIn / 3, now);
      this.engine.log.add({ ev: 'charge.start', sound: 'chargeLoop', variant: 0, t: this.game.clock, start: now, prop: 0, distance: 0, gainDb: LOOPS.charge.db }, 0);
    } else this.charge = null;
  }

  private stopCharge(): void {
    if (!this.charge) return;
    this.charge.stop(this.ctx.currentTime, LOOPS.charge.fadeOut);
    this.charge = null;
  }

  /** 毎コマ（描画の後）に呼ぶ。camera は three のカメラの世界行列（列優先の16個）、still は撮影モードなど時間が止まっている間。 */
  frame(camera: ArrayLike<number>, still: boolean): void {
    const g = this.game;
    const e = this.engine;
    const now = this.ctx.currentTime;
    e.listener = listenerFrom(camera, tuple(g.body.pos));
    const phase = g.session.phase;
    const quiet = still || phase === 'paused';
    if (quiet !== this.quiet) {
      e.mixer.setPaused(quiet);
      this.quiet = quiet;
      if (phase === 'paused' && this.phase === 'playing') e.play('uiPause', null, { ev: 'pause', t: g.clock });
    }
    this.phase = phase;
    if (!e.ready) return this.publish();
    const m = e.music;
    if (m && this.musicWanted && phase !== 'ready') {
      this.musicWanted = false;
      m.play(now + 0.05, 0);
    }
    if (m) {
      // 一時停止の間は曲の時計も止める（ゲーム内時刻と同じく進まない。終わりの8小節が3分の終わりにそろう）
      if (m.started && phase === 'paused' && !m.paused) m.pause(now);
      else if (m.started && phase !== 'paused' && m.paused) m.resume(now + 0.06);
      if (!m.paused) {
        const stage = this.intensity.update({ t: g.clock, playing: phase === 'playing', rage: g.score.rage, rageFull: g.score.rageFull, combo: g.score.combo });
        if (m.started && stage !== m.stage) m.requestStage(stage, now);
      }
      // r05-audio：残りのゲーム内時間と遊びの時計（ヒットストップで遅くなる）を曲へ渡す。曲は 63 小節目の繰り返しの数をこれで決める
      const remaining = g.session.timeLeft ?? Math.max(0, SESSION.durationSeconds - (g.clock - this.sessionClock0));
      m.setGame(now, g.clock, remaining, phase === 'playing');
      m.update(now);
    }
    // 振りかぶりの始まり（段階が windup に入ったコマ）で風切りを鳴らす
    const cp = g.combat.claw.phase;
    const tp = g.combat.tail.phase;
    if (cp === 'windup' && this.clawPhase !== 'windup') this.play('clawSwing', tuple(g.body.pos), 'claw.windup');
    if (tp === 'windup' && this.tailPhase !== 'windup') this.play('tailSwing', tuple(g.body.pos), 'tail.windup');
    this.clawPhase = cp;
    this.tailPhase = tp;
    if (this.breath) {
      const p = place(tuple(g.combat.mouth), e.listener, 'self');
      this.breath.set(dbToGain(LOOPS.breath.db) * p.gain, p.pan, p.lowpassHz, 0.05);
    }
    if (this.charge) {
      // 突進の地響きは足もとから（速さで少し大きく）
      const p = place([g.body.pos.x, this.chargePos[1], g.body.pos.z], e.listener, 'self');
      this.charge.set(dbToGain(LOOPS.charge.db) * p.gain * Math.min(1.2, 0.6 + g.body.speed / 40), p.pan, p.lowpassHz, 0.08);
    }
    this.updateBeds(now);
    this.publish();
  }

  /** 燃える街の下地と、空の風。 */
  private updateBeds(now: number): void {
    const e = this.engine;
    const L = e.listener;
    if (!L) return;
    const g = this.game;
    const F = LOOPS.fire;
    this.fireNear ??= e.loop(F.nearBank, 0.15);
    this.fireFar ??= e.loop(F.farBank, 0.3);
    this.wind ??= e.loop(LOOPS.wind.bank, 0);
    let near = 0;
    let far = 0;
    let side = 0;
    for (const id of g.fire.burning) {
      const b = g.city.buildings[id];
      const cx = (b.footprint.x0 + b.footprint.x1) / 2;
      const cz = (b.footprint.z0 + b.footprint.z1) / 2;
      const d = Math.hypot(cx - L.ear[0], b.height * 0.4 - L.ear[1], cz - L.ear[2]);
      const w = Math.min(1.5, g.fire.burn[id]);
      const wn = d < F.nearRange ? w / (1 + (d / 60) ** 2) : 0;
      near += wn;
      far += w / (1 + d / 250);
      const cl = Math.hypot(cx - L.cam[0], cz - L.cam[2]) || 1;
      side += (((cx - L.cam[0]) * L.right[0] + (cz - L.cam[2]) * L.right[2]) / cl) * wn;
    }
    const start = (v: LoopVoice | null): void => {
      if (v && !v.playing) v.start(now, 1, this.engine.variety.unit() * 5);
    };
    start(this.fireNear);
    start(this.fireFar);
    start(this.wind);
    const nearLevel = Math.min(1, near / F.fullAt);
    const farLevel = Math.min(1, far / (F.fullAt * 4));
    // 燃えている棟が多いほど、燃える街の下地を持ち上げる（最大 boostDb）
    const many = dbToGain(F.boostDb * Math.min(1, g.fire.burning.size / F.boostAt));
    this.fireNear?.set(dbToGain(F.nearDb) * Math.sqrt(nearLevel) * many, near > 0 ? Math.max(-0.7, Math.min(0.7, side / near)) : 0, 16000, F.smooth);
    this.fireFar?.set(dbToGain(F.farDb) * Math.sqrt(farLevel) * many, 0, 5000, F.smooth * 2);
    const W = LOOPS.wind;
    const air = !g.body.grounded;
    const k = air ? Math.min(1, Math.max(0, (g.body.speed - W.fromSpeed) / (W.fullSpeed - W.fromSpeed))) : 0;
    const boost = g.body.mode === 'dive' ? W.diveBoostDb : 0;
    this.wind?.set(k > 0 ? dbToGain(W.db + boost) * k : 0, 0, 1500 + 11000 * k, W.smooth);
  }

  /** window.__audioLog を最新にする（半秒ごと）。 */
  private publish(): void {
    if (typeof window === 'undefined') return;
    const now = performance.now();
    if (now < this.publishAt) return;
    this.publishAt = now + 500;
    window.__audioLog = this.snapshot();
  }

  snapshot(): AudioLog {
    const e = this.engine;
    const c = this.ctx as AudioContext;
    const a = e.voices.allocator;
    return {
      state: (c.state as string) ?? 'offline',
      sampleRate: c.sampleRate,
      baseLatency: c.baseLatency ?? 0,
      outputLatency: c.outputLatency ?? 0,
      limiter: e.mixer.limiterKind,
      limiterMaxGrDb: Math.round((e.mixer.limiter?.maxGrDb() ?? 0) * 10) / 10,
      loaded: e.store.size,
      failed: e.store.failed,
      voices: { active: e.voices.activeCount, peak: a.peak, dropped: a.dropped, stolen: a.stolen, stolenTails: a.stolenTails },
      music: {
        started: e.music?.started ?? false,
        stage: e.music?.stage ?? 0,
        changes: e.music?.changes ?? [],
        lateChunks: e.music?.lateChunks ?? 0,
        songStart: e.music?.start ?? 0,
        paused: e.music?.paused ?? false,
        position: e.music?.started ? e.music.position(c.currentTime) : 0,
        pauses: e.music?.pauses ?? [],
        finalAt: e.music?.finalAt ?? null,
        extensionBars: e.music?.extensionBars ?? 0,
        cutToEnd: e.music?.endAlign ?? null,
        grid: e.music?.grid ?? [],
        result: this.result,
      },
      counts: e.log.counts,
      entries: e.log.entries,
      ducks: e.log.ducks,
    };
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
