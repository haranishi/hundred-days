// 端末側のネット対戦の入口。画面とゲームの側はここだけを使う。
// - createRoom() / joinRoom(code, name) / createAndJoin(name) / resumeRoom(code, token)：友だちの部屋
// - matchmake(callbacks)：相手探し（20秒で見つからなければ onGiveUp）
// - RoomClient：部屋への接続（時計合わせ・JSON とバイナリ・札での再接続・切断の知らせ）
// - SnapshotBuffer：参加者の画面で、店の様子を約100ms遅らせて補間する
// 符号化（バイナリの形・WorldView の組み立て直し）は src/shared/protocol にある。

export { ClockSync, pickBestSample, type ClockSample } from './clock'
export { browserNetEnv, isSocketOpen, resolveNetEnv, type NetEnv, type SocketLike } from './env'
export { matchmake, type MatchmakeCallbacks, type MatchmakeFailure, type MatchmakeHandle } from './matchmake'
export {
  phaseAt,
  reconnectDelayMs,
  RoomClient,
  RoomJoinError,
  type ConnectionStatus,
  type JoinFailure,
  type RoomClientEvent,
  type RoomClientOptions,
} from './room-client'
export { createAndJoin, createRoom, inviteUrl, joinRoom, resumeRoom, type JoinOptions, type NetOptions } from './rooms'
export { memorySeatStore, sessionSeatStore, type SeatRecord, type SeatStore } from './seat-store'
export { lerpAngle, SnapshotBuffer, type Snapshot, type SnapshotBufferOptions } from './snapshot-buffer'
export type { NetLink } from './link'
export { joinFailureText, lobbyModelOf, lostText, matchFailureText, noticeText } from './texts'
