// BGM の再生。楽譜（score.ts）を、AudioContext の時刻で少し先（0.2秒）まで予約していく。
// タイマーのぶれで音がずれないよう、時刻は AudioContext の currentTime で数える。
// scheduleStep は BaseAudioContext を受けるので、OfflineAudioContext で曲を書き出して確かめられる。

import { type Ev, type Song, eventsAt, stepSeconds, totalSteps } from './score';
import { held, midiToHz, noiseHit, tone } from './synth';

const LOOKAHEAD = 0.2;
const INTERVAL_MS = 25;

/** 1つの位置の音を予約する */
export function scheduleEvents(ctx: BaseAudioContext, dest: AudioNode, evs: readonly Ev[], t: number, step: number, song: Song): void {
  for (const ev of evs) {
    const length = ev.len * step;
    switch (ev.inst) {
      // 音量の釣り合い：強さ0（メロディ・和音・ハイハット）だけでも曲として聞こえ、
      // 強さ1で低音とリズムが足されても急に大きくならないようにする（書き出して RMS で確かめた）
      case 'lead': {
        // マリンバとビブラフォンの間のような、丸い音
        const f = midiToHz(ev.midi);
        tone(ctx, dest, { type: 'triangle', freq: f, t, attack: 0.008, decay: Math.max(0.16, length * 0.95), peak: 0.175 * ev.vel });
        tone(ctx, dest, { type: 'sine', freq: f * 2, t, attack: 0.004, decay: Math.max(0.08, length * 0.45), peak: 0.048 * ev.vel });
        break;
      }
      case 'chord':
        if (song.chordStyle === 'pad') {
          tone(ctx, dest, { type: 'sine', freq: midiToHz(ev.midi), t, attack: 0.08, decay: length, peak: 0.048 * ev.vel });
        } else {
          tone(ctx, dest, { type: 'triangle', freq: midiToHz(ev.midi), t, attack: 0.005, decay: step * 0.9, peak: 0.082 * ev.vel });
        }
        break;
      case 'bass': {
        const f = midiToHz(ev.midi);
        held(ctx, dest, { type: 'sine', freq: f, t, length: Math.max(0.08, length * 0.85), peak: 0.1 * ev.vel, release: 0.05 });
        // 小さなスピーカーでも聞こえるよう、2倍音を少し足す
        tone(ctx, dest, { type: 'triangle', freq: f * 2, t, attack: 0.004, decay: Math.max(0.06, length * 0.5), peak: 0.03 * ev.vel });
        break;
      }
      case 'kick':
        tone(ctx, dest, { type: 'sine', freq: 125, freqEnd: 45, t, attack: 0.002, decay: 0.13, peak: 0.17 * ev.vel });
        break;
      case 'snare':
        noiseHit(ctx, dest, { t, decay: 0.1, peak: 0.08 * ev.vel, filter: 'bandpass', freq: 1900, q: 0.8 });
        tone(ctx, dest, { type: 'triangle', freq: 230, freqEnd: 180, t, attack: 0.001, decay: 0.05, peak: 0.04 * ev.vel });
        break;
      case 'hat':
        noiseHit(ctx, dest, { t, decay: 0.035, peak: 0.04 * ev.vel, filter: 'highpass', freq: 7500 });
        break;
    }
  }
}

export class BgmPlayer {
  private readonly out: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private song: Song | null = null;
  private step = 0;
  private nextTime = 0;
  private intensity: 0 | 1 | 2 = 0;
  /** 消音中は音を作らない（拍は進める） */
  silent = false;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
  }

  get playing(): Song | null {
    return this.timer !== null ? this.song : null;
  }

  play(song: Song): void {
    if (this.timer !== null && this.song === song) return;
    const t = this.ctx.currentTime;
    this.song = song;
    this.step = 0;
    this.nextTime = t + 0.08;
    // 曲の切り替えは一度小さくしてから上げる
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.06);
    this.out.gain.linearRampToValueAtTime(1, t + 0.7);
    if (this.timer === null) this.timer = setInterval(() => this.pump(), INTERVAL_MS);
    this.pump();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.4);
  }

  setIntensity(level: 0 | 1 | 2): void {
    this.intensity = level;
  }

  private pump(): void {
    const song = this.song;
    if (!song) return;
    const ctx = this.ctx;
    // タブが隠れて止まっていたあとに、昔の時刻の音をまとめて鳴らさない
    if (this.nextTime < ctx.currentTime - 0.1) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const step = stepSeconds(song, this.intensity);
      if (!this.silent) scheduleEvents(ctx, this.out, eventsAt(song, this.step, this.intensity), this.nextTime, step, song);
      this.nextTime += step;
      this.step = (this.step + 1) % totalSteps(song);
    }
  }
}
