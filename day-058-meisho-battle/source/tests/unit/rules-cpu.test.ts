import { describe, expect, it } from 'vitest'
import { BUILD_MS, COUNTDOWN_MS } from '../../src/shared/config'
import { nextDeadline, reduce } from '../../src/shared/rules'
import type { CpuLevel, GameState } from '../../src/shared/types'
import {
  BUILD_START,
  cpuPlayer,
  ME,
  playOutByDeadlines,
  playOutByFrames,
  q,
  startedGame,
  tickUntilPhase,
  wrongOf,
} from './helpers'

const LEVELS: CpuLevel[] = ['minarai', 'veteran', 'densetsu']

describe('コンピューター3段階の決定性', () => {
  for (const level of LEVELS) {
    it(`${level}：同じ種なら同じ動き、ちがう種ならちがう動き`, () => {
      const a = playOutByDeadlines(startedGame([ME, cpuPlayer(level)], { seed: 42 }))
      const b = playOutByDeadlines(startedGame([ME, cpuPlayer(level)], { seed: 42 }))
      const c = playOutByDeadlines(startedGame([ME, cpuPlayer(level)], { seed: 43 }))
      expect(a.phase).toBe('finished')
      expect(b).toEqual(a)
      expect(JSON.stringify(c.results)).not.toBe(JSON.stringify(a.results))
    })
  }

  it('tick を毎フレーム呼んでも、締め切りの時刻にだけ呼んでも、結果は同じ', () => {
    for (const level of LEVELS) {
      for (const seed of [1, 2, 3]) {
        const s0 = startedGame([ME, cpuPlayer(level), cpuPlayer('densetsu', 2)], { seed, scope: 'all' })
        const byDeadlines = playOutByDeadlines(s0)
        expect(byDeadlines.phase).toBe('finished')
        expect(playOutByFrames(s0, 16)).toEqual(byDeadlines)
        expect(playOutByFrames(s0, 250)).toEqual(byDeadlines)
      }
    }
  })

  it('強いほど早く押す（同じ種の20ゲームの平均）', () => {
    const avgBuzz = (level: CpuLevel): number => {
      const xs: number[] = []
      for (let seed = 1; seed <= 20; seed++) {
        const s = playOutByDeadlines(startedGame([ME, cpuPlayer(level)], { seed, scope: 'all' }))
        for (const r of s.results) for (const a of r.attempts) if (a.playerId === 'cpu1') xs.push(a.progress)
      }
      return xs.reduce((x, y) => x + y, 0) / xs.length
    }
    const [m, v, d] = LEVELS.map(avgBuzz)
    expect(d).toBeLessThan(v as number)
    expect(v).toBeLessThan(m as number)
  })
})

