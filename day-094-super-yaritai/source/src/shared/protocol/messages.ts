// 操作の連絡（JSON。docs/05「やりとりの形」）の型と、届いたものを確かめる関数。
// 確かめる関数は、型・範囲・長さが合わなければ null を返す（呼ぶ側は捨てる）。知らない欄は落として、決まった欄だけの新しい値を返す。
// 部屋（Worker）と端末の両方が使うので、DOM も Cloudflare の型も使わない。

import { sanitizeName, sanitizeText } from '../names'
import { isValidRoomCode } from '../roomcode'
import type { MisdeedId, ScoreKind, SecretId } from '../rules/misdeeds'
import type { MatchResult, PlayerResult } from '../view'
import { CHARACTER_PATTERN, FRIENDS_MAX_PLAYERS, MATCH_DURATIONS, MAX_TEXT_CHARS, type MatchDuration } from './constants'
import { MISDEED_ORDER, SCORE_KINDS, SECRET_ORDER } from './tables'

/** 再接続の札・相手探しの札の形（部屋が作る） */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
/** 名前の生の入力の上限（UTF-16 の長さ）。8文字に切る前の、明らかに壊れた入力を捨てるため */
export const MAX_NAME_INPUT_UNITS = 160
/** 称号の長さの上限（見た目の文字数） */
export const MAX_TITLE_CHARS = 24

export type RoomKind = 'friends' | 'match'
/** 部屋の段階。countdown と playing は開始時刻とサーバー時刻から決まる（端末も同じ計算で求められる） */
export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'result'

// ───────── 端末 → 部屋 ─────────

export interface HelloMessage {
  type: 'hello'
  /** 友だちの部屋だけ。整えたあとの名前（相手探しの部屋では使わない） */
  name?: string
  /** 選んだキャラ（'ch/〜'） */
  character?: string
  /** 再接続の札・相手探しの札 */
  token?: string
}
/** 部屋の主だけ：試合の長さ（待合室か結果のとき） */
export interface ConfigMessage {
  type: 'config'
  duration: MatchDuration
}
/** 部屋の主だけ：はじめる（2人以上） */
export interface StartMessage {
  type: 'start'
}
/** 部屋の主だけ：もう一回（結果のとき） */
export interface RematchMessage {
  type: 'rematch'
}
/** 部屋の主だけ：最終結果。round は何試合目か（前の試合の遅れて届いた結果を捨てるため） */
export interface FinalMessage {
  type: 'final'
  round: number
  result: MatchResult
}
/** 時計合わせ。t は端末の送信時刻（そのまま pong で返る） */
export interface PingMessage {
  type: 'ping'
  t: number
}
/** 自分から抜ける（席をすぐに空ける） */
export interface ByeMessage {
  type: 'bye'
}

export type ClientMessage =
  | HelloMessage
  | ConfigMessage
  | StartMessage
  | RematchMessage
  | FinalMessage
  | PingMessage
  | ByeMessage

// ───────── 部屋 → 端末 ─────────

export interface MemberView {
  slot: number
  name: string
  character: string
  /** いまつながっているか（切れても、待合室60秒・試合中20秒は席が残る） */
  connected: boolean
}

export interface RoomView {
  code: string
  kind: RoomKind
  phase: RoomPhase
  /** 部屋の主（試合の長さを選び、はじめるを押し、試合中は物理を回す） */
  hostSlot: number | null
  members: MemberView[]
  /** 試合の長さ（秒）。試合中はその試合の長さ、待合室では次の試合の長さ */
  duration: number
  /** 何試合目か（0＝まだ始めていない）。もう一回のたびに増える */
  round: number
  /** 試合の開始時刻（サーバー時刻・ミリ秒）。待合室では null */
  startAt: number | null
  /** 店を組み立てる種（buildWorldStatic(seed)）。待合室では null */
  seed: number | null
}

export interface WelcomeMessage {
  type: 'welcome'
  /** 自分の番号 0..3（試合のキャラの slot と同じ） */
  slot: number
  /** 再接続の札（端末のタブの中だけに覚える） */
  token: string
  code: string
  serverNow: number
}
export interface RoomMessage {
  type: 'room'
  serverNow: number
  room: RoomView
}
export interface ResultMessage {
  type: 'result'
  round: number
  result: MatchResult
}
/** 試合中に主が抜けた（戻らなかった）か、主から結果が届かなかった。参加者は最後に届いた点数で結果を出す */
export interface HostLeftMessage {
  type: 'host-left'
  round: number
}
export interface PongMessage {
  type: 'pong'
  t: number
  serverNow: number
}

/** 断る理由 */
export type ErrorCode =
  | 'room-not-found'
  | 'room-full'
  | 'already-started'
  | 'not-host'
  | 'not-enough-players'
  | 'not-playing'
  | 'bad-message'
  | 'rate-limited'
  | 'name-required'
  | 'daily-limit'
  | 'room-closed'

