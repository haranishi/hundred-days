import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AudioGraph,
  computeRms,
  normalizeLevel,
  readLevelFrom,
  type TimeDomainAnalyser,
} from './audio'

/** 振幅 amplitude・周期数 cycles の正弦波を length サンプル分作る。 */
function sine(length: number, amplitude: number, cycles = 4): Float32Array {
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * cycles * i) / length)
  }
  return samples
}

/** 渡されたバッファを一定値で埋めるだけの偽アナライザ。 */
function fakeAnalyser(fftSize: number, fill: number): TimeDomainAnalyser {
  return {
    fftSize,
    getFloatTimeDomainData(buffer: Float32Array) {
      buffer.fill(fill)
    },
  }
}

describe('computeRms', () => {
  it('無音と空配列は 0', () => {
    expect(computeRms(new Float32Array(512))).toBe(0)
    expect(computeRms(new Float32Array(0))).toBe(0)
  })

  it('振幅 A の正弦波は A/√2 になる', () => {
    const amplitude = 0.5
    expect(computeRms(sine(2048, amplitude))).toBeCloseTo(amplitude / Math.SQRT2, 4)
  })

  it('直流 1 は 1', () => {
    const samples = new Float32Array(64)
    samples.fill(1)
    expect(computeRms(samples)).toBe(1)
  })
})

describe('normalizeLevel', () => {
  it('感度を掛けた値を返す', () => {
    expect(normalizeLevel(0.1, 3)).toBeCloseTo(0.3, 6)
  })

  it('0..1 に収める', () => {
    expect(normalizeLevel(0.5, 3)).toBe(1)
    expect(normalizeLevel(-0.2, 3)).toBe(0)
    expect(normalizeLevel(0.1, 0)).toBe(0)
    expect(normalizeLevel(-0.2, -3)).toBe(0)
  })

  it('数値でない入力は 0', () => {
    expect(normalizeLevel(Number.NaN, 3)).toBe(0)
    expect(normalizeLevel(0.1, Number.NaN)).toBe(0)
  })
})

describe('readLevelFrom', () => {
  it('アナライザの波形から正規化レベルを返す', () => {
    const buffer = new Float32Array(1024)
    // 一定値 0.2 → RMS 0.2 → 感度 3 で 0.6
    expect(readLevelFrom(fakeAnalyser(1024, 0.2), buffer, 3)).toBeCloseTo(0.6, 6)
    expect(readLevelFrom(fakeAnalyser(1024, 0), buffer, 3)).toBe(0)
  })

  it('fftSize がバッファより短いときは先頭 fftSize 分だけ見る', () => {
    const buffer = new Float32Array(8)
    buffer.fill(1) // 後半は前回の残り（大きい値）
    const analyser: TimeDomainAnalyser = {
      fftSize: 4,
      getFloatTimeDomainData(target: Float32Array) {
        target.fill(0, 0, 4) // 実機と同じく fftSize 分しか書き込まない
      },
    }
    expect(readLevelFrom(analyser, buffer, 3)).toBe(0)
  })
})

// --- AudioGraph の配線（偽 AudioContext） ---------------------------------
// マイクをスピーカーへ出すとハウリングするので、配線だけはここで固定しておく。

class FakeNode {
  outputs: FakeNode[] = []
  connect(target: FakeNode): FakeNode {
    this.outputs.push(target)
    return target
  }
  disconnect(target?: FakeNode): void {
    this.outputs = target ? this.outputs.filter((node) => node !== target) : []
  }
  connectedTo(target: FakeNode): boolean {
    return this.outputs.includes(target)
  }
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  getFloatTimeDomainData(buffer: Float32Array): void {
    buffer.fill(0.1)
  }
}

