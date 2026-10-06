// アニメーション設定と AnimationEngine の契約。
// UI・音声処理はこの型だけに依存し、SpriteAnimationEngine（現在）/ AIAnimationEngine（将来）の中身を知らない。

import type { CharacterAssets, MouthState } from './character'

export interface LipSyncSettings {
  /** これ未満は closed。既定 0.08 */
  thresholdSmall: number
  /** これ以上は open。既定 0.22 */
  thresholdOpen: number
  /** 下がる方向にだけ効くヒステリシス幅（絶対値）。既定 0.02 */
  hysteresis: number
  /** 口の状態を切り替えたら最低この時間は保持する。既定 60ms（目安 50〜100） */
  minHoldMs: number
  /** level が上がるときの平滑化時定数。既定 25ms */
  attackMs: number
  /** level が下がるときの平滑化時定数。既定 90ms */
  releaseMs: number
}

export interface MotionSettings {
  /** 待機時の上下ゆらぎ（Y ±2〜4px・2〜4秒周期） */
  idleEnabled: boolean
  /** 発話時の Y / scale / rotation の微動 */
  talkingEnabled: boolean
  /** まばたき（blink 画像があるときだけ効く） */
  blinkEnabled: boolean
  /** 0..2。振幅の倍率。既定 1 */
  strength: number
}

export interface AnimationSettings {
  lipSync: LipSyncSettings
  motion: MotionSettings
}

export const DEFAULT_LIPSYNC: LipSyncSettings = {
  thresholdSmall: 0.08,
  thresholdOpen: 0.22,
  hysteresis: 0.02,
  minHoldMs: 60,
  attackMs: 25,
  releaseMs: 90,
}

export const DEFAULT_MOTION: MotionSettings = {
  idleEnabled: true,
  talkingEnabled: true,
  blinkEnabled: true,
  strength: 1,
}

/** 出力キャンバスのピクセル基準（1080×1920 等）での微動量。基準サイズは MOTION_REFERENCE_HEIGHT。 */
export const MOTION_REFERENCE_HEIGHT = 1080

export interface CharacterTransform {
  /** 出力キャンバス px。配置位置からの相対オフセット。 */
  offsetX: number
  offsetY: number
  /** 1.0 基準。発話時 1.0〜1.015 程度 */
  scale: number
  /** 度。発話時 -0.5〜0.5 程度 */
  rotationDeg: number
}

export interface EngineInput {
  /** performance.now() 相当の単調増加ミリ秒 */
  timeMs: number
  /** 前フレームからの経過ミリ秒（0 < dt <= 100 にクランプ済み） */
  dtMs: number
  /** 音声側の生の正規化レベル 0..1（平滑化はエンジン側の責務） */
  level: number
  settings: AnimationSettings
  assets: CharacterAssets
}

export interface EngineFrame {
  mouth: MouthState
  blinking: boolean
  /** 平滑化後のレベル 0..1（メーター表示・しきい値調整用） */
  level: number
  /** closed しきい値を超えているか */
  speaking: boolean
  /** 描く1枚。blink 中で blink 画像があればそれ、無ければ口の画像。素材未登録なら null */
  image: HTMLImageElement | null
  transform: CharacterTransform
}

export type AnimationEngineId = 'sprite' | 'ai'

export interface AnimationEngine {
  readonly id: AnimationEngineId
  readonly displayName: string
  /** 毎フレーム呼ぶ。純粋な入力→出力に近い形にし、UI や Web Audio に触らない。 */
  update(input: EngineInput): EngineFrame
  /** 音声を最初から再生するときなどに内部状態（口・まばたき・平滑化）を初期化する */
  reset(): void
  dispose(): void
}

export interface AnimationEngineDeps {
  /** 0..1 の乱数。テストでは固定列を渡す。既定 Math.random */
  random?: () => number
}
