import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fixMock } = vi.hoisted(() => ({ fixMock: vi.fn() }))
vi.mock('fix-webm-duration', () => ({ default: fixMock }))

import { MIME_CANDIDATES } from '../types/recording'
import {
  buildFileName,
  createRecordingStream,
  extensionForMime,
  finalizeBlob,
  pickSupportedMimeType,
  Recording,
} from './mediaRecorder'

// ---- テスト用の偽 MediaRecorder --------------------------------------------

interface FakeOptions {
  mimeType?: string
  videoBitsPerSecond?: number
}

class FakeRecorder {
  static unsupported = new Set<string>()
  static unsupportedOnStart = new Set<string>()
  static actualMime: string | null = null
  static created: FakeRecorder[] = []

  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  videoBitsPerSecond: number | null
  timeslice: number | null = null
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: { error?: unknown }) => void) | null = null

  constructor(_stream: unknown, options?: FakeOptions) {
    const mime = options?.mimeType ?? ''
    if (FakeRecorder.unsupported.has(mime)) {
      const error = new Error(`${mime} is not supported`)
      error.name = 'NotSupportedError'
      throw error
    }
    this.mimeType = mime
    this.videoBitsPerSecond = options?.videoBitsPerSecond ?? null
    FakeRecorder.created.push(this)
  }

  start(timeslice?: number): void {
    if (FakeRecorder.unsupportedOnStart.has(this.mimeType)) {
      const error = new Error('unsupported codec')
      error.name = 'NotSupportedError'
      throw error
    }
    if (FakeRecorder.actualMime) this.mimeType = FakeRecorder.actualMime
    this.state = 'recording'
    this.timeslice = timeslice ?? null
  }

  push(text: string): void {
    this.ondataavailable?.({ data: new Blob([text]) })
  }

  stop(): void {
    this.state = 'inactive'
    this.onstop?.()
  }
}

const FakeRecorderCtor = FakeRecorder as unknown as typeof MediaRecorder
const fakeStream = {} as MediaStream

beforeEach(() => {
  FakeRecorder.unsupported = new Set<string>()
  FakeRecorder.unsupportedOnStart = new Set<string>()
  FakeRecorder.actualMime = null
  FakeRecorder.created = []
  fixMock.mockReset()
})

// ---- mime の選択 ------------------------------------------------------------

describe('pickSupportedMimeType', () => {
  it('全部使えるなら mp4 を選ぶ', () => {
    expect(pickSupportedMimeType(MIME_CANDIDATES, () => true)).toBe('video/mp4')
  })

  it('mp4 が使えないなら webm;vp9 に落ちる', () => {
    const supported = (mime: string) => mime !== 'video/mp4'
    expect(pickSupportedMimeType(MIME_CANDIDATES, supported)).toBe('video/webm;codecs=vp9')
  })

  it('vp9 も使えないなら素の webm に落ちる', () => {
    const supported = (mime: string) => mime === 'video/webm'
    expect(pickSupportedMimeType(MIME_CANDIDATES, supported)).toBe('video/webm')
  })

  it('どれも使えなければ null', () => {
    expect(pickSupportedMimeType(MIME_CANDIDATES, () => false)).toBeNull()
  })

  it('MediaRecorder が無い環境（node）では既定判定でも null', () => {
    expect(pickSupportedMimeType()).toBeNull()
  })
})

describe('extensionForMime', () => {
  it('mp4 系は mp4', () => {
    expect(extensionForMime('video/mp4')).toBe('mp4')
    expect(extensionForMime('video/mp4;codecs=avc1.42E01E')).toBe('mp4')
  })

  it('それ以外は webm', () => {
    expect(extensionForMime('video/webm;codecs=vp9')).toBe('webm')
    expect(extensionForMime('video/webm')).toBe('webm')
    expect(extensionForMime('')).toBe('webm')
  })
})

describe('buildFileName', () => {
  it('ローカル時刻を YYYYMMDD-HHmmss で埋め込む', () => {
    expect(buildFileName(new Date(2026, 8, 18, 21, 5, 7), 'webm')).toBe('character-animation-20260918-210507.webm')
  })

  it('1桁の月日・時分秒をゼロ埋めする', () => {
    expect(buildFileName(new Date(2026, 0, 2, 3, 4, 5), 'mp4')).toBe('character-animation-20260102-030405.mp4')
  })
})

