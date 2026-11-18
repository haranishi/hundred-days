import { describe, expect, it } from 'vitest'
import { BIN_EVENTS, BIN_INTENT, BIN_SELF, BIN_STORE, SLOT_UNSET } from '../../../src/shared/protocol/binary'
import {
  COUNTDOWN_MS,
  EMPTY_ROOM_TTL_MS,
  FINAL_GRACE_MS,
  HOST_SILENT_MS,
  LOBBY_GRACE_MS,
  PLAYING_GRACE_MS,
} from '../../../src/shared/protocol/constants'
import type { MatchResult } from '../../../src/shared/view'
import {
  banToken,
  canStartGame,
  checkHostSilent,
  configureRoom,
  createRoomRecord,
  expireSeats,
  finishGame,
  isRoomInUse,
  joinRoom,
  markDisconnected,
  nextWakeAt,
  removeSeat,
  roomPhase,
  roomView,
  routeBinary,
  shouldAutoStart,
  startGame,
  tickRoom,
  type RoomRecord,
} from '../../../src/worker/room-core'

const T0 = 1_000_000
let seq = 0
const newToken = (): string => `token-${String(++seq).padStart(20, '0')}`

function friends(names: string[]): RoomRecord {
  let room = createRoomRecord({ code: 'K7QM', kind: 'friends', now: T0 })
  names.forEach((name, i) => {
    const r = joinRoom(room, { name }, T0 + 10 * (i + 1), newToken())
    if (!r.ok) throw new Error(r.code)
    room = r.room
  })
  return room
}

function must(r: { ok: true; room: RoomRecord } | { ok: false; code: string }): RoomRecord {
  if (!r.ok) throw new Error(`失敗: ${r.code}`)
  return r.room
}

/** 2人の部屋で試合を始め、カウントダウンが終わった時刻を返す */
function playing(names = ['たろう', 'はなこ']): { room: RoomRecord; t: number } {
  const room = must(startGame(friends(names), 0, false, T0 + 1000, 42))
  return { room, t: T0 + 1000 + COUNTDOWN_MS }
}

function result(slots: number[]): MatchResult {
  return {
    duration: 120,
    players: slots.map((slot, i) => ({
      slot,
      kind: 'human' as const,
      name: `ずる${slot}`,
      character: 'ch/character-male-a',
      score: 1000 - i,
      rank: i + 1,
      title: '要注意人物',
      complete: false,
      achieved: [],
      secrets: [],
      breakdown: {},
      caught: 0,
    })),
    winnerSlots: [slots[0] as number],
    damage: 0.1,
    aborted: false,
  }
}

const frame = (kind: number, size = 8): Uint8Array => {
  const b = new Uint8Array(size)
  b[0] = kind
  b[1] = SLOT_UNSET
  return b
}

describe('入る・主・席', () => {
  it('最初に入った人が主。席の番号は0から順に。名前の無い新しい人は断る', () => {
    const room = friends(['たろう', 'はなこ', 'じろう'])
    expect(room.hostSlot).toBe(0)
    expect(room.seats.map((s) => s.slot)).toEqual([0, 1, 2])
    expect(joinRoom(room, {}, T0 + 100, newToken())).toEqual({ ok: false, code: 'name-required' })
  })

  it('5人目は満員で断る。始まったら途中からは入れない（結果のあとも）', () => {
    const four = friends(['a', 'b', 'c', 'd'])
    expect(joinRoom(four, { name: 'e' }, T0 + 100, newToken())).toEqual({ ok: false, code: 'room-full' })
    const { room, t } = playing()
    expect(joinRoom(room, { name: 'ちこく' }, t, newToken())).toEqual({ ok: false, code: 'already-started' })
    const ended = must(finishGame(room, 0, 1, result([0, 1]), t + 5000))
    expect(joinRoom(ended, { name: 'ちこく' }, t + 6000, newToken())).toEqual({ ok: false, code: 'already-started' })
  })

  it('キャラは選んだものを使い、選ばなければ席の番号で決まる', () => {
    let room = createRoomRecord({ code: 'K7QM', kind: 'friends', now: T0 })
    room = must(joinRoom(room, { name: 'a', character: 'ch/character-male-e' }, T0, newToken()))
    room = must(joinRoom(room, { name: 'b' }, T0, newToken()))
    expect(room.seats.map((s) => s.character)).toEqual(['ch/character-male-e', 'ch/character-male-f'])
  })

  it('待合室で主が切れたら、次に入った人が主になる。全員が抜けたら片付けの時計が動く', () => {
    let room = friends(['あるじ', 'つぎ', 'さんばん'])
    room = markDisconnected(room, 0, T0 + 100)
    expect(room.hostSlot).toBe(1)
    room = removeSeat(room, 1, T0 + 200)
    expect(room.hostSlot).toBe(2)
    room = markDisconnected(room, 2, T0 + 300)
    expect(room.emptySince).toBe(T0 + 300)
    expect(isRoomInUse(room, T0 + 300 + EMPTY_ROOM_TTL_MS - 1)).toBe(true)
    expect(isRoomInUse(room, T0 + 300 + EMPTY_ROOM_TTL_MS)).toBe(false)
  })

  it('切れても札で同じ席に戻れる（待合室60秒・試合中20秒）。過ぎたら席が空く', () => {
    let room = friends(['たろう', 'はなこ'])
    const token = room.seats[1]?.token
    room = markDisconnected(room, 1, T0 + 100)
    expect(expireSeats(room, T0 + 100 + LOBBY_GRACE_MS - 1).seats).toHaveLength(2)
    const back = joinRoom(room, { token }, T0 + 100 + LOBBY_GRACE_MS - 1, newToken())
    expect(back.ok && back.seat.slot).toBe(1)
    expect(back.ok && back.rejoined).toBe(true)
    expect(expireSeats(room, T0 + 100 + LOBBY_GRACE_MS).seats).toHaveLength(1)

    const { room: game, t } = playing()
    const off = markDisconnected(game, 1, t)
    expect(nextWakeAt(off, t)).toBe(t + PLAYING_GRACE_MS)
    expect(expireSeats(off, t + PLAYING_GRACE_MS - 1).seats).toHaveLength(2)
    expect(expireSeats(off, t + PLAYING_GRACE_MS).seats).toHaveLength(1)
  })

  it('通数の制限で切った札は、しばらく戻れない', () => {
    let room = friends(['たろう'])
    const token = room.seats[0]?.token as string
    room = banToken(markDisconnected(room, 0, T0), token, T0)
    expect(joinRoom(room, { token }, T0 + 1000, newToken())).toEqual({ ok: false, code: 'rate-limited' })
    expect(joinRoom(room, { token }, T0 + 30_000, newToken()).ok).toBe(true)
  })
})

