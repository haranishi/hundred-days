// ゲーム進行の計算（docs/03）。ひとりで・ふたりで・ネット対戦のどれもこの計算で動かす。
//
// 使い方：
//   let s = createGame({ seed, scope, players, now })
//   s = reduce(s, { type: 'start' }, now)                          // 「3・2・1」を始める
//   s = reduce(s, { type: 'tick' }, now)                           // 毎フレーム、または nextDeadline(s, now) の時刻に
//   s = reduce(s, { type: 'buzz', playerId }, now)                 // 早押し
//   s = reduce(s, { type: 'answer', playerId, choiceIndex }, now)  // 4択
//
// - reduce は副作用なし。渡された state は書き換えない。何も変わらなければ同じ state をそのまま返す
// - 時間で進む遷移（締め切り・コンピューターの押しと回答）は、tick がいつ呼ばれても「予定の時刻」に起きたものとして
//   処理する。だから tick を毎フレーム呼んでも、締め切りの時刻にだけ呼んでも、結果は同じになる
// - どの操作も、まず now までの時間の遷移を済ませてから受け付ける（最後のチャンスが終わった後の押しは受け付けない）。
//   同じ時刻なら、時間で起きる出来事（締め切り・コンピューターの押し）が人の操作より先になる
// - now はミリ秒。1つのゲームの間は同じ時計を使う（端末なら performance.now()、サーバーなら Date.now()）
// - 「押せる時間」＝組み立て（BUILD_MS）＋最後のチャンス（LAST_CALL_MS）を1本の時計で数え、回答中だけ止める

import { generateChoices, selectQuestions } from './choices'
import {
  ANSWER_MS,
  BUILD_MS,
  BUZZ_MAX_REWIND,
  BUZZ_WINDOW_MS,
  COUNTDOWN_MS,
  INTRO_MS,
  LAST_CALL_MS,
  MAX_POINTS,
  MIN_POINTS,
  QUESTIONS_PER_GAME,
  REVEAL_MS,
  WRONG_PENALTY,
} from './config'
import { cpuPlan, cpuResumeDelayMs } from './cpu'
import { getLandmark } from './landmarks'
import { createRng, deriveSeed, toSeed } from './rng'
import type {
  Action,
  Attempt,
  CpuLevel,
  CpuQuestionPlan,
  GameOutcome,
  GameState,
  Phase,
  PlayerInfo,
  PlayerState,
  PublicGameState,
  QuestionEnd,
  QuestionResult,
  QuestionState,
  Scope,
} from './types'

/** 押せる時間の長さ（組み立て＋最後のチャンス） */
export const OPEN_MS = BUILD_MS + LAST_CALL_MS

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
const clamp01 = (v: number): number => clamp(v, 0, 1)

// ── 得点と進み具合 ──

/** 正解の得点：1000 − 800 × 進み具合 を10点単位で丸める（0→1000点、1→200点）。数でなければ最低点 */
export function pointsAt(progress: number): number {
  const p = Number.isFinite(progress) ? clamp01(progress) : 1
  return Math.round((MAX_POINTS - (MAX_POINTS - MIN_POINTS) * p) / 10) * 10
}

/** progressAt が読む部分。GameState と PublicGameState のどちらも渡せる */
export interface ProgressSource {
  phase: Phase
  question: { openElapsedMs: number; openResumedAt: number | null } | null
}

/** 押せる時間の経過（ミリ秒）。止まっている間は増えない */
function openTimeAt(q: { openElapsedMs: number; openResumedAt: number | null }, now: number): number {
  const running = q.openResumedAt === null ? 0 : Math.max(0, now - q.openResumedAt)
  return Math.min(OPEN_MS, q.openElapsedMs + running)
}

/**
 * いまの進み具合（0〜1）。組み立てが止まっている間（回答中）は増えない。
 * 開始前と出題の札の間は 0、答えあわせと結果では 1（完成した模型を見せる）。
 */
export function progressAt(state: ProgressSource, now: number): number {
  switch (state.phase) {
    case 'building':
    case 'lastcall':
    case 'answering':
      return state.question ? clamp01(openTimeAt(state.question, now) / BUILD_MS) : 0
    case 'reveal':
    case 'finished':
      return 1
    default:
      return 0
  }
}

