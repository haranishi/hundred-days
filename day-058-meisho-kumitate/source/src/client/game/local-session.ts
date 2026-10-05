// ひとりで・ふたりでのゲーム進行（session.ts の GameSession を満たす）。
// src/shared/rules.ts の reduce を、端末の時計（PausableClock）で回す。コンピューターは rules の tick の中で動く。
//
// - 時間で進む遷移は、次の締め切り（nextDeadline）にだけタイマーを掛けて tick する（毎フレーム回さない）
// - タブが隠れたら時計を止める。隠れたタブでは画面の更新が止まるので、戻ったときにまとめて進めないため
// - 画面には toPublicState の形で渡す（ネット対戦と同じ形。正解の番号は答えあわせまで null）

import { CPU_LEVEL_NAMES } from '../../shared/cpu'
import { canBuzz as rulesCanBuzz, createGame, nextDeadline, progressAt, reduce, toPublicState } from '../../shared/rules'
import type { Action, CpuLevel, GameState, PlayerInfo, PublicGameState, Scope } from '../../shared/types'
import { PausableClock } from './clock'
import { memoryRecentStore, type RecentStore } from './recent'
import type { ConnectionStatus, GameSession } from './session'

/** 画面が隠れたかどうかを知る口（自動テストでは偽物に差し替えられる） */
export interface VisibilitySource {
  hidden(): boolean
  onChange(cb: () => void): () => void
}

export interface LocalSessionOptions {
  mode: 'solo' | 'duo'
  scope: Scope
  /** ひとりのときの相手の強さ（既定は見習い） */
  level?: CpuLevel
  /** 乱数の種を固定する（?seed=）。null・省略なら毎回ちがう */
  seed?: number | null
  /** 時間の速さ（?speed=）。既定は1 */
  speed?: number
  /** 直前のゲームで出た名所を覚える場所 */
  recent?: RecentStore
  /** 実時間の時計（ミリ秒）。既定は performance.now */
  realNow?: () => number
  visibility?: VisibilitySource
}

/** ひとりのときのプレイヤーの id */
export const SOLO_HUMAN_ID = 'you'
export const SOLO_CPU_ID = 'guide'
/** ふたりのときのプレイヤーの id（席の順：左が1P、右が2P） */
export const DUO_IDS = ['p1', 'p2'] as const

function documentVisibility(): VisibilitySource {
  return {
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    onChange(cb) {
      if (typeof document === 'undefined') return () => {}
      document.addEventListener('visibilitychange', cb)
      return () => document.removeEventListener('visibilitychange', cb)
    },
  }
}

function randomSeed(): number {
  try {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] ?? 0
  } catch {
    return Math.floor(Math.random() * 2 ** 32)
  }
}

function playersFor(mode: 'solo' | 'duo', level: CpuLevel): PlayerInfo[] {
  if (mode === 'solo') {
    return [
      { id: SOLO_HUMAN_ID, name: 'あなた', kind: 'human', slot: 0 },
      { id: SOLO_CPU_ID, name: CPU_LEVEL_NAMES[level], kind: 'cpu', slot: 1, cpuLevel: level },
    ]
  }
  // ふたりは名前を付けず、番号（1P・2P）とキー（F・J）で呼ぶ
  return [
    { id: DUO_IDS[0], name: '', kind: 'human', slot: 0 },
    { id: DUO_IDS[1], name: '', kind: 'human', slot: 1 },
  ]
}

export class LocalSession implements GameSession {
  readonly mode: 'solo' | 'duo'
  readonly localPlayerIds: readonly string[]
  readonly selfId = null
  readonly canSkipReveal = true
  readonly scope: Scope
  readonly level: CpuLevel

  private readonly clock: PausableClock
  private readonly recent: RecentStore
  private readonly baseSeed: number
  private readonly offVisibility: () => void
  private readonly listeners = new Set<(s: PublicGameState) => void>()
  private state: GameState
  private pub: PublicGameState
  private gameNo = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private closed = false

  constructor(opts: LocalSessionOptions) {
    this.mode = opts.mode
    this.scope = opts.scope
    this.level = opts.level ?? 'minarai'
    this.localPlayerIds = opts.mode === 'solo' ? [SOLO_HUMAN_ID] : [...DUO_IDS]
    this.clock = new PausableClock(opts.speed ?? 1, opts.realNow)
    this.recent = opts.recent ?? memoryRecentStore()
    this.baseSeed = opts.seed ?? randomSeed()
    this.state = this.newGame()
    this.pub = toPublicState(this.state, this.clock.now())

    const visibility = opts.visibility ?? documentVisibility()
    const onVisibility = (): void => {
      if (visibility.hidden()) this.pause('hidden')
      else this.resume('hidden')
    }
    this.offVisibility = visibility.onChange(onVisibility)
    if (visibility.hidden()) this.pause('hidden')
  }

