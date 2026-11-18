// 1日の使用量を数える（ブレーカー）。UTC の日付ごとに Durable Object を1つ使う（名前＝日付）。名所バトルの usage.ts を写した。
// 認めた回数だけ1行ずつ書き、上限に達したあとは書かない。呼ぶ側（Worker・部屋）は、上限と分かった種類を
// 日付が変わるまで覚えて、この Durable Object を呼ばずに断る（budget.ts の TripCache）。

import { DurableObject } from 'cloudflare:workers'
import {
  DAILY_LIMITS,
  nextUtcMidnight,
  takeSlot,
  TripCache,
  USAGE_ERROR_RETRY_MS,
  utcDay,
  type TestUsage,
  type UsageCounts,
  type UsageKind,
} from './budget'
import type { Env } from './env'

const KEY = 'counts'

export class UsageDO extends DurableObject<Env> {
  private counts: UsageCounts | null = null

  /** 1回ぶん使ってよいか。よければ数を1増やして保存する（1行）。上限なら何も書かずに false */
  async take(kind: UsageKind, limit: number): Promise<boolean> {
    if (this.counts === null) this.counts = (await this.ctx.storage.get<UsageCounts>(KEY)) ?? {}
    const r = takeSlot(this.counts, kind, limit)
    if (!r.granted) return false
    this.counts = r.counts
    await this.ctx.storage.put(KEY, r.counts)
    return true
  }

  /** いまの数（手元の試験の確かめ用） */
  async peek(): Promise<UsageCounts> {
    if (this.counts === null) this.counts = (await this.ctx.storage.get<UsageCounts>(KEY)) ?? {}
    return { ...this.counts }
  }
}

/** 数え先の名前。試験用の上限が付いているときは、本物の1日の数とは別に数える */
export function usageObjectName(now: number, test: TestUsage | null): string {
  return test ? `test:${test.id}:${utcDay(now)}` : `day:${utcDay(now)}`
}

const cache = new TripCache()

/**
 * 1日の上限の内側なら、1回ぶん使って true。上限なら false（呼ぶ側は「きょうのネット対戦はいっぱいです」で断る）。
 * 数え先が答えられないときも断る（ブレーカーは安全側に倒す）。その場合は30秒後に聞き直す
 */
export async function takeDaily(env: Env, kind: UsageKind, now: number, test: TestUsage | null): Promise<boolean> {
  const name = usageObjectName(now, test)
  const key = `${name}:${kind}`
  if (cache.isTripped(key, now)) return false
  const limit = test ? test.limits[kind] : DAILY_LIMITS[kind]
  try {
    const ok = await env.USAGE.getByName(name).take(kind, limit)
    if (!ok) cache.trip(key, nextUtcMidnight(now), now)
    return ok
  } catch {
    cache.trip(key, now + USAGE_ERROR_RETRY_MS, now)
    return false
  }
}
