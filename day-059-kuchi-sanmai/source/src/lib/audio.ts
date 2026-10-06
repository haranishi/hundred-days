// 音声の解析グラフ。ここは Web Audio だけを見る層で、React・ストア・DOM イベントには触らない。

/** AnalyserNode の窓幅。時間領域を読むのでこの数だけサンプルが取れる。 */
export const ANALYSER_FFT_SIZE = 2048

/** 時間領域を読めれば何でもよい（テストでは偽物を渡す）。 */
export interface TimeDomainAnalyser {
  fftSize: number
  getFloatTimeDomainData(buffer: Float32Array): void
}

/** 波形サンプルの二乗平均平方根。無音なら 0、振幅 A の正弦波なら約 A/√2。 */
export function computeRms(samples: Float32Array): number {
  const length = samples.length
  if (length === 0) return 0
  let sum = 0
  for (let i = 0; i < length; i += 1) {
    const s = samples[i]
    sum += s * s
  }
  const rms = Math.sqrt(sum / length)
  return Number.isFinite(rms) ? rms : 0
}

/** RMS に感度を掛けて 0..1 に収める。話し声の RMS は 0.03〜0.15 程度なので既定の感度 3 で 0.1〜0.45 に載る。 */
export function normalizeLevel(rms: number, sensitivity: number): number {
  if (!Number.isFinite(rms) || !Number.isFinite(sensitivity)) return 0
  if (rms <= 0 || sensitivity <= 0) return 0
  const level = rms * sensitivity
  if (level <= 0) return 0
  return level >= 1 ? 1 : level
}

/**
 * アナライザから時間領域を読み、正規化したレベルを返す。
 * buffer は使い回す（毎フレーム呼ぶので確保し直さない）。fftSize より長い分は読まれないので無視する。
 */
export function readLevelFrom(
  analyser: TimeDomainAnalyser,
  buffer: Float32Array,
  sensitivity: number,
): number {
  analyser.getFloatTimeDomainData(buffer)
  const filled = Math.min(buffer.length, analyser.fftSize)
  const samples = filled === buffer.length ? buffer : buffer.subarray(0, filled)
  return normalizeLevel(computeRms(samples), sensitivity)
}

type AudioContextCtor = new () => AudioContext

function resolveAudioContextCtor(): AudioContextCtor {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  const ctor = scope.AudioContext ?? scope.webkitAudioContext
  if (!ctor) {
    throw new Error('このブラウザは Web Audio に対応していません。')
  }
  return ctor
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  return value >= 1 ? 1 : value
}

/**
 * 常設ノード: Analyser（解析）・recDest（録画用のトラック）・Gain（モニター音量）。
 * ソースだけを差し替える。ファイルは Gain 経由でスピーカーへ出し、マイクは出さない（ハウリング防止）。
 */
export class AudioGraph {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private recDest: MediaStreamAudioDestinationNode | null = null
  private gain: GainNode | null = null
  /** MediaElementAudioSourceNode は要素につき1回しか作れないので覚えておく。 */
  private elementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()
  private currentSource: AudioNode | null = null
  private streamSource: MediaStreamAudioSourceNode | null = null
  private monitorConnected = false
  private monitorVolume = 1
  private buffer: Float32Array = new Float32Array(ANALYSER_FFT_SIZE)

  /** AudioContext は遅延生成する（自動再生制限があるので、実際の開始は resume() で行う）。 */
  ensureContext(): AudioContext {
    if (this.context) return this.context
    const Ctor = resolveAudioContextCtor()
    const context = new Ctor()

    const analyser = context.createAnalyser()
    analyser.fftSize = ANALYSER_FFT_SIZE
    const recDest = context.createMediaStreamDestination()
    const gain = context.createGain()
    gain.gain.value = this.monitorVolume

    // 解析結果はそのまま録画用の出力へ。スピーカーへはソース種別に応じて後からつなぐ。
    analyser.connect(recDest)
    gain.connect(context.destination)

    this.context = context
    this.analyser = analyser
    this.recDest = recDest
    this.gain = gain
    this.monitorConnected = false
    if (this.buffer.length !== analyser.fftSize) {
      this.buffer = new Float32Array(analyser.fftSize)
    }
    return context
  }

