// 部屋の決まり（docs/05「部屋の決まり」）を、Cloudflare に依存しない純粋な関数で書く。名所バトルの room-core.ts を写して直した。
// RoomDO（room.ts）はこれを呼び、保存・送信・アラームだけを受け持つ。単体試験は tests/unit/worker/room-core.test.ts。
//
// 名所バトルとの違い：部屋の中でルールを回さない。試合の物理と点数は部屋の主（最初に入った人）の端末が回し、
// 部屋は「段階・顔ぶれ・主・開始時刻と種・最終結果」の管理と、試合中のバイナリの中継（routeBinary）だけをする。
// 段階のうち countdown と playing は開始時刻と今の時刻から決まるので、保存しない（休止から戻っても同じ答えになる）。

import type { MatchResult } from '../shared/view'
import { BIN_EVENTS, BIN_INTENT, BIN_SELF, BIN_STORE } from '../shared/protocol/binary'
import {
  COUNTDOWN_MS,
  DEFAULT_CHARACTERS,
  DEFAULT_DURATION,
  EMPTY_ROOM_TTL_MS,
  FINAL_GRACE_MS,
  FRIENDS_MAX_PLAYERS,
  HOST_SILENT_MS,
  LOBBY_GRACE_MS,
  MATCH_PLAYERS,
  MAX_BINARY_BYTES,
  PLAYING_GRACE_MS,
  ROOM_MIN_PLAYERS,
  BAN_MS,
  type MatchDuration,
} from '../shared/protocol/constants'
import type { ErrorCode, RoomKind, RoomPhase, RoomView } from '../shared/protocol/messages'
import { emptyUsage, gameMessageAllowance, type RoomUsage, type TestUsage } from './budget'

export interface Seat {
  /** 席の番号 0..3（試合のキャラの slot と同じ）。席がある間は変わらない */
  slot: number
  /** 再接続の札（相手探しの部屋では、配った札がそのまま再接続の札になる） */
  token: string
  name: string
  character: string
  /** 初めてつながった時刻。主の交代の順に使う。相手探しの部屋でまだ来ていない席は null */
  joinedAt: number | null
  connected: boolean
  /** 切れた時刻（つながっている間は null）。相手探しの部屋でまだ来ていない席は部屋を作った時刻 */
  disconnectedAt: number | null
}

/** 試合の終わり方。final＝主が結果を送った、host-left＝主が抜けた（戻らなかった）、timeout＝主から結果が来なかった */
export type EndReason = 'final' | 'host-left' | 'timeout'

export interface GameRecord {
  /** 何試合目か（1から） */
  round: number
  seed: number
  /** 試合の開始時刻（実時刻）。これより前はカウントダウン */
  startAt: number
  duration: MatchDuration
  endedAt: number | null
  endReason: EndReason | null
  /** final で届いた結果（host-left・timeout では null。参加者は最後に届いた点数で結果を出す） */
  result: MatchResult | null
}

export interface RoomRecord {
  v: 1
  code: string
  kind: RoomKind
  createdAt: number
  hostSlot: number | null
  seats: Seat[]
  /** 次の試合の長さ（主が選ぶ） */
  duration: MatchDuration
  /** 待合室では null。始まったら最後の試合（結果のあとも残す） */
  game: GameRecord | null
  /** つながっている人がいなくなった時刻。だれかいれば null */
  emptySince: number | null
  usage: RoomUsage
  /** 予算を超えて閉じた部屋。だれも入れない（全員が抜けて10分たったら片付ける） */
  closed: boolean
  /** 通数の制限で切った札。until までは戻れない */
  banned: { token: string; until: number }[]
  /** 手元の試験で1日の上限を差し替えたとき（本番では null） */
  testUsage: TestUsage | null
  /** 1日の試合の上限で認められたが、開始までに状況が変わって始まらなかった枠の日付（同じ日なら次の開始で使い回す） */
  reservedGameDay: string | null
}

// ── 部屋を作る ──

export interface NewRoomOptions {
  code: string
  kind: RoomKind
  now: number
  /** 相手探しの部屋だけ：2人分の席（配る札・仮名） */
  matchSeats?: readonly { token: string; name: string }[]
  testUsage?: TestUsage | null
}

