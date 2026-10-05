// 自動テスト用の窓口（URL に ?test=1 があるときだけ）。ひとり・ふたりの状態を window.__MMB__ に出す。
// ネット対戦では出さない（正解の番号は答えあわせまでサーバーの外に出さない約束なので）。

import type { PublicGameState } from '../../shared/types'
import type { LocalSession } from './local-session'

export interface TestHook {
  mode: 'solo' | 'duo'
  phase(): string
  questionIndex(): number
  /** いまの問題の正解の番号（答えあわせの前でも返す） */
  correctIndex(): number | null
  landmarkId(): string | null
  progress(): number
  /** ゲームの時計（止まっている間は進まない） */
  now(): number
  state(): PublicGameState
  /** 時計を止める・動かす（スクリーンショットを撮るため） */
  pause(): void
  resume(): void
  /** 止めている間だけ、ゲームの時計を ms 進める */
  advance(ms: number): void
}

declare global {
  interface Window {
    __MMB__?: TestHook
  }
}

/** ひとり・ふたりのゲームを出す。null で消す */
export function exposeLocalSession(session: LocalSession | null): void {
  if (typeof window === 'undefined') return
  if (!session) {
    delete window.__MMB__
    return
  }
  window.__MMB__ = {
    mode: session.mode,
    phase: () => session.peekState().phase,
    questionIndex: () => session.peekState().questionIndex,
    correctIndex: () => session.peekState().question?.correctIndex ?? null,
    landmarkId: () => session.peekState().question?.landmarkId ?? null,
    progress: () => session.progress(),
    now: () => session.now(),
    state: () => session.getState(),
    pause: () => session.pause('test'),
    resume: () => session.resume('test'),
    advance: (ms: number) => session.testAdvance(ms),
  }
}