export const ERROR_CODES = [
  'room-not-found',
  'room-full',
  'already-started',
  'not-host',
  'not-enough-players',
  'not-playing',
  'bad-message',
  'rate-limited',
  'name-required',
  'daily-limit',
  'room-closed',
] as const satisfies readonly ErrorCode[]
/** ErrorCode を足したのに ERROR_CODES へ足し忘れると、ここが型の誤りになる（届いた理由を捨ててしまわないように） */
type AssertNever<T extends never> = T
export type ErrorCodeCheck = AssertNever<Exclude<ErrorCode, (typeof ERROR_CODES)[number]>>

export interface ErrorMessage {
  type: 'error'
  code: ErrorCode
}

export type ServerMessage = WelcomeMessage | RoomMessage | ResultMessage | HostLeftMessage | PongMessage | ErrorMessage

// ───────── 相手探し（LobbyDO）。端末からは何も送らない（名前も送らせない） ─────────

export interface LobbyWaitingMessage {
  type: 'waiting'
}
/** 相手が見つかった。端末は code の部屋に hello { token: ticket } で入る */
export interface LobbyMatchedMessage {
  type: 'matched'
  code: string
  ticket: string
}
export interface LobbyErrorMessage {
  type: 'error'
  code: 'rate-limited' | 'daily-limit' | 'bad-message'
}
export type LobbyMessage = LobbyWaitingMessage | LobbyMatchedMessage | LobbyErrorMessage

// ───────── HTTP ─────────

/** POST /api/rooms の返事（201） */
export interface CreateRoomResponse {
  code: string
}
/** POST /api/rooms が断るときの返事 */
export interface CreateRoomErrorResponse {
  error: 'daily-limit' | 'rate-limited' | 'forbidden-origin' | 'busy' | 'method-not-allowed'
}

// ───────── 確かめる道具 ─────────

type Bag = Record<string, unknown>

function isBag(v: unknown): v is Bag {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** その名前の欄が自分の持ち物としてあれば値を、なければ undefined（継承した値は読まない） */
function own(bag: Bag, key: string): unknown {
  return Object.hasOwn(bag, key) ? bag[key] : undefined
}

function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

function isFiniteIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
}

/** 文字列なら JSON として読む（長すぎるもの・壊れたものは undefined）。それ以外はそのまま */
function readJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  if (raw.length === 0 || raw.length > MAX_TEXT_CHARS) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

export function isMatchDuration(v: unknown): v is MatchDuration {
  return (MATCH_DURATIONS as readonly unknown[]).includes(v)
}

export function isCharacterKey(v: unknown): v is string {
  return typeof v === 'string' && CHARACTER_PATTERN.test(v)
}

const SLOT_MAX = FRIENDS_MAX_PLAYERS - 1

// ───────── 結果（final の中身） ─────────

function parseIdList<T extends string>(v: unknown, table: readonly T[]): T[] | null {
  if (!Array.isArray(v) || v.length > table.length) return null
  const out: T[] = []
  for (const id of v) {
    if (typeof id !== 'string' || !(table as readonly string[]).includes(id) || out.includes(id as T)) return null
    out.push(id as T)
  }
  return out
}

function parseBreakdown(v: unknown): PlayerResult['breakdown'] | null {
  if (!isBag(v)) return null
  const out: PlayerResult['breakdown'] = {}
  for (const key of Object.keys(v)) {
    if (!(SCORE_KINDS as readonly string[]).includes(key)) return null
    const item = v[key]
    if (!isBag(item)) return null
    const count = own(item, 'count')
    const points = own(item, 'points')
    if (!isIntIn(count, 0, 1_000_000) || !isFiniteIn(points, -1e9, 1e9)) return null
    out[key as ScoreKind] = { count, points }
  }
  return out
}

/** 内訳の外の加点の行（完全制覇・ひみつ）。省略可。1人16行まで */
function parseExtras(v: unknown): PlayerResult['extras'] | null {
  if (!Array.isArray(v) || v.length > 16) return null
  const out: NonNullable<PlayerResult['extras']> = []
  for (const item of v) {
    if (!isBag(item)) return null
    const label = own(item, 'label')
    const points = own(item, 'points')
    if (typeof label !== 'string' || label.length > MAX_NAME_INPUT_UNITS || !isFiniteIn(points, -1e9, 1e9)) return null
    out.push({ label: sanitizeText(label, MAX_TITLE_CHARS) ?? '', points })
  }
  return out
}

