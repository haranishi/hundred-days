// 100日チャレンジ版で出さないと決めた名所（2026-10-05）。運営者・管理機関が、外観（形・シルエット・CGを含む）や
// 似姿を使うことに許可を求めているため。模型にも、はずれの選択肢にも、見間違えやすい名所の参照にも残さない。
import { describe, expect, it } from 'vitest'
import { hasModel, MODELED_IDS } from '../../src/client/landmarks'
import { LANDMARK_FACTS } from '../../src/shared/landmark-facts'
import { LANDMARKS } from '../../src/shared/landmarks'

const WITHHELD = [
  { id: 'tokyo-tower', name: '東京タワー' },
  { id: 'tsutenkaku', name: '通天閣' },
  { id: 'uluru', name: 'ウルル' },
]

describe('出さない名所', () => {
  for (const { id, name } of WITHHELD) {
    it(`${name}は一覧・豆知識・模型・選択肢の参照のどこにも無い`, () => {
      expect(LANDMARKS.some((l) => l.id === id || l.name === name)).toBe(false)
      expect(LANDMARKS.some((l) => l.confusables.includes(id))).toBe(false)
      expect(Object.hasOwn(LANDMARK_FACTS, id)).toBe(false)
      expect(hasModel(id)).toBe(false)
      expect(MODELED_IDS).not.toContain(id)
    })
  }

  it('模型のある名所は68か所（日本32・世界36）', () => {
    const modeled = LANDMARKS.filter((l) => l.modeled)
    expect(modeled.length).toBe(68)
    expect(modeled.filter((l) => l.scope === 'japan').length).toBe(32)
    expect(modeled.filter((l) => l.scope === 'world').length).toBe(36)
  })
})
