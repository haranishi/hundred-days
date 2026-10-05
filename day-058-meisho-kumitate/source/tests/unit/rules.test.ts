import { describe, expect, it } from 'vitest'
import {
  ANSWER_MS,
  BUILD_MS,
  COUNTDOWN_MS,
  INTRO_MS,
  LAST_CALL_MS,
  QUESTIONS_PER_GAME,
  REVEAL_MS,
  WRONG_PENALTY,
} from '../../src/shared/config'
import { canBuzz, createGame, nextDeadline, pointsAt, progressAt, reduce } from '../../src/shared/rules'
import type { Action, GameState } from '../../src/shared/types'
import {
  BUILD_START,
  correctOf,
  cpuPlayer,
  deepFreeze,
  FRIEND,
  ME,
  playOutByDeadlines,
  q,
  score,
  startedGame,
  tickUntilPhase,
  wrongOf,
} from './helpers'

const tick: Action = { type: 'tick' }
const buzz = (playerId: string, extra: { progress?: number; q?: number } = {}): Action => ({
  type: 'buzz',
  playerId,
  ...extra,
})
const answer = (playerId: string, choiceIndex: number): Action => ({ type: 'answer', playerId, choiceIndex })

describe('得点の丸め', () => {
  it('pointsAt は 1000 − 800 × 進み具合 を10点単位に丸める', () => {
    expect(pointsAt(0)).toBe(1000)
    expect(pointsAt(0.5)).toBe(600)
    expect(pointsAt(1)).toBe(200)
    expect(pointsAt(0.123)).toBe(900) // 901.6
    expect(pointsAt(0.137)).toBe(890) // 890.4
    expect(pointsAt(0.99)).toBe(210) // 208
    let prev = Infinity
    for (let i = 0; i <= 1000; i++) {
      const p = pointsAt(i / 1000)
      expect(p % 10).toBe(0)
      expect(p).toBeLessThanOrEqual(prev)
      prev = p
    }
  })

  it('範囲の外は端に寄せ、数でなければ最低点', () => {
    expect(pointsAt(-0.5)).toBe(1000)
    expect(pointsAt(1.5)).toBe(200)
    expect(pointsAt(Number.NaN)).toBe(200)
  })

  it('押した瞬間の進み具合で決まる：組み立ての最初なら1000点、半分なら600点', () => {
    let s = startedGame([ME, FRIEND])
    s = reduce(s, buzz('p1'), BUILD_START)
    expect(s.phase).toBe('answering')
    expect(q(s).buzzProgress).toBe(0)
    s = reduce(s, answer('p1', correctOf(s)), BUILD_START + 2000)
    expect(score(s, 'p1')).toBe(1000)
    expect(s.results[0]).toMatchObject({ winnerId: 'p1', points: 1000, endedBy: 'correct' })

    let t = startedGame([ME, FRIEND])
    t = reduce(t, buzz('p2'), BUILD_START + BUILD_MS / 2)
    expect(q(t).buzzProgress).toBe(0.5)
    // 考えている間に時間がたっても、得点は押した瞬間のまま
    t = reduce(t, answer('p2', correctOf(t)), BUILD_START + BUILD_MS / 2 + 5000)
    expect(score(t, 'p2')).toBe(600)
  })

  it('最後のチャンスの正解は200点', () => {
    let s = startedGame([ME, FRIEND])
    const t = BUILD_START + BUILD_MS + 1000
    s = reduce(s, buzz('p1'), t)
    expect(s.phase).toBe('answering')
    expect(q(s).buzzProgress).toBe(1)
    s = reduce(s, answer('p1', correctOf(s)), t + 500)
    expect(score(s, 'p1')).toBe(200)
  })
})

