// OWNER: integrate
// 夜の環境音（鳴りっぱなしの音）：かすかな風・虫（鈴虫のような高い震え）・蛙（池のほうから）・篝火のはぜる音・炎上のうなり。
// 虫・蛙・はぜる音は、毎コマ少し先までの鳴り方を予約する（setTimeout に頼らず、AudioContext の時刻で並べる）。
import { AUDIO } from '../config/audio';
import type { AudioEngine } from './engine';

export interface Listener {
  x: number;
  z: number;
  /** 画面の右の向き（x, z）。左右の振り分けに使う。 */
  rightX: number;
  rightZ: number;
}

interface Insect {
  carrier: OscillatorNode;
  env: GainNode;
  pan: StereoPannerNode;
  next: number;
}

export class Ambience {
  private readonly e: AudioEngine;
  private readonly braziers: { x: number; z: number }[];
  private readonly pond: { x: number; z: number } | null;
  private readonly insects: Insect[] = [];
  private windGain!: GainNode;
  private roarGain!: GainNode;
  private roarFilter!: BiquadFilterNode;
  private breathGain!: GainNode;
  private nextFrog = 0;
  private nextCrackle = 0;
  private fire = 0;

  constructor(e: AudioEngine, braziers: { x: number; z: number }[], pond: { x: number; z: number } | null) {
    this.e = e;
    this.braziers = braziers;
    this.pond = pond;
  }

  /** 音の文脈ができてから一度だけ組む。 */
  start(): void {
    const e = this.e;
    const ctx = e.ctx!;
    const now = ctx.currentTime;
    // 風：茶色のノイズを低く通し、ゆっくり揺らす
    const wind = ctx.createBufferSource();
    wind.buffer = e.brown;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = AUDIO.wind.cutoff;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = AUDIO.wind.level;
    const sway = ctx.createOscillator();
    sway.frequency.value = AUDIO.wind.swayHz;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = AUDIO.wind.level * AUDIO.wind.swayDepth;
    sway.connect(swayDepth);
    swayDepth.connect(this.windGain.gain);
    wind.connect(wf);
    wf.connect(this.windGain);
    this.windGain.connect(e.amb);
    wind.start(now);
    sway.start(now);

    // 虫：高い正弦を速く震わせ（AM）、鳴く・休むを予約する
    const r = e.rng;
    for (let i = 0; i < AUDIO.insects.voices; i++) {
      const carrier = ctx.createOscillator();
      carrier.frequency.value = AUDIO.insects.freqLo + r() * (AUDIO.insects.freqHi - AUDIO.insects.freqLo);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const trill = ctx.createOscillator();
      trill.frequency.value = AUDIO.insects.trillLo + r() * (AUDIO.insects.trillHi - AUDIO.insects.trillLo);
      const trillDepth = ctx.createGain();
      trillDepth.gain.value = 0.5;
      trill.connect(trillDepth);
      trillDepth.connect(am.gain);
      const env = ctx.createGain();
      env.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = (r() * 2 - 1) * 0.8;
      carrier.connect(am);
      am.connect(env);
      env.connect(pan);
      pan.connect(e.amb);
      carrier.start(now);
      trill.start(now);
      this.insects.push({ carrier, env, pan, next: now + r() * 1.5 });
    }

    // 篝火の息（低いゴォという燃える音）と、炎上のうなり
    const breath = ctx.createBufferSource();
    breath.buffer = e.brown;
    breath.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 180;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    breath.connect(bf);
    bf.connect(this.breathGain);
    this.breathGain.connect(e.amb);
    breath.start(now, 1.3);

    const roar = ctx.createBufferSource();
    roar.buffer = e.brown;
    roar.loop = true;
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'lowpass';
    this.roarFilter.frequency.value = AUDIO.fireRoar.cutoffLo;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    roar.connect(this.roarFilter);
    this.roarFilter.connect(this.roarGain);
    this.roarGain.connect(e.sfx);
    roar.start(now, 2.1);
    this.nextFrog = now + 1.2;
    this.nextCrackle = now;
  }

  /** 炎上の進み 0→1（討ち取りの演出の間）。 */
  setFire(k: number): void {
    this.fire = Math.max(0, Math.min(1, k));
  }

