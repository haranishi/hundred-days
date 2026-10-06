import { describe, expect, it } from 'vitest'
import {
  BLINK_CLOSE_MAX_MS,
  BLINK_CLOSE_MIN_MS,
  BLINK_INTERVAL_MAX_MS,
  BLINK_INTERVAL_MIN_MS,
  BlinkScheduler,
  LevelSmoother,
  LipSyncStateMachine,
  computeIdleOffset,
  computeTalkingTransform,
  selectSpriteImage,
} from './animation'
import { createAnimationEngine } from '../engine'
import { DEFAULT_LIPSYNC, DEFAULT_MOTION, type AnimationSettings, type LipSyncSettings } from '../types/animation'
import type { CharacterAsset, CharacterAssets, CharacterSlot } from '../types/character'

const LIPSYNC: LipSyncSettings = { ...DEFAULT_LIPSYNC }

/** node 環境には HTMLImageElement が無いので、drawImage に必要な形だけ持つ偽物を使う。 */
function fakeImage(label: string): HTMLImageElement {
  return { alt: label, naturalWidth: 400, naturalHeight: 600, width: 400, height: 600 } as unknown as HTMLImageElement
}

function asset(slot: CharacterSlot): CharacterAsset {
  return { slot, fileName: `${slot}.png`, objectUrl: `blob:${slot}`, image: fakeImage(slot), width: 400, height: 600 }
}

function assets(...slots: CharacterSlot[]): CharacterAssets {
  const result: CharacterAssets = {}
  for (const slot of slots) result[slot] = asset(slot)
  return result
}

/** 乱数を順に返す（尽きたら最後の値を返し続ける）。 */
function sequence(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[Math.min(i, values.length - 1)]
    i += 1
    return v
  }
}

describe('LevelSmoother', () => {
  it('上がるほうが下がるより速い（attack < release）', () => {
    const rising = new LevelSmoother()
    rising.update(1, 16, 25, 90)

    const falling = new LevelSmoother()
    falling.reset(1)
    falling.update(0, 16, 25, 90)

    // 0 から 1 へ寄った量 と 1 から 0 へ寄った量 を比べる
    expect(rising.value).toBeGreaterThan(1 - falling.value)
  })

  it('十分な時間で目標に収束する', () => {
    const smoother = new LevelSmoother()
    for (let i = 0; i < 100; i += 1) smoother.update(0.8, 16, 25, 90)
    expect(smoother.value).toBeCloseTo(0.8, 5)

    for (let i = 0; i < 200; i += 1) smoother.update(0, 16, 25, 90)
    expect(smoother.value).toBeCloseTo(0, 5)
  })

  it('dt=0 では動かず、reset で初期値へ戻る', () => {
    const smoother = new LevelSmoother()
    smoother.update(1, 0, 25, 90)
    expect(smoother.value).toBe(0)

    smoother.update(1, 50, 25, 90)
    expect(smoother.value).toBeGreaterThan(0)
    smoother.reset()
    expect(smoother.value).toBe(0)
  })

  it('目標は 0..1 に丸める', () => {
    const smoother = new LevelSmoother()
    for (let i = 0; i < 100; i += 1) smoother.update(5, 16, 25, 90)
    expect(smoother.value).toBeLessThanOrEqual(1)
  })
})