describe('組み立ての停止と再開', () => {
  it('回答中は進み具合が増えず、まちがいのあと同じところから再開する', () => {
    let s = startedGame([ME, FRIEND])
    const tb = BUILD_START + 3000
    s = reduce(s, tick, tb)
    expect(s.phase).toBe('building')
    expect(progressAt(s, tb)).toBeCloseTo(0.2, 10)
    s = reduce(s, buzz('p1'), tb)
    expect(s.phase).toBe('answering')
    expect(progressAt(s, tb + 3000)).toBeCloseTo(0.2, 10)

    const tw = tb + 3000
    s = reduce(s, answer('p1', wrongOf(s)), tw)
    expect(s.phase).toBe('building')
    expect(progressAt(s, tw)).toBeCloseTo(0.2, 10)
    expect(progressAt(s, tw + 1500)).toBeCloseTo(0.3, 10)

    // 止まっていた3秒ぶん、組み立ての終わりが遅れる
    const buildEnd = tw + (BUILD_MS - 3000)
    expect(s.phaseEndsAt).toBe(buildEnd)
    expect(nextDeadline(s, tw)).toBe(buildEnd)
    expect(reduce(s, tick, buildEnd - 1).phase).toBe('building')
    expect(reduce(s, tick, buildEnd).phase).toBe('lastcall')
  })

  it('開始前と出題の札の間は0、答えあわせでは1', () => {
    const s = startedGame([ME, FRIEND])
    expect(progressAt(s, 1000)).toBe(0)
    const intro = reduce(s, tick, COUNTDOWN_MS)
    expect(intro.phase).toBe('intro')
    expect(progressAt(intro, COUNTDOWN_MS + 500)).toBe(0)
    const { s: reveal, t } = tickUntilPhase(s, 0, 'reveal')
    expect(progressAt(reveal, t)).toBe(1)
  })
})

describe('まちがい：減点と締め出し', () => {
  it('まちがえた人は−200点で、その問題ではもう押せない。組み立ては再開し、ほかの人は押せる', () => {
    let s = startedGame([ME, FRIEND])
    let t = BUILD_START + 2000
    s = reduce(s, buzz('p1'), t)
    t += 1000
    s = reduce(s, answer('p1', wrongOf(s)), t)
    expect(score(s, 'p1')).toBe(-WRONG_PENALTY)
    expect(q(s).lockedOut).toEqual(['p1'])
    expect(s.phase).toBe('building')
    expect(canBuzz(s, 'p1', t)).toBe(false)
    expect(canBuzz(s, 'p2', t)).toBe(true)

    // 締め出された人の押しは受け付けない（状態はそのまま）
    expect(reduce(s, buzz('p1'), t + 100)).toBe(s)

    s = reduce(s, buzz('p2'), t + 200)
    expect(s.phase).toBe('answering')
    expect(q(s).buzzerId).toBe('p2')
    // 押した人以外の答えは受け付けない
    expect(reduce(s, answer('p1', correctOf(s)), t + 250)).toBe(s)
    s = reduce(s, answer('p2', correctOf(s)), t + 300)
    expect(score(s, 'p2')).toBeGreaterThan(0)
    expect(score(s, 'p1')).toBe(-WRONG_PENALTY)
    expect(s.results[0]?.attempts.map((a) => [a.playerId, a.correct])).toEqual([
      ['p1', false],
      ['p2', true],
    ])
  })

  it('得点はマイナスにもなり、締め出しは次の問題で消える', () => {
    let s = startedGame([ME, FRIEND])
    s = reduce(s, buzz('p1'), BUILD_START + 1000)
    s = reduce(s, answer('p1', wrongOf(s)), BUILD_START + 1500)
    const r1 = tickUntilPhase(s, BUILD_START + 1500, 'reveal')
    const b2 = tickUntilPhase(r1.s, r1.t, 'building')
    expect(b2.s.questionIndex).toBe(1)
    expect(q(b2.s).lockedOut).toEqual([])
    let s2 = reduce(b2.s, buzz('p1'), b2.t + 500)
    s2 = reduce(s2, answer('p1', wrongOf(s2)), b2.t + 900)
    expect(score(s2, 'p1')).toBe(-2 * WRONG_PENALTY)
  })
})

