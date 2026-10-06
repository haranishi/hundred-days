import { createContext, useContext, type RefObject } from 'react'

export const PreviewCanvasContext = createContext<RefObject<HTMLCanvasElement | null> | null>(null)

export function usePreviewCanvas(): RefObject<HTMLCanvasElement | null> {
  const canvas = useContext(PreviewCanvasContext)
  if (!canvas) throw new Error('プレビューのキャンバスが見つかりません')
  return canvas
}