describe('LipSyncStateMachine', () => {
  /** 最小保持時間の影響を外して判定だけ見るため、毎回十分に時間を進める。 */
  function run(machine: LipSyncStateMachine, levels: number[], step = 1000): string[] {
    return levels.map((level, i) => machine.update(level, (i + 1) * step, LIPSYNC))
  }

  it('しきい値どおりに closed / small / open を選ぶ', () => {
    const machine = new LipSyncStateMachine()
    expect(run(machine, [0.05])).toEqual(['closed'])
    expect(run(new LipSyncStateMachine(), [0.1])).toEqual(['small'])
    expect(run(new LipSyncStateMachine(), [0.3])).toEqual(['open'])
  })

  it('closed から open へ直接遷移できる', () => {
    const machine = new LipSyncStateMachine()
    expect(machine.update(0.5, 1000, LIPSYNC)).toBe('open')
    expect(machine.state).toBe('open')
  })

  it('下がる方向にだけヒステリシスが効く（open は 0.21 で落ちず 0.19 で落ちる）', () => {
    const holding = new LipSyncStateMachine()
    run(holding, [0.3, 0.21])
    expect(holding.state).toBe('open')

    const dropping = new LipSyncStateMachine()
    run(dropping, [0.3, 0.19])
    expect(dropping.state).toBe('small')
  })

  it('open からは small を飛ばして closed まで落ちる', () => {
    const machine = new LipSyncStateMachine()
    run(machine, [0.3, 0.0])
    expect(machine.state).toBe('closed')
  })

  it('small は 0.07 では閉じず、0.05 で閉じる', () => {
    const holding = new LipSyncStateMachine()
    run(holding, [0.1, 0.07])
    expect(holding.state).toBe('small')

    const closing = new LipSyncStateMachine()
    run(closing, [0.1, 0.05])
    expect(closing.state).toBe('closed')
  })

  it('最小保持時間の間は境界を往復しても切り替わらない', () => {
    const machine = new LipSyncStateMachine()
    machine.update(0.3, 0, LIPSYNC)
    expect(machine.state).toBe('open')

    // minHoldMs = 60ms 未満の間に何度境界をまたいでも open のまま
    for (let t = 10; t < 60; t += 10) {
      machine.update(t % 20 === 0 ? 0 : 0.3, t, LIPSYNC)
      expect(machine.state).toBe('open')
    }
    expect(machine.update(0, 60, LIPSYNC)).toBe('closed')
  })

  it('reset で closed に戻り、直後の変更が保持時間で妨げられない', () => {
    const machine = new LipSyncStateMachine()
    machine.update(0.3, 1000, LIPSYNC)
    machine.reset()
    expect(machine.state).toBe('closed')
    expect(machine.update(0.3, 1001, LIPSYNC)).toBe('open')
  })
})

describe('BlinkScheduler', () => {
  it('乱数 0 と 1 で間隔と閉眼が範囲の両端になる', () => {
    const shortest = new BlinkScheduler(sequence([0]))
    expect(shortest.update(0, true)).toBe(false)
    expect(shortest.update(BLINK_INTERVAL_MIN_MS - 1, true)).toBe(false)
    expect(shortest.update(BLINK_INTERVAL_MIN_MS, true)).toBe(true)
    expect(shortest.update(BLINK_INTERVAL_MIN_MS + BLINK_CLOSE_MIN_MS - 1, true)).toBe(true)
    expect(shortest.update(BLINK_INTERVAL_MIN_MS + BLINK_CLOSE_MIN_MS, true)).toBe(false)

    const longest = new BlinkScheduler(sequence([1]))
    expect(longest.update(0, true)).toBe(false)
    expect(longest.update(BLINK_INTERVAL_MAX_MS - 1, true)).toBe(false)
    expect(longest.update(BLINK_INTERVAL_MAX_MS, true)).toBe(true)
    expect(longest.update(BLINK_INTERVAL_MAX_MS + BLINK_CLOSE_MAX_MS - 1, true)).toBe(true)
    expect(longest.update(BLINK_INTERVAL_MAX_MS + BLINK_CLOSE_MAX_MS, true)).toBe(false)
  })

  it('繰り返しても間隔 3000〜7000ms・閉眼 100〜180ms に収まる', () => {
    const random = sequence([0.25, 0.75, 0.5, 0.1, 0.9, 0.4, 0.6, 0.2])
    const scheduler = new BlinkScheduler(random)
    let blinking = false
    let lastOpenAt = 0
    let closedAt = 0
    const intervals: number[] = []
    const closures: number[] = []

    for (let t = 0; t <= 60000; t += 10) {
      const next = scheduler.update(t, true)
      if (next && !blinking) {
        intervals.push(t - lastOpenAt)
        closedAt = t
      }
      if (!next && blinking) {
        closures.push(t - closedAt)
        lastOpenAt = t
      }
      blinking = next
    }

    expect(intervals.length).toBeGreaterThan(5)
    expect(closures.length).toBeGreaterThan(5)
    // 10ms 刻みで観測するので、量子化ぶん 1 ステップの余裕をみる
    for (const interval of intervals) {
      expect(interval).toBeGreaterThanOrEqual(BLINK_INTERVAL_MIN_MS)
      expect(interval).toBeLessThanOrEqual(BLINK_INTERVAL_MAX_MS + 10)
    }
    for (const closure of closures) {
      expect(closure).toBeGreaterThanOrEqual(BLINK_CLOSE_MIN_MS)
      expect(closure).toBeLessThanOrEqual(BLINK_CLOSE_MAX_MS + 10)
    }
  })

  it('enabled=false の間は常に false で、有効化した時点から測り直す', () => {
    const scheduler = new BlinkScheduler(sequence([0]))
    for (let t = 0; t <= 20000; t += 100) {
      expect(scheduler.update(t, false)).toBe(false)
    }
    // 無効中に予定は流れているので、再開直後は閉じない
    expect(scheduler.update(20100, true)).toBe(false)
    expect(scheduler.update(20100 + BLINK_INTERVAL_MIN_MS - 1, true)).toBe(false)
    expect(scheduler.update(20100 + BLINK_INTERVAL_MIN_MS, true)).toBe(true)
  })

  it('閉眼中に無効化されたら即座に開く', () => {
    const scheduler = new BlinkScheduler(sequence([0]))
    scheduler.update(0, true)
    expect(scheduler.update(BLINK_INTERVAL_MIN_MS, true)).toBe(true)
    expect(scheduler.update(BLINK_INTERVAL_MIN_MS + 10, false)).toBe(false)
  })
})

