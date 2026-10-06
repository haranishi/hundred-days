// キャンバスへの描画。ctx を受け取るだけで、要素の生成・サイズ変更・ストア参照はしない
// （呼ぶのは hooks/useCanvasRenderer）。テストは偽 ctx で呼び出し列を見る。

import { MOTION_REFERENCE_HEIGHT, type CharacterTransform, type EngineFrame } from '../types/animation'
import { GREEN_SCREEN, type CanvasState } from '../types/canvas'

export const WHITE = '#ffffff'
export const BLACK = '#000000'

/** 回転をかける前のキャラ矩形。ドラッグでの当たり判定にも使う。 */
export interface CharacterRect {
  x: number
  y: number
  width: number
  height: number
  /** 回転と拡大の中心（= 配置位置＋微動オフセット） */
  cx: number
  cy: number
}

export interface ImageSize {
  width: number
  height: number
}

/**
 * 画像の素の大きさ。decode 前や SVG では naturalWidth が 0 になることがあるので width/height に落とす。
 * どちらも取れなければ 0 を返し、呼び出し側が「描かない」を選べるようにする。
 */
export function resolveImageSize(image: HTMLImageElement): ImageSize {
  const width = image.naturalWidth || image.width || 0
  const height = image.naturalHeight || image.height || 0
  return { width, height }
}

/**
 * 表示位置と大きさ。高さを「キャンバス高さ × size × scale」で決め、幅はアスペクト比で従う。
 * 微動のオフセットは基準1080px での px なので、実際のキャンバス高さの比 k を掛ける
 * （こうしないと 1920 高のときだけ揺れが半分に見える）。
 */
export function computeCharacterRect(canvas: CanvasState, imageSize: ImageSize, transform: CharacterTransform): CharacterRect {
  const k = canvas.height / MOTION_REFERENCE_HEIGHT
  const cx = canvas.width * canvas.placement.x + transform.offsetX * k
  const cy = canvas.height * canvas.placement.y + transform.offsetY * k
  const height = canvas.height * canvas.placement.size * transform.scale
  const aspect = imageSize.height > 0 ? imageSize.width / imageSize.height : 1
  const width = height * aspect
  return { x: cx - width / 2, y: cy - height / 2, width, height, cx, cy }
}

/** 背景画像は cover（比率を保ったまま全面を覆い、はみ出しは中央基準で切る）。 */
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, size: ImageSize, canvas: CanvasState): void {
  if (size.width <= 0 || size.height <= 0) return
  const scale = Math.max(canvas.width / size.width, canvas.height / size.height)
  const width = size.width * scale
  const height = size.height * scale
  ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
}

function drawBackground(ctx: CanvasRenderingContext2D, canvas: CanvasState): void {
  const background = canvas.background
  switch (background.kind) {
    case 'transparent':
      // 何も塗らない。透過のまま録画・書き出しへ渡す
      return
    case 'white':
      fill(ctx, canvas, WHITE)
      return
    case 'black':
      fill(ctx, canvas, BLACK)
      return
    case 'green':
      fill(ctx, canvas, GREEN_SCREEN)
      return
    case 'color':
      fill(ctx, canvas, background.color)
      return
    case 'image': {
      const bg = background.image
      if (!bg) return
      const size = bg.width > 0 && bg.height > 0 ? { width: bg.width, height: bg.height } : resolveImageSize(bg.image)
      drawCover(ctx, bg.image, size, canvas)
      return
    }
  }
}

function fill(ctx: CanvasRenderingContext2D, canvas: CanvasState, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

/** 1フレーム分（全消し → 背景 → キャラ1枚）。状態は ctx に残さない（save/restore で挟む）。 */
export function drawFrame(ctx: CanvasRenderingContext2D, canvas: CanvasState, frame: EngineFrame): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = !canvas.pixelArt
  if (!canvas.pixelArt) ctx.imageSmoothingQuality = 'high'

  drawBackground(ctx, canvas)

  const image = frame.image
  if (!image) return
  const size = resolveImageSize(image)
  if (size.width <= 0 || size.height <= 0) return
  const rect = computeCharacterRect(canvas, size, frame.transform)
  if (!(rect.width > 0) || !(rect.height > 0)) return

  ctx.save()
  ctx.translate(rect.cx, rect.cy)
  ctx.rotate((frame.transform.rotationDeg * Math.PI) / 180)
  ctx.drawImage(image, -rect.width / 2, -rect.height / 2, rect.width, rect.height)
  ctx.restore()
}