describe('全員まちがい → 答えあわせ', () => {
  it('押せる人がいなくなったら、すぐ答えあわせへ進む', () => {
    let s = startedGame([ME, FRIEND])
    const t = BUILD_START + 1000
    s = reduce(s, buzz('p1'), t)
    s = reduce(s, answer('p1', wrongOf(s)), t + 500)
    s = reduce(s, buzz('p2'), t + 1000)
    s = reduce(s, answer('p2', wrongOf(s)), t + 1500)
    expect(s.phase).toBe('reveal')
    expect(s.results[0]).toMatchObject({ endedBy: 'allLockedOut', winnerId: null, points: 0 })
    expect(score(s, 'p1')).toBe(-WRONG_PENALTY)
    expect(score(s, 'p2')).toBe(-WRONG_PENALTY)

    const next = reduce(s, tick, t + 1500 + REVEAL_MS)
    expect(next.phase).toBe('intro')
    expect(next.questionIndex).toBe(1)
    expect(q(next).lockedOut).toEqual([])
  })
})

describe('回答の時間切れ', () => {
  it('6秒たっても答えなければ、まちがいと同じ（−200点・締め出し・再開）', () => {
    let s = startedGame([ME, FRIEND])
    const t = BUILD_START + 1000
    s = reduce(s, buzz('p1'), t)
    expect(nextDeadline(s, t)).toBe(t + ANSWER_MS)
    expect(reduce(s, tick, t + ANSWER_MS - 1).phase).toBe('answering')
    s = reduce(s, tick, t + ANSWER_MS)
    expect(s.phase).toBe('building')
    expect(score(s, 'p1')).toBe(-WRONG_PENALTY)
    expect(q(s).lockedOut).toEqual(['p1'])
    expect(q(s).attempts[0]).toMatchObject({ playerId: 'p1', choiceIndex: null, correct: false, points: -WRONG_PENALTY })
    // 時間切れのあとに届いた答えは受け付けない
    expect(reduce(s, answer('p1', correctOf(s)), t + ANSWER_MS + 10)).toBe(s)
  })

  it('締め切りちょうどに届いた答えは間に合わない', () => {
    let s = startedGame([ME, FRIEND])
    const t = BUILD_START + 1000
    s = reduce(s, buzz('p1'), t)
    const late = reduce(s, answer('p1', correctOf(s)), t + ANSWER_MS)
    expect(score(late, 'p1')).toBe(-WRONG_PENALTY)
    const inTime = reduce(s, answer('p1', correctOf(s)), t + ANSWER_MS - 1)
    expect(score(inTime, 'p1')).toBeGreaterThan(0)
  })
})

describe('最後のチャンス', () => {
  it('完成後4秒は押せて、誰も当てなければ答えあわせへ（点の増減なし）', () => {
    const s = startedGame([ME, FRIEND])
    const lastStart = BUILD_START + BUILD_MS
    expect(reduce(s, tick, lastStart - 1).phase).toBe('building')
    const last = reduce(s, tick, lastStart)
    expect(last.phase).toBe('lastcall')
    expect(progressAt(last, lastStart + 1000)).toBe(1)
    expect(last.phaseEndsAt).toBe(lastStart + LAST_CALL_MS)
    expect(reduce(last, tick, lastStart + LAST_CALL_MS - 1).phase).toBe('lastcall')

    const end = reduce(last, tick, lastStart + LAST_CALL_MS)
    expect(end.phase).toBe('reveal')
    expect(end.results[0]).toMatchObject({ endedBy: 'timeUp', winnerId: null, points: 0, attempts: [] })
    expect(score(end, 'p1')).toBe(0)
    expect(score(end, 'p2')).toBe(0)

    // 締め切りちょうどの押しは間に合わない
    const late = reduce(last, buzz('p1'), lastStart + LAST_CALL_MS)
    expect(late.phase).toBe('reveal')
    expect(q(late).attempts).toEqual([])
  })

  it('最後のチャンスでまちがえても、残り時間はそのまま続く', () => {
    let s = startedGame([ME, FRIEND])
    const lastStart = BUILD_START + BUILD_MS
    s = reduce(s, buzz('p1'), lastStart + 1000) // 残り3秒で押す
    s = reduce(s, answer('p1', wrongOf(s)), lastStart + 4000)
    expect(s.phase).toBe('lastcall')
    expect(s.phaseEndsAt).toBe(lastStart + 7000)
    expect(reduce(s, tick, lastStart + 6999).phase).toBe('lastcall')
    expect(reduce(s, tick, lastStart + 7000).phase).toBe('reveal')
  })
})