class FakeContext extends FakeNode {
  state = 'running'
  destination = new FakeNode()
  analyser = new FakeAnalyser()
  gain = Object.assign(new FakeNode(), { gain: { value: 1 } })
  track = { kind: 'audio', stop() {} }
  recDest = Object.assign(new FakeNode(), {
    stream: { getAudioTracks: () => [this.track] },
  })
  elementSourceCount = 0
  streamSourceCount = 0
  createAnalyser(): FakeAnalyser {
    return this.analyser
  }
  createGain(): FakeNode {
    return this.gain
  }
  createMediaStreamDestination(): FakeNode {
    return this.recDest
  }
  createMediaElementSource(): FakeNode {
    this.elementSourceCount += 1
    return new FakeNode()
  }
  createMediaStreamSource(): FakeNode {
    this.streamSourceCount += 1
    return new FakeNode()
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

let lastContext: FakeContext | null = null
let cleanupAnalyzer: (() => void) | null = null

function installFakeAudioContext(): void {
  const scope = globalThis as unknown as { AudioContext?: unknown }
  scope.AudioContext = function FakeAudioContextCtor(this: unknown) {
    lastContext = new FakeContext()
    return lastContext
  } as unknown as typeof AudioContext
}

afterEach(() => {
  cleanupAnalyzer?.()
  cleanupAnalyzer = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  const scope = globalThis as unknown as { AudioContext?: unknown }
  delete scope.AudioContext
  lastContext = null
})

describe('AudioGraph の配線', () => {
  it('ファイルはスピーカーへ出し、マイクは出さない', () => {
    installFakeAudioContext()
    const graph = new AudioGraph()
    const el = {} as HTMLAudioElement

    graph.attachElement(el)
    const ctx = lastContext as unknown as FakeContext
    expect(ctx.analyser.connectedTo(ctx.recDest)).toBe(true) // 録画には常に流す
    expect(ctx.analyser.connectedTo(ctx.gain)).toBe(true) // モニターへ流す
    expect(graph.getRecordingTrack()).toBe(ctx.track)

    graph.attachStream({} as MediaStream)
    expect(ctx.analyser.connectedTo(ctx.recDest)).toBe(true)
    expect(ctx.analyser.connectedTo(ctx.gain)).toBe(false) // ハウリング防止
  })

  it('同じ要素なら MediaElementSource を作り直さない', () => {
    installFakeAudioContext()
    const graph = new AudioGraph()
    const el = {} as HTMLAudioElement

    graph.attachElement(el)
    graph.detachSource()
    graph.attachElement(el)

    expect((lastContext as unknown as FakeContext).elementSourceCount).toBe(1)
  })

  it('ソース未接続なら readLevel は 0', () => {
    installFakeAudioContext()
    const graph = new AudioGraph()
    expect(graph.readLevel(3)).toBe(0) // context 未生成

    graph.attachElement({} as HTMLAudioElement)
    expect(graph.readLevel(3)).toBeCloseTo(0.3, 6) // 0.1 の直流 × 感度3

    graph.detachSource()
    expect(graph.readLevel(3)).toBe(0)
  })

  it('AudioContext が停止中なら直前の波形が残っていても 0', () => {
    installFakeAudioContext()
    const graph = new AudioGraph()
    graph.attachElement({} as HTMLAudioElement)
    const context = lastContext as unknown as FakeContext
    context.state = 'suspended'
    expect(graph.readLevel(3)).toBe(0)
  })

  it('モニター音量を下げても録画経路はつながったまま', () => {
    installFakeAudioContext()
    const graph = new AudioGraph()
    graph.setMonitorVolume(0.4)
    graph.attachElement({} as HTMLAudioElement)
    const context = lastContext as unknown as FakeContext
    expect(context.gain.gain.value).toBe(0.4)
    graph.setMonitorVolume(0)
    expect(context.gain.gain.value).toBe(0)
    expect(context.analyser.connectedTo(context.recDest)).toBe(true)
  })
})

// ブラウザの許可ダイアログ・メタデータ読込は後から完了するため、
// その途中で入力を切り替えても古い操作が復活しないことを検証する。
class FakeAudioElement extends EventTarget {
  private source = ''
  readyState = 0
  duration = 0
  currentTime = 0
  paused = true
  ended = false
  hidden = false
  preload = ''
  style = { display: '' }

  set src(value: string) {
    this.source = value
    this.readyState = 0
    this.duration = 0
  }
  get src(): string { return this.source }
  load(): void {}
  pause(): void {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  async play(): Promise<void> {
    this.paused = false
    this.dispatchEvent(new Event('playing'))
  }
  metadata(duration: number): void {
    this.duration = duration
    this.readyState = 1
    this.dispatchEvent(new Event('loadedmetadata'))
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function fakeMicrophone() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), kind: 'audio' })
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

async function setupAnalyzer(getUserMedia = vi.fn()) {
  vi.resetModules()
  installFakeAudioContext()
  const audio = new FakeAudioElement()
  vi.stubGlobal('document', { createElement: () => audio, body: { appendChild: vi.fn() } })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  let nextUrl = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++nextUrl}`)
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // このAPIはReactの内部フックを使わず、モジュール単位の音声実体を返す。
  const { useAudioAnalyzer: getAnalyzer } = await import('../hooks/useAudioAnalyzer')
  const { useAudioStore } = await import('../state/audioStore')
  const api = getAnalyzer()
  cleanupAnalyzer = () => { api.pause(); api.stopMic() }
  return { audio, api, store: useAudioStore, revoke }
}

describe('useAudioAnalyzer の非同期切替', () => {
  it('マイク許可待ちからファイルに戻したら遅れて届いたストリームを停止する', async () => {
    const pending = deferred<MediaStream>()
    const { api, store } = await setupAnalyzer(vi.fn(() => pending.promise))
    const start = api.startMic()
    expect(store.getState().mic).toBe('requesting')
    api.setMode('file')
    const microphone = fakeMicrophone()
    pending.resolve(microphone.stream)
    await start
    expect(microphone.track.stop).toHaveBeenCalledOnce()
    expect(store.getState().mode).toBe('file')
    expect(store.getState().mic).toBe('off')
    expect(api.getLevel()).toBe(0)
  })

  it('マイク開始をキャンセルした後の拒否で新しい状態を壊さない', async () => {
    const pending = deferred<MediaStream>()
    const { api, store } = await setupAnalyzer(vi.fn(() => pending.promise))
    const start = api.startMic()
    api.stopMic()
    pending.reject(new DOMException('denied', 'NotAllowedError'))
    await start
    expect(store.getState().mic).toBe('off')
    expect(store.getState().errorMessage).toBeNull()
  })

  it('マイク要求を重複して作らず、デバイス切断も反映する', async () => {
    const microphone = fakeMicrophone()
    const getUserMedia = vi.fn(async () => microphone.stream)
    const { api, store } = await setupAnalyzer(getUserMedia)
    await Promise.all([api.startMic(), api.startMic()])
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(store.getState().mic).toBe('live')
    microphone.track.dispatchEvent(new Event('ended'))
    expect(store.getState().mic).toBe('error')
    expect(microphone.track.stop).toHaveBeenCalledOnce()
    expect(api.getLevel()).toBe(0)
  })

  it('読込途中でマイクに切り替えても完了時にファイルモードへ戻らない', async () => {
    const { audio, api, store } = await setupAnalyzer()
    const loading = api.loadFile(new File(['audio'], 'voice.wav', { type: 'audio/wav' }))
    api.setMode('mic')
    audio.metadata(3.5)
    await loading
    expect(store.getState().mode).toBe('mic')
    expect(store.getState().file?.duration).toBe(3.5)
    expect(store.getState().playback).toBe('ready')
    expect(api.getLevel()).toBe(0)
  })

  it('裏で完了した音声読込がマイクの拒否メッセージを消さない', async () => {
    const getUserMedia = vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError') })
    const { audio, api, store } = await setupAnalyzer(getUserMedia)
    const loading = api.loadFile(new File(['audio'], 'voice.wav', { type: 'audio/wav' }))
    await api.startMic()
    const message = store.getState().errorMessage
    expect(store.getState().mic).toBe('denied')
    audio.metadata(3.5)
    await loading
    expect(store.getState().errorMessage).toBe(message)
    expect(store.getState().mode).toBe('mic')
  })

  it('古いファイル読込を解放し、最後に選んだファイルだけを反映する', async () => {
    const { audio, api, store, revoke } = await setupAnalyzer()
    const first = api.loadFile(new File(['one'], 'first.wav', { type: 'audio/wav' }))
    const second = api.loadFile(new File(['two'], 'second.wav', { type: 'audio/wav' }))
    audio.metadata(12)
    await Promise.all([first, second])
    expect(store.getState().file?.name).toBe('second.wav')
    expect(store.getState().file?.duration).toBe(12)
    expect(revoke).toHaveBeenCalledWith('blob:test-1')
  })

  it('再生・一時停止・終端からのシークを状態に反映し、停止中のレベルは0', async () => {
    const { audio, api, store } = await setupAnalyzer()
    const loading = api.loadFile(new File(['audio'], 'voice.wav', { type: 'audio/wav' }))
    audio.metadata(10)
    await loading
    await api.play()
    expect(store.getState().playback).toBe('playing')
    expect(api.getLevel()).toBeCloseTo(0.3, 6)
    api.pause()
    expect(store.getState().playback).toBe('paused')
    expect(api.getLevel()).toBe(0)
    store.getState().patch({ playback: 'ended' })
    api.seek(4)
    expect(store.getState().currentTime).toBe(4)
    expect(store.getState().playback).toBe('paused')
    await api.restart()
    expect(store.getState().currentTime).toBe(0)
    expect(store.getState().playback).toBe('playing')
  })

  it('AudioContext の再開待ちで一時停止したら後から再生しない', async () => {
    const { audio, api, store } = await setupAnalyzer()
    const loading = api.loadFile(new File(['audio'], 'voice.wav', { type: 'audio/wav' }))
    audio.metadata(10)
    await loading
    const context = lastContext as unknown as FakeContext
    const pendingResume = deferred<void>()
    context.state = 'suspended'
    context.resume = () => pendingResume.promise
    const playing = api.play()
    api.pause()
    pendingResume.resolve()
    await playing
    expect(audio.paused).toBe(true)
    expect(store.getState().playback).toBe('ready')
  })
})