describe('createRecordingStream', () => {
  it('captureStream に fps を渡し、録画専用に複製した音声トラックを足す', () => {
    const added: unknown[] = []
    const stream = { addTrack: (track: unknown) => added.push(track) }
    const captureStream = vi.fn(() => stream)
    const canvas = { captureStream } as unknown as HTMLCanvasElement
    const clonedTrack = { kind: 'audio', stop: vi.fn() }
    const clone = vi.fn(() => clonedTrack)
    const audioTrack = { kind: 'audio', clone, stop: vi.fn() } as unknown as MediaStreamTrack

    const result = createRecordingStream(canvas, audioTrack)

    expect(captureStream).toHaveBeenCalledWith(30)
    expect(added).toEqual([clonedTrack])
    expect(clone).toHaveBeenCalledOnce()
    expect(audioTrack.stop).not.toHaveBeenCalled()
    expect(result).toBe(stream as unknown as MediaStream)
  })

  it('音声トラックが無ければ addTrack しない', () => {
    const addTrack = vi.fn()
    const canvas = { captureStream: () => ({ addTrack }) } as unknown as HTMLCanvasElement
    createRecordingStream(canvas, null, 24)
    expect(addTrack).not.toHaveBeenCalled()
  })

  it('音声追加に失敗した場合は生成した映像と音声コピーを片付ける', () => {
    const videoTrack = { stop: vi.fn() }
    const copyTrack = { stop: vi.fn() }
    const canvas = { captureStream: () => ({
      addTrack: () => { throw new Error('cannot add audio') },
      getTracks: () => [videoTrack],
    }) } as unknown as HTMLCanvasElement
    const originalTrack = { clone: () => copyTrack, stop: vi.fn() } as unknown as MediaStreamTrack
    expect(() => createRecordingStream(canvas, originalTrack)).toThrow('cannot add audio')
    expect(copyTrack.stop).toHaveBeenCalledOnce()
    expect(videoTrack.stop).toHaveBeenCalledOnce()
    expect(originalTrack.stop).not.toHaveBeenCalled()
  })

  it('停止済み音声と非対応キャンバスは開始前に拒否する', () => {
    const canvas = { captureStream: vi.fn() } as unknown as HTMLCanvasElement
    expect(() => createRecordingStream(canvas, { readyState: 'ended' } as MediaStreamTrack)).toThrow('音声が停止')
    expect(canvas.captureStream).not.toHaveBeenCalled()
    expect(() => createRecordingStream({} as HTMLCanvasElement, null)).toThrow('キャンバスの録画')
  })
})

// ---- Recording --------------------------------------------------------------