describe('同点と結果', () => {
  /** p1 が1問目、p2 が2問目を同じ進み具合で当て、残りは誰も押さない */
  function playTwoEqualCorrects(): GameState {
    const b1 = tickUntilPhase(startedGame([ME, FRIEND]), 0, 'building')
    let s = reduce(b1.s, buzz('p1'), b1.t + 7500)
    s = reduce(s, answer('p1', correctOf(s)), b1.t + 8000)
    const b2 = tickUntilPhase(s, b1.t + 8000, 'building')
    s = reduce(b2.s, buzz('p2'), b2.t + 7500)
    s = reduce(s, answer('p2', correctOf(s)), b2.t + 8000)
    return playOutByDeadlines(s, b2.t + 8000)
  }

  it('同じ点なら「ひきわけ」', () => {
    const s = playTwoEqualCorrects()
    expect(s.phase).toBe('finished')
    expect(s.results).toHaveLength(QUESTIONS_PER_GAME)
    expect(score(s, 'p1')).toBe(600)
    expect(score(s, 'p2')).toBe(600)
    expect(s.outcome).toEqual({ winnerIds: ['p1', 'p2'], draw: true, endedEarly: false })
    expect(nextDeadline(s, 999999)).toBeNull()
  })

  it('誰も押さなくても8問で結果になり、0点どうしは「ひきわけ」', () => {
    const s = playOutByDeadlines(startedGame([ME, FRIEND]))
    expect(s.phase).toBe('finished')
    expect(s.results.map((r) => r.endedBy)).toEqual(Array(QUESTIONS_PER_GAME).fill('timeUp'))
    expect(s.outcome).toEqual({ winnerIds: ['p1', 'p2'], draw: true, endedEarly: false })
  })

  it('点の高い人が勝ち', () => {
    const b1 = tickUntilPhase(startedGame([ME, FRIEND]), 0, 'building')
    let s = reduce(b1.s, buzz('p2'), b1.t + 100)
    s = reduce(s, answer('p2', correctOf(s)), b1.t + 200)
    s = playOutByDeadlines(s, b1.t + 200)
    expect(s.outcome).toEqual({ winnerIds: ['p2'], draw: false, endedEarly: false })
  })
})

