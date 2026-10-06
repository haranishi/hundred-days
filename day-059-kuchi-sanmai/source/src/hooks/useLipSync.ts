// 口パク設定（操作する値）と、いまの口・レベル（見る値）をまとめて渡す。
// live 側は liveStore（約15Hz 更新）から取るので、60fps の再レンダーは起きない。

import { useAnimationStore } from '../state/animationStore'
import { useLiveStore } from '../state/liveStore'
import type { LipSyncSettings } from '../types/animation'
import type { MouthState } from '../types/character'

export interface UseLipSyncResult {
  settings: LipSyncSettings
  setLipSync: (partial: Partial<LipSyncSettings>) => void
  mouth: MouthState
  /** 平滑化後のレベル 0..1。しきい値スライダーの隣のメーターに出す */
  level: number
  speaking: boolean
}

export function useLipSync(): UseLipSyncResult {
  const settings = useAnimationStore((s) => s.lipSync)
  const setLipSync = useAnimationStore((s) => s.setLipSync)
  const mouth = useLiveStore((s) => s.mouth)
  const level = useLiveStore((s) => s.level)
  const speaking = useLiveStore((s) => s.speaking)

  return { settings, setLipSync, mouth, level, speaking }
}
