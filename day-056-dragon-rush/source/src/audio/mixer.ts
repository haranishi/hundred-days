// OWNER: audio
// 音の系統：曲（引き・一時停止のこもり・音量）／効果音（一時停止で止める・音量、近・中・遠の残響の戻りも通る）／UI → 制限器 → 全体の音量 → 出力。
// 全体の音量は制限器の後ろに置く（音量を下げても制限の掛かり方が変わらない）。
import { DUCK, LOW_DUCK, MIX } from '../config/audio';
import { createLimiter, type Limiter } from './limiter';

export type DuckKind = keyof typeof DUCK;
export type LowDuckKind = keyof typeof LOW_DUCK.kinds;
export type ReverbName = 'near' | 'mid' | 'far';

const dbToGain = (db: number): number => 10 ** (db / 20);

/** 曲の低い帯を引くかを決める出来事（r06-audio）。 */
export type LowDuckCause =
  | { kind: 'collapse'; near: boolean; volume: number }
  | { kind: 'land'; heavy: boolean; rageDive: boolean }
  | { kind: 'roar' }
  | { kind: 'fissure' };

/**
 * r06-audio：曲の低い帯を引くのは本当に重い瞬間だけ（純粋な決まり）。とても大きな近い崩落（LOW_DUCK.collapseMinVolume より大きい）・咆哮・地割れ・怒りの急降下の着地。
 * ふつうの重い着地（急降下・のしかかり）と、それより小さい崩落・遠い崩落では引かない。引かないときは null。
 */
export function lowDuckFor(c: LowDuckCause): LowDuckKind | null {
  switch (c.kind) {
    case 'collapse':
      return c.near && c.volume > LOW_DUCK.collapseMinVolume ? 'collapse' : null;
    case 'land':
      return c.rageDive ? 'rageDive' : null;
    case 'roar':
      return 'roar';
    case 'fissure':
      return 'fissure';
  }
}

/** つまみ（0〜1）を倍率へ。耳で等間隔に聞こえるよう dB で曲げ、0 で完全に消す。 */
export function volumeToGain(v: number): number {
  if (v <= 0) return 0;
  return dbToGain(MIX.volumeFloorDb * (1 - Math.min(1, v)) ** 1.6);
}

export class AudioMixer {
  readonly musicIn: GainNode;
  readonly sfxIn: GainNode;
  readonly uiIn: GainNode;
  readonly reverbIn: Record<ReverbName, GainNode>;
  private readonly musicDuck: GainNode;
  /** 続く音（ブレス）の間だけ BGM を引き続ける段（一発の引きとは別に掛け算で重ねる） */
  private readonly musicHold: GainNode;
  /** r05-audio：重い効果音の間だけ曲の 40〜100Hz を下げる山形の帯（ふだんは 0dB） */
  private readonly musicLow: BiquadFilterNode;
  private lowUntil = -Infinity;
  private readonly musicFilter: BiquadFilterNode;
  private readonly musicPause: GainNode;
  private readonly musicVol: GainNode;
  private readonly sfxPause: GainNode;
  private readonly sfxVol: GainNode;
  private readonly uiVol: GainNode;
  private readonly convolvers: Record<ReverbName, ConvolverNode>;
  private readonly preLimit: GainNode;
  private readonly masterVol: GainNode;
  limiter: Limiter | null = null;
  private duckUntil = -Infinity;
  private duckDepth = 0;
  paused = false;

  constructor(readonly ctx: BaseAudioContext) {
    const g = (v = 1): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.preLimit = g();
    this.masterVol = g();
    this.musicIn = g();
    this.musicDuck = g();
    this.musicHold = g();
    this.musicLow = ctx.createBiquadFilter();
    this.musicLow.type = 'peaking';
    this.musicLow.frequency.value = LOW_DUCK.freqHz;
    this.musicLow.Q.value = LOW_DUCK.q;
    this.musicLow.gain.value = 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.5;
    this.musicPause = g();
    this.musicVol = g(dbToGain(MIX.musicDb));
    this.musicIn.connect(this.musicDuck).connect(this.musicHold).connect(this.musicLow).connect(this.musicFilter).connect(this.musicPause).connect(this.musicVol).connect(this.preLimit);
    this.sfxIn = g();
    this.sfxPause = g();
    this.sfxVol = g(dbToGain(MIX.sfxDb));
    this.sfxIn.connect(this.sfxPause).connect(this.sfxVol).connect(this.preLimit);
    this.uiIn = g();
    this.uiVol = g(dbToGain(MIX.uiDb));
    this.uiIn.connect(this.uiVol).connect(this.preLimit);
    const ret = g(dbToGain(MIX.reverbReturnDb));
    ret.connect(this.sfxIn);
    const names: ReverbName[] = ['near', 'mid', 'far'];
    this.reverbIn = {} as Record<ReverbName, GainNode>;
    this.convolvers = {} as Record<ReverbName, ConvolverNode>;
    for (const n of names) {
      const input = g();
      const conv = ctx.createConvolver();
      // インパルス応答は生成の段でエネルギー 1 に揃えてあるので、ブラウザの正規化は使わない
      conv.normalize = false;
      input.connect(conv).connect(ret);
      this.reverbIn[n] = input;
      this.convolvers[n] = conv;
    }
    // 制限器ができるまでは、そのまま出力へ（作れたらつなぎ替える）
    this.preLimit.connect(this.masterVol);
    this.masterVol.connect(ctx.destination);
  }

