import { create } from 'zustand'
import type { MouthState } from '../types/character'

/**
 * 描画ループが約15回/秒でだけ書き込む「今の様子」。メーター・状態表示専用。
 * 毎フレーム（60fps）の値は hooks 側の ref に置き、React の再レンダーを起こさない。
 */
export interface LiveState {
  level: number
  mouth: MouthState
  blinking: boolean
  speaking: boolean
  fps: number
  /** 描画ループが動いているか */
  running: boolean
}

interface LiveStore extends LiveState {
  publish: (partial: Partial<LiveState>) => void
}

export const useLiveStore = create<LiveStore>()((set) => ({
  level: 0,
  mouth: 'closed',
  blinking: false,
  speaking: false,
  fps: 0,
  running: false,
  publish: (partial) => set(partial),
}))