describe('段階：待合室 → カウントダウン → 試合中 → 結果', () => {
  it('主だけが、2人以上で始められる。開始時刻は今＋3.5秒で、種を配る', () => {
    const one = friends(['たろう'])
    expect(canStartGame(one, 0, false, T0)).toEqual({ ok: false, code: 'not-enough-players' })
    const two = friends(['たろう', 'はなこ'])
    expect(canStartGame(two, 1, false, T0)).toEqual({ ok: false, code: 'not-host' })
    const started = must(startGame(two, 0, false, T0 + 1000, 0xdeadbeef))
    expect(roomPhase(started, T0 + 1000)).toBe('countdown')
    expect(roomPhase(started, T0 + 1000 + COUNTDOWN_MS)).toBe('playing')
    const view = roomView(started, T0 + 1000)
    expect(view).toMatchObject({ phase: 'countdown', round: 1, startAt: T0 + 1000 + COUNTDOWN_MS, seed: 0xdeadbeef, hostSlot: 0 })
    // 札は配る形に入らない
    expect(JSON.stringify(view)).not.toContain('token-')
    expect(startGame(started, 0, false, T0 + 2000, 1)).toEqual({ ok: false, code: 'already-started' })
  })

  it('試合の長さは待合室か結果のときに、主だけが変えられる', () => {
    const room = friends(['たろう', 'はなこ'])
    expect(configureRoom(room, 1, 90, T0)).toEqual({ ok: false, code: 'not-host' })
    const r = must(configureRoom(room, 0, 180, T0))
    expect(roomView(r, T0).duration).toBe(180)
    const game = must(startGame(r, 0, false, T0, 1))
    expect(configureRoom(game, 0, 90, T0 + 10)).toEqual({ ok: false, code: 'already-started' })
  })

  it('始めたときに切れていた人は試合に入らない', () => {
    const room = markDisconnected(friends(['たろう', 'はなこ', 'じろう']), 2, T0 + 50)
    const started = must(startGame(room, 0, false, T0 + 100, 1))
    expect(started.seats.map((s) => s.slot)).toEqual([0, 1])
  })

  it('final は主だけ・試合中だけ・同じ試合の番号だけ。名前とキャラは部屋の知っている値に置き換える', () => {
    const { room, t } = playing()
    expect(finishGame(room, 0, 1, result([0, 1]), t - 1)).toEqual({ ok: false, code: 'not-playing' })
    expect(finishGame(room, 1, 1, result([0, 1]), t)).toEqual({ ok: false, code: 'not-host' })
    expect(finishGame(room, 0, 2, result([0, 1]), t)).toEqual({ ok: false, code: 'not-playing' })
    const ended = must(finishGame(room, 0, 1, result([0, 1, 3]), t + 60_000))
    expect(roomPhase(ended, t + 60_000)).toBe('result')
    expect(ended.game?.endReason).toBe('final')
    const names = ended.game?.result?.players.map((p) => p.name)
    expect(names).toEqual(['たろう', 'はなこ', 'ずる3']) // 席の無い slot（CPUなど）はそのまま
    expect(finishGame(ended, 0, 1, result([0, 1]), t + 61_000)).toEqual({ ok: false, code: 'not-playing' })
  })

  it('もう一回は結果のあとに主だけ。試合の番号が増え、新しい開始時刻になる', () => {
    const { room, t } = playing()
    expect(startGame(room, 0, true, t, 2)).toEqual({ ok: false, code: 'already-started' })
    const ended = must(finishGame(room, 0, 1, result([0, 1]), t + 1000))
    expect(startGame(ended, 1, true, t + 2000, 2)).toEqual({ ok: false, code: 'not-host' })
    const again = must(startGame(ended, 0, true, t + 2000, 2))
    expect(roomView(again, t + 2000)).toMatchObject({ phase: 'countdown', round: 2, startAt: t + 2000 + COUNTDOWN_MS, seed: 2 })
    expect(again.usage.games).toBe(2)
  })

  it('主から結果が来なければ、試合の長さ＋15秒で打ち切る（timeout）', () => {
    const { room, t } = playing()
    const end = t + 120_000 + FINAL_GRACE_MS
    expect(nextWakeAt(room, t)).toBe(end)
    expect(roomPhase(tickRoom(room, end - 1), end - 1)).toBe('playing')
    const cut = tickRoom(room, end)
    expect(roomPhase(cut, end)).toBe('result')
    expect(cut.game?.endReason).toBe('timeout')
  })
})

