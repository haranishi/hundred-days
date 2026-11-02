// OWNER: integrate
// 音の土台：AudioContext（最初の操作で作る）・音量の系統（全体 → 効果音／環境音）・手続きで作った残響・ノイズの素材と、
// 短い音を組む部品（ノイズの一打・音程の動く音）。外の音源は使わない。
import { AUDIO } from '../config/audio';

export interface Voice {
  /** 鳴らす先（効果音か環境音の系統）。 */
  dest: AudioNode;
  /** 0..1 の音量と、左右の位置（-1..1）。 */
  gain: number;
  pan: number;
  /** 残響へ送る量（既定は系統の値）。 */
  send?: number;
}

/** 決まった種の乱数（音の揺らぎを毎回少し変える。ゲームの判定には関係しない）。 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  amb!: GainNode;
  /** 残響の入口（効果音・環境音から少しずつ送る）。 */
  reverbIn!: GainNode;
  white!: AudioBuffer;
  brown!: AudioBuffer;
  readonly rng = makeRng(7);
  private muted = false;
  private duck = 1;

  get started(): boolean {
    return this.ctx !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** 最初の操作の中で呼ぶ（ブラウザは操作なしに音を出させない）。2回目からは止まっていれば再開するだけ。 */
  start(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return false;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.master;
    // 重なっても割れないよう、最後に軽く抑える
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = AUDIO.sfx;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = AUDIO.ambience;
    this.amb.connect(this.master);
    this.white = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(AUDIO.reverb.seconds, AUDIO.reverb.decay);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    this.reverbIn.connect(conv);
    conv.connect(this.master);
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }

  setMuted(on: boolean): void {
    this.muted = on;
    this.applyMaster();
  }

  /** 一時停止などで全体を下げる（1 で元の大きさ）。 */
  setDuck(k: number): void {
    if (Math.abs(k - this.duck) < 1e-3) return;
    this.duck = k;
    this.applyMaster();
  }

  private applyMaster(): void {
    if (!this.ctx) return;
    const v = this.muted ? 0 : AUDIO.master * this.duck;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
  }

  private makeNoise(seconds: number, kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = makeRng(kind === 'white' ? 11 : 23);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  /** 残響の手続きの応答：左右で別のノイズを、指数で減らす（夜の境内と塀の跳ね返りの広がり）。 */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const r = makeRng(101 + ch);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        // 最初の 15ms は塀の早い跳ね返りを少し強く
        const early = i < ctx.sampleRate * 0.015 ? 0.4 : 0;
        d[i] = (r() * 2 - 1) * (Math.pow(1 - u, decay) * 0.5 + early * (1 - u));
      }
    }
    return buf;
  }

  /** 出口：音量と左右を付けて dest へ、残響へも少し送る。返り値の GainNode に音をつなぐ。 */
  out(v: Voice, t: number, release: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = v.gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v.pan));
    g.connect(p);
    p.connect(v.dest);
    const send = v.send ?? (v.dest === this.amb ? AUDIO.reverb.ambSend : AUDIO.reverb.sfxSend);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      p.connect(s);
      s.connect(this.reverbIn);
      // 鳴り終わったらつなぎを外す（ノードを溜めない）
      window.setTimeout(() => s.disconnect(), (t - ctx.currentTime + release + 0.5) * 1000);
    }
    window.setTimeout(() => p.disconnect(), (t - ctx.currentTime + release + 0.5) * 1000);
    return g;
  }

  /**
   * ノイズの一打：フィルターを通したノイズに、立ち上がりと減衰を付ける。sweepTo を渡すと、フィルターの周波数を動かす。
   */
  burst(
    v: Voice,
    t: number,
    o: { dur: number; type: BiquadFilterType; freq: number; q?: number; attack?: number; sweepTo?: number; brown?: boolean; level?: number },
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
    f.Q.value = o.q ?? 1;
    const env = ctx.createGain();
    const a = o.attack ?? 0.002;
    const peak = o.level ?? 1;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + a);
    env.gain.exponentialRampToValueAtTime(0.0008, t + a + o.dur);
    src.connect(f);
    f.connect(env);
    env.connect(this.out(v, t, a + o.dur));
    const off = this.rng() * Math.max(0, src.buffer.duration - o.dur - a - 0.05);
    src.start(t, off, a + o.dur + 0.05);
  }

  /** 音程の動く音（正弦・三角など）。f1 を渡すと f0 から指数で動く。 */
  tone(v: Voice, t: number, o: { type: OscillatorType; f0: number; f1?: number; dur: number; attack?: number; level?: number; glide?: number }): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? o.dur));
    const env = ctx.createGain();
    const a = o.attack ?? 0.003;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(o.level ?? 1, t + a);
    env.gain.exponentialRampToValueAtTime(0.0008, t + a + o.dur);
    osc.connect(env);
    env.connect(this.out(v, t, a + o.dur));
    osc.start(t);
    osc.stop(t + a + o.dur + 0.05);
  }
}
