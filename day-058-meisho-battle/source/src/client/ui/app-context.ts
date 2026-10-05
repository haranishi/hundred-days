// 画面の部品どうしの約束。段B1（画面）が実装し、段B2（ネットの画面）が使う。
// ⚠️ 変えるときは両方の担当に知らせる。

import type { DioramaView } from '../render'
import type { GameSession } from '../game/session'
import type { CpuLevel, Scope } from '../../shared/types'

/** 1つの画面。mount で uiRoot の中に自分の要素を作り、unmount で片付ける */
export interface Screen {
  mount(root: HTMLElement): void
  unmount(): void
}

export type ScreenFactory = (ctx: AppContext, params: unknown) => Screen

/** 効果音の名前（段B1の audio が鳴らし方を持つ） */
export type SfxName =
  | 'tap'
  | 'land'
  | 'paint'
  | 'buzz'
  | 'correct'
  | 'wrong'
  | 'tick'
  | 'go'
  | 'fanfare'
  | 'join'

export interface AudioApi {
  /** 最初のタップで呼ぶ（それより前は鳴らさない） */
  unlock(): void
  play(name: SfxName, opts?: { size?: number }): void
  setSfxEnabled(on: boolean): void
  setBgmEnabled(on: boolean): void
  /** ゲーム中だけBGMを流す、などの切り替え */
  setBgmPlaying(playing: boolean): void
}

/** 端末に覚える設定。localStorage を try/catch で包んだもの（使えない端末では覚えないだけ） */
export interface Settings {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
}

/** ひとり・ふたりのゲームを始めるときの指定 */
export interface LocalGameOptions {
  mode: 'solo' | 'duo'
  scope: Scope
  /** ひとりのときの相手の強さ */
  level?: CpuLevel
  /** ゲーム画面の頭に一度だけ出す知らせ（例：相手が見つからなかったので、ガイドさんと対戦します） */
  notice?: string
}

export interface AppContext {
  /** 画面の UI を置く層（模型の描画の上に重なる） */
  readonly uiRoot: HTMLElement
  /** 模型の描画。アプリ全体で1つだけ */
  readonly view: DioramaView
  readonly audio: AudioApi
  readonly settings: Settings
  /** 画面を切り替える。登録済みの名前：title・howto・solo・duo・settings・credits・game・result など */
  go(name: string, params?: unknown): void
  registerScreen(name: string, factory: ScreenFactory): void
  /** ひとり・ふたりのゲームをすぐ始める */
  startLocalGame(opts: LocalGameOptions): void
  /** ゲーム画面へ */
  startSession(session: GameSession, opts?: { notice?: string }): void
}