describe('コンピューターの押す時刻と答え方', () => {
  it('人が押さなければ、予定の進み具合ちょうどに押し、考える時間ののちに予定どおり答える', () => {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 15; seed++) {
        let s: GameState = startedGame([ME, cpuPlayer(level)], { seed, scope: 'all' })
        let t = 0
        let buildStart = Number.NaN
        let checked = 0
        while (s.phase !== 'finished') {
          const before = s.phase
          const d = nextDeadline(s, t)
          if (d === null) break
          t = d
          s = reduce(s, { type: 'tick' }, t)
          if (s.phase === 'building' && q(s).openElapsedMs === 0 && q(s).openResumedAt !== null) buildStart = q(s).openResumedAt as number
          if (s.phase === 'reveal' && before !== 'reveal') {
            const plan = q(s).cpu[0]
            const attempt = q(s).attempts.find((a) => a.playerId === 'cpu1')
            if (!plan || !attempt) throw new Error('コンピューターが押していない')
            const wait = attempt.buzzedAt - buildStart
            // 押す時刻は組み立て開始から 0.12×15＝1.8秒 〜 1.05×15＝15.75秒
            expect(wait).toBeGreaterThanOrEqual(1800)
            expect(wait).toBeLessThanOrEqual(15750)
            expect(wait).toBe(plan.buzzAtOpenMs)
            expect(plan.buzzAtOpenMs).toBe(Math.round(plan.buzzProgress * BUILD_MS))
            expect(attempt.progress).toBeCloseTo(Math.min(1, plan.buzzAtOpenMs / BUILD_MS), 9)
            expect(attempt.answeredAt - attempt.buzzedAt).toBe(plan.thinkMs)
            expect(attempt.correct).toBe(plan.correct)
            if (!plan.correct) expect(attempt.choiceIndex).toBe(plan.wrongChoiceIndex)
            checked++
          }
        }
        expect(s.phase).toBe('finished')
        expect(checked).toBe(8)
      }
    }
  })

  it('人がまちがえて再開しても、予定を過ぎていなければ予定の進み具合で押す（止まっていた分だけ遅れる）', () => {
    let s = startedGame([ME, cpuPlayer('veteran')], { seed: 5 })
    s = reduce(s, { type: 'tick' }, COUNTDOWN_MS)
    const plan = q(s).cpu[0]
    if (!plan) throw new Error('予定がない')
    const tBuzz = BUILD_START + 1000 // コンピューターは早くても1.8秒なので、まだ押していない
    s = reduce(s, { type: 'buzz', playerId: 'p1' }, tBuzz)
    expect(q(s).buzzerId).toBe('p1')
    const tWrong = tBuzz + 3000
    s = reduce(s, { type: 'answer', playerId: 'p1', choiceIndex: wrongOf(s) }, tWrong)
    expect(q(s).cpu[0]?.buzzAtOpenMs).toBe(plan.buzzAtOpenMs)
    const { s: answering } = tickUntilPhase(s, tWrong, 'answering')
    expect(q(answering).buzzerId).toBe('cpu1')
    expect(q(answering).buzzedAt).toBe(BUILD_START + plan.buzzAtOpenMs + 3000)
    expect(q(answering).buzzProgress).toBeCloseTo(Math.min(1, plan.buzzAtOpenMs / BUILD_MS), 9)
  })

  it('再開したとき押す予定を過ぎていたら、0.6〜1.2秒後に押す', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = startedGame([ME, cpuPlayer('veteran')], { seed })
      const tBuzz = BUILD_START + 1000
      s = reduce(s, { type: 'buzz', playerId: 'p1' }, tBuzz)
      // 予定を過ぎた形にする（押す予定を、いまの進み具合より前に置く）
      s = { ...s, question: { ...q(s), cpu: q(s).cpu.map((p) => ({ ...p, buzzAtOpenMs: 500 })) } }
      const tWrong = tBuzz + 2000
      s = reduce(s, { type: 'answer', playerId: 'p1', choiceIndex: wrongOf(s) }, tWrong)
      expect(s.phase).toBe('building')
      const delay = (q(s).cpu[0]?.buzzAtOpenMs ?? 0) - q(s).openElapsedMs
      expect(delay).toBeGreaterThanOrEqual(600)
      expect(delay).toBeLessThanOrEqual(1200)
      const { s: answering } = tickUntilPhase(s, tWrong, 'answering')
      expect(q(answering).buzzerId).toBe('cpu1')
      expect((q(answering).buzzedAt ?? 0) - tWrong).toBe(delay)
    }
  })

  it('コンピューターの押しと答えは、外からの操作では動かせない', () => {
    let s = startedGame([ME, cpuPlayer('minarai')], { seed: 8 })
    s = reduce(s, { type: 'tick' }, BUILD_START + 100)
    expect(reduce(s, { type: 'buzz', playerId: 'cpu1' }, BUILD_START + 200)).toBe(s)
  })

  it('コンピューターがまちがえたら締め出され、人はそのあとも押せる', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = startedGame([ME, cpuPlayer('minarai')], { seed })
      let s = s0
      let t = 0
      // コンピューターが最初の問題で答え終わるまで進める
      while (!(q0Attempted(s) || s.phase === 'reveal')) {
        const d = nextDeadline(s, t)
        if (d === null) break
        t = d
        s = reduce(s, { type: 'tick' }, t)
      }
      const cpuAttempt = s.question?.attempts.find((a) => a.playerId === 'cpu1')
      if (!cpuAttempt || cpuAttempt.correct) continue
      expect(q(s).lockedOut).toContain('cpu1')
      expect(['building', 'lastcall']).toContain(s.phase)
      const after = reduce(s, { type: 'buzz', playerId: 'p1' }, t + 10)
      expect(q(after).buzzerId).toBe('p1')
      return
    }
    throw new Error('コンピューターがまちがえる種が見つからなかった')
  })
})

function q0Attempted(s: GameState): boolean {
  return s.questionIndex === 0 && (s.question?.attempts.some((a) => a.playerId === 'cpu1') ?? false)
}