  /** 毎コマ：少し先までの虫・蛙・はぜる音を予約し、篝火と炎上の大きさを合わせる。 */
  update(l: Listener | null): void {
    const e = this.e;
    const ctx = e.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const ahead = now + 0.35;
    const r = e.rng;
    const I = AUDIO.insects;
    for (const ins of this.insects) {
      while (ins.next < ahead) {
        const t = Math.max(now, ins.next);
        const on = 0.25 + r() * 0.6;
        const lv = I.level * (0.5 + r() * 0.5);
        ins.env.gain.setValueAtTime(0, t);
        ins.env.gain.linearRampToValueAtTime(lv, t + 0.05);
        ins.env.gain.setValueAtTime(lv, t + on - 0.06);
        ins.env.gain.linearRampToValueAtTime(0, t + on);
        ins.next = t + on + 0.2 + r() * 1.3;
      }
    }
    // 蛙：池が近いほどよく聞こえる。ゲロゲロ（4〜6 回の短い脈）
    if (this.nextFrog < ahead) {
      const t = Math.max(now, this.nextFrog);
      let near = 0.45;
      let pan = r() * 1.6 - 0.8;
      if (l && this.pond) {
        const dx = this.pond.x - l.x;
        const dz = this.pond.z - l.z;
        const d = Math.hypot(dx, dz);
        near = 0.35 + 0.65 * Math.max(0, 1 - d / (AUDIO.frogs.nearPond * 3));
        if (d > 0.5) pan = (dx * l.rightX + dz * l.rightZ) / d;
      }
      const f0 = 150 + r() * 70;
      const pulses = 4 + Math.floor(r() * 3);
      for (let i = 0; i < pulses; i++) {
        e.tone({ dest: e.amb, gain: AUDIO.frogs.level * near * (0.7 + r() * 0.3), pan, send: 0.5 }, t + i * 0.065, {
          type: 'sawtooth',
          f0,
          f1: f0 * 0.82,
          dur: 0.045,
          level: 1,
        });
      }
      this.nextFrog = t + AUDIO.frogs.gapLo + r() * (AUDIO.frogs.gapHi - AUDIO.frogs.gapLo);
    }
    // 篝火：近いほど大きく、多くはぜる
    let prox = 0;
    let panSum = 0;
    if (l) {
      for (const b of this.braziers) {
        const dx = b.x - l.x;
        const dz = b.z - l.z;
        const d = Math.hypot(dx, dz);
        const k = Math.max(0, 1 - d / AUDIO.crackle.radius);
        const kk = k * k;
        prox += kk;
        if (d > 0.3) panSum += kk * ((dx * l.rightX + dz * l.rightZ) / d);
      }
    }
    const fireK = this.fire;
    const crackleK = Math.min(1.2, prox) + fireK * 2.5;
    const crPan = prox > 1e-3 ? Math.max(-1, Math.min(1, panSum / prox)) : 0;
    this.breathGain.gain.setTargetAtTime(AUDIO.crackle.breath * Math.min(1, prox), now, 0.3);
    if (crackleK > 0.02) {
      const rate = AUDIO.crackle.ratePerSec * crackleK;
      while (this.nextCrackle < ahead) {
        const t = Math.max(now, this.nextCrackle);
        const big = r() < 0.15;
        e.burst(
          { dest: e.amb, gain: AUDIO.crackle.level * Math.min(1, crackleK) * (big ? 1 : 0.35 + r() * 0.4), pan: fireK > 0.3 ? r() * 2 - 1 : crPan + (r() - 0.5) * 0.3 },
          t,
          { dur: big ? 0.035 : 0.008 + r() * 0.012, type: 'highpass', freq: 1500 + r() * 2500, q: 0.8, level: 1 },
        );
        this.nextCrackle = t - Math.log(1 - r() * 0.98) / rate;
      }
    } else {
      this.nextCrackle = ahead;
    }
    // 炎上のうなり
    const R = AUDIO.fireRoar;
    this.roarGain.gain.setTargetAtTime(R.level * Math.pow(fireK, 0.7), now, 0.4);
    this.roarFilter.frequency.setTargetAtTime(R.cutoffLo + (R.cutoffHi - R.cutoffLo) * fireK, now, 0.4);
  }
}
