// ネット対戦の画面に出す文言と、待合室の形（LobbyModel）。app.ts から使う。DOM を使わない（単体試験で確かめる）。
// 文言は「何が起きたか」と「次に何ができるか」を1文ずつ（docs/02 の「エラーは理由と戻り道」）。

import type { LobbyModel } from '../contracts'
import type { ErrorCode, RoomView } from '../../shared/protocol/messages'
import type { MatchmakeFailure } from './matchmake'
import type { JoinFailure } from './room-client'

/** 部屋に入れなかった・作れなかった理由 */
export function joinFailureText(code: JoinFailure): string {
  switch (code) {
    case 'room-not-found':
      return 'その部屋は見つかりませんでした。あいことばをもう一度確かめてください'
    case 'room-full':
      return 'その部屋はいっぱいです（4人まで）。新しい部屋を作って遊べます'
    case 'already-started':
      return 'その部屋はもう試合を始めています。新しい部屋を作って遊べます'
    case 'bad-code':
      return 'あいことばは、英字と数字の4文字です'
    case 'name-required':
      return '名前を入れてから、もう一度お試しください'
    case 'daily-limit':
      return 'きょうのネット対戦はいっぱいです。「ひとりで遊ぶ」なら、いつでも遊べます'
    case 'rate-limited':
      return '続けて何度も試したので、1分ほど待ってからもう一度お試しください'
    case 'room-closed':
      return 'その部屋は閉じられました。新しい部屋を作って遊べます'
    default:
      return 'つながりませんでした。電波のよい場所で、もう一度お試しください'
  }
}

/** 試合中・待合室で、戻れなくなった理由（null は通信が切れたまま戻れなかった） */
export function lostText(code: JoinFailure | null): string {
  if (code === 'daily-limit') return joinFailureText(code)
  if (code === 'room-closed' || code === 'room-not-found') return '部屋が閉じられたので、戻れませんでした。「ひとりで遊ぶ」なら、すぐに遊べます'
  if (code === 'rate-limited') return '送る量が多すぎたので、部屋から外れました。少し待ってから、もう一度お試しください'
  return '通信が切れて、部屋に戻れませんでした。「ひとりで遊ぶ」なら、すぐに遊べます'
}

/** 操作を断られたとき（接続はそのまま）のトースト */
export function noticeText(code: ErrorCode): string {
  switch (code) {
    case 'not-enough-players':
      return 'はじめるには、2人以上そろう必要があります'
    case 'not-host':
      return 'それは部屋の主だけができます'
    case 'already-started':
      return 'もう試合が始まっています'
    case 'daily-limit':
      return joinFailureText(code)
    default:
      return 'うまくいきませんでした。もう一度お試しください'
  }
}

/** 相手探しをやめた理由（見つからなかったときの文言は画面の担当が出す） */
export function matchFailureText(reason: MatchmakeFailure): string {
  if (reason === 'daily-limit') return joinFailureText('daily-limit')
  if (reason === 'rate-limited') return joinFailureText('rate-limited')
  if (reason === 'timeout') return '相手が見つかりませんでした。CPUと遊ぶか、もう一度さがしてください'
  return 'つながりませんでした。CPUと遊ぶか、もう一度さがしてください'
}

/** 部屋の形から待合室の形を作る。部屋がまだ届いていなければ、自分だけの待合室にする */
export function lobbyModelOf(room: RoomView | null, mySlot: number | null, code: string, url: string): LobbyModel {
  const hostSlot = room?.hostSlot ?? null
  const players = (room?.members ?? []).map((m) => ({
    slot: m.slot,
    name: m.name,
    character: m.character,
    isHost: m.slot === hostSlot,
    isYou: m.slot === mySlot,
    connected: m.connected,
  }))
  const isHost = mySlot !== null && hostSlot === mySlot
  const connected = players.filter((p) => p.connected).length
  return {
    code: room?.code ?? code,
    url,
    players,
    isHost,
    duration: room?.duration ?? 120,
    canStart: isHost && connected >= 2 && room?.phase === 'lobby',
  }
}