export function createRoomRecord(o: NewRoomOptions): RoomRecord {
  const seats: Seat[] = (o.matchSeats ?? []).slice(0, MATCH_PLAYERS).map((s, i) => ({
    slot: i,
    token: s.token,
    name: s.name,
    character: defaultCharacter(i),
    joinedAt: null,
    connected: false,
    disconnectedAt: o.now,
  }))
  return {
    v: 1,
    code: o.code,
    kind: o.kind,
    createdAt: o.now,
    hostSlot: null,
    seats,
    duration: DEFAULT_DURATION,
    game: null,
    // 作っただけでだれも来なければ、10分で片付ける
    emptySince: o.now,
    usage: emptyUsage(),
    closed: false,
    banned: [],
    testUsage: o.testUsage ?? null,
    reservedGameDay: null,
  }
}

export function defaultCharacter(slot: number): string {
  return DEFAULT_CHARACTERS[slot % DEFAULT_CHARACTERS.length] ?? DEFAULT_CHARACTERS[0]
}

/** 席の数（友だちの部屋は4、相手探しの部屋は2） */
export function capacity(room: Pick<RoomRecord, 'kind'>): number {
  return room.kind === 'match' ? MATCH_PLAYERS : FRIENDS_MAX_PLAYERS
}

/** 同時につないでよい接続の数（名乗る前の接続も数える）。席の数×2 */
export function maxConnections(room: Pick<RoomRecord, 'kind'>): number {
  return capacity(room) * 2
}

// ── 段階 ──

export function roomPhase(room: Pick<RoomRecord, 'game'>, now: number): RoomPhase {
  const g = room.game
  if (!g) return 'lobby'
  if (g.endedAt !== null) return 'result'
  return now < g.startAt ? 'countdown' : 'playing'
}

function inMatch(phase: RoomPhase): boolean {
  return phase === 'countdown' || phase === 'playing'
}

/** 切れた人の席を残す時間（待合室・結果は60秒、試合中は20秒） */
export function graceMs(room: Pick<RoomRecord, 'game'>, now: number): number {
  return inMatch(roomPhase(room, now)) ? PLAYING_GRACE_MS : LOBBY_GRACE_MS
}

/** 主から結果が来なければ打ち切る時刻 */
export function finalDeadline(game: GameRecord): number {
  return game.startAt + game.duration * 1000 + FINAL_GRACE_MS
}

// ── 札の一時停止と使用中の判定 ──

export function banToken(room: RoomRecord, token: string, now: number): RoomRecord {
  const banned = room.banned.filter((b) => b.until > now && b.token !== token)
  banned.push({ token, until: now + BAN_MS })
  return { ...room, banned }
}

export function isBanned(room: RoomRecord, token: string | undefined, now: number): boolean {
  return typeof token === 'string' && room.banned.some((b) => b.token === token && b.until > now)
}

/**
 * あいことばの使用中判定。部屋の記録があり、まだ片付けの時刻（全員が抜けて10分）を過ぎていなければ使用中。
 * 片付けのアラームが失敗して記録が残っていても、時刻を過ぎていれば使用中とはみなさない。
 */
export function isRoomInUse(room: RoomRecord | null | undefined, now: number): boolean {
  if (!room) return false
  return !(room.emptySince !== null && now - room.emptySince >= EMPTY_ROOM_TTL_MS)
}

// ── 入る・戻る ──

export interface JoinRequest {
  /** 整えたあとの名前（友だちの部屋だけ使う） */
  name?: string
  character?: string
  /** 再接続の札・相手探しの札 */
  token?: string
}

export type JoinResult = { ok: true; room: RoomRecord; seat: Seat; rejoined: boolean } | { ok: false; code: ErrorCode }

/** 札が合う席。札が無い・合わなければ undefined */
export function findSeatByToken(room: RoomRecord, token: string | undefined): Seat | undefined {
  if (typeof token !== 'string' || token === '') return undefined
  return room.seats.find((s) => s.token === token)
}

/**
 * hello が届いたときの判定。札が合えばその席に戻す（切れていた人・相手探しで初めて来た人）。
 * 合わなければ、友だちの部屋で、待合室で、満員でなく、名前があれば、新しい席を作る。
 * newToken は新しい席の札（呼ぶ側が推測できない乱数で作る）
 */
