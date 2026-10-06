import { describe, expect, it } from 'vitest'
import { formatClock, formatDimensions, formatLevel, formatTimes, MOUTH_TEXT } from './format'
import { phraseParts, plainText } from './phrases'

describe('画面に出す数の書き方', () => {
  it('時間は「分:秒」で、分をゼロ埋めしない', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(14.9)).toBe('0:14')
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })

  it('大きさは桁区切り付き、倍率は「×」の前に空白を入れず小数2桁、レベルも小数2桁', () => {
    expect(formatDimensions(1080, 1920)).toBe('1,080 × 1,920')
    expect(formatDimensions(512, 640)).toBe('512 × 640')
    expect(formatTimes(3)).toBe('3.00×')
    expect(formatTimes(1.05)).toBe('1.05×')
    expect(formatLevel(0.2345)).toBe('0.23')
  })

  it('口の状態は素材の名前に合わせる', () => {
    expect(MOUTH_TEXT).toEqual({ closed: 'とじ', small: '小', open: '大' })
  })
})

describe('文節の区切り', () => {
  it('「|」で分け、外すと元の文に戻る', () => {
    expect(phraseParts('声に|あわせて、|動きだす。')).toEqual(['声に', 'あわせて、', '動きだす。'])
    expect(plainText('声に|あわせて、|動きだす。')).toBe('声にあわせて、動きだす。')
    expect(plainText('区切りなし')).toBe('区切りなし')
  })
})