export function isOpenPhase(phase: Phase): boolean {
  return phase === 'building' || phase === 'lastcall'
}

// ── ゲームを作る ──

export interface CreateGameOptions {
  /** 乱数の種。同じ種・同じ範囲・同じ人なら、同じ出題・同じコンピューターの動きになる */
  seed: number
  scope: Scope
  /** 1〜4人。id と席の番号は重ねない */
  players: readonly PlayerInfo[]
  now: number
  /** 既定は QUESTIONS_PER_GAME（8問）。範囲の名所の数より多ければ、ある分だけ */
  questionCount?: number
  /** 直前のゲームで出た名所（なるべく避ける） */
  avoidIds?: readonly string[]
}

const CPU_LEVEL_SET: ReadonlySet<string> = new Set<CpuLevel>(['minarai', 'veteran', 'densetsu'])

function normalizePlayers(input: readonly PlayerInfo[]): PlayerState[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4) throw new Error('プレイヤーは1〜4人にする')
  const ids = new Set<string>()
  const slots = new Set<number>()
  const out: PlayerState[] = []
  for (const p of input) {
    if (typeof p.id !== 'string' || p.id === '' || ids.has(p.id)) throw new Error(`プレイヤーの id が空か重なっている: ${String(p.id)}`)
    if (![0, 1, 2, 3].includes(p.slot) || slots.has(p.slot)) throw new Error(`席の番号が 0〜3 の外か重なっている: ${String(p.slot)}`)
    if (p.kind !== 'human' && p.kind !== 'cpu') throw new Error(`プレイヤーの種類がわからない: ${String(p.kind)}`)
    ids.add(p.id)
    slots.add(p.slot)
    const base: PlayerState = { id: p.id, name: String(p.name ?? ''), kind: p.kind, slot: p.slot, score: 0, active: true }
    if (p.kind === 'cpu') {
      // 強さの指定がなければ、いちばんやさしい見習いにする
      const cpuLevel: CpuLevel = p.cpuLevel !== undefined && CPU_LEVEL_SET.has(p.cpuLevel) ? p.cpuLevel : 'minarai'
      out.push({ id: base.id, name: base.name, kind: base.kind, slot: base.slot, cpuLevel, score: 0, active: true })
    } else {
      out.push(base)
    }
  }
  return out.sort((a, b) => a.slot - b.slot)
}

/** 新しいゲーム。'start' するまでは countdown のまま止まっている（phaseEndsAt が null） */
export function createGame(opts: CreateGameOptions): GameState {
  const players = normalizePlayers(opts.players)
  const seed = toSeed(opts.seed)
  const now = Number.isFinite(opts.now) ? opts.now : 0
  const ids = selectQuestions(
    createRng(deriveSeed(seed, 'questions')),
    opts.scope,
    opts.questionCount ?? QUESTIONS_PER_GAME,
    opts.avoidIds ?? [],
  )
  if (ids.length === 0) throw new Error('出題できる名所がない')
  const questions = ids.map((landmarkId, i) => {
    const c = generateChoices(createRng(deriveSeed(seed, 'choices', i)), landmarkId, opts.scope)
    return { landmarkId, choiceIds: c.choiceIds, correctIndex: c.correctIndex }
  })
  return {
    v: 1,
    seed,
    scope: opts.scope,
    questionCount: questions.length,
    questions,
    players,
    phase: 'countdown',
    startedAt: null,
    phaseStartedAt: null,
    phaseEndsAt: null,
    questionIndex: -1,
    question: null,
    results: [],
    outcome: null,
    updatedAt: now,
  }
}

// ── 状態を進める ──

export function reduce(state: GameState, action: Action, now: number): GameState {
  if (!Number.isFinite(now)) return state
  const t = Math.max(now, state.updatedAt)
  const s = advance(state, t)
  switch (action.type) {
    case 'tick':
      return s
    case 'start':
      return startGame(s, t)
    case 'buzz':
      return tryBuzz(s, action, t)
    case 'answer':
      return tryAnswer(s, action, t)
    case 'skipReveal':
      return s.phase === 'reveal' ? nextQuestionOrFinish(s, t) : s
    case 'removePlayer':
      return removePlayer(s, action.playerId, t)
    default:
      return s
  }
}

