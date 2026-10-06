import { describe, expect, it, vi } from 'vitest'
import { computeCharacterRect, drawFrame, resolveImageSize } from './render'
import { CANVAS_PRESETS, DEFAULT_CANVAS_STATE, GREEN_SCREEN } from '../types/canvas'
import type { CanvasState } from '../types/canvas'
import type { CharacterTransform, EngineFrame } from '../types/animation'

const NEUTRAL: CharacterTransform = { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 }

function image(width = 400, height = 600): HTMLImageElement {
  return { naturalWidth: width, naturalHeight: height, width, height } as HTMLImageElement
}

function frame(picture: HTMLImageElement | null = image(), transform = NEUTRAL): EngineFrame {
  return { mouth: 'closed', blinking: false, level: 0, speaking: false, image: picture, transform }
}

function canvas(overrides: Partial<CanvasState> = {}): CanvasState {
  return { ...DEFAULT_CANVAS_STATE, placement: { x: 0.5, y: 0.5, size: 0.8 }, ...overrides }
}

function context() {
  const mock = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    fillStyle: '',
  }
  return { mock, ctx: mock as unknown as CanvasRenderingContext2D }
}

describe('computeCharacterRect', () => {
  it.each(CANVAS_PRESETS)('$label は実解像度に比例した高さとアスペクト比で描く', ({ id, width, height }) => {
    const result = computeCharacterRect(canvas({ preset: id, width, height }), { width: 400, height: 600 }, NEUTRAL)
    expect(result.height).toBeCloseTo(height * 0.8)
    expect(result.width / result.height).toBeCloseTo(2 / 3)
    expect(result.cx).toBe(width / 2)
    expect(result.cy).toBe(height / 2)
    expect(result.x).toBeCloseTo(result.cx - result.width / 2)
    expect(result.y).toBeCloseTo(result.cy - result.height / 2)
  })

  it('基準1080pxからの微動と配置、発話の拡大率を適用する', () => {
    const settings = canvas({ width: 1080, height: 1920, placement: { x: 0.25, y: 0.75, size: 0.5 } })
    const result = computeCharacterRect(settings, { width: 100, height: 200 }, { offsetX: 3, offsetY: -8, scale: 1.015, rotationDeg: 0.5 })
    expect(result.cx).toBeCloseTo(270 + 3 * (1920 / 1080))
    expect(result.cy).toBeCloseTo(1440 - 8 * (1920 / 1080))
    expect(result.height).toBeCloseTo(1920 * 0.5 * 1.015)
    expect(result.width).toBeCloseTo(result.height / 2)
  })
})

describe('drawFrame', () => {
  it('毎フレーム消去し、透明背景には色もチェック柄も書き込まない', () => {
    const { ctx, mock } = context()
    drawFrame(ctx, canvas(), frame(null))
    expect(mock.clearRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
    expect(mock.fillRect).not.toHaveBeenCalled()
    expect(mock.drawImage).not.toHaveBeenCalled()
  })

  it.each([
    ['white', '#ffffff'],
    ['black', '#000000'],
    ['green', GREEN_SCREEN],
    ['color', '#123456'],
  ] as const)('%s 背景を全面に塗ってからキャラクターを描く', (kind, expectedColor) => {
    const { ctx, mock } = context()
    drawFrame(ctx, canvas({ background: { kind, color: '#123456', image: null } }), frame())
    expect(mock.fillStyle).toBe(expectedColor)
    expect(mock.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
    expect(mock.clearRect.mock.invocationCallOrder[0]).toBeLessThan(mock.fillRect.mock.invocationCallOrder[0])
    expect(mock.fillRect.mock.invocationCallOrder[0]).toBeLessThan(mock.drawImage.mock.invocationCallOrder[0])
  })

  it('横長背景を縦キャンバスで中央coverにし、余白を残さない', () => {
    const { ctx, mock } = context()
    const background = image(1920, 1080)
    drawFrame(ctx, canvas({ background: { kind: 'image', color: '#000000', image: { image: background, width: 1920, height: 1080, fileName: 'landscape.png', objectUrl: 'blob:background' } } }), frame(null))
    const width = 1920 * (1920 / 1080)
    expect(mock.drawImage).toHaveBeenCalledWith(background, (1080 - width) / 2, 0, width, 1920)
  })

  it('縦長背景を横キャンバスで中央coverにし、画像比率を保つ', () => {
    const { ctx, mock } = context()
    const background = image(600, 1200)
    drawFrame(ctx, canvas({ width: 1920, height: 1080, background: { kind: 'image', color: '#000000', image: { image: background, width: 600, height: 1200, fileName: 'portrait.png', objectUrl: 'blob:background' } } }), frame(null))
    expect(mock.drawImage).toHaveBeenCalledWith(background, 0, (1080 - 3840) / 2, 1920, 3840)
  })

  it('中心へ移動し、角度をradianへ変換してから描画・復元する', () => {
    const { ctx, mock } = context()
    const picture = image()
    const transform = { ...NEUTRAL, rotationDeg: 90 }
    const settings = canvas({ width: 1080, height: 1080 })
    const rect = computeCharacterRect(settings, { width: 400, height: 600 }, transform)
    drawFrame(ctx, settings, frame(picture, transform))
    expect(mock.translate).toHaveBeenCalledWith(540, 540)
    expect(mock.rotate).toHaveBeenCalledWith(Math.PI / 2)
    expect(mock.drawImage).toHaveBeenCalledWith(picture, -rect.width / 2, -rect.height / 2, rect.width, rect.height)
    expect(mock.save.mock.invocationCallOrder[0]).toBeLessThan(mock.translate.mock.invocationCallOrder[0])
    expect(mock.translate.mock.invocationCallOrder[0]).toBeLessThan(mock.rotate.mock.invocationCallOrder[0])
    expect(mock.rotate.mock.invocationCallOrder[0]).toBeLessThan(mock.drawImage.mock.invocationCallOrder[0])
    expect(mock.drawImage.mock.invocationCallOrder[0]).toBeLessThan(mock.restore.mock.invocationCallOrder[0])
  })

  it('ドット絵ではスムージングせず、解除すると高品質の補間に戻る', () => {
    const { ctx, mock } = context()
    drawFrame(ctx, canvas({ pixelArt: true }), frame())
    expect(mock.imageSmoothingEnabled).toBe(false)
    drawFrame(ctx, canvas({ pixelArt: false }), frame())
    expect(mock.imageSmoothingEnabled).toBe(true)
    expect(mock.imageSmoothingQuality).toBe('high')
  })

  it('背景画像がない場合やデコード前のキャラ画像ではdrawImageを呼ばない', () => {
    const { ctx, mock } = context()
    drawFrame(ctx, canvas({ background: { kind: 'image', color: '#000000', image: null } }), frame(image(0, 0)))
    expect(mock.drawImage).not.toHaveBeenCalled()
    expect(mock.translate).not.toHaveBeenCalled()
  })

  it('SVGなどでnaturalサイズが0のときは画像のwidth/heightを使う', () => {
    const picture = { naturalWidth: 0, naturalHeight: 0, width: 400, height: 600 } as HTMLImageElement
    expect(resolveImageSize(picture)).toEqual({ width: 400, height: 600 })
    const { ctx, mock } = context()
    drawFrame(ctx, canvas(), frame(picture))
    expect(mock.drawImage).toHaveBeenCalledOnce()
  })
})
