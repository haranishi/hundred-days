import { create } from 'zustand'
import { DEFAULT_AUDIO_STATE, type AudioState } from '../types/audio'

interface AudioStore extends AudioState {
  patch: (partial: Partial<AudioState>) => void
  reset: () => void
}

/** 低頻度の UI 状態だけを持つ。毎フレームの level は liveStore、AudioContext 等は lib/audio の AudioGraph が持つ。 */
export const useAudioStore = create<AudioStore>()((set) => ({
  ...DEFAULT_AUDIO_STATE,
  patch: (partial) => set(partial),
  reset: () => set({ ...DEFAULT_AUDIO_STATE }),
}))
