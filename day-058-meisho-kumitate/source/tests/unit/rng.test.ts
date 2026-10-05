import { describe, expect, it } from 'vitest'
import { createRng, deriveSeed, hashString, mulberry32, toSeed } from '../../src/shared/rng'

const take = (next: () => number, n: number): number[] => Array.from({ length: n }, () => next())

describe('種つき乱数', () => {
  it('同じ種なら同じ並び、ちがう種ならちがう並び', () => {
    expect(take(mulberry32(1), 20)).toEqual(take(mulberry32(1), 20))
    expect(take(mulberry32(1), 20)).not.toEqual(take(mulberry32(2), 20))
    const a = createRng('ゲーム')
    const b = createRng('ゲーム')
    expect(take(() => a.next(), 10)).toEqual(take(() => b.next(), 10))
  })

  it('値の範囲：next は0以上1未満、int は0以上 max 未満、range は min 以上 max 未満', () => {
    const r = createRng(99)
    for (let i = 0; i < 5000; i++) {
      const x = r.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      const k = r.int(4)
      expect([0, 1, 2, 3]).toContain(k)
      const y = r.range(600, 1200)
      expect(y).toBeGreaterThanOrEqual(600)
      expect(y).toBeLessThan(1200)
    }
    expect(r.int(0)).toBe(0)
  })

  it('shuffle は並べ替えただけの新しい配列を返し、元を変えない', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = createRng(5).shuffle(src)
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...out].sort()).toEqual(src)
    expect(createRng(5).shuffle(src)).toEqual(out)
  })

  it('pick は空の配列では誤り', () => {
    expect(() => createRng(1).pick([])).toThrow()
    expect(['a', 'b']).toContain(createRng(1).pick(['a', 'b']))
  })

  it('normal はおよそ指定の平均と標準偏差', () => {
    const r = createRng(2024)
    const xs = take(() => r.normal(0.5, 0.1), 20000)
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
    expect(mean).toBeCloseTo(0.5, 2)
    expect(sd).toBeCloseTo(0.1, 2)
  })

  it('fork の系列は、元の系列をいくつ使ったかに左右されない', () => {
    const fresh = createRng(7)
    const used = createRng(7)
    take(() => used.next(), 123)
    expect(take(() => used.fork('cpu', 1).next(), 5)).toEqual(take(() => fresh.fork('cpu', 1).next(), 5))
    expect(take(() => fresh.fork('cpu', 1).next(), 5)).not.toEqual(take(() => fresh.fork('cpu', 2).next(), 5))
    expect(createRng(7).fork('a').seed).toBe(deriveSeed(7, 'a'))
  })

  it('hashString は決まった値を返し、似た文字列でも散らばる', () => {
    expect(hashString('kinkakuji')).toBe(hashString('kinkakuji'))
    expect(hashString('a')).not.toBe(hashString('b'))
    expect(hashString('q1')).not.toBe(hashString('q2'))
    const h = hashString('')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(2 ** 32)
  })

  it('種は32ビットの整数にそろえる（小数・負・大きな数・文字列・数でない値）', () => {
    expect(toSeed(5.9)).toBe(5)
    expect(toSeed(-1)).toBe(2 ** 32 - 1)
    expect(toSeed(2 ** 32 + 3)).toBe(3)
    expect(toSeed(Number.NaN)).toBe(0)
    expect(toSeed('abc')).toBe(hashString('abc'))
    expect(toSeed(1_727_000_000_000)).toBe(1_727_000_000_000 % 2 ** 32)
  })
})
