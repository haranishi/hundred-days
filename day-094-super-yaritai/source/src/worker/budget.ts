// 無料枠を守るための上限（docs/05「使用量と無料枠」）。名所バトルの budget.ts を写して、試合中の中継に合わせて直した。
// Cloudflare の無料プランは、どれかを使い切るとその日（UTC。日本時間9時まで）はその種類の操作が失敗する。
// 1日の開始件数（ブレーカー）と部屋1つあたりの予算で、無料枠の消費を抑える。Cloudflare に依存しない純粋な関数だけを置く。

import { RATE_BURST, RATE_PER_SEC, TEST_USAGE_HEADER } from '../shared/protocol/constants'

export { TEST_USAGE_HEADER }

// ── 1日の上限（ブレーカー） ──

/** 1日（UTC）の上限。超えたら「きょうのネット対戦はいっぱいです」で断る */
export const DAILY_LIMITS = {
  /** 友だちの部屋をつくる回数 */
  room: 300,
  /** 相手探しに入る回数 */
  match: 600,
  /** 試合を始める回数（はじめる・もう一回・相手探しの自動開始） */
  game: 250,
} as const

export type UsageKind = keyof typeof DAILY_LIMITS
export type DailyLimits = Record<UsageKind, number>
export type UsageCounts = Partial<Record<UsageKind, number>>

/** UTC の日付（Cloudflare の無料枠が切り替わる日） */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** 次に UTC の日付が変わる時刻 */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}

/** 1回ぶん使ってよいか。よければ1足した数を返す（上限に達していたら数を増やさない＝書き込みもしない） */
export function takeSlot(counts: UsageCounts, kind: UsageKind, limit: number): { granted: boolean; counts: UsageCounts } {
  const used = counts[kind] ?? 0
  if (!(used < limit)) return { granted: false, counts }
  return { granted: true, counts: { ...counts, [kind]: used + 1 } }
}

// ── 部屋ごとの予算 ──

/**
 * 部屋1つが一生のうちに使ってよい量。どれかを超えたら、その部屋を閉じる（ふつうに遊ぶ量の数倍にしてある）。
 * 届いた通数は「待合室の分（base）＋試合ごとに 人数×(試合の秒数＋30秒)×perPlayerSecond」まで。
 * ふつうの試合は1人毎秒15〜20通なので、32 はその倍近い
 */
export const ROOM_BUDGET = {
  connections: { base: 12, perGame: 8 },
  messages: { base: 600, perPlayerSecond: 32, marginSec: 30 },
  writes: { base: 30, perGame: 30 },
} as const

export type RoomBudgetKind = keyof typeof ROOM_BUDGET

export interface RoomUsage {
  /** 受け入れた接続の数（つなぎ直しを含む） */
  connections: number
  /** 届いた知らせの数（20通で Durable Objects の1リクエスト） */
  messages: number
  /** 保存の書き込み（行数。アラームの設定も1行） */
  writes: number
  /** 始めた試合の数 */
  games: number
  /** 試合を始めるたびに足した、通数の上乗せ */
  messageAllowance: number
}

export function emptyUsage(): RoomUsage {
  return { connections: 0, messages: 0, writes: 0, games: 0, messageAllowance: 0 }
}

/** 試合1つぶんの通数の上乗せ */
export function gameMessageAllowance(players: number, durationSec: number): number {
  const b = ROOM_BUDGET.messages
  return Math.max(0, players) * (Math.max(0, durationSec) + b.marginSec) * b.perPlayerSecond
}

export function roomAllowance(kind: RoomBudgetKind, usage: RoomUsage): number {
  if (kind === 'messages') return ROOM_BUDGET.messages.base + usage.messageAllowance
  const b = ROOM_BUDGET[kind]
  return b.base + b.perGame * Math.max(0, usage.games)
}

/** 予算を超えたものがあればその名前、なければ null。pendingMessages はまだ usage に足していない通数 */
export function overRoomBudget(usage: RoomUsage, pendingMessages = 0): RoomBudgetKind | null {
  if (usage.connections > roomAllowance('connections', usage)) return 'connections'
  if (usage.messages + pendingMessages > roomAllowance('messages', usage)) return 'messages'
  if (usage.writes > roomAllowance('writes', usage)) return 'writes'
  return null
}

// ── 1接続の通数（docs/05：1つの接続から毎秒40通を超えたら切る） ──

/** 溜め（トークンバケツ）。tokens は今使える通数、at は最後に数えた時刻 */
export interface Bucket {
  tokens: number
  at: number
}

/**
 * 1通届いたことを数える。毎秒 rate 通ずつ溜まり、burst 通まで溜められる。溜めが空なら allowed=false（切る）。
 * 溜めを持つのは、通信が詰まったあとに何通かまとめて届くことがあるため（平均は毎秒 rate 通を超えられない）
 */
export function takeToken(
  bucket: Bucket | undefined,
  now: number,
  rate: number = RATE_PER_SEC,
  burst: number = RATE_BURST,
): { bucket: Bucket; allowed: boolean } {
  const prev = bucket ?? { tokens: burst, at: now }
  const elapsed = Math.max(0, now - prev.at) / 1000
  const tokens = Math.min(burst, prev.tokens + elapsed * rate)
  if (tokens < 1) return { bucket: { tokens, at: now }, allowed: false }
  return { bucket: { tokens: tokens - 1, at: now }, allowed: true }
}

// ── 手元の試験だけで使う上限の差し替え ──

export interface TestUsage {
  /** 数える場所の名前（本物の1日の数とは別に数える） */
  id: string
  limits: DailyLimits
}

/**
 * 試験用の見出しを読む。「id;room=2;match=1;game=1」の形。届いた先が localhost のときだけ有効。
 * 公開先の URL のホストは localhost にならない（Cloudflare はホスト名で Worker に振り分ける）ので、本番では必ず null になる。
 * 名所バトルは GAME_SPEED（試験用の倍速）がある時だけ読んだが、こちらは倍速を使わない（試合の長さは主が決める）ので、ホストだけで判断する
 */
export function readTestUsage(header: string | null, requestUrl: string): TestUsage | null {
  if (!header) return null
  let host = ''
  try {
    host = new URL(requestUrl).hostname
  } catch {
    return null
  }
  if (host !== 'localhost' && host !== '127.0.0.1') return null
  const [id, ...pairs] = header.split(';').map((x) => x.trim())
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null
  const limits: DailyLimits = { ...DAILY_LIMITS }
  for (const pair of pairs) {
    const [k, v] = pair.split('=')
    const n = Number(v)
    if ((k === 'room' || k === 'match' || k === 'game') && Number.isInteger(n) && n >= 0) limits[k] = n
  }
  return { id, limits }
}

// ── 上限に達したことを覚えておく（同じ isolate の中だけ） ──

/** 数え先が答えられなかったときに、聞き直すまで断り続ける時間 */
export const USAGE_ERROR_RETRY_MS = 30_000

/**
 * 上限に達した種類を、日付が変わるまで覚えておく。覚えている間は数え先（UsageDO）を呼ばずに断るので、
 * 上限のあとに大量に来ても、ブレーカーそのものが無料枠を使わない
 */
export class TripCache {
  private readonly until = new Map<string, number>()

  isTripped(key: string, now: number): boolean {
    const t = this.until.get(key)
    if (t === undefined) return false
    if (t > now) return true
    this.until.delete(key)
    return false
  }

  trip(key: string, until: number, now: number): void {
    for (const [k, t] of this.until) if (t <= now) this.until.delete(k)
    this.until.set(key, until)
  }

  get size(): number {
    return this.until.size
  }
}
