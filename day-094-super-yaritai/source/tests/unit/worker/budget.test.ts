import { WORKER_ORIGIN } from '../../../src/shared/hosts'
import { describe, expect, it } from 'vitest'
import {
  DAILY_LIMITS,
  emptyUsage,
  gameMessageAllowance,
  nextUtcMidnight,
  overRoomBudget,
  readTestUsage,
  takeSlot,
  takeToken,
  TripCache,
  utcDay,
  type Bucket,
} from '../../../src/worker/budget'
import { allocateRoomCode } from '../../../src/worker/limits'
import { pairWaiters } from '../../../src/worker/lobby-core'
import { isSameOrigin } from '../../../src/worker/origin'
import { randomInt, randomRoomCode, randomToken } from '../../../src/worker/random'
import { TOKEN_PATTERN } from '../../../src/shared/protocol/messages'

describe('1接続の通数：毎秒40通を超えたら切る', () => {
  it('毎秒40通の速さなら、いつまでも通る', () => {
    let b: Bucket | undefined
    for (let i = 0; i < 4000; i++) {
      const r = takeToken(b, i * 25)
      expect(r.allowed).toBe(true)
      b = r.bucket
    }
  })

  it('毎秒45通が続くと、溜め（80通）を使い切ったところで切る', () => {
    let b: Bucket | undefined
    let cutAt = -1
    for (let i = 0; i < 2000 && cutAt < 0; i++) {
      const r = takeToken(b, (i * 1000) / 45)
      if (!r.allowed) cutAt = i
      b = r.bucket
    }
    // 溜め80通＋（45−40）通/秒の差で減る → 約16秒（720通目あたり）で切れる
    expect(cutAt).toBeGreaterThan(600)
    expect(cutAt).toBeLessThan(800)
  })

  it('一度に大量（81通）が届いたら切る。通信が詰まった後の80通までのまとめ届きは許す', () => {
    let b: Bucket | undefined
    for (let i = 0; i < 80; i++) {
      const r = takeToken(b, 1000)
      expect(r.allowed).toBe(true)
      b = r.bucket
    }
    expect(takeToken(b, 1000).allowed).toBe(false)
  })
})

describe('1日の上限と部屋の予算', () => {
  it('上限は友だちの部屋300・相手探し600・試合開始250', () => {
    expect(DAILY_LIMITS).toEqual({ room: 300, match: 600, game: 250 })
    let counts = {}
    for (let i = 0; i < 3; i++) counts = takeSlot(counts, 'game', 3).counts
    expect(takeSlot(counts, 'game', 3).granted).toBe(false)
  })

  it('日付は UTC で切り替わる', () => {
    const t = Date.UTC(2026, 9, 6, 14, 59, 59)
    expect(utcDay(t)).toBe('2026-10-06')
    expect(nextUtcMidnight(t)).toBe(Date.UTC(2026, 9, 7))
  })

  it('部屋の通数の予算は、試合の人数と長さに応じて増える', () => {
    const usage = { ...emptyUsage(), messages: 600 }
    expect(overRoomBudget(usage)).toBeNull()
    expect(overRoomBudget(usage, 1)).toBe('messages')
    // 2人・120秒の試合：ふつうは1人毎秒15〜20通 → 2×150×20 = 6000 通は収まる
    const allowance = gameMessageAllowance(2, 120)
    expect(allowance).toBeGreaterThan(2 * 150 * 20)
    expect(overRoomBudget({ ...usage, games: 1, messageAllowance: allowance }, 6000)).toBeNull()
    expect(overRoomBudget({ ...emptyUsage(), connections: 13 })).toBe('connections')
    expect(overRoomBudget({ ...emptyUsage(), connections: 13, games: 1 })).toBeNull()
  })

  it('上限に達したことを日付が変わるまで覚える', () => {
    const c = new TripCache()
    c.trip('day:x:game', 2000, 1000)
    expect(c.isTripped('day:x:game', 1999)).toBe(true)
    expect(c.isTripped('day:x:game', 2000)).toBe(false)
    expect(c.size).toBe(0)
  })

  it('試験用の見出しは localhost に届いたときだけ読む（公開先では必ず無視）', () => {
    expect(readTestUsage('run1;room=2;game=0', 'http://localhost:8798/api/rooms')).toEqual({
      id: 'run1',
      limits: { room: 2, match: 600, game: 0 },
    })
    expect(readTestUsage('run1;room=2', 'http://127.0.0.1:8798/api/rooms')?.id).toBe('run1')
    expect(readTestUsage('run1;room=2', `${WORKER_ORIGIN}/api/rooms`)).toBeNull()
    expect(readTestUsage('bad id!', 'http://localhost/api/rooms')).toBeNull()
    expect(readTestUsage(null, 'http://localhost/api/rooms')).toBeNull()
  })
})

describe('あいことば・札・相手探しの組・Origin', () => {
  it('作り直しの上限まで決まらなければ null。使用中なら作り直す', async () => {
    const used = new Set(['AAAA', 'BBBB'])
    const picks = ['AAAA', 'AAAA', 'BBBB', 'CCCC']
    let i = 0
    expect(await allocateRoomCode(() => picks[i++] ?? 'ZZZZ', async (c) => !used.has(c))).toBe('CCCC')
    expect(await allocateRoomCode(() => 'AAAA', async () => false, 5)).toBeNull()
  })

  it('乱数のあいことばと札は形に合う。randomInt は範囲の中', () => {
    for (let k = 0; k < 200; k++) {
      expect(randomRoomCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)
      expect(randomToken()).toMatch(TOKEN_PATTERN)
      const v = randomInt(7)
      expect(v >= 0 && v < 7).toBe(true)
    }
    expect(randomInt(0)).toBe(0)
  })

  it('相手探しは来た順に2人ずつ組にする', () => {
    const w = [
      { key: 'c', joinedAt: 3 },
      { key: 'a', joinedAt: 1 },
      { key: 'b', joinedAt: 1 },
    ]
    const r = pairWaiters(w)
    expect(r.pairs.map((p) => p.map((x) => x.key))).toEqual([['a', 'b']])
    expect(r.rest.map((x) => x.key)).toEqual(['c'])
  })

  it('Origin が自分のホストと同じときだけ通す', () => {
    expect(isSameOrigin('http://localhost:8798', 'http://localhost:8798/api/rooms')).toBe(true)
    expect(isSameOrigin('https://evil.example', 'http://localhost:8798/api/rooms')).toBe(false)
    expect(isSameOrigin('http://localhost:5173', 'http://localhost:8798/api/rooms')).toBe(false)
    expect(isSameOrigin(null, 'http://localhost:8798/api/rooms')).toBe(false)
    expect(isSameOrigin('null', 'http://localhost:8798/api/rooms')).toBe(false)
  })
})
