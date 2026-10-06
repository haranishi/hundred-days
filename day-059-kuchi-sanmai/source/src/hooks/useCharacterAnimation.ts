// 描画ループ。React の再レンダーとは切り離し、毎フレームの値は ref に置く。
// ストアは購読せず getState() で読む（購読するとフレームごとに再レンダーが走り、ループが作り直される）。

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useAnimationStore } from '../state/animationStore'
import { useCharacterStore } from '../state/characterStore'
import { useLiveStore } from '../state/liveStore'
import type { AnimationEngine, EngineFrame } from '../types/animation'

/** liveStore へ書く間隔。約15Hz。メーターはこの頻度で十分で、これ以上は再レンダーが無駄になる。 */
export const PUBLISH_INTERVAL_MS = 66

/** dt の上限。タブが裏に回って戻った直後に巨大な dt が入ると、口も微動も一気に飛ぶ。 */
export const MAX_DELTA_MS = 100

export interface UseCharacterAnimationOptions {
  engine: AnimationEngine
  /** 音声側の現在レベル 0..1 を同期で返す関数 */
  getLevel: () => number
  draw: (frame: EngineFrame) => void
  /** false でループを止める（素材が揃っていない・非表示など） */
  enabled: boolean
}

export interface UseCharacterAnimationResult {
  /** 最新フレーム。E2E とデバッグ表示がここを読む。 */
  frameRef: RefObject<EngineFrame | null>
}

export function useCharacterAnimation({ engine, getLevel, draw, enabled }: UseCharacterAnimationOptions): UseCharacterAnimationResult {
  const frameRef = useRef<EngineFrame | null>(null)
  const engineRef = useRef(engine)
  const getLevelRef = useRef(getLevel)
  const drawRef = useRef(draw)

  // 参照が変わってもループは作り直さない（rAF を張り直すと dt と FPS 計測が毎回途切れる）
  useEffect(() => {
    engineRef.current = engine
    getLevelRef.current = getLevel
    drawRef.current = draw
  })

  useEffect(() => {
    const publishStopped = () => useLiveStore.getState().publish({ running: false })
    if (!enabled) {
      publishStopped()
      return
    }

    let rafId = 0
    let started = false
    let lastTimeMs = 0
    let lastPublishMs = 0
    let framesSincePublish = 0

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop)

      const dtMs = started ? Math.min(MAX_DELTA_MS, Math.max(0, now - lastTimeMs)) : 0
      started = true
      lastTimeMs = now

      const frame = engineRef.current.update({
        timeMs: now,
        dtMs,
        level: getLevelRef.current(),
        settings: useAnimationStore.getState(),
        assets: useCharacterStore.getState().assets,
      })
      frameRef.current = frame
      drawRef.current(frame)

      framesSincePublish += 1
      const elapsed = now - lastPublishMs
      if (lastPublishMs === 0 || elapsed >= PUBLISH_INTERVAL_MS) {
        const fps = lastPublishMs === 0 || elapsed <= 0 ? 0 : Math.round((framesSincePublish * 1000) / elapsed)
        useLiveStore.getState().publish({
          level: frame.level,
          mouth: frame.mouth,
          blinking: frame.blinking,
          speaking: frame.speaking,
          fps,
          running: true,
        })
        lastPublishMs = now
        framesSincePublish = 0
      }
    }

    rafId = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafId)
      publishStopped()
    }
  }, [enabled])

  return { frameRef }
}
