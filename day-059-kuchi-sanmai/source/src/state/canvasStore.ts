import { create } from 'zustand'
import {
  CANVAS_PRESETS,
  DEFAULT_CANVAS_STATE,
  type BackgroundImage,
  type BackgroundSetting,
  type CanvasPresetId,
  type CanvasState,
  type CharacterPlacement,
} from '../types/canvas'

interface CanvasStore extends CanvasState {
  setPreset: (preset: CanvasPresetId) => void
  setBackground: (partial: Partial<BackgroundSetting>) => void
  setBackgroundImage: (image: BackgroundImage | null) => void
  setPlacement: (partial: Partial<CharacterPlacement>) => void
  setPixelArt: (pixelArt: boolean) => void
  reset: () => void
}

function revokeImage(image: BackgroundImage | null) {
  if (image && typeof URL !== 'undefined' && image.objectUrl.startsWith('blob:')) URL.revokeObjectURL(image.objectUrl)
}

export const useCanvasStore = create<CanvasStore>()((set) => ({
  ...DEFAULT_CANVAS_STATE,
  setPreset: (preset) => {
    const p = CANVAS_PRESETS.find((c) => c.id === preset) ?? CANVAS_PRESETS[0]
    set({ preset: p.id, width: p.width, height: p.height })
  },
  setBackground: (partial) => set((s) => ({ background: { ...s.background, ...partial } })),
  setBackgroundImage: (image) =>
    set((s) => {
      if (s.background.image && s.background.image !== image) revokeImage(s.background.image)
      return { background: { ...s.background, image, kind: image ? 'image' : s.background.kind === 'image' ? 'transparent' : s.background.kind } }
    }),
  setPlacement: (partial) => set((s) => ({ placement: { ...s.placement, ...partial } })),
  setPixelArt: (pixelArt) => set({ pixelArt }),
  reset: () =>
    set((s) => {
      revokeImage(s.background.image)
      return { ...DEFAULT_CANVAS_STATE, background: { ...DEFAULT_CANVAS_STATE.background }, placement: { ...DEFAULT_CANVAS_STATE.placement } }
    }),
}))
