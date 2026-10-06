// 出力キャンバス（プレビュー兼録画対象）の型契約。

export type CanvasPresetId = 'shorts' | 'youtube' | 'square'

export interface CanvasPreset {
  id: CanvasPresetId
  label: string
  hint: string
  width: number
  height: number
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: 'shorts', label: '縦 9:16', hint: 'YouTube Shorts / TikTok / Reels', width: 1080, height: 1920 },
  { id: 'youtube', label: '横 16:9', hint: 'YouTube', width: 1920, height: 1080 },
  { id: 'square', label: '正方形 1:1', hint: 'X / Instagram', width: 1080, height: 1080 },
]

export type BackgroundKind = 'transparent' | 'white' | 'black' | 'green' | 'color' | 'image'

export interface BackgroundImage {
  fileName: string
  objectUrl: string
  image: HTMLImageElement
  width: number
  height: number
}

export interface BackgroundSetting {
  kind: BackgroundKind
  /** kind === 'color' のときの色。#rrggbb */
  color: string
  /** kind === 'image' のときの画像（cover で全面に敷く） */
  image: BackgroundImage | null
}

export interface CharacterPlacement {
  /** キャラ中心の X。キャンバス幅に対する割合 0..1（0.5 = 中央） */
  x: number
  /** キャラ中心の Y。キャンバス高さに対する割合 0..1 */
  y: number
  /** キャラの表示高さ。キャンバス高さに対する割合（0.1..1.5、既定 0.8） */
  size: number
}

export interface CanvasState {
  preset: CanvasPresetId
  width: number
  height: number
  background: BackgroundSetting
  placement: CharacterPlacement
  /** true で imageSmoothingEnabled = false（ドット絵をにじませない） */
  pixelArt: boolean
}

export const DEFAULT_CANVAS_STATE: CanvasState = {
  preset: 'shorts',
  width: 1080,
  height: 1920,
  background: { kind: 'transparent', color: '#1e293b', image: null },
  placement: { x: 0.5, y: 0.55, size: 0.8 },
  pixelArt: false,
}

export const GREEN_SCREEN = '#00ff00'
