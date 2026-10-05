// 効果音の合成。音源ファイルを使わず、発振器と雑音だけで作る。
// どの関数も「いつ（t）・どこへ（dest）」を受け取り、その場で鳴らして終わる（後片付けは stop の時刻で自動）。

export type Wave = OscillatorType

export interface ToneSpec {
  type: Wave
  freq: number
  /** 終わりの音程（省略なら変えない） */
  freqEnd?: number
  t: number
  attack: number
  decay: number
  peak: number
  /** 音程のずれ（セント） */
  detune?: number
}

const SILENT = 0.0001

/** 1つの音：上がって、指数で消える */
export function tone(ctx: BaseAudioContext, dest: AudioNode, spec: ToneSpec): void {
  const o = ctx.createOscillator()
  o.type = spec.type
  o.frequency.setValueAtTime(spec.freq, spec.t)
  if (spec.freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), spec.t + spec.attack + spec.decay)
  if (spec.detune) o.detune.setValueAtTime(spec.detune, spec.t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(SILENT, spec.t)
  g.gain.exponentialRampToValueAtTime(spec.peak, spec.t + spec.attack)
  g.gain.exponentialRampToValueAtTime(SILENT, spec.t + spec.attack + spec.decay)
  o.connect(g).connect(dest)
  o.start(spec.t)
  o.stop(spec.t + spec.attack + spec.decay + 0.05)
}

/** 決まった長さだけ鳴り続ける音（ブブーのように切れのある音） */
export function held(ctx: BaseAudioContext, dest: AudioNode, type: Wave, freq: number, t: number, length: number, peak: number): void {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(SILENT, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
  g.gain.setValueAtTime(peak, t + Math.max(0.013, length - 0.03))
  g.gain.exponentialRampToValueAtTime(SILENT, t + length)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + length + 0.05)
}

let noiseBuffer: AudioBuffer | null = null
let noiseOwner: BaseAudioContext | null = null

function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseOwner === ctx) return noiseBuffer
  const len = Math.floor(ctx.sampleRate * 0.8)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  // 種つきの簡単な乱数（毎回同じ雑音でよい）
  let x = 12345
  for (let i = 0; i < len; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    data[i] = (x / 2 ** 32) * 2 - 1
  }
  noiseBuffer = buf
  noiseOwner = ctx
  return buf
}

/** 雑音を帯域で絞って短く鳴らす（打つ音・シャラン・ハイハット） */
export function noiseBurst(
  ctx: BaseAudioContext,
  dest: AudioNode,
  spec: { t: number; decay: number; peak: number; filter: BiquadFilterType; freq: number; q?: number },
): void {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const f = ctx.createBiquadFilter()
  f.type = spec.filter
  f.frequency.setValueAtTime(spec.freq, spec.t)
  f.Q.setValueAtTime(spec.q ?? 1, spec.t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(SILENT, spec.t)
  g.gain.exponentialRampToValueAtTime(spec.peak, spec.t + 0.003)
  g.gain.exponentialRampToValueAtTime(SILENT, spec.t + 0.003 + spec.decay)
  src.connect(f).connect(g).connect(dest)
  src.start(spec.t, Math.random() * 0.5)
  src.stop(spec.t + spec.decay + 0.05)
}

export function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12)
}

// ── 効果音 ──

/** ボタンを押した小さな音 */
export function sfxTap(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', freq: 1250, freqEnd: 900, t, attack: 0.003, decay: 0.05, peak: 0.1 })
}

/**
 * 部品の着地「コトッ」。大きい部品ほど低い音。木を打つような短い音に、乾いた雑音を少し足す。
 * size は部品の大きさ（外接球の半径の目安。台座の半径が5）
 */
export function sfxLand(ctx: BaseAudioContext, dest: AudioNode, t: number, size: number): void {
  const s = Number.isFinite(size) && size > 0 ? size : 0.3
  const f = Math.min(1300, Math.max(170, 520 / Math.sqrt(s + 0.05)))
  const detune = (Math.random() - 0.5) * 80
  tone(ctx, dest, { type: 'triangle', freq: f, freqEnd: f * 0.55, t, attack: 0.002, decay: 0.09, peak: 0.14, detune })
  tone(ctx, dest, { type: 'sine', freq: f * 2.02, freqEnd: f * 1.2, t, attack: 0.001, decay: 0.035, peak: 0.04, detune })
  noiseBurst(ctx, dest, { t, decay: 0.025, peak: 0.05, filter: 'bandpass', freq: Math.min(5000, f * 3.2), q: 3 })
}

