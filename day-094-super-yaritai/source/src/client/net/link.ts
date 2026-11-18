// 試合のセッション（HostSession・GuestSession）が部屋への接続に求めるもの。RoomClient がこれを満たす。
// 単体試験では、メモリの中で中継する偽物（部屋の routeBinary と同じ振り分け）を差し込む。

import type { MatchResult } from '../../shared/view'
import type { RoomView } from '../../shared/protocol/messages'
import type { ConnectionStatus, RoomClientEvent } from './room-client'

export interface NetLink {
  /** 自分の席の番号（名乗りが通るまで null） */
  readonly slot: number | null
  /** いちばん新しい部屋の形 */
  readonly room: RoomView | null
  /** 試合開始からのミリ秒（サーバー時刻で数える。カウントダウン中は負）。試合が無ければ null */
  matchTime(): number | null
  /** 端末の時計（ミリ秒・戻らない） */
  localNow(): number
  status(): ConnectionStatus
  sendBinary(data: Uint8Array): boolean
  final(round: number, result: MatchResult): boolean
  on(listener: (e: RoomClientEvent) => void): () => void
  onBinary(listener: (data: Uint8Array) => void): () => void
}