function parsePlayerResult(v: unknown): PlayerResult | null {
  if (!isBag(v)) return null
  const slot = own(v, 'slot')
  const kind = own(v, 'kind')
  const character = own(v, 'character')
  const score = own(v, 'score')
  const rank = own(v, 'rank')
  const complete = own(v, 'complete')
  const caught = own(v, 'caught')
  if (!isIntIn(slot, 0, SLOT_MAX)) return null
  if (kind !== 'human' && kind !== 'cpu') return null
  if (!isCharacterKey(character)) return null
  if (!isFiniteIn(score, -1e9, 1e9)) return null
  if (!isIntIn(rank, 1, FRIENDS_MAX_PLAYERS)) return null
  if (typeof complete !== 'boolean') return null
  if (!isIntIn(caught, 0, 10_000)) return null
  const rawName = own(v, 'name')
  const rawTitle = own(v, 'title')
  if (typeof rawName !== 'string' || rawName.length > MAX_NAME_INPUT_UNITS) return null
  if (typeof rawTitle !== 'string' || rawTitle.length > MAX_NAME_INPUT_UNITS) return null
  const achieved = parseIdList<MisdeedId>(own(v, 'achieved'), MISDEED_ORDER)
  const secrets = parseIdList<SecretId>(own(v, 'secrets'), SECRET_ORDER)
  const breakdown = parseBreakdown(own(v, 'breakdown'))
  if (!achieved || !secrets || !breakdown) return null
  const rawExtras = own(v, 'extras')
  const extras = rawExtras === undefined ? undefined : parseExtras(rawExtras)
  if (extras === null) return null
  const result: PlayerResult = {
    slot,
    kind,
    name: sanitizeName(rawName) ?? `${slot + 1}P`,
    character,
    score,
    rank,
    title: sanitizeText(rawTitle, MAX_TITLE_CHARS) ?? '',
    complete,
    achieved,
    secrets,
    breakdown,
    caught,
  }
  if (extras !== undefined) result.extras = extras
  return result
}

/** 主から届いた最終結果を確かめる。合わなければ null */
export function parseMatchResult(v: unknown): MatchResult | null {
  if (!isBag(v)) return null
  const duration = own(v, 'duration')
  const damage = own(v, 'damage')
  const aborted = own(v, 'aborted')
  const rawPlayers = own(v, 'players')
  const rawWinners = own(v, 'winnerSlots')
  if (!isFiniteIn(duration, 0, 3600) || !isFiniteIn(damage, 0, 1) || typeof aborted !== 'boolean') return null
  if (!Array.isArray(rawPlayers) || rawPlayers.length < 1 || rawPlayers.length > FRIENDS_MAX_PLAYERS) return null
  const players: PlayerResult[] = []
  for (const p of rawPlayers) {
    const r = parsePlayerResult(p)
    if (!r || players.some((q) => q.slot === r.slot)) return null
    players.push(r)
  }
  if (!Array.isArray(rawWinners) || rawWinners.length > players.length) return null
  const winnerSlots: number[] = []
  for (const s of rawWinners) {
    if (!isIntIn(s, 0, SLOT_MAX) || !players.some((p) => p.slot === s) || winnerSlots.includes(s)) return null
    winnerSlots.push(s)
  }
  return { duration, players, winnerSlots, damage, aborted }
}

// ───────── 端末 → 部屋 ─────────

