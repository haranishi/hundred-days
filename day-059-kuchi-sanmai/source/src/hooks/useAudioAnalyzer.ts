// 音声入力の唯一の窓口。AudioGraph と非表示の <audio> をモジュール単位のシングルトンで持ち、
// どのコンポーネントから呼んでも同じ実体・同じ関数参照を返す。

import { AudioGraph } from '../lib/audio'
import { useAudioStore } from '../state/audioStore'
import { DEFAULT_AUDIO_STATE, type AudioMode, type AudioState } from '../types/audio'

export interface AudioAnalyzerApi {
  /** 毎フレーム同期で呼ぶ。0..1。 */
  getLevel(): number
  getRecordingTrack(): MediaStreamTrack | null
  loadFile(file: File): Promise<void>
  play(): Promise<void>
  pause(): void
  seek(sec: number): void
  restart(): Promise<void>
  setVolume(v: number): void
  setSensitivity(v: number): void
  /** 再生終了の購読。戻り値を呼ぶと解除。 */
  onEnded(cb: () => void): () => void
  startMic(): Promise<void>
  stopMic(): void
  setMode(mode: AudioMode): void
}

/** currentTime をストアへ流す間隔（約10回/秒）。 */
const TIME_UPDATE_INTERVAL_MS = 100

const MESSAGES = {
  loadFailed: '音声ファイルを読み込めませんでした。対応した形式か確認してください。',
  playFailed: '再生を開始できませんでした。もう一度ボタンを押してください。',
  graphFailed: '音声の解析を開始できませんでした。ページを再読み込みしてください。',
  micDenied: 'マイクの使用が許可されませんでした。ブラウザの設定で許可してください。',
  micFailed: 'マイクを開始できませんでした。デバイスの接続を確認してください。',
} as const

const graph = new AudioGraph()
const endedListeners = new Set<() => void>()

let element: HTMLAudioElement | null = null
let elementAttached = false
let objectUrl: string | null = null
let micStream: MediaStream | null = null
let pendingMicStream: MediaStream | null = null
let sensitivity = DEFAULT_AUDIO_STATE.sensitivity
let loadToken = 0
let playToken = 0
let micToken = 0
let lastTimePush = 0
let timeUpdateTimer: ReturnType<typeof setInterval> | null = null
let cancelMetadataWait: (() => void) | null = null

function patch(partial: Partial<AudioState>): void {
  useAudioStore.getState().patch(partial)
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  return value > max ? max : value
}

function errorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    return String((err as { name?: unknown }).name)
  }
  return ''
}

function durationOf(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
}

function notifyEnded(): void {
  for (const listener of [...endedListeners]) {
    listener()
  }
}

function stopTimeUpdates(): void {
  if (timeUpdateTimer !== null) clearInterval(timeUpdateTimer)
  timeUpdateTimer = null
}

function startTimeUpdates(audio: HTMLAudioElement): void {
  stopTimeUpdates()
  timeUpdateTimer = setInterval(() => {
    if (element !== audio) return
    if (audio.paused || useAudioStore.getState().mode !== 'file') {
      stopTimeUpdates()
      return
    }
    patch({ currentTime: audio.currentTime })
  }, TIME_UPDATE_INTERVAL_MS)
}

// --- 要素 ---------------------------------------------------------------

/** DOM 参照は必ずこの中だけ。import しただけの SSR / テスト環境では触らない。 */
function ensureElement(): HTMLAudioElement | null {
  if (element) return element
  if (typeof document === 'undefined') return null
  const audio = document.createElement('audio')
  audio.preload = 'auto'
  audio.hidden = true
  audio.style.display = 'none'
  bindElementEvents(audio)
  document.body?.appendChild(audio)
  element = audio
  return audio
}

function bindElementEvents(audio: HTMLAudioElement): void {
  const markPlaying = () => {
    if (element !== audio || audio.paused || useAudioStore.getState().mode !== 'file') return
    patch({ playback: 'playing', errorMessage: null })
    startTimeUpdates(audio)
  }
  audio.addEventListener('play', markPlaying)
  audio.addEventListener('playing', markPlaying)

  audio.addEventListener('pause', () => {
    if (element !== audio) return
    stopTimeUpdates()
    // 末尾まで再生したときは pause → ended の順に飛んでくるので、ended を優先する。
    const playback = useAudioStore.getState().playback
    if (audio.ended || playback === 'ended' || playback === 'loading' || playback === 'error' || playback === 'idle') return
    patch({ playback: 'paused', currentTime: audio.currentTime })
  })

  audio.addEventListener('ended', () => {
    if (element !== audio) return
    stopTimeUpdates()
    patch({ playback: 'ended', currentTime: audio.currentTime })
    if (useAudioStore.getState().mode === 'file') notifyEnded()
  })

  audio.addEventListener('timeupdate', () => {
    if (element !== audio) return
    const t = now()
    if (t - lastTimePush < TIME_UPDATE_INTERVAL_MS) return
    lastTimePush = t
    patch({ currentTime: audio.currentTime })
  })

  audio.addEventListener('seeked', () => {
    if (element !== audio) return
    patch({ currentTime: audio.currentTime })
  })

  audio.addEventListener('durationchange', () => {
    if (element !== audio) return
    const file = useAudioStore.getState().file
    const duration = durationOf(audio)
    if (file && duration > 0 && file.duration !== duration) {
      patch({ file: { ...file, duration } })
    }
  })

  audio.addEventListener('error', () => {
    if (element !== audio || !audio.src) return
    stopTimeUpdates()
    patch({ playback: 'error', ...(useAudioStore.getState().mode === 'file' ? { errorMessage: MESSAGES.loadFailed } : {}) })
  })
}

