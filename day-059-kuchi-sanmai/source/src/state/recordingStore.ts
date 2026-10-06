import { create } from 'zustand'
import { DEFAULT_RECORDING_STATE, type RecordingResult, type RecordingState } from '../types/recording'

interface RecordingStore extends RecordingState {
  patch: (partial: Partial<RecordingState>) => void
  setResult: (result: RecordingResult | null) => void
  reset: () => void
}

function revokeResult(result: RecordingResult | null) {
  if (result && typeof URL !== 'undefined' && result.url.startsWith('blob:')) URL.revokeObjectURL(result.url)
}

export const useRecordingStore = create<RecordingStore>()((set) => ({
  ...DEFAULT_RECORDING_STATE,
  patch: (partial) => set(partial),
  setResult: (result) =>
    set((s) => {
      if (s.result && s.result !== result) revokeResult(s.result)
      return { result }
    }),
  reset: () =>
    set((s) => {
      revokeResult(s.result)
      return { ...DEFAULT_RECORDING_STATE, autoPlayFromStart: s.autoPlayFromStart }
    }),
}))