export function joinRoom(room: RoomRecord, req: JoinRequest, now: number, newToken: string): JoinResult {
  if (room.closed) return { ok: false, code: 'room-closed' }
  if (isBanned(room, req.token, now)) return { ok: false, code: 'rate-limited' }
  const seat = findSeatByToken(room, req.token)
  if (seat) {
    const first = seat.joinedAt === null
    const back: Seat = {
      ...seat,
      connected: true,
      disconnectedAt: null,
      joinedAt: seat.joinedAt ?? now,
      // 相手探しの部屋で初めて来たときだけ、選んだキャラを使う（戻ってきた人は変えない）
      character: first && req.character ? req.character : seat.character,
    }
    const next = fixHost({ ...replaceSeat(room, back), emptySince: null }, now)
    return { ok: true, room: next, seat: back, rejoined: !first }
  }
  // 相手探しの部屋には、配った札を持つ2人しか入れない
  if (room.kind === 'match') return { ok: false, code: 'room-full' }
  // 始まったら途中からは入れない（結果のあとも、同じ顔ぶれのもう一回だけ）
  if (room.game !== null) return { ok: false, code: 'already-started' }
  if (room.seats.length >= FRIENDS_MAX_PLAYERS) return { ok: false, code: 'room-full' }
  if (!req.name) return { ok: false, code: 'name-required' }
  const slot = freeSlot(room)
  const fresh: Seat = {
    slot,
    token: newToken,
    name: req.name,
    character: req.character ?? defaultCharacter(slot),
    joinedAt: now,
    connected: true,
    disconnectedAt: null,
  }
  const next = fixHost({ ...room, seats: [...room.seats, fresh], emptySince: null }, now)
  return { ok: true, room: next, seat: fresh, rejoined: false }
}

/** 空いている席でいちばん小さい番号 */
function freeSlot(room: RoomRecord): number {
  for (let slot = 0; slot < FRIENDS_MAX_PLAYERS; slot++) if (!room.seats.some((s) => s.slot === slot)) return slot
  throw new Error('room-core: 空いている席がない（満員の判定の誤り）')
}

// ── 切れる・抜ける ──

/** 接続が切れた（席は残す）。待合室・結果で主だったら、つながっている人の中で最初に入った人に渡す */
export function markDisconnected(room: RoomRecord, slot: number, now: number): RoomRecord {
  const seat = room.seats.find((s) => s.slot === slot)
  if (!seat || !seat.connected) return room
  return settleEmpty(fixHost(replaceSeat(room, { ...seat, connected: false, disconnectedAt: now }), now), now)
}

/** 席を空ける（自分から出た・席の保持の時間を過ぎた）。試合中に主の席が空いたら、試合を host-left で終える */
export function removeSeat(room: RoomRecord, slot: number, now: number): RoomRecord {
  if (!room.seats.some((s) => s.slot === slot)) return room
  const phase = roomPhase(room, now)
  let next: RoomRecord = { ...room, seats: room.seats.filter((s) => s.slot !== slot) }
  if (room.hostSlot === slot) {
    next = { ...next, hostSlot: null }
    if (inMatch(phase)) next = endGame(next, 'host-left', now, null)
  }
  return settleEmpty(fixHost(next, now), now)
}

/** 席の保持の時間を過ぎても戻らない席を空ける */
export function expireSeats(room: RoomRecord, now: number): RoomRecord {
  let next = room
  for (const s of room.seats) {
    if (!s.connected && s.disconnectedAt !== null && now - s.disconnectedAt >= graceMs(next, now)) next = removeSeat(next, s.slot, now)
  }
  return next
}

/**
 * 主を決め直す。試合中（カウントダウンを含む）は、主の席が残っている限り主のまま（切れていても20秒は戻るのを待つ）。
 * 待合室と結果では、主の席がつながっていればそのまま。そうでなければ、つながっている人の中で最初に入った人。
 * だれもつながっていなければ、今の主（席が無ければ最初に入った人）。
 */
export function fixHost(room: RoomRecord, now: number): RoomRecord {
  const host = room.seats.find((s) => s.slot === room.hostSlot)
  if (host && (host.connected || inMatch(roomPhase(room, now)))) return room
  const byJoin = room.seats.filter((s) => s.joinedAt !== null).sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.slot - b.slot)
  const next = byJoin.find((s) => s.connected) ?? host ?? byJoin[0]
  const hostSlot = next?.slot ?? null
  return hostSlot === room.hostSlot ? room : { ...room, hostSlot }
}

