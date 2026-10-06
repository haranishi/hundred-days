// まばたきの ON/OFF と現在の状態。blink 画像が無いときは available=false になり、
// UI 側はトグルを無効化して「素材が要る」ことを見せられる。

import { useCallback } from 'react'
import { useAnimationStore } from '../state/animationStore'
import { selectHasBlink, useCharacterStore } from '../state/characterStore'
import { useLiveStore } from '../state/liveStore'

export interface UseBlinkResult {
  enabled: boolean
  /** blink 画像が登録されているか。false のときは enabled が true でも瞬きしない */
  available: boolean
  blinking: boolean
  setEnabled: (value: boolean) => void
}

export function useBlink(): UseBlinkResult {
  const enabled = useAnimationStore((s) => s.motion.blinkEnabled)
  const setMotion = useAnimationStore((s) => s.setMotion)
  const available = useCharacterStore(selectHasBlink)
  const blinking = useLiveStore((s) => s.blinking)

  const setEnabled = useCallback((value: boolean) => setMotion({ blinkEnabled: value }), [setMotion])

  return { enabled, available, blinking, setEnabled }
}
