import { describe, expect, it } from 'vitest'
import { boundedPixelRatio, canStartDrag, defaultQuality, releaseVelocity } from '../../src/client/render/mobile-policy'

describe('mobile render and pointer budgets', () => {
  it('defaults coarse pointers to low and caps DPR and total pixels', () => {
    expect(defaultQuality(true)).toBe('low')
    expect(defaultQuality(false)).toBe('high')
    expect(boundedPixelRatio(390, 844, 3, 1.5)).toBe(1.5)
    const ratio = boundedPixelRatio(3000, 2000, 3, 2)
    expect(3000 * 2000 * ratio * ratio).toBeLessThanOrEqual(4_000_000)
    expect(boundedPixelRatio(390, 844, NaN, 2)).toBe(1)
  })
  it('ignores secondary buttons and extra pointers during a drag', () => {
    expect(canStartDrag(2, false)).toBe(false)
    expect(canStartDrag(0, true)).toBe(false)
    expect(canStartDrag(0, false)).toBe(true)
  })
  it('never retains inertia after cancel or under reduced motion', () => {
    expect(releaseVelocity(300, 10, false, false)).toBe(240)
    expect(releaseVelocity(-300, 10, false, false)).toBe(-240)
    expect(releaseVelocity(100, 10, true, false)).toBe(0)
    expect(releaseVelocity(100, 10, false, true)).toBe(0)
    expect(releaseVelocity(100, 121, false, false)).toBe(0)
  })
})