describe('Recording', () => {
  it('1つ目の候補が NotSupportedError なら次の候補で開始する', () => {
    FakeRecorder.unsupported.add('video/mp4')
    const recording = new Recording(FakeRecorderCtor)

    const adopted = recording.start(fakeStream, MIME_CANDIDATES, { timesliceMs: 250 })

    expect(adopted).toBe('video/webm;codecs=vp9')
    expect(recording.mimeType).toBe('video/webm;codecs=vp9')
    expect(FakeRecorder.created).toHaveLength(1)
    expect(FakeRecorder.created[0].timeslice).toBe(250)
  })

  it('全候補が使えなければ throw する', () => {
    for (const mime of MIME_CANDIDATES) FakeRecorder.unsupported.add(mime)
    const recording = new Recording(FakeRecorderCtor)
    expect(() => recording.start(fakeStream, MIME_CANDIDATES)).toThrow()
  })

  it('start() 時に形式が拒否されてもハンドラーを外して次候補を試す', () => {
    FakeRecorder.unsupportedOnStart.add('video/mp4')
    const recording = new Recording(FakeRecorderCtor)
    expect(recording.start(fakeStream)).toBe('video/webm;codecs=vp9')
    expect(FakeRecorder.created[0].onstop).toBeNull()
    expect(FakeRecorder.created[0].ondataavailable).toBeNull()
    expect(FakeRecorder.created[1].state).toBe('recording')
  })

  it('ブラウザが実際に採用した codec を Blob に反映する', async () => {
    FakeRecorder.actualMime = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
    const recording = new Recording(FakeRecorderCtor)
    expect(recording.start(fakeStream)).toBe(FakeRecorder.actualMime)
    FakeRecorder.created[0].push('movie')
    expect((await recording.stop()).type).toBe(FakeRecorder.actualMime.toLowerCase())
  })

  it('stop で chunk が 1 本の Blob に結合される', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    const recorder = FakeRecorder.created[0]

    recorder.push('abc')
    recorder.push('')
    recorder.push('de')
    const blob = await recording.stop()

    expect(blob.type).toBe('video/webm')
    expect(await blob.text()).toBe('abcde')
  })

  it('stop の二重呼び出しは同じ Promise を返す', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    FakeRecorder.created[0].push('x')

    const first = recording.stop()
    const second = recording.stop()

    expect(first).toBe(second)
    expect(await blobText(await first)).toBe('x')
  })

  it('開始前の stop は reject する', async () => {
    const recording = new Recording(FakeRecorderCtor)
    await expect(recording.stop()).rejects.toThrow('録画が開始されていません')
  })

  it('映像ソースの自然停止後でも終了イベントを取りこぼさず取得できる', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    FakeRecorder.created[0].push('movie')
    FakeRecorder.created[0].stop()
    expect(recording.active).toBe(false)
    expect(await (await recording.stop()).text()).toBe('movie')
  })

  it('inactive 直後に stop を呼んだ場合もキュー中の最終データを待つ', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    const recorder = FakeRecorder.created[0]
    recorder.state = 'inactive'
    const promise = recording.stop()
    recorder.push('last chunk')
    recorder.onstop?.()
    expect(await (await promise).text()).toBe('last chunk')
  })

  it('開始後の非同期エラーは stop 前に発生しても失敗として返す', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    const recorder = FakeRecorder.created[0]
    recorder.push('incomplete')
    recorder.onerror?.({ error: new Error('encoder failed') })
    expect(recording.active).toBe(false)
    await expect(recording.stop()).rejects.toThrow('encoder failed')
    expect(recorder.onstop).toBeNull()
    expect(recorder.state).toBe('inactive')
  })

  it('空の動画を保存対象にしない', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    await expect(recording.stop()).rejects.toThrow('録画データがありません')
  })

  it('chunk が無いまま onerror が来たら stop は reject する', async () => {
    const recording = new Recording(FakeRecorderCtor)
    recording.start(fakeStream, ['video/webm'])
    const recorder = FakeRecorder.created[0]
    recorder.stop = () => {
      recorder.onerror?.({ error: new Error('録画に失敗しました') })
    }

    await expect(recording.stop()).rejects.toThrow('録画に失敗しました')
  })
})

async function blobText(blob: Blob): Promise<string> {
  return blob.text()
}

// ---- finalizeBlob -----------------------------------------------------------

describe('finalizeBlob', () => {
  it('mp4 はそのまま返す（fix-webm-duration を呼ばない）', async () => {
    const blob = new Blob(['mp4'], { type: 'video/mp4' })
    expect(await finalizeBlob(blob, 'video/mp4', 1234)).toBe(blob)
    expect(fixMock).not.toHaveBeenCalled()
  })

  it('webm は fix-webm-duration に duration を渡す', async () => {
    const blob = new Blob(['webm'], { type: 'video/webm' })
    const fixed = new Blob(['webm+duration'], { type: 'video/webm' })
    fixMock.mockResolvedValue(fixed)

    const result = await finalizeBlob(blob, 'video/webm;codecs=vp9', 1234.6)

    expect(result).toBe(fixed)
    expect(fixMock).toHaveBeenCalledWith(blob, 1235, { logger: false })
  })

  it('fix-webm-duration が失敗しても元の blob を返す', async () => {
    const blob = new Blob(['webm'], { type: 'video/webm' })
    fixMock.mockRejectedValue(new Error('broken'))
    expect(await finalizeBlob(blob, 'video/webm', 1000)).toBe(blob)
  })

  it('duration が 0 以下なら何もしない', async () => {
    const blob = new Blob(['webm'], { type: 'video/webm' })
    expect(await finalizeBlob(blob, 'video/webm', 0)).toBe(blob)
    expect(fixMock).not.toHaveBeenCalled()
  })
})