function settleEmpty(room: RoomRecord, now: number): RoomRecord {
  if (room.seats.some((s) => s.connected)) return room.emptySince === null ? room : { ...room, emptySince: null }
  return room.emptySince === null ? { ...room, emptySince: now } : room
}

function replaceSeat(room: RoomRecord, seat: Seat): RoomRecord {
  return { ...room, seats: room.seats.map((s) => (s.slot === seat.slot ? seat : s)) }
}

export function connectedCount(room: RoomRecord): number {
  return room.seats.filter((s) => s.connected).length
}

// ── 主の操作 ──

export type RoomOpResult = { ok: true; room: RoomRecord } | { ok: false; code: ErrorCode }

/** 試合の長さを変える（待合室か結果で、主だけ） */
export function configureRoom(room: RoomRecord, requester: number, duration: MatchDuration, now: number): RoomOpResult {
  if (room.closed) return { ok: false, code: 'room-closed' }
  if (room.hostSlot !== requester) return { ok: false, code: 'not-host' }
  if (inMatch(roomPhase(room, now))) return { ok: false, code: 'already-started' }
  return { ok: true, room: room.duration === duration ? room : { ...room, duration } }
}

/**
 * はじめる（待合室）・もう一回（結果）を、ルールの上で始められるか。1日の上限を聞く前の確かめ。
 * requester が null なら相手探しの部屋の自動開始
 */
export function canStartGame(room: RoomRecord, requester: number | null, rematch: boolean, now: number): RoomOpResult {
  if (room.closed) return { ok: false, code: 'room-closed' }
  if (requester !== null && room.hostSlot !== requester) return { ok: false, code: 'not-host' }
  if (roomPhase(room, now) !== (rematch ? 'result' : 'lobby')) return { ok: false, code: 'already-started' }
  if (connectedCount(room) < ROOM_MIN_PLAYERS) return { ok: false, code: 'not-enough-players' }
  return { ok: true, room }
}

/**
 * 試合を始める。開始時刻は今＋3.5秒（カウントダウン）。切れている人の席は外す（始まったら途中からは入れない）。
 * 部屋の予算は、試合ごとに人数と長さに応じて増える
 */
export function startGame(room: RoomRecord, requester: number | null, rematch: boolean, now: number, seed: number): RoomOpResult {
  const check = canStartGame(room, requester, rematch, now)
  if (!check.ok) return check
  const seats = room.seats.filter((s) => s.connected)
  const game: GameRecord = {
    round: (room.game?.round ?? 0) + 1,
    seed: seed >>> 0,
    startAt: now + COUNTDOWN_MS,
    duration: room.duration,
    endedAt: null,
    endReason: null,
    result: null,
  }
  const usage: RoomUsage = {
    ...room.usage,
    games: room.usage.games + 1,
    messageAllowance: room.usage.messageAllowance + gameMessageAllowance(seats.length, game.duration),
  }
  return { ok: true, room: fixHost({ ...room, seats, game, usage, reservedGameDay: null }, now) }
}

/** 相手探しの部屋で、札を持つ2人がそろったら自動で始める（待合室が無いため） */
export function shouldAutoStart(room: RoomRecord, now: number): boolean {
  return (
    !room.closed &&
    room.kind === 'match' &&
    roomPhase(room, now) === 'lobby' &&
    room.seats.length === MATCH_PLAYERS &&
    room.seats.every((s) => s.connected)
  )
}

/** 主から最終結果が届いた（試合中だけ）。人の席がある slot の名前とキャラは、部屋が知っている値に置き換える */
export function finishGame(room: RoomRecord, requester: number, round: number, result: MatchResult, now: number): RoomOpResult {
  if (room.hostSlot !== requester) return { ok: false, code: 'not-host' }
  const g = room.game
  if (!g || g.round !== round || roomPhase(room, now) !== 'playing') return { ok: false, code: 'not-playing' }
  const players = result.players.map((p) => {
    const seat = room.seats.find((s) => s.slot === p.slot)
    return seat ? { ...p, kind: 'human' as const, name: seat.name, character: seat.character } : p
  })
  return { ok: true, room: endGame(room, 'final', now, { ...result, players }) }
}

