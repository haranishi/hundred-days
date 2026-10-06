// 画像切替（スプライト）方式のアニメーションエンジン。
// lib/animation.ts の純粋クラスを組み合わせるだけで、Web Audio・DOM・ストアには触らない。
// 将来 AIAnimationEngine を足すときも、この update(input) => frame の形だけ守れば UI は変えずに済む。

import {
  BlinkScheduler,
  LevelSmoother,
  LipSyncStateMachine,
  computeIdleOffset,
  computeTalkingTransform,
  selectSpriteImage,
} from '../lib/animation'
import type {
  AnimationEngine,
  AnimationEngineDeps,
  AnimationEngineId,
  CharacterTransform,
  EngineFrame,
  EngineInput,
} from '../types/animation'

const NEUTRAL: CharacterTransform = { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 }

export class SpriteAnimationEngine implements AnimationEngine {
  readonly id: AnimationEngineId = 'sprite'
  readonly displayName = 'スプライト（画像切替）'

  private smoother = new LevelSmoother()
  private lipSync = new LipSyncStateMachine()
  private blink: BlinkScheduler

  constructor(deps: AnimationEngineDeps = {}) {
    this.blink = new BlinkScheduler(deps.random)
  }

  update(input: EngineInput): EngineFrame {
    const { lipSync: lipSyncSettings, motion } = input.settings

    // 1. 生レベルを平滑化する。以降のしきい値判定・微動はすべて平滑化後の値で行う
    const level = this.smoother.update(input.level, input.dtMs, lipSyncSettings.attackMs, lipSyncSettings.releaseMs)

    // 2. 口の状態。speaking は「閉じるしきい値を超えているか」だけの素直な判定
    const mouth = this.lipSync.update(level, input.timeMs, lipSyncSettings)
    const speaking = level >= lipSyncSettings.thresholdSmall

    // 3. まばたきは blink 画像があるときだけ動かす（無ければ予定も立てない）
    const blinking = this.blink.update(input.timeMs, motion.blinkEnabled && Boolean(input.assets.blink))

    // 4. 待機のゆらぎと発話の微動は独立に足す（喋りながらでも呼吸は止まらない）
    const transform: CharacterTransform = { ...NEUTRAL }
    if (motion.idleEnabled) {
      transform.offsetY += computeIdleOffset(input.timeMs, motion.strength)
    }
    if (motion.talkingEnabled) {
      const talking = computeTalkingTransform(level, input.timeMs, motion.strength)
      transform.offsetX += talking.offsetX
      transform.offsetY += talking.offsetY
      transform.scale = talking.scale
      transform.rotationDeg = talking.rotationDeg
    }

    return {
      mouth,
      blinking,
      level,
      speaking,
      image: selectSpriteImage(input.assets, mouth, blinking),
      transform,
    }
  }

  /** 音声を頭出しするときなどに呼ぶ。前の再生の口・まばたき・平滑化を持ち越さない。 */
  reset(): void {
    this.smoother.reset()
    this.lipSync.reset()
    this.blink.reset()
  }

  dispose(): void {
    this.reset()
  }
}