  // ── GameSession ──

  now(): number {
    return this.clock.now()
  }

  getState(): PublicGameState {
    return this.pub
  }

  subscribe(cb: (state: PublicGameState) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  progress(): number {
    return progressAt(this.state, this.clock.now())
  }

  canBuzz(playerId: string): boolean {
    // 止まっている間（確認の窓など）も見た目は変えない。押しても buzz の側で受け付けない
    return !this.closed && this.localPlayerIds.includes(playerId) && rulesCanBuzz(this.state, playerId, this.clock.now())
  }

  // 止まっている間（確認の窓・隠れたタブ）は画面の側が操作を通さないので、ここでは止めない。
  // 自動テストは時計を止めたまま答えられる（テストの操作の遅さで回答時間が切れないように）
  buzz(playerId: string): void {
    if (!this.localPlayerIds.includes(playerId)) return
    this.apply({ type: 'buzz', playerId })
  }

  answer(playerId: string, choiceIndex: number): void {
    if (!this.localPlayerIds.includes(playerId)) return
    this.apply({ type: 'answer', playerId, choiceIndex })
  }

  skipReveal(): void {
    this.apply({ type: 'skipReveal' })
  }

  connection(): ConnectionStatus {
    return 'ok'
  }

  begin(): void {
    if (this.state.startedAt === null) this.apply({ type: 'start' })
  }

  canRematch(): boolean {
    return !this.closed && this.state.phase === 'finished'
  }

  rematch(): void {
    if (!this.canRematch()) return
    this.gameNo++
    this.clearTimer()
    this.state = this.newGame()
    this.publish()
  }

  leave(): void {
    if (this.closed) return
    this.closed = true
    this.clearTimer()
    this.offVisibility()
    this.listeners.clear()
  }

  // ── ひとり・ふたりだけの操作 ──

  /** 時計を止める（「やめる」の確認中など）。理由ごとに数え、全部の理由が外れたら動き出す */
  pause(reason = 'manual'): void {
    // 止める前に、時刻が来ていた出来事（締め切り・コンピューターの押し）を済ませる。
    // タイマーが遅れているときに止めると、来ていたはずの出来事が反映されないまま止まってしまうため
    if (!this.clock.paused && !this.closed) this.apply({ type: 'tick' })
    this.clock.pause(reason)
    this.clearTimer()
  }

  resume(reason = 'manual'): void {
    this.clock.resume(reason)
    if (!this.clock.paused) this.schedule()
  }

  get paused(): boolean {
    return this.clock.paused
  }

  get speed(): number {
    return this.clock.speed
  }

  /**
   * 止めている間に、ゲームの時計を ms だけ進めて、その時刻までの出来事を済ませる（自動テスト ?test=1 の窓口だけが使う）。
   * 画面なしのブラウザは描画が重く実時間がぶれるので、スクリーンショットは時計を手で進めて撮る
   */
  testAdvance(ms: number): void {
    if (!this.clock.paused || this.closed) return
    this.clock.advanceWhilePaused(ms)
    this.apply({ type: 'tick' })
  }

  /** 中の状態（正解の番号を含む）。自動テスト（?test=1）の窓口だけが読む。画面は getState() を使う */
  peekState(): GameState {
    return this.state
  }

  // ── 中身 ──

  private newGame(): GameState {
    const avoidIds = this.recent.load()
    const state = createGame({
      seed: (this.baseSeed + this.gameNo) >>> 0,
      scope: this.scope,
      players: playersFor(this.mode, this.level),
      now: this.clock.now(),
      avoidIds,
    })
    this.recent.save(state.questions.map((q) => q.landmarkId))
    return state
  }

  private apply(action: Action): void {
    if (this.closed) return
    const now = this.clock.now()
    const next = reduce(this.state, action, now)
    if (next !== this.state) {
      this.state = next
      this.publish()
    }
    this.schedule()
  }

  private publish(): void {
    this.pub = toPublicState(this.state, this.clock.now())
    for (const cb of [...this.listeners]) {
      try {
        cb(this.pub)
      } catch (err) {
        console.error('[game] 状態の知らせの処理で誤り', err)
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  /** 次の締め切りにタイマーを掛ける。止まっている間・締め切りがない間は掛けない */
  private schedule(): void {
    this.clearTimer()
    if (this.closed || this.clock.paused) return
    const now = this.clock.now()
    const at = nextDeadline(this.state, now)
    if (at === null) return
    const delay = Math.min(2 ** 30, Math.max(0, this.clock.toRealMs(at - now)) + 1)
    this.timer = setTimeout(() => {
      this.timer = null
      this.apply({ type: 'tick' })
    }, delay)
  }
}
