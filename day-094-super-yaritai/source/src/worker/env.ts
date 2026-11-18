// Worker と Durable Object が受け取る環境（wrangler.jsonc の設定と対応する）

import type { LobbyDO } from './lobby'
import type { RoomDO } from './room'
import type { UsageDO } from './usage'

export interface Env {
  /** 画面の静的配信（Vite で作った dist/client） */
  ASSETS: Fetcher
  /** 部屋ごとに1つ（名前＝あいことば） */
  ROOMS: DurableObjectNamespace<RoomDO>
  /** 相手探しの行列。全体で1つ */
  LOBBY: DurableObjectNamespace<LobbyDO>
  /** 1日の使用量（ブレーカー）。UTC の日付ごとに1つ */
  USAGE: DurableObjectNamespace<UsageDO>
  /** API の受付を IP・操作ごとに絞る（カウンターは Cloudflare の拠点ごと） */
  ROOM_CREATE_LIMIT: RateLimit
  MATCH_LIMIT: RateLimit
  ROOM_CONNECT_LIMIT: RateLimit
}
