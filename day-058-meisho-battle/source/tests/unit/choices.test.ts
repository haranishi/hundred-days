import { describe, expect, it } from 'vitest'
import { QUESTIONS_PER_GAME } from '../../src/shared/config'
import { CHOICE_COUNT, generateChoices, selectQuestions } from '../../src/shared/choices'
import { getLandmark, inScope, LANDMARKS, landmarksInScope } from '../../src/shared/landmarks'
import { createRng } from '../../src/shared/rng'
import type { Landmark, Scope } from '../../src/shared/types'

const SCOPES: Scope[] = ['japan', 'world', 'all']
const lm = (id: string): Landmark => {
  const l = getLandmark(id)
  if (!l) throw new Error(`知らない名所: ${id}`)
  return l
}

describe('generateChoices：4択', () => {
  it('重複なし・正解を1つだけ含む・範囲の外から選ばない（全名所×全範囲×40通り）', () => {
    for (const scope of SCOPES) {
      for (const correct of landmarksInScope(scope, { modeledOnly: true })) {
        for (let i = 0; i < 40; i++) {
          const { choiceIds, correctIndex } = generateChoices(createRng(`c-${scope}-${correct.id}-${i}`), correct.id, scope)
          expect(choiceIds).toHaveLength(CHOICE_COUNT)
          expect(new Set(choiceIds).size).toBe(CHOICE_COUNT)
          expect(choiceIds[correctIndex]).toBe(correct.id)
          expect(choiceIds.filter((id) => id === correct.id)).toHaveLength(1)
          for (const id of choiceIds) expect(inScope(lm(id), scope)).toBe(true)
        }
      }
    }
  })

  it('正解の位置は乱数で、0〜3のどこにも来る', () => {
    const count = [0, 0, 0, 0]
    for (let i = 0; i < 400; i++) {
      const { correctIndex } = generateChoices(createRng(`pos-${i}`), 'kinkakuji', 'japan')
      count[correctIndex] = (count[correctIndex] ?? 0) + 1
    }
    for (const c of count) expect(c).toBeGreaterThan(60)
  })

  it('はずれは「見間違えやすい名所」から先に選び、足りなければ同じ種類から選ぶ', () => {
    for (const scope of SCOPES) {
      for (const correct of landmarksInScope(scope, { modeledOnly: true })) {
        const confusables = [...new Set(correct.confusables)].filter((id) => inScope(lm(id), scope))
        const sameCategory = LANDMARKS.filter(
          (l) => l.id !== correct.id && inScope(l, scope) && l.category === correct.category && !confusables.includes(l.id),
        ).map((l) => l.id)
        for (let i = 0; i < 20; i++) {
          const { choiceIds } = generateChoices(createRng(`pri-${scope}-${correct.id}-${i}`), correct.id, scope)
          const wrong = choiceIds.filter((id) => id !== correct.id)
          const fromConfusables = wrong.filter((id) => confusables.includes(id)).length
          expect(fromConfusables).toBe(Math.min(3, confusables.length))
          const fromCategory = wrong.filter((id) => sameCategory.includes(id)).length
          expect(fromCategory).toBe(Math.min(3 - fromConfusables, sameCategory.length))
        }
      }
    }
  })

  it('例：日本の範囲の東京タワーは、日本のタワー3つがはずれ。ぜんぶの範囲ならエッフェル塔も候補', () => {
    const { choiceIds } = generateChoices(createRng(1), 'tokyo-tower', 'japan')
    expect([...choiceIds].sort()).toEqual(['kobe-port-tower', 'kyoto-tower', 'tokyo-tower', 'tsutenkaku'])
    let sawEiffel = false
    for (let i = 0; i < 50; i++) {
      const all = generateChoices(createRng(`eiffel-${i}`), 'tokyo-tower', 'all').choiceIds
      if (all.includes('eiffel-tower')) sawEiffel = true
    }
    expect(sawEiffel).toBe(true)
  })

  it('名前だけの名所もはずれに使う', () => {
    const used = new Set<string>()
    for (const correct of landmarksInScope('all', { modeledOnly: true })) {
      for (let i = 0; i < 10; i++) {
        for (const id of generateChoices(createRng(`name-${correct.id}-${i}`), correct.id, 'all').choiceIds) used.add(id)
      }
    }
    expect([...used].filter((id) => lm(id).nameOnly).length).toBeGreaterThan(10)
  })

  it('同じ種なら同じ4択。知らない名所は誤り', () => {
    expect(generateChoices(createRng(5), 'moai', 'world')).toEqual(generateChoices(createRng(5), 'moai', 'world'))
    expect(() => generateChoices(createRng(5), 'no-such-place', 'all')).toThrow()
  })
})

