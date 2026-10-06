import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUDIO_STATE } from '../types/audio'

class FakeNode {
  connect() {}
  disconnect() {}
}

let pendingResume: Promise<void> | null = null

class FakeContext {
  static created: FakeContext[] = []
  state = pendingResume ? 'suspended' : 'running'
  destination = new FakeNode()
  analyser = Object.assign(new FakeNode(), {
    fftSize: 2048,
    getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(0.1),
  })
  gain = Object.assign(new FakeNode(), { gain: { value: 1 } })
  track = { kind: 'audio', stop: vi.fn() }
  elementSourceCount = 0
  streamSourceCount = 0
  constructor() { FakeContext.created.push(this) }
  createAnalyser() { return this.analyser }
  createGain() { return this.gain }
  createMediaStreamDestination() {
    return Object.assign(new FakeNode(), { stream: { getAudioTracks: () => [this.track] } })
  }
  createMediaElementSource() { this.elementSourceCount += 1; return new FakeNode() }
  createMediaStreamSource() { this.streamSourceCount += 1; return new FakeNode() }
  resume = vi.fn(async () => {
    if (pendingResume) await pendingResume
    this.state = 'running'
  })
  close = vi.fn(async () => { this.state = 'closed' })
}

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
  set src(value: string) { this.source = value; this.readyState = 0; this.duration = 0 }
  get src() { return this.source }
  load = vi.fn()
  remove = vi.fn()
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = '' })
  pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  play = vi.fn(async () => {
    this.paused = false
    this.dispatchEvent(new Event('playing'))
  })
  metadata(duration: number) {
    this.duration = duration
    this.readyState = 1
    this.dispatchEvent(new Event('loadedmetadata'))
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function microphone() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), kind: 'audio' })
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream }
}

let cleanup: (() => void) | null = null

