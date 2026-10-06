import { useCallback, useEffect } from 'react'
import {
  buildFileName, createRecordingStream, extensionForMime, finalizeBlob,
  pickSupportedMimeType, Recording, triggerDownload,
} from '../lib/mediaRecorder'
import { useAudioStore } from '../state/audioStore'
import { useRecordingStore } from '../state/recordingStore'
import { MIME_CANDIDATES } from '../types/recording'
import { useAudioAnalyzer, type AudioAnalyzerApi } from './useAudioAnalyzer'

interface RecordingSession {
  recording: Recording
  stream: MediaStream
  audio: AudioAnalyzerApi
  startedAt: number
  autoPlay: boolean
  audioUrl: string | null
  timer: ReturnType<typeof setInterval> | null
  unsubscribeEnded: () => void
  unsubscribeAudio: () => void
  stopping: Promise<void> | null
  cancelled: boolean
  startingAudio: boolean
}

let activeSession: RecordingSession | null = null
let hookUsers = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '録画に失敗しました。もう一度お試しください。'
}

function unsubscribe(session: RecordingSession): void {
  if (session.timer) clearInterval(session.timer)
  session.timer = null
  session.unsubscribeEnded()
  session.unsubscribeAudio()
}

function stopTracks(session: RecordingSession): void {
  for (const track of session.stream.getTracks()) track.stop()
}

function pauseOwnedAudio(session: RecordingSession): void {
  const audioState = useAudioStore.getState()
  if (session.autoPlay && audioState.mode === 'file' && audioState.file?.objectUrl === session.audioUrl) {
    session.audio.pause()
  }
}

async function discardRecording(session: RecordingSession, error?: string): Promise<void> {
  session.cancelled = true
  unsubscribe(session)
  pauseOwnedAudio(session)
  // エラー時にもハンドラーを残さず、録画専用の複製トラックだけを解放する。
  const stopped = session.recording.stop().catch(() => undefined)
  stopTracks(session)
  if (activeSession === session) {
    activeSession = null
    useRecordingStore.getState().patch({
      status: error ? 'error' : 'idle', startedAt: null, elapsedMs: 0,
      error: error ?? null,
    })
  }
  await stopped
}

function stopRecording(): Promise<void> {
  const session = activeSession
  if (!session) return Promise.resolve()
  if (session.stopping) return session.stopping
  unsubscribe(session)
  const durationMs = Math.max(0, performance.now() - session.startedAt)
  useRecordingStore.getState().patch({ status: 'finalizing', elapsedMs: durationMs })
  pauseOwnedAudio(session)
  session.stopping = (async () => {
    try {
      const raw = await session.recording.stop()
      stopTracks(session)
      const mimeType = session.recording.mimeType ?? raw.type
      const blob = await finalizeBlob(raw, mimeType, durationMs)
      if (session.cancelled || activeSession !== session) return
      const result = {
        blob,
        url: URL.createObjectURL(blob),
        mimeType,
        fileName: buildFileName(new Date(), extensionForMime(mimeType)),
        durationMs,
        sizeBytes: blob.size,
      }
      useRecordingStore.getState().setResult(result)
      useRecordingStore.getState().patch({ status: 'done', startedAt: null, mimeType, error: null })
    } catch (error) {
      if (!session.cancelled && activeSession === session) {
        useRecordingStore.getState().patch({ status: 'error', startedAt: null, error: errorMessage(error) })
      }
    } finally {
      stopTracks(session)
      if (activeSession === session) activeSession = null
    }
  })()
  return session.stopping
}

