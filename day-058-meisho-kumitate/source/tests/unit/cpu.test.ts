import { describe, expect, it } from 'vitest'
import { CPU_BUZZ_MAX, CPU_BUZZ_MIN, CPU_DIFFICULTY_DELAY, CPU_LEVELS } from '../../src/shared/config'
import { CPU_LEVEL_NAMES, CPU_LEVEL_ORDER, cpuPlan, cpuResumeDelayMs } from '../../src/shared/cpu'
import { createRng } from '../../src/shared/rng'
import type { CpuLevel, CpuPlan } from '../../src/shared/types'

// 金閣寺が正解（0番）。銀閣寺と平等院は「見間違えやすい名所」、富士山はちがう
const CHOICES = ['kinkakuji', 'ginkakuji', 'byodoin', 'mt-fuji']
const LEVELS: CpuLevel[] = ['minarai', 'veteran', 'densetsu']

function sample(level: CpuLevel, difficulty: number, n: number, tag = ''): CpuPlan[] {
  return Array.from({ length: n }, (_, i) => cpuPlan(createRng(`${tag}${level}-${difficulty}-${i}`), level, difficulty, CHOICES, 0))
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]): number => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

describe('コンピューターの予定（cpuPlan）', () => {
  for (const level of LEVELS) {
    it(`${CPU_LEVEL_NAMES[level]}：押す進み具合の平均とばらつき・当たる確率が docs/03 の表どおり`, () => {
      const plans = sample(level, 1, 4000)
      const spec = CPU_LEVELS[level]
      const buzz = plans.map((p) => p.buzzProgress)
      expect(Math.abs(mean(buzz) - spec.buzzMean)).toBeLessThan(0.01)
      expect(Math.abs(sd(buzz) - spec.buzzSd)).toBeLessThan(0.006)
      const accuracy = plans.filter((p) => p.correct).length / plans.length
      expect(Math.abs(accuracy - spec.accuracy)).toBeLessThan(0.03)
    })
  }

  it('表の値そのもの（見習い0.70・0.08・65%／ベテラン0.52・0.08・80%／伝説0.36・0.07・92%）', () => {
    expect(CPU_LEVELS).toEqual({
      minarai: { buzzMean: 0.7, buzzSd: 0.08, accuracy: 0.65 },
      veteran: { buzzMean: 0.52, buzzSd: 0.08, accuracy: 0.8 },
      densetsu: { buzzMean: 0.36, buzzSd: 0.07, accuracy: 0.92 },
    })
    expect(CPU_LEVEL_ORDER).toEqual(LEVELS)
  })

  it('名所の難しさが1上がるごとに、押す進み具合が0.06遅れる', () => {
    const d1 = mean(sample('veteran', 1, 3000, 'd').map((p) => p.buzzProgress))
    const d2 = mean(sample('veteran', 2, 3000, 'd').map((p) => p.buzzProgress))
    const d3 = mean(sample('veteran', 3, 3000, 'd').map((p) => p.buzzProgress))
    expect(d2 - d1).toBeCloseTo(CPU_DIFFICULTY_DELAY, 2)
    expect(d3 - d1).toBeCloseTo(2 * CPU_DIFFICULTY_DELAY, 2)
  })

  it('押す進み具合は0.12〜1.05、考える時間は1.0〜1.8秒に収まる', () => {
    let reachedLastCall = false
    for (const level of LEVELS) {
      for (const d of [1, 2, 3]) {
        for (const p of sample(level, d, 1500, 'range')) {
          expect(p.buzzProgress).toBeGreaterThanOrEqual(CPU_BUZZ_MIN)
          expect(p.buzzProgress).toBeLessThanOrEqual(CPU_BUZZ_MAX)
          expect(p.thinkMs).toBeGreaterThanOrEqual(1000)
          expect(p.thinkMs).toBeLessThanOrEqual(1800)
          expect(Number.isInteger(p.thinkMs)).toBe(true)
          if (p.buzzProgress > 1) reachedLastCall = true
        }
      }
    }
    // 見習いがむずかしい名所に出会うと、最後のチャンスに押すこともある
    expect(reachedLastCall).toBe(true)
  })

  it('はずれのときは、選択肢の中の「見間違えやすい名所」を選ぶ', () => {
    for (const p of sample('minarai', 1, 500, 'wrong')) {
      expect(p.wrongChoiceIndex).not.toBe(0)
      expect(['ginkakuji', 'byodoin']).toContain(CHOICES[p.wrongChoiceIndex])
    }
  })

  it('見間違えやすい名所が選択肢になければ、ほかのはずれから選ぶ', () => {
    const choices = ['kinkakuji', 'kobe-port-tower', 'goryokaku', 'moai'] // 金閣寺の見間違えやすい名所は入っていない
    const seen = new Set<number>()
    for (let i = 0; i < 300; i++) {
      const p = cpuPlan(createRng(`other-${i}`), 'veteran', 1, choices, 0)
      expect(p.wrongChoiceIndex).not.toBe(0)
      seen.add(p.wrongChoiceIndex)
    }
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('同じ種なら同じ予定', () => {
    for (const level of LEVELS) {
      expect(cpuPlan(createRng(77), level, 2, CHOICES, 0)).toEqual(cpuPlan(createRng(77), level, 2, CHOICES, 0))
    }
  })

  it('再開したときの「予定を過ぎていたら押すまでの時間」は0.6〜1.2秒', () => {
    for (let i = 0; i < 1000; i++) {
      const ms = cpuResumeDelayMs(createRng(`resume-${i}`))
      expect(ms).toBeGreaterThanOrEqual(600)
      expect(ms).toBeLessThanOrEqual(1200)
    }
  })

  it('強さの名前', () => {
    expect(CPU_LEVEL_NAMES).toEqual({ minarai: '見習いガイド', veteran: 'ベテランガイド', densetsu: '伝説のガイド' })
  })
})