  /** ユーザー操作の中で呼ぶこと。suspended のままだとレベルが 0 のまま動かない。 */
  async resume(): Promise<void> {
    const context = this.ensureContext()
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  /** 音声要素をつなぐ。要素は1つを使い回して src だけ替える前提（作り直せないため）。 */
  attachElement(el: HTMLAudioElement): void {
    const context = this.ensureContext()
    let source = this.elementSources.get(el)
    if (!source) {
      source = context.createMediaElementSource(el)
      this.elementSources.set(el, source)
    }
    this.detachSource()
    if (this.analyser) source.connect(this.analyser)
    this.currentSource = source
    this.connectMonitor()
  }

  /** マイクをつなぐ。スピーカーへは出さない（自分の声が回って発振するため）。 */
  attachStream(stream: MediaStream): void {
    const context = this.ensureContext()
    const source = context.createMediaStreamSource(stream)
    this.detachSource()
    if (this.analyser) source.connect(this.analyser)
    this.streamSource = source
    this.currentSource = source
  }

  /** 今のソースを外す。要素ソースは破棄せず保持する（同じ要素で作り直せないため）。 */
  detachSource(): void {
    this.disconnectMonitor()
    if (this.currentSource) {
      try {
        this.currentSource.disconnect()
      } catch {
        // 既に切断済み
      }
    }
    if (this.streamSource && this.streamSource !== this.currentSource) {
      try {
        this.streamSource.disconnect()
      } catch {
        // 既に切断済み
      }
    }
    this.streamSource = null
    this.currentSource = null
  }

  /** モニター音量（0..1）。録画は Analyser → recDest を通るのでこの値の影響を受けない。 */
  setMonitorVolume(v: number): void {
    this.monitorVolume = clamp01(v)
    if (this.gain) this.gain.gain.value = this.monitorVolume
  }

  getMonitorVolume(): number {
    return this.monitorVolume
  }

  /** 毎フレーム呼ばれる。ソース未接続・context 未生成なら 0。 */
  readLevel(sensitivity: number): number {
    if (!this.context || !this.analyser || !this.currentSource) return 0
    if (this.context.state !== 'running') return 0
    if (this.buffer.length !== this.analyser.fftSize) {
      this.buffer = new Float32Array(this.analyser.fftSize)
    }
    return readLevelFrom(this.analyser, this.buffer, sensitivity)
  }

  /** 録画に混ぜる音声トラック。context 未生成なら null。 */
  getRecordingTrack(): MediaStreamTrack | null {
    if (!this.recDest) return null
    return this.recDest.stream.getAudioTracks()[0] ?? null
  }

  hasSource(): boolean {
    return this.currentSource !== null
  }

  dispose(): void {
    this.detachSource()
    if (this.analyser) {
      try {
        this.analyser.disconnect()
      } catch {
        // 既に切断済み
      }
    }
    if (this.gain) {
      try {
        this.gain.disconnect()
      } catch {
        // 既に切断済み
      }
    }
    const context = this.context
    this.context = null
    this.analyser = null
    this.recDest = null
    this.gain = null
    this.elementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()
    this.monitorConnected = false
    if (context) {
      void context.close().catch(() => {
        // 既に閉じている
      })
    }
  }

  private connectMonitor(): void {
    if (!this.analyser || !this.gain || this.monitorConnected) return
    this.analyser.connect(this.gain)
    this.monitorConnected = true
  }

  private disconnectMonitor(): void {
    if (!this.analyser || !this.gain || !this.monitorConnected) return
    try {
      this.analyser.disconnect(this.gain)
    } catch {
      // 未接続なら無視
    }
    this.monitorConnected = false
  }
}