describe('試合中に主が抜ける', () => {
  it('主が切れても20秒は主のまま待ち、戻らなければ host-left で結果になり、次の人が主になる', () => {
    const { room, t } = playing(['あるじ', 'さんか', 'さんか2'])
    const off = markDisconnected(room, 0, t + 1000)
    expect(off.hostSlot).toBe(0)
    expect(roomPhase(off, t + 1000)).toBe('playing')
    const gone = tickRoom(off, t + 1000 + PLAYING_GRACE_MS)
    expect(roomPhase(gone, t + 1000 + PLAYING_GRACE_MS)).toBe('result')
    expect(gone.game?.endReason).toBe('host-left')
    expect(gone.hostSlot).toBe(1)
    // 新しい主はもう一回を始められる
    expect(startGame(gone, 1, true, t + 30_000, 9).ok).toBe(true)
  })

  it('主の店の様子が20秒届かなければ host-left（カウントダウン中は数えない・届いていれば続く）', () => {
    const { room, t } = playing()
    // 開始から数える：カウントダウン中に送っていなくても、開始から20秒までは待つ
    expect(checkHostSilent(room, T0, t + HOST_SILENT_MS - 1)).toBe(room)
    expect(checkHostSilent(room, T0, t - 500)).toBe(room)
    const silent = checkHostSilent(room, T0, t + HOST_SILENT_MS)
    expect(silent.game?.endReason).toBe('host-left')
    expect(roomPhase(silent, t + HOST_SILENT_MS)).toBe('result')
    // 最後に届いた時刻から数える
    expect(checkHostSilent(room, t + 30_000, t + 30_000 + HOST_SILENT_MS - 1)).toBe(room)
    // 終わった試合はそのまま
    const ended = must(finishGame(room, 0, 1, result([0, 1]), t + 1000))
    expect(checkHostSilent(ended, T0, t + 99_000)).toBe(ended)
  })

  it('主が自分から抜けたら（bye）すぐに host-left', () => {
    const { room, t } = playing()
    const gone = removeSeat(room, 0, t + 500)
    expect(gone.game?.endReason).toBe('host-left')
    expect(gone.hostSlot).toBe(1)
  })

  it('参加者が抜けても試合は続く', () => {
    const { room, t } = playing(['あるじ', 'さんか', 'さんか2'])
    const r = removeSeat(room, 2, t + 500)
    expect(roomPhase(r, t + 500)).toBe('playing')
    expect(r.hostSlot).toBe(0)
  })

  it('主が切れて戻ってきたら、主のまま続く', () => {
    const { room, t } = playing()
    const token = room.seats[0]?.token
    const off = markDisconnected(room, 0, t + 100)
    const back = joinRoom(off, { token }, t + 5000, newToken())
    expect(back.ok && back.room.hostSlot).toBe(0)
    expect(back.ok && roomPhase(back.room, t + 5000)).toBe('playing')
  })
})