function waitForMetadata(audio: HTMLAudioElement): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    if (audio.readyState >= 1) {
      resolve(durationOf(audio))
      return
    }
    function cleanup(): void {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onError)
      if (cancelMetadataWait === cancel) cancelMetadataWait = null
    }
    function onLoaded(): void {
      cleanup()
      resolve(durationOf(audio))
    }
    function onError(): void {
      cleanup()
      reject(new Error('audio load failed'))
    }
    function cancel(): void {
      cleanup()
      reject(new DOMException('Audio load cancelled', 'AbortError'))
    }
    cancelMetadataWait = cancel
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('error', onError)
  })
}

// --- グラフ接続 ---------------------------------------------------------

function attachElementToGraph(): boolean {
  const audio = element
  if (!audio || !audio.src) return false
  if (elementAttached) return true
  try {
    graph.attachElement(audio)
    elementAttached = true
    return true
  } catch {
    patch({ errorMessage: MESSAGES.graphFailed })
    return false
  }
}

function detachFromGraph(): void {
  graph.detachSource()
  elementAttached = false
}

// --- API ----------------------------------------------------------------

function getLevel(): number {
  const state = useAudioStore.getState()
  if (state.mode === 'file' && state.playback !== 'playing') return 0
  if (state.mode === 'mic' && state.mic !== 'live') return 0
  return graph.readLevel(sensitivity)
}

function getRecordingTrack(): MediaStreamTrack | null {
  return graph.getRecordingTrack()
}

async function loadFile(file: File): Promise<void> {
  const audio = ensureElement()
  if (!audio) return

  pause()
  stopMic()
  loadToken += 1
  const token = loadToken
  cancelMetadataWait?.()

  const url = URL.createObjectURL(file)
  const previousUrl = objectUrl
  objectUrl = url

  patch({
    mode: 'file',
    file: { name: file.name, objectUrl: url, duration: 0 },
    playback: 'loading',
    currentTime: 0,
    errorMessage: null,
  })

  audio.src = url
  audio.load()
  // 新しい src を割り当てた後に古い URL を解放する（先に revoke すると古い読み込みが error を投げる）。
  if (previousUrl) URL.revokeObjectURL(previousUrl)

  try {
    const duration = await waitForMetadata(audio)
    if (token !== loadToken) return
    patch({
      file: { name: file.name, objectUrl: url, duration },
      playback: 'ready',
      currentTime: 0,
      ...(useAudioStore.getState().mode === 'file' ? { errorMessage: null } : {}),
    })
    if (useAudioStore.getState().mode === 'file') attachElementToGraph()
  } catch {
    if (token !== loadToken) return
    patch({ playback: 'error', ...(useAudioStore.getState().mode === 'file' ? { errorMessage: MESSAGES.loadFailed } : {}) })
  }
}

async function play(): Promise<void> {
  const audio = element
  if (!audio || !audio.src) return
  if (useAudioStore.getState().mode !== 'file') return
  if (!attachElementToGraph()) return
  const token = ++playToken
  try {
    await graph.resume()
    if (token !== playToken || useAudioStore.getState().mode !== 'file') return
    await audio.play()
    if (token !== playToken || audio.paused || useAudioStore.getState().mode !== 'file') return
    patch({ playback: 'playing', errorMessage: null })
    startTimeUpdates(audio)
  } catch (err) {
    if (token !== playToken) return
    // 別の操作で中断されただけなら黙って無視する。
    if (errorName(err) === 'AbortError') return
    patch({ playback: 'paused', errorMessage: MESSAGES.playFailed })
  }
}

function pause(): void {
  playToken += 1
  stopTimeUpdates()
  const audio = element
  if (!audio) return
  audio.pause()
}

function seek(sec: number): void {
  const audio = element
  if (!audio) return
  const duration = durationOf(audio)
  const next = clamp(sec, 0, duration > 0 ? duration : Number.MAX_SAFE_INTEGER)
  try {
    audio.currentTime = next
  } catch {
    // 読み込み前などシーク不可の場合は無視
  }
  const playback = useAudioStore.getState().playback
  if (playback === 'ended') {
    patch({ currentTime: next, playback: 'paused' })
  } else {
    patch({ currentTime: next })
  }
}

