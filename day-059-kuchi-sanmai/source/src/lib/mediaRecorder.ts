// 録画（canvas.captureStream + MediaRecorder）まわりのロジック。
// ブラウザ API への依存はすべて引数で差し替えられるようにして、node 環境でテストできる状態を保つ。

import { MIME_CANDIDATES, RECORDING_FPS } from '../types/recording'

export type RecordingExtension = 'mp4' | 'webm'

export interface RecordingStartOptions {
  /** MediaRecorder.start(timeslice)。小刻みに chunk を受け取っておくと停止時の取りこぼしが減る */
  timesliceMs?: number
  videoBitsPerSecond?: number
}

export const RECORDER_UNSUPPORTED_MESSAGE = 'このブラウザは録画（MediaRecorder）に対応していません'

const DEFAULT_TIMESLICE_MS = 250
const DEFAULT_VIDEO_BPS = 8_000_000

function defaultIsSupported(mime: string): boolean {
  if (typeof MediaRecorder === 'undefined') return false
  if (typeof MediaRecorder.isTypeSupported !== 'function') return false
  try {
    return MediaRecorder.isTypeSupported(mime)
  } catch {
    return false
  }
}

/** 候補を優先順に試し、最初に対応しているものを返す。MediaRecorder が無い環境では null。 */
export function pickSupportedMimeType(
  candidates: readonly string[] = MIME_CANDIDATES,
  isSupported: (mime: string) => boolean = defaultIsSupported,
): string | null {
  for (const candidate of candidates) {
    if (isSupported(candidate)) return candidate
  }
  return null
}