/** 次に tick すべき時刻。過ぎていれば now。時間で進むものがなければ null（開始前・結果） */
export function nextDeadline(state: GameState, now: number): number | null {
  const ev = nextEvent(state)
  if (!ev) return null
  return Number.isFinite(now) ? Math.max(ev.at, now) : ev.at
}

/** この人がいま押せるか（ボタンを押せる見た目にするかどうかに使う） */
export function canBuzz(state: GameState, playerId: string, now: number): boolean {
  const s = Number.isFinite(now) ? advance(state, Math.max(now, state.updatedAt)) : state
  const q = s.question
  const player = findPlayer(s, playerId)
  return q !== null && isOpenPhase(s.phase) && player?.kind === 'human' && canStillBuzz(s, q, playerId)
}

// 時間で起きる出来事。どれも予定の時刻 at に起きたものとして処理する
type TimedEvent =
  | { kind: 'countdownEnd'; at: number }
  | { kind: 'introEnd'; at: number }
  | { kind: 'buildEnd'; at: number }
  | { kind: 'lastcallEnd'; at: number }
  | { kind: 'cpuBuzz'; at: number; playerId: string; openMs: number }
  | { kind: 'cpuAnswer'; at: number; playerId: string }
  | { kind: 'answerTimeout'; at: number }
  | { kind: 'revealEnd'; at: number }

/** now までに予定の時刻が来た出来事を、時刻の順にすべて処理する */
function advance(state: GameState, t: number): GameState {
  let s = state
  for (let guard = 0; guard < 10000; guard++) {
    const ev = nextEvent(s)
    if (!ev || ev.at > t) return s
    s = applyEvent(s, ev)
  }
  throw new Error('rules: 時間の遷移が終わらない（内部の誤り）')
}

/** いちばん早い出来事。同じ時刻なら、段階の区切り → 席の順のコンピューター の順 */
function nextEvent(s: GameState): TimedEvent | null {
  const q = s.question
  switch (s.phase) {
    case 'countdown':
      return s.phaseEndsAt === null ? null : { kind: 'countdownEnd', at: s.phaseEndsAt }
    case 'intro':
      return s.phaseEndsAt === null ? null : { kind: 'introEnd', at: s.phaseEndsAt }
    case 'reveal':
      return s.phaseEndsAt === null ? null : { kind: 'revealEnd', at: s.phaseEndsAt }
    case 'building':
    case 'lastcall': {
      if (!q || q.openResumedAt === null) return null
      const resumedAt = q.openResumedAt
      const wallAt = (openMs: number): number => resumedAt + (openMs - q.openElapsedMs)
      let ev: TimedEvent =
        s.phase === 'building' ? { kind: 'buildEnd', at: wallAt(BUILD_MS) } : { kind: 'lastcallEnd', at: wallAt(OPEN_MS) }
      for (const plan of q.cpu) {
        if (plan.buzzAtOpenMs >= OPEN_MS || !canStillBuzz(s, q, plan.playerId)) continue
        const openMs = Math.max(plan.buzzAtOpenMs, q.openElapsedMs)
        const at = wallAt(openMs)
        if (at < ev.at) ev = { kind: 'cpuBuzz', at, playerId: plan.playerId, openMs }
      }
      return ev
    }
    case 'answering': {
      if (!q || q.answerEndsAt === null || q.buzzerId === null) return null
      let ev: TimedEvent = { kind: 'answerTimeout', at: q.answerEndsAt }
      const buzzerId = q.buzzerId
      const plan = q.cpu.find((p) => p.playerId === buzzerId)
      if (plan && q.buzzedAt !== null && findPlayer(s, buzzerId)?.kind === 'cpu') {
        const at = q.buzzedAt + plan.thinkMs
        if (at < ev.at) ev = { kind: 'cpuAnswer', at, playerId: buzzerId }
      }
      return ev
    }
    default:
      return null
  }
}

