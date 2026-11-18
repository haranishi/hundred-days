// 鳴らし続ける音：カートの走行音（速さで大きく・明るく）と冷凍ケースの風。
// 大きさ0が続いたら部品を止めて外す（鳴っていない音で端末を重くしない）。次に大きさが来たら作り直す。

import type { LoopName } from '../contracts';
import { noiseBuffer } from './synth';

/** 大きさ0のまま、部品を止めるまでの秒 */
const IDLE_STOP = 1.2;

interface Built {
  out: GainNode;
  /** 大きさ（0..1）を音へ写す */
  apply(level: number, t: number): void;
  stop(t: number): void;
}

function loopNoise(ctx: BaseAudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  return src;
}

/** カート：低い転がる音＋車輪のカタカタ（速いほど細かく） */
function buildCart(ctx: BaseAudioContext, dest: AudioNode): Built {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.connect(dest);

  const rumble = loopNoise(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.setValueAtTime(0.8, t);
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.9, t);
  rumble.connect(lp).connect(rumbleGain).connect(out);

  const rattle = loopNoise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2300, t);
  bp.Q.setValueAtTime(5, t);
  const rattleGain = ctx.createGain();
  rattleGain.gain.setValueAtTime(0.12, t);
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(0.1, t);
  lfo.connect(lfoDepth).connect(rattleGain.gain);
  rattle.connect(bp).connect(rattleGain).connect(out);

  const hum = ctx.createOscillator();
  hum.type = 'triangle';
  const humGain = ctx.createGain();
  humGain.gain.setValueAtTime(0.12, t);
  hum.connect(humGain).connect(out);

  rumble.start(t, Math.random());
  rattle.start(t, Math.random());
  lfo.start(t);
  hum.start(t);
  return {
    out,
    apply(level, at) {
      out.gain.setTargetAtTime(0.55 * level * level, at, 0.06);
      lp.frequency.setTargetAtTime(220 + 900 * level, at, 0.08);
      lfo.frequency.setTargetAtTime(7 + 16 * level, at, 0.08);
      hum.frequency.setTargetAtTime(55 + 35 * level, at, 0.08);
    },
    stop(at) {
      for (const n of [rumble, rattle, lfo, hum]) n.stop(at);
    },
  };
}

/** 冷凍ケース：ゆっくりうねる冷たい風＋かすかなシー */
function buildFreezer(ctx: BaseAudioContext, dest: AudioNode): Built {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.connect(dest);

  const wind = loopNoise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900, t);
  bp.Q.setValueAtTime(0.9, t);
  const sway = ctx.createOscillator();
  sway.frequency.setValueAtTime(0.27, t);
  const swayDepth = ctx.createGain();
  swayDepth.gain.setValueAtTime(350, t);
  sway.connect(swayDepth).connect(bp.frequency);
  wind.connect(bp).connect(out);

  const hiss = loopNoise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(6000, t);
  const hissGain = ctx.createGain();
  hissGain.gain.setValueAtTime(0.12, t);
  hiss.connect(hp).connect(hissGain).connect(out);

  wind.start(t, Math.random());
  hiss.start(t, Math.random());
  sway.start(t);
  return {
    out,
    apply(level, at) {
      out.gain.setTargetAtTime(0.45 * level, at, 0.12);
    },
    stop(at) {
      for (const n of [wind, hiss, sway]) n.stop(at);
    },
  };
}

export class LoopVoice {
  private built: Built | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  level = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly name: LoopName,
  ) {}

  set(level: number): void {
    const v = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    this.level = v;
    const t = this.ctx.currentTime;
    if (v > 0) {
      if (this.idleTimer !== null) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      this.built ??= this.name === 'cart' ? buildCart(this.ctx, this.dest) : buildFreezer(this.ctx, this.dest);
      this.built.apply(v, t);
      return;
    }
    if (!this.built) return;
    this.built.apply(0, t);
    if (this.idleTimer === null) this.idleTimer = setTimeout(() => this.release(), IDLE_STOP * 1000);
  }

  /** 部品を止めて外す */
  release(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const b = this.built;
    this.built = null;
    if (!b) return;
    try {
      b.stop(this.ctx.currentTime + 0.05);
    } catch {
      // すでに止まっていれば何もしない
    }
    setTimeout(() => b.out.disconnect(), 200);
  }
}
