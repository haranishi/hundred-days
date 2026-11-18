// 音の部品。音源ファイルを使わず、発振器と雑音だけで作る。
// どの関数も「いつ（t）・どこへ（dest）」を受け取り、その場で予約して終わる（後片付けは stop の時刻で自動）。
// BaseAudioContext を受けるので、OfflineAudioContext でも同じ音が作れる（試験で音量を測るのに使う）。

export const SILENT = 0.0001;

export function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

export interface ToneSpec {
  type: OscillatorType;
  freq: number;
  /** 終わりの音程（省略なら変えない） */
  freqEnd?: number;
  t: number;
  attack: number;
  decay: number;
  peak: number;
  /** 音程のずれ（セント） */
  detune?: number;
}

/** 1つの音：上がって、指数で消える */
export function tone(ctx: BaseAudioContext, dest: AudioNode, spec: ToneSpec): void {
  const o = ctx.createOscillator();
  o.type = spec.type;
  const end = spec.t + spec.attack + spec.decay;
  o.frequency.setValueAtTime(Math.max(20, spec.freq), spec.t);
  if (spec.freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), end);
  if (spec.detune) o.detune.setValueAtTime(spec.detune, spec.t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, spec.t);
  g.gain.exponentialRampToValueAtTime(Math.max(SILENT * 2, spec.peak), spec.t + Math.max(0.001, spec.attack));
  g.gain.exponentialRampToValueAtTime(SILENT, end);
  o.connect(g).connect(dest);
  o.start(spec.t);
  o.stop(end + 0.05);
}

/** 決まった長さだけ鳴り続ける音（笛・ブザー・ベースのように切れのある音） */
export function held(
  ctx: BaseAudioContext,
  dest: AudioNode,
  spec: { type: OscillatorType; freq: number; freqEnd?: number; t: number; length: number; peak: number; release?: number },
): { osc: OscillatorNode; gain: GainNode } {
  const o = ctx.createOscillator();
  o.type = spec.type;
  o.frequency.setValueAtTime(Math.max(20, spec.freq), spec.t);
  if (spec.freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), spec.t + spec.length);
  const g = ctx.createGain();
  const rel = spec.release ?? 0.04;
  g.gain.setValueAtTime(SILENT, spec.t);
  g.gain.exponentialRampToValueAtTime(spec.peak, spec.t + 0.012);
  g.gain.setValueAtTime(spec.peak, spec.t + Math.max(0.013, spec.length - rel));
  g.gain.exponentialRampToValueAtTime(SILENT, spec.t + spec.length);
  o.connect(g).connect(dest);
  o.start(spec.t);
  o.stop(spec.t + spec.length + 0.05);
  return { osc: o, gain: g };
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 白い雑音（2秒・種つきの乱数なので毎回同じ） */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let x = 2463534242;
  for (let i = 0; i < len; i++) {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = ((x >>> 0) / 4294967296) * 2 - 1;
  }
  noiseCache.set(ctx, buf);
  return buf;
}

export interface NoiseSpec {
  t: number;
  decay: number;
  peak: number;
  filter: BiquadFilterType;
  freq: number;
  /** フィルタの周波数を最後にここへ動かす */
  freqEnd?: number;
  q?: number;
  attack?: number;
}

/** 雑音を帯域で絞って短く鳴らす（打つ音・風・シュッ） */
export function noiseHit(ctx: BaseAudioContext, dest: AudioNode, spec: NoiseSpec): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = spec.filter;
  const attack = spec.attack ?? 0.003;
  const end = spec.t + attack + spec.decay;
  f.frequency.setValueAtTime(spec.freq, spec.t);
  if (spec.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), end);
  f.Q.setValueAtTime(spec.q ?? 1, spec.t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, spec.t);
  g.gain.exponentialRampToValueAtTime(spec.peak, spec.t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, end);
  src.connect(f).connect(g).connect(dest);
  // 毎回ちがう所から読む（同じ雑音の繰り返しに聞こえないように）。最後まで鳴らせる範囲で選ぶ
  const room = Math.max(0, src.buffer.duration - (end - spec.t) - 0.06);
  src.start(spec.t, Math.random() * room);
  src.stop(end + 0.05);
}

/** 金属や鐘の音：倍音が整数倍でない部分音を重ねる */
export function partials(
  ctx: BaseAudioContext,
  dest: AudioNode,
  spec: { t: number; base: number; ratios: readonly number[]; decays: readonly number[]; peaks: readonly number[]; type?: OscillatorType },
): void {
  spec.ratios.forEach((r, i) => {
    tone(ctx, dest, {
      type: spec.type ?? 'sine',
      freq: spec.base * r,
      t: spec.t,
      attack: 0.002,
      decay: spec.decays[i] ?? 0.2,
      peak: spec.peaks[i] ?? 0.05,
    });
  });
}
