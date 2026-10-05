// ルールのテストで使う小さな道具（テストそのものではない）

import { COUNTDOWN_MS, INTRO_MS } from '../../src/shared/config'
import { createGame, nextDeadline, reduce } from '../../src/shared/rules'
import type { CpuLevel, GameState, Phase, PlayerInfo, QuestionState, Scope } from '../../src/shared/types'

/** start を時刻 0 にしたとき、1問目の組み立てが始まる時刻 */
export const BUILD_START = COUNTDOWN_MS + INTRO_MS

export const ME: PlayerInfo = { id: 'p1', name: 'あなた', kind: 'human', slot: 0 }
export const FRIEND: PlayerInfo = { id: 'p2', name: 'ともだち', kind: 'human', slot: 1 }
export const THIRD: PlayerInfo = { id: 'p3', name: 'さんにんめ', kind: 'human', slot: 2 }
export const cpuPlayer = (level: CpuLevel, slot: 1 | 2 | 3 = 1): PlayerInfo => ({
  id: `cpu${slot}`,
  name: 'ガイド',
  kind: 'cpu',
  slot,
  cpuLevel: level,
})

export interface GameOpts {
  seed?: number
  scope?: Scope
  questionCount?: number
}

/** 時刻 0 で作って start したゲーム */
export function startedGame(players: PlayerInfo[], opts: GameOpts = {}): GameState {
  const s = createGame({
    seed: opts.seed ?? 1,
    scope: opts.scope ?? 'japan',
    players,
    now: 0,
    questionCount: opts.questionCount,
  })
  return reduce(s, { type: 'start' }, 0)
}

export function q(s: GameState): QuestionState {
  if (!s.question) throw new Error('問題がない')
  return s.question
}

export const score = (s: GameState, id: string): number => {
  const p = s.players.find((x) => x.id === id)
  if (!p) throw new Error(`いない: ${id}`)
  return p.score
}

/** 正解の番号とはずれの番号 */
export const correctOf = (s: GameState): number => q(s).correctIndex
export const wrongOf = (s: GameState): number => (q(s).correctIndex + 1) % q(s).choiceIds.length

/** 締め切りの時刻にだけ tick して、指定の段階になるまで進める。なった時刻も返す */
export function tickUntilPhase(s0: GameState, t0: number, phase: Phase, maxSteps = 500): { s: GameState; t: number } {
  let s = s0
  let t = t0
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === phase) return { s, t }
    const d = nextDeadline(s, t)
    if (d === null) break
    t = d
    s = reduce(s, { type: 'tick' }, t)
  }
  if (s.phase === phase) return { s, t }
  throw new Error(`段階 ${phase} にならなかった（いまは ${s.phase}）`)
}

/** 締め切りの時刻にだけ tick して、結果まで進める（人は何もしない） */
export function playOutByDeadlines(s0: GameState, t0 = 0): GameState {
  let s = s0
  let t = t0
  for (let i = 0; i < 2000 && s.phase !== 'finished'; i++) {
    const d = nextDeadline(s, t)
    if (d === null) break
    t = d
    s = reduce(s, { type: 'tick' }, t)
  }
  return s
}

/** 一定の間隔（毎フレームのつもり）で tick して、結果まで進める（人は何もしない） */
export function playOutByFrames(s0: GameState, stepMs: number, t0 = 0): GameState {
  let s = s0
  for (let t = t0; s.phase !== 'finished' && t < t0 + 30 * 60 * 1000; t += stepMs) s = reduce(s, { type: 'tick' }, t)
  return s
}

/** 中まで凍らせる（書き換えようとすると TypeError になる） */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

/** 値の中に出てくる欄の名前をすべて集める */
export function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      collectKeys(v, out)
    }
  }
  return out
}