export function extensionForMime(mime: string): RecordingExtension {
  return mime.toLowerCase().includes('mp4') ? 'mp4' : 'webm'
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** character-animation-YYYYMMDD-HHmmss.<ext>（ローカル時刻） */
export function buildFileName(date: Date, ext: string): string {
  const ymd = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  const hms = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  return `character-animation-${ymd}-${hms}.${ext}`
}

/** キャンバス映像＋（あれば）音声トラックの録画用ストリームを作る。 */
export function createRecordingStream(
  canvas: HTMLCanvasElement,
  audioTrack: MediaStreamTrack | null,
  fps: number = RECORDING_FPS,
): MediaStream {
  if (typeof canvas.captureStream !== 'function') throw new Error('このブラウザはキャンバスの録画に対応していません。')
  if (audioTrack?.readyState === 'ended') throw new Error('音声が停止しています。音声を読み込むかマイクを開始してください。')
  const stream = canvas.captureStream(fps)
  let clone: MediaStreamTrack | null = null
  try {
    // 解析グラフのトラックは所有しない。録画専用コピーだけを停止できるようにする。
    if (audioTrack) {
      clone = audioTrack.clone()
      stream.addTrack(clone)
    }
    return stream
  } catch (error) {
    clone?.stop()
    for (const track of stream.getTracks()) track.stop()
    throw error
  }
}

/** mimeType が使えないときに MediaRecorder が投げてくるエラーか（ブラウザによって種類が違う） */
function isMimeRejection(error: unknown): boolean {
  if (error instanceof TypeError) return true
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'NotSupportedError'
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

function resolveRecorderCtor(): typeof MediaRecorder {
  if (typeof MediaRecorder === 'undefined') throw new Error(RECORDER_UNSUPPORTED_MESSAGE)
  return MediaRecorder
}

/**
 * MediaRecorder の薄いラッパー。
 * - コンストラクタで実装を注入できる（テスト用の偽 MediaRecorder を渡せる）
 * - 候補 mime を順に試し、対応していなければ次へ送る
 * - stop() は onstop を待って 1 本の Blob を返す。二重呼び出しでも同じ Promise を返す
 */
export class Recording {
  /** 実際に採用した mime。start() 前は null */
  mimeType: string | null = null

  private recorderCtor: typeof MediaRecorder
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stopPromise: Promise<Blob> | null = null
  private settle: { resolve: (blob: Blob) => void; reject: (error: Error) => void } | null = null
  private errorMessage: string | null = null
  private finished = false
  private output: Blob | null = null

  constructor(recorderCtor?: typeof MediaRecorder) {
    this.recorderCtor = recorderCtor ?? resolveRecorderCtor()
  }

  get error(): string | null {
    return this.errorMessage
  }

  get active(): boolean {
    return this.recorder !== null && !this.finished && this.stopPromise === null
  }

  /** 録画を開始し、採用した mime を返す。全候補が使えなければ throw。 */
  start(
    stream: MediaStream,
    candidates: readonly string[] = MIME_CANDIDATES,
    options: RecordingStartOptions = {},
  ): string {
    if (this.recorder) throw new Error('すでに録画を開始しています')
    const timesliceMs = options.timesliceMs ?? DEFAULT_TIMESLICE_MS
    const videoBitsPerSecond = options.videoBitsPerSecond ?? DEFAULT_VIDEO_BPS

    let lastError: unknown = null
    for (const mime of candidates) {
      let recorder: MediaRecorder | null = null
      try {
        recorder = new this.recorderCtor(stream, { mimeType: mime, videoBitsPerSecond })
        this.recorder = recorder
        this.mimeType = recorder.mimeType || mime
        this.attach(recorder)
        recorder.start(timesliceMs)
      } catch (error) {
        if (recorder) {
          this.detach(recorder)
          if (recorder.state !== 'inactive') {
            try { recorder.stop() } catch { /* 開始に失敗した候補の後始末。 */ }
          }
        }
        this.recorder = null
        this.mimeType = null
        this.chunks = []
        this.finished = false
        this.output = null
        this.errorMessage = null
        lastError = error
        if (isMimeRejection(error)) continue
        throw error
      }
      this.mimeType = recorder.mimeType || mime
      return this.mimeType
    }
    throw new Error(toMessage(lastError, '対応している録画形式が見つかりませんでした'))
  }

  /** 停止して 1 本の Blob にまとめる。録画していなければ reject。 */
  stop(): Promise<Blob> {
    if (this.stopPromise) return this.stopPromise
    const recorder = this.recorder
    if (!recorder) return Promise.reject(new Error('録画が開始されていません'))

    this.stopPromise = new Promise<Blob>((resolve, reject) => {
      this.settle = { resolve, reject }
    })
    if (this.finished) {
      this.settleOutput()
      return this.stopPromise
    }
    try {
      // 自然停止で state が inactive になり、onstop がキューにある場合も待つ。
      if (recorder.state !== 'inactive') recorder.stop()
    } catch (error) {
      this.errorMessage = toMessage(error, '録画を停止できませんでした')
      this.finish()
    }
    return this.stopPromise
  }

  private attach(recorder: MediaRecorder): void {
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data)
    }
    recorder.onstop = () => {
      this.finish()
    }
    recorder.onerror = (event: Event) => {
      const error = (event as { error?: unknown }).error
      this.errorMessage = toMessage(error, '録画中にエラーが発生しました')
      this.finish()
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* エラーが発生した実体を停止する。 */ }
      }
    }
  }

  private detach(recorder: MediaRecorder): void {
    recorder.ondataavailable = null
    recorder.onstop = null
    recorder.onerror = null
  }

  private finish(): void {
    if (this.finished) return
    this.finished = true
    if (this.recorder) this.detach(this.recorder)
    if (!this.errorMessage && this.chunks.length === 0) {
      this.errorMessage = '録画データがありません。少し長く録画してお試しください。'
    }
    if (!this.errorMessage) this.output = new Blob(this.chunks, { type: this.mimeType ?? 'video/webm' })
    this.chunks = []
    this.settleOutput()
  }

  private settleOutput(): void {
    const settle = this.settle
    if (!settle) return
    this.settle = null
    if (this.errorMessage || !this.output) {
      settle.reject(new Error(this.errorMessage ?? '録画データを作成できませんでした。'))
      return
    }
    settle.resolve(this.output)
  }
}

/**
 * webm は MediaRecorder が duration を書かないため、シークできない動画になる。
 * fix-webm-duration で後追いで書き込む（失敗しても録画そのものは捨てない）。
 */
export async function finalizeBlob(blob: Blob, mimeType: string, durationMs: number): Promise<Blob> {
  if (extensionForMime(mimeType) !== 'webm') return blob
  if (!Number.isFinite(durationMs) || durationMs <= 0) return blob
  try {
    const { default: fixWebmDuration } = await import('fix-webm-duration')
    const fixed = await fixWebmDuration(blob, Math.round(durationMs), { logger: false })
    return fixed && fixed.size > 0 ? fixed : blob
  } catch {
    return blob
  }
}

/** <a download> を作って click → 片付ける。 */
export function triggerDownload(url: string, fileName: string): void {
  if (typeof document === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