describe('computeIdleOffset', () => {
  it('周期 3200ms で ±3px を超えない', () => {
    for (let t = 0; t <= 6400; t += 13) {
      expect(Math.abs(computeIdleOffset(t, 1))).toBeLessThanOrEqual(3 + 1e-9)
    }
    expect(computeIdleOffset(0, 1)).toBeCloseTo(0, 10)
    expect(computeIdleOffset(800, 1)).toBeCloseTo(3, 10)
    expect(computeIdleOffset(2400, 1)).toBeCloseTo(-3, 10)
    expect(computeIdleOffset(3200, 1)).toBeCloseTo(0, 10)
  })

  it('strength に比例する', () => {
    expect(computeIdleOffset(800, 0)).toBe(0)
    expect(computeIdleOffset(800, 2)).toBeCloseTo(6, 10)
  })
})

describe('computeTalkingTransform', () => {
  it('level 1・strength 1 でも拡大は 1.015 まで、回転は ±0.5 度まで', () => {
    for (let t = 0; t <= 4000; t += 7) {
      const transform = computeTalkingTransform(1, t, 1)
      expect(transform.scale).toBeLessThanOrEqual(1.015 + 1e-12)
      expect(transform.scale).toBeGreaterThanOrEqual(1)
      expect(Math.abs(transform.rotationDeg)).toBeLessThanOrEqual(0.5 + 1e-12)
      expect(transform.offsetY).toBeCloseTo(-8, 10)
      expect(transform.offsetX).toBe(0)
    }
  })

  it('strength 0 と level 0 では無変化', () => {
    expect(computeTalkingTransform(1, 1234, 0)).toEqual({ offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 })
    expect(computeTalkingTransform(0, 1234, 1)).toEqual({ offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 })
  })

  it('level に比例して振幅が増える', () => {
    const half = computeTalkingTransform(0.5, 500, 1)
    const full = computeTalkingTransform(1, 500, 1)
    expect(half.offsetY).toBeCloseTo(full.offsetY / 2, 10)
    expect(half.scale - 1).toBeCloseTo((full.scale - 1) / 2, 10)
  })
})