describe('selectQuestions：出題の選び方', () => {
  const run = (scope: Scope, seed: number, avoid: string[] = []): Landmark[] =>
    selectQuestions(createRng(`q-${scope}-${seed}`), scope, QUESTIONS_PER_GAME, avoid).map(lm)

  it('範囲の中の模型のある名所から、重複なしで8問', () => {
    for (const scope of SCOPES) {
      for (let seed = 0; seed < 60; seed++) {
        const qs = run(scope, seed)
        expect(qs).toHaveLength(QUESTIONS_PER_GAME)
        expect(new Set(qs.map((l) => l.id)).size).toBe(QUESTIONS_PER_GAME)
        for (const l of qs) {
          expect(l.modeled).toBe(true)
          expect(inScope(l, scope)).toBe(true)
        }
      }
    }
  })

  it('1〜2問目は難しさ1、最後は難しさ2以上、同じ種類が続かない', () => {
    for (const scope of SCOPES) {
      for (let seed = 0; seed < 60; seed++) {
        const qs = run(scope, seed)
        expect(qs[0]?.difficulty).toBe(1)
        expect(qs[1]?.difficulty).toBe(1)
        expect(qs[qs.length - 1]?.difficulty).toBeGreaterThanOrEqual(2)
        for (let i = 1; i < qs.length; i++) expect(qs[i]?.category).not.toBe(qs[i - 1]?.category)
      }
    }
  })

  it('直前のゲームで出た名所はなるべく避ける', () => {
    for (let seed = 0; seed < 30; seed++) {
      // ぜんぶ（48か所）なら重ならない
      const prevAll = run('all', seed).map((l) => l.id)
      const nextAll = run('all', seed + 1000, prevAll).map((l) => l.id)
      expect(nextAll.filter((id) => prevAll.includes(id))).toEqual([])
      // 日本・世界は各24。冒頭の易しい2問が不足する分だけ前の名所を再利用する
      for (const scope of ['japan', 'world'] as Scope[]) {
        const prev = run(scope, seed).map((l) => l.id)
        const next = run(scope, seed + 1000, prev)
        const freshEasy = landmarksInScope(scope, { modeledOnly: true })
          .filter((l) => l.difficulty === 1 && !prev.includes(l.id)).length
        expect(next.filter((l) => prev.includes(l.id))).toHaveLength(Math.max(0, 2 - freshEasy))
        expect(next[0]?.difficulty).toBe(1)
        expect(next[1]?.difficulty).toBe(1)
      }
    }
  })

  it('追加24問も出題対象になる。各範囲500ゲームですべての模型が実際に選ばれる', () => {
    for (const scope of SCOPES) {
      const seen = new Set<string>()
      for (let seed = 0; seed < 500; seed++) {
        for (const l of run(scope, seed)) seen.add(l.id)
      }
      expect([...seen].sort()).toEqual(landmarksInScope(scope, { modeledOnly: true }).map((l) => l.id).sort())
    }
  })

  it('問題数が名所の数より多ければある分だけ、0なら空。同じ種なら同じ', () => {
    expect(selectQuestions(createRng(1), 'japan', 99, [])).toHaveLength(landmarksInScope('japan', { modeledOnly: true }).length)
    expect(selectQuestions(createRng(1), 'all', 99, [])).toHaveLength(landmarksInScope('all', { modeledOnly: true }).length)
    expect(selectQuestions(createRng(1), 'japan', 0, [])).toEqual([])
    expect(selectQuestions(createRng(1), 'japan', 1, [])).toHaveLength(1)
    expect(selectQuestions(createRng(9), 'world', 8, [])).toEqual(selectQuestions(createRng(9), 'world', 8, []))
  })
})