/**
 * 主の店の様子が HOST_SILENT_MS 届いていなければ、試合を host-left で終える（試合中だけ）。
 * lastHostFrameAt は部屋が最後に主の種類2を中継した時刻（休止・入れ替えから戻ったときは、その時刻で数え直す）
 */
export function checkHostSilent(room: RoomRecord, lastHostFrameAt: number, now: number): RoomRecord {
  const g = room.game
  if (!g || roomPhase(room, now) !== 'playing') return room
  if (now - Math.max(lastHostFrameAt, g.startAt) < HOST_SILENT_MS) return room
  return endGame(room, 'host-left', now, null)
}

function endGame(room: RoomRecord, reason: EndReason, now: number, result: MatchResult | null): RoomRecord {
  const g = room.game
  if (!g || g.endedAt !== null) return room
  return { ...room, game: { ...g, endedAt: now, endReason: reason, result } }
}

// ── 時間で進むもの ──

/** now まで進める：席の保持の終わり・主から結果が来ないときの打ち切り */
export function tickRoom(room: RoomRecord, now: number): RoomRecord {
  let next = expireSeats(room, now)
  const g = next.game
  if (g && g.endedAt === null && now >= finalDeadline(g)) next = endGame(next, 'timeout', now, null)
  return next
}

/** 次に起こすべき時刻（席の保持の終わり・打ち切り・片付け）。無ければ null */
export function nextWakeAt(room: RoomRecord, now: number): number | null {
  const times: number[] = []
  const grace = graceMs(room, now)
  for (const s of room.seats) if (!s.connected && s.disconnectedAt !== null) times.push(s.disconnectedAt + grace)
  if (room.game && room.game.endedAt === null) times.push(finalDeadline(room.game))
  if (room.emptySince !== null) times.push(room.emptySince + EMPTY_ROOM_TTL_MS)
  return times.length === 0 ? null : Math.max(now, Math.min(...times))
}

// ── 配る形 ──

/** 端末に配る部屋の形。札は入らない */
export function roomView(room: RoomRecord, now: number): RoomView {
  const g = room.game
  const phase = roomPhase(room, now)
  return {
    code: room.code,
    kind: room.kind,
    phase,
    hostSlot: room.hostSlot,
    members: [...room.seats]
      .sort((a, b) => a.slot - b.slot)
      .map((s) => ({ slot: s.slot, name: s.name, character: s.character, connected: s.connected })),
    duration: g && inMatch(phase) ? g.duration : room.duration,
    round: g?.round ?? 0,
    startAt: g?.startAt ?? null,
    seed: g?.seed ?? null,
  }
}

// ── 試合中のバイナリの中継（docs/05「試合中のデータ」） ──

export type RelayRoute =
  | { to: 'host'; slot: number }
  | { to: 'guests'; slots: number[] }
  | { drop: 'size' | 'phase' | 'kind' | 'sender' | 'no-host' }

/**
 * 届いたバイナリの行き先を決める。種類1と4は主にだけ送り、2バイト目に送り主の slot を書き込む（data をその場で書き換える）。
 * 種類2と3は主から参加者全員へ。主以外の2・3、主の1・4、知らない種類、空・16KB超え、試合中でないものは捨てる
 */
export function routeBinary(room: RoomRecord, sender: number, data: Uint8Array, now: number): RelayRoute {
  if (data.byteLength < 2 || data.byteLength > MAX_BINARY_BYTES) return { drop: 'size' }
  if (!inMatch(roomPhase(room, now))) return { drop: 'phase' }
  const isHost = room.hostSlot === sender
  switch (data[0]) {
    case BIN_SELF:
    case BIN_INTENT: {
      if (isHost) return { drop: 'sender' }
      const host = room.seats.find((s) => s.slot === room.hostSlot)
      if (!host?.connected) return { drop: 'no-host' }
      data[1] = sender
      return { to: 'host', slot: host.slot }
    }
    case BIN_STORE:
    case BIN_EVENTS:
      if (!isHost) return { drop: 'sender' }
      return { to: 'guests', slots: room.seats.filter((s) => s.connected && s.slot !== sender).map((s) => s.slot) }
    default:
      return { drop: 'kind' }
  }
}
