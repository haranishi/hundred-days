// 録画（canvas.captureStream + MediaRecorder）の型契約。

export type RecordingStatus = 'idle' | 'recording' | 'finalizing' | 'done' | 'error'

export interface RecordingResult {
  blob: Blob
  /** URL.createObjectURL(blob)。clear() で revoke する */
  url: string
  mimeType: string
  /** character-animation-YYYYMMDD-HHmmss.<ext> */
  fileName: string
  durationMs: number
  sizeBytes: number
}

export interface RecordingState {
  status: RecordingStatus
  /** performance.now() 基準の開始時刻 */
  startedAt: number | null
  /** 録画中に約4回/秒で更新 */
  elapsedMs: number
  /** 実際に採用した MIME（isTypeSupported で決定） */
  mimeType: string | null
  result: RecordingResult | null
  error: string | null
  /** ファイルモード: 録画開始で音声を最初から再生し、再生終了で自動停止する */
  autoPlayFromStart: boolean
}

export const DEFAULT_RECORDING_STATE: RecordingState = {
  status: 'idle',
  startedAt: null,
  elapsedMs: 0,
  mimeType: null,
  result: null,
  error: null,
  autoPlayFromStart: true,
}

/** 優先順位どおりに isTypeSupported で判定する候補 */
export const MIME_CANDIDATES: readonly string[] = [
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
]

export const RECORDING_FPS = 30
