// 口パク・まばたき・微動の純粋ロジック。DOM・Web Audio・ストアには触らない。
// 乱数は注入できるようにしてあり（BlinkScheduler）、テストは固定列で決定的に回る。

import type { CharacterTransform, LipSyncSettings } from '../types/animation'
import { MOUTH_SLOT, type CharacterAssets, type MouthState } from '../types/character'

/** 待機のゆらぎ: 振幅 3px（基準1080px換算）・周期 3200ms */
export const IDLE_AMPLITUDE_PX = 3
export const IDLE_PERIOD_MS = 3200

/** 発話の微動: 上へ 8px・拡大 1.5%・回転 0.5 度を上限に、level と strength で縮める */
export const TALKING_OFFSET_PX = 8
export const TALKING_SCALE_GAIN = 0.015
export const TALKING_ROTATION_DEG = 0.5
/** 回転は周期の違う2つの正弦波を 0.6:0.4 で混ぜ、往復が機械的に見えないようにする */
export const TALKING_ROTATION_SLOW_MS = 900
export const TALKING_ROTATION_FAST_MS = 370

/** まばたきの間隔と閉眼時間（人の平均的な瞬きに合わせた範囲） */
export const BLINK_INTERVAL_MIN_MS = 3000
export const BLINK_INTERVAL_MAX_MS = 7000
export const BLINK_CLOSE_MIN_MS = 100
export const BLINK_CLOSE_MAX_MS = 180

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  return value >= 1 ? 1 : value
}

/**
 * レベルの指数平滑化。上がるときは attack、下がるときは release の時定数を使う。
 * 口を開けるのは速く・閉じるのは遅くしたいので、非対称にしてある（対称だと語尾でパタパタする）。
 * alpha = 1 - exp(-dt / tau) なので、フレームレートが揺れても見た目の速さが変わらない。
 */
export class LevelSmoother {
  private current = 0

  get value(): number {
    return this.current
  }

  reset(value = 0): void {
    this.current = clamp01(value)
  }

  update(target: number, dtMs: number, attackMs: number, releaseMs: number): number {
    const goal = clamp01(target)
    const tau = goal > this.current ? attackMs : releaseMs
    const dt = Math.max(0, dtMs)
    if (!Number.isFinite(tau) || tau <= 0) {
      // 時定数 0 は「平滑化しない」の意味にする
      this.current = goal
    } else if (dt > 0) {
      const alpha = 1 - Math.exp(-dt / tau)
      this.current += (goal - this.current) * alpha
    }
    return this.current
  }
}

/**
 * レベル → 口の3状態。しきい値そのままだと境界でパタパタするので、
 * 「下がる方向にだけヒステリシス」と「最小保持時間」の2段構えで止める。
 * 上がる方向は素直に通す（反応が遅れると声と口がずれて見える）。
 */
export class LipSyncStateMachine {
  private current: MouthState = 'closed'
  private lastChangeMs = Number.NEGATIVE_INFINITY

  get state(): MouthState {
    return this.current
  }

  reset(): void {
    this.current = 'closed'
    this.lastChangeMs = Number.NEGATIVE_INFINITY
  }

  update(level: number, timeMs: number, settings: LipSyncSettings): MouthState {
    const next = this.resolve(level, settings)
    if (next !== this.current && timeMs - this.lastChangeMs >= settings.minHoldMs) {
      this.current = next
      this.lastChangeMs = timeMs
    }
    return this.current
  }

  /** 保持時間を無視した「いま行きたい状態」。閉じる方向だけヒステリシス分を差し引く。 */
  private resolve(level: number, settings: LipSyncSettings): MouthState {
    const { thresholdSmall, thresholdOpen, hysteresis } = settings
    const closeSmall = thresholdSmall - hysteresis
    const closeOpen = thresholdOpen - hysteresis

    if (this.current === 'closed') {
      if (level >= thresholdOpen) return 'open'
      return level >= thresholdSmall ? 'small' : 'closed'
    }
    if (this.current === 'small') {
      if (level >= thresholdOpen) return 'open'
      return level < closeSmall ? 'closed' : 'small'
    }
    // open からは small を飛ばして closed まで落ちてよい（無音が来たら即閉じる）
    if (level < closeSmall) return 'closed'
    return level < closeOpen ? 'small' : 'open'
  }
}