/**
 * 端末から届いた1通を確かめる。文字列（WebSocket の中身）でも、JSON を読んだあとの値でも受ける。
 * 型・範囲・長さが合わなければ null。
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  const data = readJson(raw)
  if (!isBag(data)) return null
  switch (own(data, 'type')) {
    case 'hello': {
      const msg: HelloMessage = { type: 'hello' }
      const name = own(data, 'name')
      if (name !== undefined) {
        if (typeof name !== 'string' || name.length > MAX_NAME_INPUT_UNITS) return null
        const clean = sanitizeName(name)
        if (clean !== null) msg.name = clean
      }
      const character = own(data, 'character')
      if (character !== undefined) {
        if (!isCharacterKey(character)) return null
        msg.character = character
      }
      const token = own(data, 'token')
      if (token !== undefined) {
        if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null
        msg.token = token
      }
      return msg
    }
    case 'config': {
      const duration = own(data, 'duration')
      return isMatchDuration(duration) ? { type: 'config', duration } : null
    }
    case 'start':
      return { type: 'start' }
    case 'rematch':
      return { type: 'rematch' }
    case 'final': {
      const round = own(data, 'round')
      const result = parseMatchResult(own(data, 'result'))
      if (!isIntIn(round, 1, 1_000_000) || !result) return null
      return { type: 'final', round, result }
    }
    case 'ping': {
      const t = own(data, 't')
      return isFiniteIn(t, 0, Number.MAX_SAFE_INTEGER) ? { type: 'ping', t } : null
    }
    case 'bye':
      return { type: 'bye' }
    default:
      return null
  }
}

// ───────── 部屋 → 端末（端末の側で確かめる） ─────────

function parseMember(v: unknown): MemberView | null {
  if (!isBag(v)) return null
  const slot = own(v, 'slot')
  const name = own(v, 'name')
  const character = own(v, 'character')
  const connected = own(v, 'connected')
  if (!isIntIn(slot, 0, SLOT_MAX) || typeof name !== 'string' || name.length > MAX_NAME_INPUT_UNITS) return null
  if (!isCharacterKey(character) || typeof connected !== 'boolean') return null
  return { slot, name, character, connected }
}

export function parseRoomView(v: unknown): RoomView | null {
  if (!isBag(v)) return null
  const code = own(v, 'code')
  const kind = own(v, 'kind')
  const phase = own(v, 'phase')
  const hostSlot = own(v, 'hostSlot')
  const rawMembers = own(v, 'members')
  const duration = own(v, 'duration')
  const round = own(v, 'round')
  const startAt = own(v, 'startAt')
  const seed = own(v, 'seed')
  if (!isValidRoomCode(code) || (kind !== 'friends' && kind !== 'match')) return null
  if (phase !== 'lobby' && phase !== 'countdown' && phase !== 'playing' && phase !== 'result') return null
  if (hostSlot !== null && !isIntIn(hostSlot, 0, SLOT_MAX)) return null
  if (!Array.isArray(rawMembers) || rawMembers.length > FRIENDS_MAX_PLAYERS) return null
  const members: MemberView[] = []
  for (const m of rawMembers) {
    const r = parseMember(m)
    if (!r || members.some((x) => x.slot === r.slot)) return null
    members.push(r)
  }
  if (!isMatchDuration(duration) || !isIntIn(round, 0, 1_000_000)) return null
  if (startAt !== null && !isFiniteIn(startAt, 0, Number.MAX_SAFE_INTEGER)) return null
  if (seed !== null && !isIntIn(seed, 0, 0xffffffff)) return null
  return { code, kind, phase, hostSlot, members, duration, round, startAt, seed }
}

/** 部屋から届いた1通を確かめる（端末の側）。合わなければ null */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const data = readJson(raw)
  if (!isBag(data)) return null
  switch (own(data, 'type')) {
    case 'welcome': {
      const slot = own(data, 'slot')
      const token = own(data, 'token')
      const code = own(data, 'code')
      const serverNow = own(data, 'serverNow')
      if (!isIntIn(slot, 0, SLOT_MAX) || typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null
      if (!isValidRoomCode(code) || !isFiniteIn(serverNow, 0, Number.MAX_SAFE_INTEGER)) return null
      return { type: 'welcome', slot, token, code, serverNow }
    }
    case 'room': {
      const serverNow = own(data, 'serverNow')
      const room = parseRoomView(own(data, 'room'))
      if (!isFiniteIn(serverNow, 0, Number.MAX_SAFE_INTEGER) || !room) return null
      return { type: 'room', serverNow, room }
    }
    case 'result': {
      const round = own(data, 'round')
      const result = parseMatchResult(own(data, 'result'))
      if (!isIntIn(round, 1, 1_000_000) || !result) return null
      return { type: 'result', round, result }
    }
    case 'host-left': {
      const round = own(data, 'round')
      return isIntIn(round, 1, 1_000_000) ? { type: 'host-left', round } : null
    }
    case 'pong': {
      const t = own(data, 't')
      const serverNow = own(data, 'serverNow')
      if (!isFiniteIn(t, 0, Number.MAX_SAFE_INTEGER) || !isFiniteIn(serverNow, 0, Number.MAX_SAFE_INTEGER)) return null
      return { type: 'pong', t, serverNow }
    }
    case 'error': {
      const code = own(data, 'code')
      return typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)
        ? { type: 'error', code: code as ErrorCode }
        : null
    }
    default:
      return null
  }
}

/** 相手探しの行列から届いた1通を確かめる（端末の側） */
export function parseLobbyMessage(raw: unknown): LobbyMessage | null {
  const data = readJson(raw)
  if (!isBag(data)) return null
  switch (own(data, 'type')) {
    case 'waiting':
      return { type: 'waiting' }
    case 'matched': {
      const code = own(data, 'code')
      const ticket = own(data, 'ticket')
      if (!isValidRoomCode(code) || typeof ticket !== 'string' || !TOKEN_PATTERN.test(ticket)) return null
      return { type: 'matched', code, ticket }
    }
    case 'error': {
      const code = own(data, 'code')
      return code === 'rate-limited' || code === 'daily-limit' || code === 'bad-message' ? { type: 'error', code } : null
    }
    default:
      return null
  }
}

/** 送る文字列にする */
export function encodeMessage(msg: ClientMessage | ServerMessage | LobbyMessage): string {
  return JSON.stringify(msg)
}
