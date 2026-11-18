// 友だちの部屋の入口。createRoom（部屋を作ってあいことばを受け取る）・joinRoom（あいことばで入る）・resumeRoom（札で戻る）。

import { sanitizeName } from '../../shared/names'
import { isCharacterKey, type CreateRoomResponse } from '../../shared/protocol/messages'
import { isValidRoomCode, normalizeRoomCode } from '../../shared/roomcode'
import { resolveNetEnv, type NetEnv } from './env'
import { RoomClient, RoomJoinError } from './room-client'
import type { SeatStore } from './seat-store'

export interface NetOptions {
  env?: Partial<NetEnv>
  store?: SeatStore
}

/**
 * 友だちの部屋を作り、あいことばを返す（入るのは joinRoom）。
 * 断られたら RoomJoinError（daily-limit＝きょうはいっぱい、rate-limited＝作りすぎ、network＝つながらない）
 */
export async function createRoom(opts: NetOptions = {}): Promise<string> {
  const env = resolveNetEnv(opts.env)
  let code: unknown
  try {
    const res = await env.fetch(`${env.httpBase}/api/rooms`, { method: 'POST' })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      if (body?.error === 'daily-limit' || body?.error === 'rate-limited') throw new RoomJoinError(body.error)
      throw new RoomJoinError('network')
    }
    code = ((await res.json()) as Partial<CreateRoomResponse>).code
  } catch (err) {
    if (err instanceof RoomJoinError) throw err
    throw new RoomJoinError('network')
  }
  if (!isValidRoomCode(code)) throw new RoomJoinError('network')
  return code
}

export interface JoinOptions extends NetOptions {
  /** 選んだキャラ（'ch/〜'）。無ければ部屋が席の番号で決める */
  character?: string
}

/** あいことばで入る。全角・小文字・空白は整えてから確かめる。名乗りが通った接続を返す。だめなら RoomJoinError */
export async function joinRoom(code: string, name: string, opts: JoinOptions = {}): Promise<RoomClient> {
  const c = normalizeRoomCode(code)
  if (!isValidRoomCode(c)) throw new RoomJoinError('bad-code')
  const clean = sanitizeName(name)
  if (clean === null) throw new RoomJoinError('name-required')
  const character = isCharacterKey(opts.character) ? opts.character : undefined
  return new RoomClient({ code: c, name: clean, character, env: opts.env, store: opts.store }).connect().ready()
}

/** 部屋を作って、そのまま入る（部屋の主になる） */
export async function createAndJoin(name: string, opts: JoinOptions = {}): Promise<RoomClient> {
  if (sanitizeName(name) === null) throw new RoomJoinError('name-required')
  const code = await createRoom(opts)
  return joinRoom(code, name, opts)
}

/** 覚えておいた札で戻る（読み込み直したタブ）。名前があれば、席が無くなっていたときに新しく入るのに使う */
export async function resumeRoom(code: string, token: string, name?: string, opts: JoinOptions = {}): Promise<RoomClient> {
  const c = normalizeRoomCode(code)
  if (!isValidRoomCode(c)) throw new RoomJoinError('bad-code')
  const clean = name === undefined ? undefined : (sanitizeName(name) ?? undefined)
  const character = isCharacterKey(opts.character) ? opts.character : undefined
  return new RoomClient({ code: c, name: clean, character, token, env: opts.env, store: opts.store }).connect().ready()
}

/** 招待のリンク（?room=コード）。base は今のページ */
export function inviteUrl(code: string, base: string = globalThis.location?.href ?? 'http://localhost/'): string {
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', code)
  return url.toString()
}