function applyEvent(s: GameState, ev: TimedEvent): GameState {
  switch (ev.kind) {
    case 'countdownEnd':
      return beginQuestion(s, 0, ev.at)
    case 'introEnd': {
      const q = mustQuestion(s)
      return {
        ...s,
        phase: 'building',
        question: { ...q, openResumedAt: ev.at },
        phaseStartedAt: ev.at,
        phaseEndsAt: ev.at + BUILD_MS,
        updatedAt: ev.at,
      }
    }
    case 'buildEnd':
      return { ...s, phase: 'lastcall', phaseStartedAt: ev.at, phaseEndsAt: ev.at + LAST_CALL_MS, updatedAt: ev.at }
    case 'lastcallEnd':
      return toReveal(s, ev.at, 'timeUp', null, 0, OPEN_MS)
    case 'cpuBuzz':
      return startAnswering(s, ev.playerId, Math.min(1, ev.openMs / BUILD_MS), ev.at, ev.openMs)
    case 'cpuAnswer': {
      const q = mustQuestion(s)
      const plan = q.cpu.find((p) => p.playerId === ev.playerId)
      const choice = plan && !plan.correct ? plan.wrongChoiceIndex : q.correctIndex
      return finishAnswer(s, ev.playerId, choice, ev.at)
    }
    case 'answerTimeout': {
      const q = mustQuestion(s)
      return q.buzzerId === null ? s : finishAnswer(s, q.buzzerId, null, ev.at)
    }
    case 'revealEnd':
      return nextQuestionOrFinish(s, ev.at)
  }
}

// ── 1問の流れ ──

function beginQuestion(s: GameState, index: number, at: number): GameState {
  const spec = s.questions[index]
  if (!spec) return finishGame(s, at, false)
  const difficulty = getLandmark(spec.landmarkId)?.difficulty ?? 2
  const cpu: CpuQuestionPlan[] = []
  for (const p of s.players) {
    if (p.kind !== 'cpu' || !p.active) continue
    // 系列は「種・問題の番号・席」から作る。同じ種なら同じ動きになる
    const rng = createRng(deriveSeed(s.seed, 'cpu', index, p.slot))
    const plan = cpuPlan(rng, p.cpuLevel ?? 'minarai', difficulty, spec.choiceIds, spec.correctIndex)
    cpu.push({ playerId: p.id, ...plan, buzzAtOpenMs: Math.round(plan.buzzProgress * BUILD_MS) })
  }
  const question: QuestionState = {
    index,
    landmarkId: spec.landmarkId,
    choiceIds: [...spec.choiceIds],
    correctIndex: spec.correctIndex,
    openElapsedMs: 0,
    openResumedAt: null,
    buzzerId: null,
    buzzProgress: null,
    buzzedAt: null,
    answerEndsAt: null,
    lockedOut: [],
    attempts: [],
    cpu,
  }
  return {
    ...s,
    phase: 'intro',
    questionIndex: index,
    question,
    phaseStartedAt: at,
    phaseEndsAt: at + INTRO_MS,
    updatedAt: at,
  }
}

/** 押した人が答える番にする。組み立ては止める */
function startAnswering(s: GameState, playerId: string, progress: number, at: number, openMs: number): GameState {
  const q = mustQuestion(s)
  const question: QuestionState = {
    ...q,
    openElapsedMs: openMs,
    openResumedAt: null,
    buzzerId: playerId,
    buzzProgress: progress,
    buzzedAt: at,
    answerEndsAt: at + ANSWER_MS,
  }
  return { ...s, phase: 'answering', question, phaseStartedAt: at, phaseEndsAt: at + ANSWER_MS, updatedAt: at }
}

/** 答えを決める。choiceIndex が null なら時間切れ（まちがいと同じ） */
function finishAnswer(s: GameState, playerId: string, choiceIndex: number | null, at: number): GameState {
  const q = mustQuestion(s)
  const progress = q.buzzProgress ?? 1
  const correct = choiceIndex !== null && choiceIndex === q.correctIndex
  const points = correct ? pointsAt(progress) : -WRONG_PENALTY
  const attempt: Attempt = { playerId, progress, buzzedAt: q.buzzedAt ?? at, answeredAt: at, choiceIndex, correct, points }
  const players = s.players.map((p) => (p.id === playerId ? { ...p, score: p.score + points } : p))
  const question: QuestionState = {
    ...q,
    buzzerId: null,
    buzzProgress: null,
    buzzedAt: null,
    answerEndsAt: null,
    attempts: [...q.attempts, attempt],
    // まちがえた人は、この問題ではもう押せない
    lockedOut: correct ? q.lockedOut : [...q.lockedOut, playerId],
  }
  const next: GameState = { ...s, players, question, updatedAt: at }
  if (correct) return toReveal(next, at, 'correct', playerId, points)
  if (!anyoneCanBuzz(next, question)) return toReveal(next, at, 'allLockedOut', null, 0)
  return resumeOpen(next, at)
}