async function restart(): Promise<void> {
  seek(0)
  await play()
}

function setVolume(v: number): void {
  const volume = clamp(v, 0, 1)
  graph.setMonitorVolume(volume)
  patch({ volume })
}

function setSensitivity(v: number): void {
  const next = clamp(v, 0, 20)
  sensitivity = next
  patch({ sensitivity: next })
}

function onEnded(cb: () => void): () => void {
  endedListeners.add(cb)
  return () => {
    endedListeners.delete(cb)
  }
}

async function startMic(): Promise<void> {
  if (micStream || useAudioStore.getState().mic === 'requesting') return
  pause()
  detachFromGraph()
  const token = ++micToken
  patch({ mode: 'mic', mic: 'requesting', errorMessage: null })
  let requestedStream: MediaStream | null = null
  try {
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    if (!media?.getUserMedia) throw new Error('getUserMedia is unavailable')
    requestedStream = await media.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
    if (token !== micToken || useAudioStore.getState().mode !== 'mic') {
      for (const track of requestedStream.getTracks()) track.stop()
      return
    }
    pendingMicStream = requestedStream
    await graph.resume()
    if (token !== micToken || useAudioStore.getState().mode !== 'mic') {
      for (const track of requestedStream.getTracks()) track.stop()
      return
    }
    graph.attachStream(requestedStream)
    micStream = requestedStream
    for (const track of requestedStream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (token !== micToken || micStream !== requestedStream) return
        stopMic()
        patch({ mic: 'error', errorMessage: 'マイクとの接続が切れました。接続を確認して開始し直してください。' })
      }, { once: true })
    }
    patch({ mic: 'live', errorMessage: null })
  } catch (err) {
    if (requestedStream) {
      for (const track of requestedStream.getTracks()) track.stop()
    }
    if (token !== micToken) return
    micStream = null
    detachFromGraph()
    const name = errorName(err)
    const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError'
    patch({
      mic: denied ? 'denied' : 'error',
      errorMessage: denied ? MESSAGES.micDenied : MESSAGES.micFailed,
    })
  } finally {
    if (pendingMicStream === requestedStream) pendingMicStream = null
  }
}

function stopMic(): void {
  micToken += 1
  if (micStream) {
    for (const track of micStream.getTracks()) {
      track.stop()
    }
    micStream = null
    detachFromGraph()
  }
  if (useAudioStore.getState().mic !== 'off') {
    patch({ mic: 'off' })
  }
  if (useAudioStore.getState().mode === 'file') {
    attachElementToGraph()
  }
}

function setMode(mode: AudioMode): void {
  if (mode === useAudioStore.getState().mode) return
  if (mode === 'file') {
    stopMic()
    patch({ mode: 'file', errorMessage: null })
    attachElementToGraph()
  } else {
    pause()
    detachFromGraph()
    patch({ mode: 'mic', errorMessage: null })
  }
}

/** 読み込み待ちを含めた音声セッション全体を破棄する。再利用時は新しい要素とグラフを作る（100日チャレンジ版では同意の撤回が無いので、いまは単体テストだけが呼ぶ）。 */
export function clearAudioSession(): void {
  loadToken += 1
  playToken += 1
  micToken += 1
  cancelMetadataWait?.()
  cancelMetadataWait = null
  stopTimeUpdates()
  lastTimePush = 0

  // pause/load/track.stop による遅延イベントより先に、旧実体を現在のセッションから外す。
  const previousElement = element
  const previousStreams = new Set([micStream, pendingMicStream])
  element = null
  elementAttached = false
  micStream = null
  pendingMicStream = null
  endedListeners.clear()

  for (const stream of previousStreams) {
    if (stream) for (const track of stream.getTracks()) track.stop()
  }
  if (previousElement) {
    previousElement.pause()
    previousElement.removeAttribute('src')
    previousElement.load()
    previousElement.remove()
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null
  graph.getRecordingTrack()?.stop()
  graph.dispose()
  useAudioStore.getState().reset()
}

const api: AudioAnalyzerApi = {
  getLevel,
  getRecordingTrack,
  loadFile,
  play,
  pause,
  seek,
  restart,
  setVolume,
  setSensitivity,
  onEnded,
  startMic,
  stopMic,
  setMode,
}

// UI がストアを直接書き換えても実体がずれないように同期させる（感度は毎フレーム読むのでモジュール変数に置く）。
useAudioStore.subscribe((state) => {
  sensitivity = state.sensitivity
  if (state.volume !== graph.getMonitorVolume()) {
    graph.setMonitorVolume(state.volume)
  }
})

/** 参照はモジュール定数。依存配列に入れても再生成されない。 */
export function useAudioAnalyzer(): AudioAnalyzerApi {
  return api
}
