import { create } from 'zustand'
import { DEFAULT_LIPSYNC, DEFAULT_MOTION, type AnimationSettings, type LipSyncSettings, type MotionSettings } from '../types/animation'

interface AnimationStore extends AnimationSettings {
  setLipSync: (partial: Partial<LipSyncSettings>) => void
  setMotion: (partial: Partial<MotionSettings>) => void
  reset: () => void
}

export const useAnimationStore = create<AnimationStore>()((set) => ({
  lipSync: { ...DEFAULT_LIPSYNC },
  motion: { ...DEFAULT_MOTION },
  setLipSync: (partial) => set((s) => ({ lipSync: { ...s.lipSync, ...partial } })),
  setMotion: (partial) => set((s) => ({ motion: { ...s.motion, ...partial } })),
  reset: () => set({ lipSync: { ...DEFAULT_LIPSYNC }, motion: { ...DEFAULT_MOTION } }),
}))

/** エンジンに渡す設定だけを取り出す（関数を含めない） */
export const selectAnimationSettings = (s: AnimationStore): AnimationSettings => ({ lipSync: s.lipSync, motion: s.motion })