  async init(): Promise<void> {
    const lim = await createLimiter(this.ctx, MIX.limiter);
    this.preLimit.disconnect();
    this.preLimit.connect(lim.input);
    lim.output.connect(this.masterVol);
    this.limiter = lim;
  }

  setReverb(name: ReverbName, buffer: AudioBuffer): void {
    this.convolvers[name].buffer = buffer;
  }

  /** 音量（つまみの 0〜1）を 60ms で滑らかに変える。 */
  setVolumes(master: number, bgm: number, sfx: number): void {
    const t = this.ctx.currentTime;
    this.masterVol.gain.setTargetAtTime(volumeToGain(master), t, 0.02);
    this.musicVol.gain.setTargetAtTime(volumeToGain(bgm) * dbToGain(MIX.musicDb), t, 0.02);
    this.sfxVol.gain.setTargetAtTime(volumeToGain(sfx) * dbToGain(MIX.sfxDb), t, 0.02);
    this.uiVol.gain.setTargetAtTime(volumeToGain(sfx) * dbToGain(MIX.uiDb), t, 0.02);
  }

  /** 大技・崩落で BGM を引く。重なったときは深い方を採り、戻り始めを遅い方に合わせる。 */
  duck(kind: DuckKind, when = this.ctx.currentTime): void {
    const d = DUCK[kind];
    const end = when + d.attack + d.hold;
    const active = when < this.duckUntil;
    const depth = active ? Math.min(this.duckDepth, d.depthDb) : d.depthDb;
    const until = Math.max(end, active ? this.duckUntil : end);
    const p = this.musicDuck.gain;
    p.cancelScheduledValues(when);
    p.setValueAtTime(p.value, when);
    p.linearRampToValueAtTime(dbToGain(depth), when + d.attack);
    p.setValueAtTime(dbToGain(depth), until);
    p.setTargetAtTime(1, until, d.release / 3);
    this.duckUntil = until;
    this.duckDepth = depth;
  }

  /**
   * 重い音の間だけ、曲の 40〜100Hz を下げる（重なったら長い方に合わせる。引く出来事は lowDuckFor が決める）。
   * 返すのは、引いていると数える区間の終わり（保持の終わり＋戻りの時定数。記録と tools/audio-render.mjs の割合の計算に使う）。
   */
  lowDuck(kind: LowDuckKind, when = this.ctx.currentTime): number {
    const d = LOW_DUCK.kinds[kind];
    const active = when < this.lowUntil;
    const until = Math.max(when + d.attack + d.hold, active ? this.lowUntil : -Infinity);
    const p = this.musicLow.gain;
    p.cancelScheduledValues(when);
    p.setValueAtTime(p.value, when);
    p.linearRampToValueAtTime(LOW_DUCK.depthDb, when + d.attack);
    p.setValueAtTime(LOW_DUCK.depthDb, until);
    p.setTargetAtTime(0, until, d.release / 3);
    this.lowUntil = until;
    return until + d.release / 3;
  }

  /** ブレスを吐いている間は BGM を引き続け（MIX.breathHold）、やめたらゆっくり戻す。 */
  holdMusic(on: boolean, when = this.ctx.currentTime): void {
    const h = MIX.breathHold;
    const p = this.musicHold.gain;
    p.cancelScheduledValues(when);
    p.setValueAtTime(p.value, when);
    p.setTargetAtTime(on ? dbToGain(h.depthDb) : 1, when, (on ? h.attack : h.release) / 3);
  }

  /** 一時停止・撮影モード：曲をこもらせて下げ、効果音を止める。戻すときは逆。 */
  setPaused(on: boolean, when = this.ctx.currentTime): void {
    if (on === this.paused) return;
    this.paused = on;
    const r = MIX.pause.rampSeconds / 3;
    this.musicFilter.frequency.setTargetAtTime(on ? MIX.pause.musicLowpassHz : 20000, when, r);
    this.musicPause.gain.setTargetAtTime(on ? dbToGain(MIX.pause.musicDb) : 1, when, r);
    this.sfxPause.gain.setTargetAtTime(on ? 0 : 1, when, r);
  }

  get limiterKind(): string {
    return this.limiter?.kind ?? 'none';
  }
}