/**
 * まばたきの時計。3〜7秒ごとに 100〜180ms 目を閉じる。
 * enabled が false の間は閉じないだけでなく予定も捨て、有効に戻った時点から測り直す
 * （そうしないと、しばらく無効にしていた直後に瞬きが連発する）。
 */
export class BlinkScheduler {
  private random: () => number
  private nextAtMs: number | null = null
  private closeUntilMs = 0
  private blinking = false

  constructor(random: () => number = Math.random) {
    this.random = random
  }

  reset(): void {
    this.nextAtMs = null
    this.closeUntilMs = 0
    this.blinking = false
  }

  update(timeMs: number, enabled: boolean): boolean {
    if (!enabled) {
      this.reset()
      return false
    }
    if (this.nextAtMs === null) {
      this.nextAtMs = timeMs + this.pick(BLINK_INTERVAL_MIN_MS, BLINK_INTERVAL_MAX_MS)
      return false
    }
    if (this.blinking) {
      if (timeMs < this.closeUntilMs) return true
      this.blinking = false
      this.nextAtMs = timeMs + this.pick(BLINK_INTERVAL_MIN_MS, BLINK_INTERVAL_MAX_MS)
      return false
    }
    if (timeMs >= this.nextAtMs) {
      this.blinking = true
      this.closeUntilMs = timeMs + this.pick(BLINK_CLOSE_MIN_MS, BLINK_CLOSE_MAX_MS)
      return true
    }
    return false
  }

  private pick(min: number, max: number): number {
    const r = this.random()
    const ratio = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0
    return min + ratio * (max - min)
  }
}

/** 待機中の上下のゆらぎ（px・基準キャンバス高さ 1080 換算）。描画側で実サイズに掛け直す。 */
export function computeIdleOffset(timeMs: number, strength: number): number {
  if (!Number.isFinite(timeMs) || !Number.isFinite(strength)) return 0
  return IDLE_AMPLITUDE_PX * strength * Math.sin((2 * Math.PI * timeMs) / IDLE_PERIOD_MS)
}

/** 発話中の微動。level と strength が 0 なら完全に無変化（scale 1・回転 0）。 */
export function computeTalkingTransform(level: number, timeMs: number, strength: number): CharacterTransform {
  const amount = Number.isFinite(level) && Number.isFinite(strength) ? Math.max(0, level) * strength : 0
  if (amount === 0 || !Number.isFinite(timeMs)) {
    return { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 }
  }
  const slow = Math.sin((2 * Math.PI * timeMs) / TALKING_ROTATION_SLOW_MS)
  const fast = Math.sin((2 * Math.PI * timeMs) / TALKING_ROTATION_FAST_MS)
  return {
    offsetX: 0,
    offsetY: -TALKING_OFFSET_PX * amount,
    scale: 1 + TALKING_SCALE_GAIN * amount,
    rotationDeg: TALKING_ROTATION_DEG * amount * (0.6 * slow + 0.4 * fast),
  }
}

/**
 * いま描く1枚を選ぶ。まばたき画像が最優先で、次に口の画像。
 * 口の画像が欠けていても mouthClosed があれば描ける（素材を入れ切る前でもプレビューが出る）。
 */
export function selectSpriteImage(assets: CharacterAssets, mouth: MouthState, blinking: boolean): HTMLImageElement | null {
  if (blinking && assets.blink) return assets.blink.image
  const asset = assets[MOUTH_SLOT[mouth]] ?? assets.mouthClosed
  return asset ? asset.image : null
}