/** 色塗り「シャラン」：高い鈴の音を上へ順に重ねる */
export function sfxPaint(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  const notes = [84, 86, 88, 91, 93, 96, 98, 100]
  notes.forEach((m, i) => {
    tone(ctx, dest, { type: 'sine', freq: midiToHz(m), t: t + i * 0.035, attack: 0.004, decay: 0.55, peak: 0.045, detune: (i % 2) * 6 })
  })
  noiseBurst(ctx, dest, { t, decay: 0.5, peak: 0.018, filter: 'highpass', freq: 7000 })
}

/** 早押し「ピンポン」：高い音から少し低い音へ */
function bell(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, decay: number, peak: number): void {
  tone(ctx, dest, { type: 'sine', freq, t, attack: 0.004, decay, peak })
  tone(ctx, dest, { type: 'sine', freq: freq * 2, t, attack: 0.004, decay: decay * 0.5, peak: peak * 0.3 })
  tone(ctx, dest, { type: 'triangle', freq: freq * 3.01, t, attack: 0.003, decay: decay * 0.25, peak: peak * 0.12 })
}

export function sfxBuzz(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  bell(ctx, dest, midiToHz(88), t, 0.35, 0.2) // E6
  bell(ctx, dest, midiToHz(84), t + 0.16, 0.7, 0.2) // C6
}

/** 正解：明るい和音を下から順に鳴らして、そのまま響かせる */
export function sfxCorrect(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  ;[72, 76, 79, 84].forEach((m, i) => {
    tone(ctx, dest, { type: 'triangle', freq: midiToHz(m), t: t + i * 0.055, attack: 0.006, decay: 0.75, peak: 0.11 })
  })
  ;[84, 88, 91].forEach((m) => {
    tone(ctx, dest, { type: 'sine', freq: midiToHz(m), t: t + 0.22, attack: 0.01, decay: 1.0, peak: 0.06 })
  })
}

/** まちがい「ブブー」：低いにごった音を2回 */
export function sfxWrong(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1100, t)
  lp.connect(dest)
  for (const [start, length] of [
    [0, 0.17],
    [0.23, 0.42],
  ] as const) {
    held(ctx, lp, 'sawtooth', 138, t + start, length, 0.1)
    held(ctx, lp, 'square', 141, t + start, length, 0.05)
  }
}

/** 3・2・1 の音 */
export function sfxTick(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', freq: 880, t, attack: 0.004, decay: 0.14, peak: 0.16 })
}

/** 始まりの音 */
export function sfxGo(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', freq: 1760, t, attack: 0.004, decay: 0.45, peak: 0.12 })
  tone(ctx, dest, { type: 'triangle', freq: 880, t, attack: 0.004, decay: 0.45, peak: 0.12 })
}

/** 結果のファンファーレ */
export function sfxFanfare(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  const run: [number, number][] = [
    [79, 0],
    [84, 0.13],
    [88, 0.26],
    [91, 0.39],
  ]
  for (const [m, at] of run) {
    tone(ctx, dest, { type: 'triangle', freq: midiToHz(m), t: t + at, attack: 0.005, decay: 0.22, peak: 0.12 })
    tone(ctx, dest, { type: 'square', freq: midiToHz(m), t: t + at, attack: 0.005, decay: 0.12, peak: 0.025 })
  }
  for (const m of [84, 88, 91, 96]) {
    tone(ctx, dest, { type: 'triangle', freq: midiToHz(m), t: t + 0.55, attack: 0.01, decay: 1.3, peak: 0.08 })
  }
  tone(ctx, dest, { type: 'sine', freq: midiToHz(48), t: t + 0.55, attack: 0.01, decay: 1.2, peak: 0.12 })
}

/** だれかが入ってきた（ネット対戦の待合室など） */
export function sfxJoin(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, { type: 'sine', freq: midiToHz(79), t, attack: 0.004, decay: 0.2, peak: 0.12 })
  tone(ctx, dest, { type: 'sine', freq: midiToHz(86), t: t + 0.09, attack: 0.004, decay: 0.3, peak: 0.12 })
}