describe('selectSpriteImage', () => {
  it('まばたき中は blink 画像が最優先', () => {
    const all = assets('mouthClosed', 'mouthSmall', 'mouthOpen', 'blink')
    expect(selectSpriteImage(all, 'open', true)).toBe(all.blink?.image)
    expect(selectSpriteImage(all, 'open', false)).toBe(all.mouthOpen?.image)
    expect(selectSpriteImage(all, 'small', false)).toBe(all.mouthSmall?.image)
    expect(selectSpriteImage(all, 'closed', false)).toBe(all.mouthClosed?.image)
  })

  it('blink 画像が無ければ、まばたき中でも口の画像を使う', () => {
    const noBlink = assets('mouthClosed', 'mouthSmall', 'mouthOpen')
    expect(selectSpriteImage(noBlink, 'open', true)).toBe(noBlink.mouthOpen?.image)
  })

  it('口の画像が欠けていれば mouthClosed に落ち、それも無ければ null', () => {
    const only = assets('mouthClosed')
    expect(selectSpriteImage(only, 'open', false)).toBe(only.mouthClosed?.image)
    expect(selectSpriteImage({}, 'closed', false)).toBeNull()
    expect(selectSpriteImage({}, 'open', true)).toBeNull()
  })
})

describe('SpriteAnimationEngine（lib の合成結果）', () => {
  const settings: AnimationSettings = { lipSync: { ...DEFAULT_LIPSYNC }, motion: { ...DEFAULT_MOTION } }

  it("createAnimationEngine の既定は sprite で、'ai' は投げる", () => {
    expect(createAnimationEngine().id).toBe('sprite')
    expect(() => createAnimationEngine('ai')).toThrow(/not available/)
  })

  it('大きい level を与え続けると口が開き、無音に戻すと閉じる', () => {
    const engine = createAnimationEngine('sprite', { random: sequence([0.5]) })
    const all = assets('mouthClosed', 'mouthSmall', 'mouthOpen', 'blink')
    let timeMs = 0
    let frame = engine.update({ timeMs, dtMs: 0, level: 0, settings, assets: all })
    expect(frame.mouth).toBe('closed')
    expect(frame.speaking).toBe(false)

    for (let i = 0; i < 40; i += 1) {
      timeMs += 16
      frame = engine.update({ timeMs, dtMs: 16, level: 0.9, settings, assets: all })
    }
    expect(frame.mouth).toBe('open')
    expect(frame.speaking).toBe(true)
    expect(frame.image).toBe(all.mouthOpen?.image)
    expect(frame.level).toBeGreaterThan(0.8)

    for (let i = 0; i < 100; i += 1) {
      timeMs += 16
      frame = engine.update({ timeMs, dtMs: 16, level: 0, settings, assets: all })
    }
    expect(frame.mouth).toBe('closed')
    expect(frame.speaking).toBe(false)
  })

  it('モーションを切ると変形せず、reset で状態が初期化される', () => {
    const engine = createAnimationEngine('sprite', { random: sequence([0.5]) })
    const off: AnimationSettings = {
      lipSync: { ...DEFAULT_LIPSYNC },
      motion: { idleEnabled: false, talkingEnabled: false, blinkEnabled: false, strength: 1 },
    }
    const all = assets('mouthClosed', 'mouthSmall', 'mouthOpen', 'blink')
    let frame = engine.update({ timeMs: 800, dtMs: 16, level: 1, settings: off, assets: all })
    expect(frame.transform).toEqual({ offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 })
    expect(frame.blinking).toBe(false)

    for (let i = 0; i < 40; i += 1) frame = engine.update({ timeMs: 1000 + i * 16, dtMs: 16, level: 1, settings, assets: all })
    expect(frame.level).toBeGreaterThan(0.5)
    engine.reset()
    frame = engine.update({ timeMs: 2000, dtMs: 0, level: 0, settings, assets: all })
    expect(frame.level).toBe(0)
    expect(frame.mouth).toBe('closed')
  })

  it('blink 画像が無ければ blinkEnabled でもまばたきしない', () => {
    const engine = createAnimationEngine('sprite', { random: sequence([0]) })
    const noBlink = assets('mouthClosed', 'mouthSmall', 'mouthOpen')
    let blinked = false
    for (let t = 0; t <= 20000; t += 16) {
      const frame = engine.update({ timeMs: t, dtMs: 16, level: 0, settings, assets: noBlink })
      if (frame.blinking) blinked = true
    }
    expect(blinked).toBe(false)
  })
})