/**
 * 組み立て（または最後のチャンス）を再開する。
 * コンピューターの押す予定を過ぎていたら（＝いまの進み具合が予定以上なら）、0.6〜1.2秒後に押す予定に付け直す。
 */
function resumeOpen(s: GameState, at: number): GameState {
  const q = mustQuestion(s)
  const open = q.openElapsedMs
  const cpu = q.cpu.map((plan) => {
    if (plan.buzzAtOpenMs > open || !canStillBuzz(s, q, plan.playerId)) return plan
    const slot = findPlayer(s, plan.playerId)?.slot ?? 0
    const delay = cpuResumeDelayMs(createRng(deriveSeed(s.seed, 'cpu-resume', q.index, slot, q.attempts.length)))
    return { ...plan, buzzAtOpenMs: open + delay }
  })
  const phase: Phase = open < BUILD_MS ? 'building' : 'lastcall'
  const phaseEndsAt = at + ((phase === 'building' ? BUILD_MS : OPEN_MS) - open)
  return { ...s, phase, question: { ...q, cpu, openResumedAt: at }, phaseStartedAt: at, phaseEndsAt, updatedAt: at }
}

/** 答えあわせへ。この問題の結果を results に足す */
function toReveal(
  s: GameState,
  at: number,
  endedBy: QuestionEnd,
  winnerId: string | null,
  points: number,
  openMs?: number,
): GameState {
  const q = mustQuestion(s)
  const question: QuestionState = {
    ...q,
    openElapsedMs: openMs ?? openTimeAt(q, at),
    openResumedAt: null,
    buzzerId: null,
    buzzProgress: null,
    buzzedAt: null,
    answerEndsAt: null,
  }
  const result: QuestionResult = {
    index: q.index,
    landmarkId: q.landmarkId,
    choiceIds: [...q.choiceIds],
    correctIndex: q.correctIndex,
    attempts: question.attempts.map((a) => ({ ...a })),
    winnerId,
    points,
    endedBy,
  }
  return {
    ...s,
    phase: 'reveal',
    question,
    results: [...s.results, result],
    phaseStartedAt: at,
    phaseEndsAt: at + REVEAL_MS,
    updatedAt: at,
  }
}

function nextQuestionOrFinish(s: GameState, at: number): GameState {
  const next = s.questionIndex + 1
  return next < s.questions.length ? beginQuestion(s, next, at) : finishGame(s, at, false)
}

function finishGame(s: GameState, at: number, endedEarly: boolean): GameState {
  const q = s.question
  const question: QuestionState | null = q
    ? {
        ...q,
        openElapsedMs: openTimeAt(q, at),
        openResumedAt: null,
        buzzerId: null,
        buzzProgress: null,
        buzzedAt: null,
        answerEndsAt: null,
      }
    : null
  return {
    ...s,
    phase: 'finished',
    question,
    phaseStartedAt: at,
    phaseEndsAt: null,
    outcome: decideOutcome(s.players, endedEarly),
    updatedAt: at,
  }
}

/** 勝ち負け。抜けていない人の中で点がいちばん高い人。2人以上並んだら「ひきわけ」 */
function decideOutcome(players: readonly PlayerState[], endedEarly: boolean): GameOutcome {
  const contenders = players.filter((p) => p.active)
  if (contenders.length === 0) return { winnerIds: [], draw: false, endedEarly }
  const top = Math.max(...contenders.map((p) => p.score))
  const winnerIds = contenders.filter((p) => p.score === top).map((p) => p.id)
  return { winnerIds, draw: winnerIds.length > 1, endedEarly }
}

// ── 人の操作 ──

function startGame(s: GameState, t: number): GameState {
  if (s.phase !== 'countdown' || s.startedAt !== null) return s
  return { ...s, startedAt: t, phaseStartedAt: t, phaseEndsAt: t + COUNTDOWN_MS, updatedAt: t }
}