describe('段階の流れ', () => {
  it('開始前は止まっていて、start で「3・2・1」が始まる', () => {
    const s = createGame({ seed: 1, scope: 'japan', players: [ME, FRIEND], now: 0 })
    expect(s.phase).toBe('countdown')
    expect(s.phaseEndsAt).toBeNull()
    expect(nextDeadline(s, 0)).toBeNull()
    expect(reduce(s, tick, 100000)).toBe(s)
    expect(reduce(s, buzz('p1'), 100)).toBe(s)

    const started = reduce(s, { type: 'start' }, 500)
    expect(started.phaseEndsAt).toBe(500 + COUNTDOWN_MS)
    expect(reduce(started, { type: 'start' }, 600)).toBe(started)
    const intro = reduce(started, tick, 500 + COUNTDOWN_MS)
    expect(intro.phase).toBe('intro')
    expect(intro.questionIndex).toBe(0)
    // 出題の札の間は押せない
    expect(reduce(intro, buzz('p1'), 500 + COUNTDOWN_MS + 100)).toBe(intro)
    expect(reduce(intro, tick, 500 + COUNTDOWN_MS + INTRO_MS).phase).toBe('building')
  })

  it('「3・2・1」は1問目の前だけ。答えあわせの「次へ」で早送りできる', () => {
    const { s: reveal, t } = tickUntilPhase(startedGame([ME, FRIEND]), 0, 'reveal')
    expect(reveal.questionIndex).toBe(0)
    const skipped = reduce(reveal, { type: 'skipReveal' }, t + 100)
    expect(skipped.phase).toBe('intro')
    expect(skipped.questionIndex).toBe(1)
    expect(skipped.phaseStartedAt).toBe(t + 100)
    // 答えあわせ以外の「次へ」は何もしない
    expect(reduce(skipped, { type: 'skipReveal' }, t + 200)).toBe(skipped)
  })

  it('別の問題あての押しと答え（q がちがう）は捨てる', () => {
    let s = startedGame([ME, FRIEND])
    s = reduce(s, tick, BUILD_START + 100)
    expect(reduce(s, buzz('p1', { q: 1 }), BUILD_START + 200)).toBe(s)
    s = reduce(s, buzz('p1', { q: 0 }), BUILD_START + 200)
    expect(s.phase).toBe('answering')
    expect(reduce(s, { type: 'answer', playerId: 'p1', choiceIndex: correctOf(s), q: 3 }, BUILD_START + 300)).toBe(s)
  })

  it('範囲の外の番号の答えは捨てる', () => {
    let s = startedGame([ME, FRIEND])
    s = reduce(s, buzz('p1'), BUILD_START + 200)
    for (const bad of [-1, 4, 1.5, Number.NaN]) expect(reduce(s, answer('p1', bad), BUILD_START + 300)).toBe(s)
  })
})

describe('状態の扱い', () => {
  it('元の state を書き換えない（中まで凍らせても動く）', () => {
    const s0 = startedGame([ME, cpuPlayer('veteran')], { seed: 3 })
    const before = JSON.stringify(s0)
    deepFreeze(s0)
    let s = s0
    s = deepFreeze(reduce(s, tick, BUILD_START + 500))
    s = deepFreeze(reduce(s, buzz('p1'), BUILD_START + 1000))
    s = deepFreeze(reduce(s, answer('p1', wrongOf(s)), BUILD_START + 2000))
    s = deepFreeze(reduce(s, tick, BUILD_START + 30000))
    s = deepFreeze(reduce(s, { type: 'skipReveal' }, BUILD_START + 30001))
    s = deepFreeze(playOutByDeadlines(s, BUILD_START + 30001))
    expect(s.phase).toBe('finished')
    expect(JSON.stringify(s0)).toBe(before)
  })

  it('何も変わらなければ同じ state を返す。now が数でなければ何もしない', () => {
    const s = reduce(startedGame([ME, FRIEND]), tick, BUILD_START + 100)
    expect(reduce(s, tick, BUILD_START + 200)).toBe(s)
    expect(reduce(s, buzz('p1'), Number.NaN)).toBe(s)
  })

  it('状態はただのデータ（JSON に書いて戻しても同じ）', () => {
    const s = playOutByDeadlines(startedGame([ME, cpuPlayer('densetsu')], { seed: 9, scope: 'all' }))
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  it('プレイヤーの指定がおかしければ作らない', () => {
    const make = (players: Parameters<typeof createGame>[0]['players']) => () =>
      createGame({ seed: 1, scope: 'japan', players, now: 0 })
    expect(make([])).toThrow()
    expect(make([ME, { ...FRIEND, id: 'p1' }])).toThrow()
    expect(make([ME, { ...FRIEND, slot: 0 }])).toThrow()
    expect(make([ME, FRIEND, { ...ME, id: 'a', slot: 2 }, { ...ME, id: 'b', slot: 3 }, { ...ME, id: 'c', slot: 1 }])).toThrow()
  })
})