async function startRecording(canvas: HTMLCanvasElement, audioTrack: MediaStreamTrack | null, audio: AudioAnalyzerApi): Promise<void> {
  if (activeSession) return
  const audioState = useAudioStore.getState()
  let session: RecordingSession | null = null
  let stream: MediaStream | null = null
  try {
    if (audioState.mode === 'mic' && audioState.mic !== 'live') {
      throw new Error('先にマイクを開始してください。')
    }
    if (audioState.mode === 'file' && audioState.file && ['loading', 'error'].includes(audioState.playback)) {
      throw new Error('音声ファイルを読み込んでから録画してください。')
    }
    if ((audioState.file && audioState.mode === 'file' || audioState.mode === 'mic') && !audioTrack) {
      throw new Error('録画用の音声を準備できませんでした。音声を読み込み直してください。')
    }
    const candidates = MIME_CANDIDATES.filter((mime) => pickSupportedMimeType([mime]))
    if (candidates.length === 0) throw new Error('このブラウザは動画の録画に対応していません。Chrome などの対応ブラウザをお使いください。')
    const recording = new Recording()
    const autoPlay = audioState.mode === 'file' && Boolean(audioState.file) && useRecordingStore.getState().autoPlayFromStart
    if (autoPlay) {
      audio.pause()
      audio.seek(0)
    }
    stream = createRecordingStream(canvas, audioTrack)
    const mimeType = recording.start(stream, candidates)
    session = {
      recording, stream, audio, autoPlay, startedAt: performance.now(),
      audioUrl: audioState.file?.objectUrl ?? null,
      timer: null, unsubscribeEnded: () => undefined, unsubscribeAudio: () => undefined,
      stopping: null, cancelled: false, startingAudio: autoPlay,
    }
    activeSession = session
    useRecordingStore.getState().setResult(null)
    useRecordingStore.getState().patch({
      status: 'recording', startedAt: session.startedAt, elapsedMs: 0, mimeType, error: null,
    })
    const current = session
    if (autoPlay) current.unsubscribeEnded = audio.onEnded(() => { void stopRecording() })
    current.unsubscribeAudio = useAudioStore.subscribe((state) => {
      if (activeSession !== current || current.cancelled) return
      const changedSource = state.mode !== audioState.mode || state.file?.objectUrl !== audioState.file?.objectUrl
      if (changedSource || state.mode === 'mic' && state.mic !== 'live') {
        void stopRecording()
      } else if (state.mode === 'file' && state.playback === 'error' && !current.startingAudio) {
        void discardRecording(current, '録画中に音声の再生が止まりました。音声を読み込み直してください。')
      }
    })
    current.timer = setInterval(() => {
      if (activeSession !== current || current.cancelled) return
      if (!recording.active) {
        void stopRecording()
        return
      }
      useRecordingStore.getState().patch({ elapsedMs: performance.now() - current.startedAt })
    }, 250)
    if (autoPlay) {
      await audio.restart()
      current.startingAudio = false
      if (current.stopping || current.cancelled) {
        // resume/play の非同期待ち中に停止された場合、遅れて再生を始めない。
        if (!activeSession || activeSession === current) pauseOwnedAudio(current)
        return
      }
      if (activeSession === current && !current.stopping && useAudioStore.getState().playback !== 'playing') {
        await discardRecording(current, '音声を再生できなかったため録画を停止しました。もう一度録画ボタンを押してください。')
      }
    }
  } catch (error) {
    if (session) {
      await discardRecording(session, errorMessage(error))
    } else {
      if (stream) for (const track of stream.getTracks()) track.stop()
      useRecordingStore.getState().patch({ status: 'error', startedAt: null, error: errorMessage(error) })
    }
  }
}

function setAutoPlayFromStart(autoPlayFromStart: boolean): void {
  if (!activeSession) useRecordingStore.getState().patch({ autoPlayFromStart })
}

function download(): void {
  const result = useRecordingStore.getState().result
  if (result) triggerDownload(result.url, result.fileName)
}

function clear(): void {
  if (!activeSession) useRecordingStore.getState().reset()
}

/** 録画実体は全コンポーネントで一つ。毎フレーム値は持たず、経過時間のみ 4 Hz で通知する。 */
export function useRecorder() {
  const audio = useAudioAnalyzer()
  const state = useRecordingStore()
  const start = useCallback((canvas: HTMLCanvasElement, audioTrack: MediaStreamTrack | null) =>
    startRecording(canvas, audioTrack, audio), [audio])

  useEffect(() => {
    hookUsers += 1
    return () => {
      hookUsers -= 1
      if (hookUsers === 0 && activeSession) void discardRecording(activeSession)
    }
  }, [])

  return {
    status: state.status,
    elapsedMs: state.elapsedMs,
    mimeType: state.mimeType,
    result: state.result,
    error: state.error,
    autoPlayFromStart: state.autoPlayFromStart,
    setAutoPlayFromStart,
    start,
    stop: stopRecording,
    download,
    clear,
  }
}
