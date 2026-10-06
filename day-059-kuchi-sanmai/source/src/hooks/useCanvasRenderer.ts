// canvas 要素と lib/render をつなぐ。ここだけが DOM の canvas を触る。
// draw は描画ループから毎フレーム呼ばれるので、参照が変わらないよう useCallback で固定する。

import { useCallback } from 'react'
import type { RefObject } from 'react'
import { drawFrame } from '../lib/render'
import { useCanvasStore } from '../state/canvasStore'
import type { EngineFrame } from '../types/animation'

export interface UseCanvasRendererResult {
  draw: (frame: EngineFrame) => void
}

export function useCanvasRenderer(canvasRef: RefObject<HTMLCanvasElement | null>): UseCanvasRendererResult {
  const draw = useCallback(
    (frame: EngineFrame) => {
      const element = canvasRef.current
      if (!element) return

      // プリセット変更は再レンダーを待たずここで実ピクセルへ反映する（canvas は width/height 代入で中身が消える）
      const canvas = useCanvasStore.getState()
      if (element.width !== canvas.width) element.width = canvas.width
      if (element.height !== canvas.height) element.height = canvas.height

      const ctx = element.getContext('2d')
      if (!ctx) return
      drawFrame(ctx, canvas, frame)
    },
    [canvasRef],
  )

  return { draw }
}