async function setup(getUserMedia = vi.fn()) {
  vi.resetModules()
  vi.useFakeTimers()
  FakeContext.created = []
  pendingResume = null
  const elements: FakeAudioElement[] = []
  let urls = 0
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('document', {
    createElement: () => { const audio = new FakeAudioElement(); elements.push(audio); return audio },
    body: { appendChild: vi.fn() },
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:session-${++urls}`)
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const { useAudioAnalyzer: getAnalyzer, clearAudioSession } = await import('./useAudioAnalyzer')
  const { useAudioStore } = await import('../state/audioStore')
  cleanup = clearAudioSession
  return { api: getAnalyzer(), clear: clearAudioSession, store: useAudioStore, elements, revoke }
}

afterEach(() => {
  cleanup?.()
  cleanup = null
  pendingResume = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const audioFile = (name = 'input.wav') => new File(['test audio'], name, { type: 'audio/wav' })

describe('clearAudioSession', () => {
  it('再生中の要素・URL・トラック・Context・タイマーを解放して初期状態へ戻す', async () => {
    const { api, clear, store, elements, revoke } = await setup()
    const load = api.loadFile(audioFile())
    const audio = elements[0]
    audio.metadata(10)
    await load
    await api.play()
    api.setVolume(0.2)
    api.setSensitivity(7)
    expect(vi.getTimerCount()).toBe(1)
    const context = FakeContext.created[0]

    clear()

    expect(store.getState()).toMatchObject(DEFAULT_AUDIO_STATE)
    expect(audio.paused).toBe(true)
    expect(audio.src).toBe('')
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
    expect(audio.remove).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:session-1')
    expect(context.close).toHaveBeenCalledOnce()
    expect(context.track.stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(api.getRecordingTrack()).toBeNull()
    expect(api.getLevel()).toBe(0)
    clear()
    expect(revoke).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('メタデータ待ちを中断し、遅れた読み込み完了で素材を復活させない', async () => {
    const { api, clear, store, elements, revoke } = await setup()
    const loading = api.loadFile(audioFile())
    expect(store.getState().playback).toBe('loading')
    clear()
    await loading
    elements[0].metadata(99)
    elements[0].dispatchEvent(new Event('durationchange'))
    expect(store.getState()).toMatchObject(DEFAULT_AUDIO_STATE)
    expect(revoke).toHaveBeenCalledWith('blob:session-1')
    expect(FakeContext.created).toHaveLength(0)
  })

  it('AudioContext 再開待ちの再生を失効させる', async () => {
    const { api, clear, store, elements } = await setup()
    const loading = api.loadFile(audioFile())
    elements[0].metadata(10)
    await loading
    const pending = deferred<void>()
    const context = FakeContext.created[0]
    context.state = 'suspended'
    context.resume.mockImplementationOnce(() => pending.promise)
    const playing = api.play()
    clear()
    pending.resolve()
    await playing
    expect(elements[0].play).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject(DEFAULT_AUDIO_STATE)
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('撤回後に許可されたマイクは直ちに停止し、再接続しない', async () => {
    const permission = deferred<MediaStream>()
    const { api, clear, store } = await setup(vi.fn(() => permission.promise))
    const starting = api.startMic()
    clear()
    const late = microphone()
    permission.resolve(late.stream)
    await starting
    expect(late.track.stop).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject(DEFAULT_AUDIO_STATE)
    expect(FakeContext.created).toHaveLength(0)
  })

  it('マイク取得後のContext再開待ちでもトラックをその場で停止する', async () => {
    const device = microphone()
    const { api, clear, store } = await setup(vi.fn(async () => device.stream))
    const resume = deferred<void>()
    pendingResume = resume.promise
    const starting = api.startMic()
    await Promise.resolve()
    expect(FakeContext.created).toHaveLength(1)
    clear()
    expect(device.track.stop).toHaveBeenCalled()
    expect(FakeContext.created[0].close).toHaveBeenCalledOnce()
    resume.resolve()
    await starting
    expect(store.getState()).toMatchObject(DEFAULT_AUDIO_STATE)
    expect(FakeContext.created[0].streamSourceCount).toBe(0)
  })

  it('稼働中のマイクと遅れた切断イベントを処理する', async () => {
    const device = microphone()
    const { api, clear, store } = await setup(vi.fn(async () => device.stream))
    await api.startMic()
    expect(store.getState().mic).toBe('live')
    clear()
    device.track.dispatchEvent(new Event('ended'))
    expect(device.track.stop).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject(DEFAULT_AUDIO_STATE)
    expect(FakeContext.created[0].close).toHaveBeenCalledOnce()
  })

  it('新しい要素で再読込・再生でき、旧要素の全イベントは新セッションを変更しない', async () => {
    const { api, clear, store, elements } = await setup()
    const firstLoad = api.loadFile(audioFile('first.wav'))
    const previous = elements[0]
    previous.metadata(10)
    await firstLoad
    await api.play()
    const previousEnded = vi.fn()
    api.onEnded(previousEnded)
    clear()

    const nextLoad = api.loadFile(audioFile('second.wav'))
    const current = elements[1]
    current.metadata(42)
    await nextLoad
    await api.play()
    const currentEnded = vi.fn()
    api.onEnded(currentEnded)
    const before = store.getState()

    previous.src = 'blob:stale'
    previous.duration = 99
    previous.currentTime = 88
    previous.paused = false
    for (const event of ['play', 'playing', 'pause', 'ended', 'timeupdate', 'seeked', 'durationchange', 'error']) {
      previous.dispatchEvent(new Event(event))
    }
    expect(store.getState()).toBe(before)
    expect(previousEnded).not.toHaveBeenCalled()
    expect(currentEnded).not.toHaveBeenCalled()
    expect(FakeContext.created).toHaveLength(2)
    expect(FakeContext.created[1].elementSourceCount).toBe(1)
    expect(api.getRecordingTrack()).toBe(FakeContext.created[1].track)
    expect(api.getLevel()).toBeCloseTo(0.3, 6)
    current.currentTime = 3
    vi.advanceTimersByTime(100)
    expect(store.getState().currentTime).toBe(3)
    current.ended = true
    current.dispatchEvent(new Event('ended'))
    expect(currentEnded).toHaveBeenCalledOnce()
    expect(previousEnded).not.toHaveBeenCalled()
  })
})
