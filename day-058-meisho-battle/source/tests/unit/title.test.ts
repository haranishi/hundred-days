import { describe, expect, it } from 'vitest'
import { titleFor } from '../../src/shared/title'

describe('称号（8問の合計）', () => {
  it.each([
    [-400, '観光見習い'],
    [0, '観光見習い'],
    [1999, '観光見習い'],
    [2000, '名所ハンター'],
    [3999, '名所ハンター'],
    [4000, 'ベテラン旅人'],
    [5999, 'ベテラン旅人'],
    [6000, '世界の名所マスター'],
    [8000, '世界の名所マスター'],
  ])('%i 点 → %s', (score, title) => {
    expect(titleFor(score)).toBe(title)
  })

  it('数でなければ「観光見習い」', () => {
    expect(titleFor(Number.NaN)).toBe('観光見習い')
  })
})
