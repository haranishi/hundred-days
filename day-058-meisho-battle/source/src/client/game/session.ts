// 画面（ゲーム・結果）とゲーム進行の約束。
// ゲーム画面は、この形だけを見て描く。100日チャレンジ版（Day58）の実装は、ひとり・ふたり（LocalSession）だけ。
// 元の試作ではネット対戦（OnlineSession）も同じ形に合わせていたので、接続の状態などの項目が残っている。

import type { PublicGameState } from '../../shared/types'

export type SessionMode = 'solo' | 'duo'
export type ConnectionStatus = 'ok' | 'reconnecting' | 'lost'

export interface GameSession {
  readonly mode: SessionMode
  /** この端末で操作するプレイヤーの id。ひとり＝人の1人、ふたり＝2人（席の順）、ネット＝自分 */
  readonly localPlayerIds: readonly string[]
  /** 自分の id（ネットのみ。ひとり・ふたりは null） */
  readonly selfId: string | null

  /** いまの時刻（ミリ秒）。ネットはサーバー時刻に合わせた値、ひとり・ふたりは裏に回ると止まる時計 */
  now(): number
  /** いまの状態。正解の番号は答えあわせまで null（ひとり・ふたりも同じ形で渡す） */
  getState(): PublicGameState
  /** 状態が変わるたびに呼ばれる。戻り値の関数で購読をやめる */
  subscribe(cb: (state: PublicGameState) => void): () => void
  /** 進み具合 0〜1。画面が毎フレーム呼ぶ（答えている間は止まる） */
  progress(): number
  /** その人がいま押せるか（ボタンの見た目用。最終判定はルール側） */
  canBuzz(playerId: string): boolean

  buzz(playerId: string): void
  answer(playerId: string, choiceIndex: number): void

  /** 答えあわせを飛ばせるか（ひとり・ふたりは true、ネットは false） */
  readonly canSkipReveal: boolean
  skipReveal(): void

  /** 接続の状態（ひとり・ふたりは常に 'ok'） */
  connection(): ConnectionStatus

  /** 画面の準備ができたら呼ぶ。ひとり・ふたりはここで「3・2・1」を始める。ネットはサーバーが始めるので何もしない */
  begin(): void
  /** 「もう一回」ができるか（ネットは部屋の主だけ true） */
  canRematch(): boolean
  /** 同じ設定・同じ相手で新しいゲーム。状態は subscribe で届く */
  rematch(): void
  /** やめる・画面を離れる（タイマーと接続を片付ける） */
  leave(): void
}