describe('中継の振り分けとなりすまし防止', () => {
  it('種類1・4は主にだけ送り、2バイト目に送り主の slot を部屋が書き込む', () => {
    const { room, t } = playing(['あるじ', 'さんか', 'さんか2'])
    for (const kind of [BIN_SELF, BIN_INTENT]) {
      const data = frame(kind)
      data[1] = 0 // 主になりすまそうとしても
      expect(routeBinary(room, 2, data, t)).toEqual({ to: 'host', slot: 0 })
      expect(data[1]).toBe(2) // 部屋が本当の送り主に書き換える
    }
  })

  it('種類2・3は主から、主以外の全員へ（切れている人には送らない）', () => {
    const { room, t } = playing(['あるじ', 'さんか', 'さんか2'])
    const off = markDisconnected(room, 2, t)
    expect(routeBinary(off, 0, frame(BIN_STORE), t)).toEqual({ to: 'guests', slots: [1] })
    expect(routeBinary(room, 0, frame(BIN_EVENTS), t)).toEqual({ to: 'guests', slots: [1, 2] })
  })

  it('主以外の2・3、主の1・4、知らない種類、空・大きすぎ、試合の外は捨てる', () => {
    const { room, t } = playing()
    expect(routeBinary(room, 1, frame(BIN_STORE), t)).toEqual({ drop: 'sender' })
    expect(routeBinary(room, 1, frame(BIN_EVENTS), t)).toEqual({ drop: 'sender' })
    expect(routeBinary(room, 0, frame(BIN_SELF), t)).toEqual({ drop: 'sender' })
    expect(routeBinary(room, 0, frame(BIN_INTENT), t)).toEqual({ drop: 'sender' })
    expect(routeBinary(room, 1, frame(9), t)).toEqual({ drop: 'kind' })
    expect(routeBinary(room, 1, frame(0), t)).toEqual({ drop: 'kind' })
    expect(routeBinary(room, 1, new Uint8Array([1]), t)).toEqual({ drop: 'size' })
    expect(routeBinary(room, 0, frame(BIN_STORE, 16 * 1024 + 1), t)).toEqual({ drop: 'size' })
    expect(routeBinary(room, 0, frame(BIN_STORE, 16 * 1024), t)).toEqual({ to: 'guests', slots: [1] })
    const lobby = friends(['たろう', 'はなこ'])
    expect(routeBinary(lobby, 0, frame(BIN_STORE), T0)).toEqual({ drop: 'phase' })
    const ended = must(finishGame(room, 0, 1, result([0, 1]), t + 100))
    expect(routeBinary(ended, 0, frame(BIN_STORE), t + 200)).toEqual({ drop: 'phase' })
  })

  it('カウントダウン中も中継する（参加者が最初の様子をそろえられるように）。主が切れていれば1・4は捨てる', () => {
    const { room, t } = playing()
    expect(routeBinary(room, 0, frame(BIN_STORE), t - 1000)).toEqual({ to: 'guests', slots: [1] })
    const off = markDisconnected(room, 0, t)
    expect(routeBinary(off, 1, frame(BIN_SELF), t)).toEqual({ drop: 'no-host' })
  })
})

describe('相手探しの部屋', () => {
  const firstCredential = 'ticket-aaaaaaaaaaaaaaaa'
  const secondCredential = 'ticket-bbbbbbbbbbbbbbbb'
  const tickets = [
    { token: firstCredential, name: '試食ハンター' },
    { token: secondCredential, name: 'カート番長' },
  ]

  it('札を持つ2人だけが入れ、名前は仮名のまま。2人そろったら自動で始める。先に来た人が主', () => {
    let room = createRoomRecord({ code: 'MTCH', kind: 'match', now: T0, matchSeats: tickets })
    expect(joinRoom(room, { name: 'よそもの' }, T0, newToken())).toEqual({ ok: false, code: 'room-full' })
    room = must(joinRoom(room, { token: tickets[1]?.token, name: 'ほんみょう', character: 'ch/character-male-a' }, T0 + 10, newToken()))
    expect(shouldAutoStart(room, T0 + 10)).toBe(false)
    expect(room.hostSlot).toBe(1)
    room = must(joinRoom(room, { token: tickets[0]?.token }, T0 + 20, newToken()))
    expect(shouldAutoStart(room, T0 + 20)).toBe(true)
    expect(room.seats.map((s) => s.name)).toEqual(['試食ハンター', 'カート番長'])
    expect(room.seats[1]?.character).toBe('ch/character-male-a')
    const started = must(startGame(room, null, false, T0 + 30, 5))
    expect(roomPhase(started, T0 + 30)).toBe('countdown')
    expect(shouldAutoStart(started, T0 + 30)).toBe(false)
  })

  it('来なかった札の席は60秒で外れる', () => {
    const room = createRoomRecord({ code: 'MTCH', kind: 'match', now: T0, matchSeats: tickets })
    expect(expireSeats(room, T0 + LOBBY_GRACE_MS).seats).toHaveLength(0)
  })
})
