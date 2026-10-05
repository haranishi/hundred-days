// 明るいBGM（小さめ・ループ）。音源ファイルを使わず、8小節の短い曲をその場で合成して繰り返す。
// 少し先（0.2秒）までの音を、AudioContext の時刻で予約しておく作り（タイマーのぶれで音がずれない）。
// 曲：ハ長調・116拍/分・8小節（C Am F G C Am Dm-G C）。メロディ（三角波）・ベース（正弦波）・裏拍の和音・ハイハット。

import { held, midiToHz, noiseBurst, tone } from './synth'

const BPM = 116
/** 8分音符1つの長さ（秒） */
const STEP = 60 / BPM / 2
const STEPS_PER_BAR = 8
const BARS = 8
const TOTAL = STEPS_PER_BAR * BARS
const LOOKAHEAD = 0.2
const INTERVAL_MS = 25

/** [小節の中の位置（8分）, 音（MIDI）, 長さ（8分の数）] */
type Note = readonly [number, number, number]

const MELODY: readonly (readonly Note[])[] = [
  [[0, 76, 1], [2, 79, 1], [4, 81, 1], [5, 79, 1], [6, 76, 2]],
  [[0, 72, 1], [2, 76, 1], [4, 74, 1], [5, 72, 1], [6, 69, 2]],
  [[0, 77, 1], [2, 81, 1], [4, 79, 1], [5, 77, 1], [6, 74, 2]],
  [[0, 79, 3], [4, 71, 2], [6, 74, 2]],
  [[0, 76, 1], [2, 79, 1], [4, 84, 2], [6, 81, 1], [7, 79, 1]],
  [[0, 81, 2], [2, 79, 1], [3, 76, 2], [6, 74, 2]],
  [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 79, 2], [6, 71, 2]],
  [[0, 72, 6]],
]

/** 各小節の和音（前半と後半） */
const CHORDS: readonly (readonly [readonly number[], readonly number[]])[] = [
  [[60, 64, 67], [60, 64, 67]],
  [[57, 60, 64], [57, 60, 64]],
  [[57, 60, 65], [57, 60, 65]],
  [[55, 59, 62], [55, 59, 62]],
  [[60, 64, 67], [60, 64, 67]],
  [[57, 60, 64], [57, 60, 64]],
  [[57, 62, 65], [55, 59, 62]],
  [[60, 64, 67], [60, 64, 67]],
]

const BASS: readonly (readonly [number, number])[] = [
  [48, 48],
  [45, 45],
  [41, 41],
  [43, 43],
  [48, 48],
  [45, 45],
  [38, 43],
  [48, 48],
]

export class Bgm {
  private readonly ctx: AudioContext
  private readonly out: GainNode
  private readonly volume: number
  private timer: ReturnType<typeof setInterval> | null = null
  private step = 0
  private nextTime = 0

  constructor(ctx: AudioContext, dest: AudioNode, volume = 0.55) {
    this.ctx = ctx
    this.volume = volume
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(dest)
  }

  get playing(): boolean {
    return this.timer !== null
  }

  start(): void {
    if (this.timer !== null) return
    const t = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(this.out.gain.value, t)
    this.out.gain.linearRampToValueAtTime(this.volume, t + 0.6)
    this.step = 0
    this.nextTime = t + 0.08
    this.timer = setInterval(() => this.pump(), INTERVAL_MS)
    this.pump()
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
    const t = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(this.out.gain.value, t)
    this.out.gain.linearRampToValueAtTime(0, t + 0.35)
  }

  private pump(): void {
    const ctx = this.ctx
    // 止まっていた（タブが隠れて AudioContext が止まった）あとに、昔の時刻の音をまとめて鳴らさない
    if (this.nextTime < ctx.currentTime - 0.1) this.nextTime = ctx.currentTime + 0.05
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime)
      this.nextTime += STEP
      this.step = (this.step + 1) % TOTAL
    }
  }

  private playStep(step: number, t: number): void {
    const ctx = this.ctx
    const out = this.out
    const bar = Math.floor(step / STEPS_PER_BAR)
    const pos = step % STEPS_PER_BAR
    for (const [at, m, len] of MELODY[bar] ?? []) {
      if (at !== pos) continue
      const length = len * STEP
      tone(ctx, out, { type: 'triangle', freq: midiToHz(m), t, attack: 0.012, decay: Math.max(0.12, length * 0.95), peak: 0.085 })
    }
    const half = pos < 4 ? 0 : 1
    const bass = BASS[bar]?.[half]
    if (bass !== undefined && (pos === 0 || pos === 4)) {
      held(ctx, out, 'sine', midiToHz(bass), t, STEP * 1.7, 0.13)
      // 低い打つ音
      tone(ctx, out, { type: 'sine', freq: 110, freqEnd: 46, t, attack: 0.002, decay: 0.12, peak: 0.09 })
    }
    if (pos % 2 === 1) {
      for (const m of CHORDS[bar]?.[half] ?? []) {
        tone(ctx, out, { type: 'triangle', freq: midiToHz(m), t, attack: 0.006, decay: STEP * 0.7, peak: 0.022 })
      }
      noiseBurst(ctx, out, { t, decay: 0.03, peak: 0.02, filter: 'highpass', freq: 8000 })
    }
  }
}