function tryBuzz(s: GameState, a: Extract<Action, { type: 'buzz' }>, t: number): GameState {
  if (a.q !== undefined && a.q !== s.questionIndex) return s
  const q = s.question
  if (!q || !isOpenPhase(s.phase) || !canStillBuzz(s, q, a.playerId)) return s
  // コンピューターの押しは tick の中だけで動かす
  if (findPlayer(s, a.playerId)?.kind !== 'human') return s
  const openMs = openTimeAt(q, t)
  const serverProgress = Math.min(1, openMs / BUILD_MS)
  // 端末の申告は、サーバーの値から BUZZ_MAX_REWIND までしかさかのぼれない。サーバーの値より先にも進めない
  const progress =
    typeof a.progress === 'number' && Number.isFinite(a.progress)
      ? clamp(a.progress, Math.max(0, serverProgress - BUZZ_MAX_REWIND), serverProgress)
      : serverProgress
  return startAnswering(s, a.playerId, progress, t, openMs)
}

function tryAnswer(s: GameState, a: Extract<Action, { type: 'answer' }>, t: number): GameState {
  if (a.q !== undefined && a.q !== s.questionIndex) return s
  const q = s.question
  if (s.phase !== 'answering' || !q || q.buzzerId !== a.playerId) return s
  const player = findPlayer(s, a.playerId)
  if (!player || player.kind !== 'human' || !player.active) return s
  if (!Number.isInteger(a.choiceIndex) || a.choiceIndex < 0 || a.choiceIndex >= q.choiceIds.length) return s
  return finishAnswer(s, a.playerId, a.choiceIndex, t)
}

/** 抜けた人を外す。残りが1人以下（または人がいない）になったら、その時点で結果にする */
function removePlayer(s: GameState, playerId: string, t: number): GameState {
  if (s.phase === 'finished') return s
  const target = findPlayer(s, playerId)
  if (!target || !target.active) return s
  const players = s.players.map((p) => (p.id === playerId ? { ...p, active: false } : p))
  const next: GameState = { ...s, players, updatedAt: t }
  const remaining = players.filter((p) => p.active)
  if (remaining.length <= 1 || !remaining.some((p) => p.kind === 'human')) return finishGame(next, t, true)

  const q = next.question
  if (!q) return next
  if (next.phase === 'answering' && q.buzzerId === playerId) {
    // 答えていた人が抜けた：減点はせず、組み立てを再開する（この問題ではもう押せない扱い）
    const question: QuestionState = {
      ...q,
      buzzerId: null,
      buzzProgress: null,
      buzzedAt: null,
      answerEndsAt: null,
      lockedOut: [...q.lockedOut, playerId],
    }
    const after: GameState = { ...next, question }
    return anyoneCanBuzz(after, question) ? resumeOpen(after, t) : toReveal(after, t, 'allLockedOut', null, 0)
  }
  if (isOpenPhase(next.phase) && !anyoneCanBuzz(next, q)) return toReveal(next, t, 'allLockedOut', null, 0)
  return next
}

// ── 小さな道具 ──

function mustQuestion(s: GameState): QuestionState {
  if (!s.question) throw new Error('rules: 問題がない段階で問題を読もうとした（内部の誤り）')
  return s.question
}

function findPlayer(s: { players: readonly PlayerState[] }, playerId: string): PlayerState | undefined {
  return s.players.find((p) => p.id === playerId)
}

/** 抜けておらず、この問題でまだ締め出されていない */
function canStillBuzz(s: GameState, q: QuestionState, playerId: string): boolean {
  const p = findPlayer(s, playerId)
  return p !== undefined && p.active && !q.lockedOut.includes(playerId)
}

function anyoneCanBuzz(s: GameState, q: QuestionState): boolean {
  return s.players.some((p) => p.active && !q.lockedOut.includes(p.id))
}

// ── ネットで配る形 ──

/**
 * ネット対戦で端末に配る形。答えあわせより前は正解の番号を null にする。
 * 乱数の種・全問の出題・コンピューターの予定は含めない（先の問題や正解がわかってしまうため）。
 * tick で now まで進めた state を渡すこと。
 */
