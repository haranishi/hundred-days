// OWNER: audio
// 声を鳴らす（Web Audio の節の組み立て）：素材 → 声の音量 → 空気の吸収（低域通過）→ 左右 → 系統、と、左右の後から近・中・遠の残響へ送る。
// 一発の音は鳴り終わると節を外す。繰り返しの音（ブレス・燃える街・風）は位置と大きさを毎コマ滑らかに動かす。
import { VOICES, type VoiceCategory } from '../config/audio';
import type { AudioMixer } from './mixer';
import type { Placement } from './spatial';
import { VoiceAllocator, envelopeOf, stackGain, type Envelope } from './voiceAllocator';

/** 素材ごとの包絡（声の譲り方が「今の大きさ」を見るため。初めて鳴らすときに1回だけ計算する） */
const envelopes = new WeakMap<AudioBuffer, Envelope>();
function envelopeFor(buffer: AudioBuffer): Envelope {
  let e = envelopes.get(buffer);
  if (!e) {
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    e = envelopeOf(chans, buffer.sampleRate);
    envelopes.set(buffer, e);
  }
  return e;
}

export interface PlayOptions {
  category: VoiceCategory;
  /** 始める時刻（コンテキストの秒）。遅れ（音速）は足してから渡す */
  when: number;
  gain: number;
  rate: number;
  place: Placement;
  bus: 'sfx' | 'ui';
}

interface Live {
  src: AudioBufferSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
}

export class VoicePlayer {
  readonly allocator = new VoiceAllocator();
  private readonly live = new Map<number, Live & { category: VoiceCategory }>();

  constructor(private readonly mixer: AudioMixer) {}

  get ctx(): BaseAudioContext {
    return this.mixer.ctx;
  }

  /** 鳴らす。止めて譲った声があれば短く絞る。鳴らさなかったら null。 */
  play(buffer: AudioBuffer, o: PlayOptions): { id: number; stack: number } | null {
    const now = this.ctx.currentTime;
    const loud = o.gain * o.place.gain;
    const d = this.allocator.request(o.category, loud, now);
    if (!d.accept) return null;
    if (d.steal !== null) this.stop(d.steal, now);
    const duration = buffer.duration / o.rate;
    const id = this.allocator.add(o.category, loud, o.when + duration, { start: o.when, env: envelopeFor(buffer), rate: o.rate });
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = o.rate;
    const gain = ctx.createGain();
    // 同じ種類が重なっているほど1つずつを下げる（崩落が何棟重なっても和が膨らみすぎない）
    gain.gain.value = o.gain * o.place.gain * stackGain(d.stack);
    const nodes: AudioNode[] = [src, gain];
    let tail: AudioNode = gain;
    src.connect(gain);
    if (o.bus === 'sfx') {
      if (o.place.lowpassHz < 17000) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = o.place.lowpassHz;
        lp.Q.value = 0.6;
        tail.connect(lp);
        tail = lp;
        nodes.push(lp);
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = o.place.pan;
      tail.connect(pan);
      tail = pan;
      nodes.push(pan);
      const names = ['near', 'mid', 'far'] as const;
      o.place.sends.forEach((s, k) => {
        if (s < 1e-3) return;
        const send = ctx.createGain();
        send.gain.value = s;
        pan.connect(send).connect(this.mixer.reverbIn[names[k]]);
        nodes.push(send);
      });
      tail.connect(this.mixer.sfxIn);
    } else tail.connect(this.mixer.uiIn);
    src.onended = () => {
      for (const n of nodes) n.disconnect();
      this.live.delete(id);
      this.allocator.remove(id);
    };
    src.start(Math.max(now, o.when));
    this.live.set(id, { src, gain, nodes, category: o.category });
    return { id, stack: d.stack };
  }

  stop(id: number, when = this.ctx.currentTime, fade: number = VOICES.stealFadeSeconds): void {
    const v = this.live.get(id);
    if (!v) return;
    v.gain.gain.cancelScheduledValues(when);
    v.gain.gain.setValueAtTime(v.gain.gain.value, when);
    v.gain.gain.linearRampToValueAtTime(0, when + fade);
    try {
      v.src.stop(when + fade + 0.005);
    } catch {
      // すでに止まっている
    }
    this.allocator.remove(id);
  }

  /** 鳴っている声をまとめて絞って止める（やり直しのとき）。keep の種類は残す。 */
  stopAll(fade = 0.08, keep: VoiceCategory | null = 'ui'): void {
    for (const [id, v] of [...this.live.entries()]) if (v.category !== keep) this.stop(id, this.ctx.currentTime, fade);
  }

  get activeCount(): number {
    return this.live.size;
  }
}

/** 繰り返しの音。start で滑らかに入り、stop で滑らかに消える。set で大きさ・左右・こもりを追いかける。 */
export class LoopVoice {
  private src: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly pan: StereoPannerNode;
  private readonly send: GainNode;
  level = 0;

  constructor(
    private readonly mixer: AudioMixer,
    private buffer: AudioBuffer | null,
    sendNear = 0.12,
  ) {
    const ctx = mixer.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    this.pan = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.send.gain.value = sendNear;
    this.gain.connect(this.lp).connect(this.pan).connect(mixer.sfxIn);
    this.pan.connect(this.send).connect(mixer.reverbIn.near);
  }

  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
  }

  get playing(): boolean {
    return this.src !== null;
  }

  /** 鳴らし始める（offset は輪の中のどこから始めるか、秒）。 */
  start(when: number, rate = 1, offset = 0): boolean {
    if (!this.buffer || this.src) return false;
    const src = this.mixer.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.connect(this.gain);
    src.start(when, offset % this.buffer.duration);
    this.src = src;
    return true;
  }

  /** 大きさ（倍率）・左右・こもり（Hz）へ、時定数 tau 秒で近づける。 */
  set(level: number, pan: number, lowpassHz: number, tau: number, when = this.mixer.ctx.currentTime): void {
    this.level = level;
    this.gain.gain.setTargetAtTime(level, when, tau);
    this.pan.pan.setTargetAtTime(pan, when, tau);
    this.lp.frequency.setTargetAtTime(lowpassHz, when, tau);
  }

  /** fade 秒で消して止める。 */
  stop(when: number, fade: number): void {
    const src = this.src;
    if (!src) return;
    this.level = 0;
    this.gain.gain.cancelScheduledValues(when);
    this.gain.gain.setValueAtTime(this.gain.gain.value, when);
    this.gain.gain.linearRampToValueAtTime(0, when + fade);
    src.stop(when + fade + 0.01);
    src.onended = () => src.disconnect();
    this.src = null;
  }
}
