// 音声入力の型契約。ファイルモード（HTMLAudioElement 再生）とマイクモード（getUserMedia）。
// 解析は Web Audio の AnalyserNode（時間領域 → RMS）。→ lib/audio.ts / hooks/useAudioAnalyzer.ts

export type AudioMode = 'file' | 'mic'

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'

export type MicStatus = 'off' | 'requesting' | 'live' | 'denied' | 'error'

export interface LoadedAudioFile {
  name: string
  objectUrl: string
  /** 秒。メタデータ読込前は 0。 */
  duration: number
}

export interface AudioState {
  mode: AudioMode
  file: LoadedAudioFile | null
  playback: PlaybackStatus
  /** 秒。UI 表示用に約10回/秒で更新する（毎フレーム更新しない）。 */
  currentTime: number
  /** 0..1 モニター用の再生音量（録画データには影響しない）。 */
  volume: number
  /** RMS に掛ける感度。正規化 level = clamp(rms * sensitivity, 0, 1)。 */
  sensitivity: number
  mic: MicStatus
  errorMessage: string | null
}

export const DEFAULT_AUDIO_STATE: AudioState = {
  mode: 'file',
  file: null,
  playback: 'idle',
  currentTime: 0,
  volume: 1,
  sensitivity: 3,
  mic: 'off',
  errorMessage: null,
}

export const ACCEPTED_AUDIO_TYPES = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac'