export function toPublicState(state: GameState, now: number): PublicGameState {
  const q = state.question
  const revealed = state.phase === 'reveal' || state.phase === 'finished'
  return {
    v: 1,
    scope: state.scope,
    questionCount: state.questionCount,
    phase: state.phase,
    started: state.startedAt !== null,
    phaseStartedAt: state.phaseStartedAt,
    phaseEndsAt: state.phaseEndsAt,
    serverNow: now,
    questionIndex: state.questionIndex,
    players: state.players.map(copyPlayer),
    question: q
      ? {
          index: q.index,
          landmarkId: q.landmarkId,
          choiceIds: [...q.choiceIds],
          correctIndex: revealed ? q.correctIndex : null,
          openElapsedMs: q.openElapsedMs,
          openResumedAt: q.openResumedAt,
          progress: progressAt(state, now),
          buzzerId: q.buzzerId,
          buzzProgress: q.buzzProgress,
          buzzedAt: q.buzzedAt,
          answerEndsAt: q.answerEndsAt,
          lockedOut: [...q.lockedOut],
          attempts: q.attempts.map(copyAttempt),
        }
      : null,
    results: state.results.map((r) => ({
      index: r.index,
      landmarkId: r.landmarkId,
      choiceIds: [...r.choiceIds],
      correctIndex: r.correctIndex,
      attempts: r.attempts.map(copyAttempt),
      winnerId: r.winnerId,
      points: r.points,
      endedBy: r.endedBy,
    })),
    outcome: state.outcome ? { ...state.outcome, winnerIds: [...state.outcome.winnerIds] } : null,
  }
}

function copyPlayer(p: PlayerState): PlayerState {
  const out: PlayerState = { id: p.id, name: p.name, kind: p.kind, slot: p.slot, score: p.score, active: p.active }
  if (p.cpuLevel !== undefined) out.cpuLevel = p.cpuLevel
  return out
}

function copyAttempt(a: Attempt): Attempt {
  return {
    playerId: a.playerId,
    progress: a.progress,
    buzzedAt: a.buzzedAt,
    answeredAt: a.answeredAt,
    choiceIndex: a.choiceIndex,
    correct: a.correct,
    points: a.points,
  }
}

// ── ネット対戦の早押しの判定 ──

export interface BuzzCandidate {
  playerId: string
  /** 押した瞬間に端末の画面で見ていた進み具合 */
  reportedProgress: number
  /** サーバーに届いた時刻 */
  receivedAt: number
}

/**
 * 最初の押しが届いてから BUZZ_WINDOW_MS（0.15秒）の間に届いた押しを集め、申告の進み具合がいちばん小さい人を選ぶ。
 * 申告は serverProgress − BUZZ_MAX_REWIND より小さくできず、serverProgress より大きくもできない。
 * 同じ値なら先に届いた人、それも同じなら id の順。候補がなければ null。
 * 押せない人（締め出し・抜けた人）は、呼ぶ側が canBuzz で先に外しておくこと。
 * 結果は reduce(state, { type: 'buzz', playerId, progress }, now) にそのまま渡す。
 */
export function arbitrateBuzzes(
  candidates: readonly BuzzCandidate[],
  serverProgress: number,
): { playerId: string; progress: number } | null {
  const valid = candidates.filter((c) => typeof c.playerId === 'string' && Number.isFinite(c.receivedAt))
  if (valid.length === 0) return null
  const firstAt = Math.min(...valid.map((c) => c.receivedAt))
  const server = Number.isFinite(serverProgress) ? clamp01(serverProgress) : 1
  const floor = Math.max(0, server - BUZZ_MAX_REWIND)
  let best: { playerId: string; progress: number; receivedAt: number } | null = null
  for (const c of valid) {
    if (c.receivedAt > firstAt + BUZZ_WINDOW_MS) continue
    const reported = Number.isFinite(c.reportedProgress) ? c.reportedProgress : server
    const progress = clamp(reported, floor, server)
    const better =
      best === null ||
      progress < best.progress ||
      (progress === best.progress &&
        (c.receivedAt < best.receivedAt || (c.receivedAt === best.receivedAt && c.playerId < best.playerId)))
    if (better) best = { playerId: c.playerId, progress, receivedAt: c.receivedAt }
  }
  return best ? { playerId: best.playerId, progress: best.progress } : null
}
