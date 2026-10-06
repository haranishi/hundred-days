// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioStore } from '../state/audioStore'
import { useRecordingStore } from '../state/recordingStore'
import { useRecorder } from './useRecorder'

const { audio } = vi.hoisted(() => ({ audio: {
  getLevel: vi.fn(), getRecordingTrack: vi.fn(), loadFile: vi.fn(),
  play: vi.fn(), pause: vi.fn(), seek: vi.fn(), restart: vi.fn(),
  setVolume: vi.fn(), setSensitivity: vi.fn(), onEnded: vi.fn(),
  startMic: vi.fn(), stopMic: vi.fn(), setMode: vi.fn(),
} }))
vi.mock('./useAudioAnalyzer', () => ({ useAudioAnalyzer: () => audio }))

class FakeRecorder {
  static created: FakeRecorder[] = []
  static isTypeSupported(mime: string) { return mime === 'video/mp4' }
  mimeType = 'video/mp4'
  state = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor() { FakeRecorder.created.push(this) }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['movie'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

let api: ReturnType<typeof useRecorder>
let root: Root
let node: HTMLDivElement
let ended: Set<() => void>
let sourceTrack: MediaStreamTrack
let audioCopy: { stop: ReturnType<typeof vi.fn> }
let canvasTrack: { stop: ReturnType<typeof vi.fn> }
let canvas: HTMLCanvasElement

function Probe() {
  const recorder = useRecorder()
  useLayoutEffect(() => { api = recorder }, [recorder])
  return null
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:recording'), revokeObjectURL: vi.fn() })
  FakeRecorder.created = []
  ended = new Set()
  audioCopy = { stop: vi.fn() }
  canvasTrack = { stop: vi.fn() }
  sourceTrack = { clone: () => audioCopy, stop: vi.fn(), readyState: 'live' } as unknown as MediaStreamTrack
  const tracks: unknown[] = [canvasTrack]
  canvas = { captureStream: () => ({ addTrack: (track: unknown) => tracks.push(track), getTracks: () => tracks }) } as unknown as HTMLCanvasElement
  useAudioStore.getState().reset()
  useRecordingStore.getState().reset()
  useRecordingStore.getState().patch({ autoPlayFromStart: true })
  useAudioStore.getState().patch({ file: { name: 'voice.wav', objectUrl: 'blob:voice', duration: 5 }, playback: 'ready' })
  audio.restart.mockImplementation(async () => { useAudioStore.getState().patch({ playback: 'playing' }) })
  audio.pause.mockImplementation(() => {
    if (useAudioStore.getState().playback !== 'ended') useAudioStore.getState().patch({ playback: 'paused' })
  })
  audio.onEnded.mockImplementation((callback: () => void) => {
    ended.add(callback)
    return () => ended.delete(callback)
  })
  node = document.createElement('div')
  document.body.appendChild(node)
  root = createRoot(node)
  await act(async () => { root.render(createElement(Probe)) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  useRecordingStore.getState().reset()
  useAudioStore.getState().reset()
  node.remove()
  vi.unstubAllGlobals()
})

describe('recording orchestration', () => {
  it('連打しても一回だけ開始し、音声終了で保存可能な動画にする', async () => {
    await act(async () => {
      await Promise.all([api.start(canvas, sourceTrack), api.start(canvas, sourceTrack)])
    })
    expect(FakeRecorder.created).toHaveLength(1)
    expect(audio.restart).toHaveBeenCalledOnce()
    expect(audio.seek).toHaveBeenCalledWith(0)
    expect(api.status).toBe('recording')
    await act(async () => {
      useAudioStore.getState().patch({ playback: 'ended' })
      for (const callback of ended) callback()
    })
    expect(api.status).toBe('done')
    expect(api.result?.fileName).toMatch(/^character-animation-\d{8}-\d{6}\.mp4$/)
    expect(api.result?.sizeBytes).toBeGreaterThan(0)
    expect(audioCopy.stop).toHaveBeenCalled()
    expect(canvasTrack.stop).toHaveBeenCalled()
    expect(sourceTrack.stop).not.toHaveBeenCalled()
    expect(ended.size).toBe(0)
  })

  it('自動再生なしでは現位置の再生を触らず、終了時にも手動停止を待つ', async () => {
    await act(async () => {
      api.setAutoPlayFromStart(false)
      useAudioStore.getState().patch({ playback: 'playing' })
      await api.start(canvas, sourceTrack)
    })
    expect(audio.restart).not.toHaveBeenCalled()
    expect(audio.pause).not.toHaveBeenCalled()
    expect(ended.size).toBe(0)
    await act(async () => {
      const first = api.stop()
      expect(api.stop()).toBe(first)
      await first
    })
    expect(api.status).toBe('done')
    expect(audio.pause).not.toHaveBeenCalled()
    await act(async () => { api.clear() })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording')
    expect(api.result).toBeNull()
  })

  it('音声再生が拒否されたら無音成功にせずエラーとし、トラックを解放する', async () => {
    audio.restart.mockImplementationOnce(async () => { useAudioStore.getState().patch({ playback: 'paused' }) })
    await act(async () => { await api.start(canvas, sourceTrack) })
    expect(api.status).toBe('error')
    expect(api.error).toContain('音声を再生できなかった')
    expect(api.result).toBeNull()
    expect(audioCopy.stop).toHaveBeenCalled()
    expect(sourceTrack.stop).not.toHaveBeenCalled()
    expect(ended.size).toBe(0)
  })

  it('再生開始待ちに停止した場合、遅れて音声だけ再生し続けない', async () => {
    let finishPlay: () => void = () => undefined
    audio.restart.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishPlay = () => { useAudioStore.getState().patch({ playback: 'playing' }); resolve() }
    }))
    let start: Promise<void> = Promise.resolve()
    await act(async () => { start = api.start(canvas, sourceTrack) })
    expect(api.status).toBe('recording')
    await act(async () => { await api.stop() })
    await act(async () => { finishPlay(); await start })
    expect(api.status).toBe('done')
    expect(useAudioStore.getState().playback).toBe('paused')
  })

  it('録画中に入力モードが変わった場合は自動で録画を閉じる', async () => {
    await act(async () => { await api.start(canvas, sourceTrack) })
    await act(async () => { useAudioStore.getState().patch({ mode: 'mic' }) })
    expect(api.status).toBe('done')
    expect(audioCopy.stop).toHaveBeenCalled()
    expect(sourceTrack.stop).not.toHaveBeenCalled()
  })

  it('動いていないマイクでは録画を開始しない', async () => {
    await act(async () => {
      useAudioStore.getState().patch({ mode: 'mic', mic: 'off' })
      await api.start(canvas, sourceTrack)
    })
    expect(api.status).toBe('error')
    expect(api.error).toContain('マイクを開始')
    expect(FakeRecorder.created).toHaveLength(0)
  })
})
