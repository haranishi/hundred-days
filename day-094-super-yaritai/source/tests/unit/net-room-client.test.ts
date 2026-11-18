import { describe, expect, it } from 'vitest'
import { createRoom, matchmake, RoomClient, RoomJoinError, type MatchmakeFailure, type RoomClientEvent } from '../../src/client/net'
import type { NetEnv, SocketLike } from '../../src/client/net/env'
import { memorySeatStore } from '../../src/client/net/seat-store'
import { CLOSE_LEAVE, CLOSE_REJECTED, MATCH_JOIN_TIMEOUT_MS, MATCH_TIMEOUT_MS, PLAYING_GRACE_MS } from '../../src/shared/protocol/constants'
import type { RoomView } from '../../src/shared/protocol/messages'

const TOKEN_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

/** 手で進める時計とタイマー */
class FakeClock {
  now = 1000
  private seq = 0
  private timers: { id: number; at: number; fn: () => void }[] = []
  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq
    this.timers.push({ id, at: this.now + Math.max(0, ms), fn })
    return id
  }
  clearTimeout = (id: unknown): void => {
    this.timers = this.timers.filter((t) => t.id !== id)
  }
  advance(ms: number): void {
    const end = this.now + ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      this.timers = this.timers.filter((t) => t !== due)
      this.now = due.at
      due.fn()
    }
    this.now = end
  }
}

class FakeSocket implements SocketLike {
  readyState = 0
  binaryType: 'blob' | 'arraybuffer' = 'blob'
  readonly sent: (string | ArrayBuffer | Uint8Array)[] = []
  closedBy: { code?: number; reason?: string } | null = null
  private readonly listeners = new Map<string, ((ev: { data?: unknown; code?: number }) => void)[]>()
  constructor(readonly url: string) {}
  addEventListener(type: string, fn: (ev: { data?: unknown; code?: number }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  send(data: string | ArrayBuffer | Uint8Array): void {
    this.sent.push(data)
  }
  close(code?: number, reason?: string): void {
    this.closedBy = { code, reason }
    this.readyState = 3
  }
  private emit(type: string, ev: { data?: unknown; code?: number }): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev)
  }
  open(): void {
    this.readyState = 1
    this.emit('open', {})
  }
  receive(msg: unknown): void {
    this.emit('message', { data: typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg) })
  }
  serverClose(code = 1006): void {
    this.readyState = 3
    this.emit('close', { code })
  }
  json(): Record<string, unknown>[] {
    return this.sent.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as Record<string, unknown>)
  }
}

function setup() {
  const clock = new FakeClock()
  const sockets: FakeSocket[] = []
  let fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = async () => new Response('{}', { status: 500 })
  const env: Partial<NetEnv> = {
    openSocket: (url) => {
      const s = new FakeSocket(url)
      sockets.push(s)
      return s
    },
    now: () => clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    wsBase: 'ws://test',
    httpBase: 'http://test',
    fetch: (input, init) => fetchImpl(input, init),
    onVisible: () => () => {},
    onOnline: () => () => {},
  }
  return {
    clock,
    sockets,
    env,
    last: (): FakeSocket => sockets[sockets.length - 1] as FakeSocket,
    setFetch: (f: typeof fetchImpl) => {
      fetchImpl = f
    },
  }
}

function roomView(over: Partial<RoomView> = {}): RoomView {
  return {
    code: 'K7QM',
    kind: 'friends',
    phase: 'lobby',
    hostSlot: 0,
    members: [{ slot: 0, name: 'たろう', character: 'ch/character-female-b', connected: true }],
    duration: 120,
    round: 0,
    startAt: null,
    seed: null,
    ...over,
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('RoomClient：名乗り・時計合わせ・送受信', () => {
  it('つないだら名前・キャラ・札を名乗り、welcome で ready になり、札を覚える', async () => {
    const t = setup()
    const store = memorySeatStore()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', character: 'ch/character-male-a', env: t.env, store }).connect()
    const s = t.last()
    expect(s.url).toBe('ws://test/api/rooms/K7QM/ws')
    expect(s.binaryType).toBe('arraybuffer')
    s.open()
    expect(s.json()[0]).toEqual({ type: 'hello', name: 'たろう', character: 'ch/character-male-a' })
    s.receive({ type: 'welcome', slot: 2, token: TOKEN_A, code: 'K7QM', serverNow: 50_000 })
    await expect(c.ready()).resolves.toBe(c)
    expect(c.slot).toBe(2)
    expect(c.token).toBe(TOKEN_A)
    expect(store.load()).toEqual({ code: 'K7QM', token: TOKEN_A })
    expect(c.status()).toBe('ok')
    // 時計合わせ：ping を送り、pong でずれが決まる
    const ping = s.json().find((m) => m.type === 'ping')
    expect(ping).toBeDefined()
    t.clock.advance(40)
    s.receive({ type: 'pong', t: ping?.t, serverNow: 90_000 })
    // 往復40ms → 送ってから20ms後がサーバーの90000
    expect(c.serverNow()).toBe(90_000 + 20)
  })

  it('部屋の形・結果・host-left・バイナリを受け取り、開始時刻から段階を求め直す', async () => {
    const t = setup()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', env: t.env, store: memorySeatStore() }).connect()
    const s = t.last()
    s.open()
    s.receive({ type: 'welcome', slot: 1, token: TOKEN_A, code: 'K7QM', serverNow: 10_000 })
    await c.ready()
    const events: RoomClientEvent[] = []
    c.on((e) => events.push(e))
    const bins: number[][] = []
    c.onBinary((d) => bins.push([...d]))
    s.receive({ type: 'room', serverNow: 10_000, room: roomView({ phase: 'countdown', round: 1, startAt: 13_500, seed: 77 }) })
    expect(c.currentPhase()).toBe('countdown')
    expect(c.matchTime()).toBe(-3500)
    t.clock.advance(4000)
    expect(c.currentPhase()).toBe('playing')
    s.receive(new Uint8Array([2, 0, 9]).buffer)
    expect(bins).toEqual([[2, 0, 9]])
    expect(c.sendBinary(new Uint8Array([1, 255]))).toBe(true)
    expect(s.sent.at(-1)).toEqual(new Uint8Array([1, 255]))
    s.receive({ type: 'host-left', round: 1 })
    expect(c.ending).toEqual({ round: 1, result: null })
    // 壊れた知らせは捨てる
    s.receive('{"type":"room","room":{"code":"bad"}}')
    expect(events.map((e) => e.type)).toEqual(['room', 'host-left'])
  })

  it('名乗る前に断られたら ready が理由つきで失敗する', async () => {
    const t = setup()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', env: t.env, store: memorySeatStore() }).connect()
    const s = t.last()
    s.open()
    s.receive({ type: 'error', code: 'room-full' })
    await expect(c.ready()).rejects.toEqual(new RoomJoinError('room-full'))
    expect(c.status()).toBe('lost')
  })

  it('切れたら札でつなぎ直し、同じ席に戻る', async () => {
    const t = setup()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', env: t.env, store: memorySeatStore() }).connect()
    t.last().open()
    t.last().receive({ type: 'welcome', slot: 0, token: TOKEN_A, code: 'K7QM', serverNow: 1 })
    await c.ready()
    const statuses: string[] = []
    let rejoined: boolean | null = null
    c.on((e) => {
      if (e.type === 'status') statuses.push(e.status)
      if (e.type === 'welcome') rejoined = e.rejoined
    })
    t.last().serverClose(1006)
    expect(c.status()).toBe('reconnecting')
    t.clock.advance(300)
    expect(t.sockets).toHaveLength(2)
    const again = t.last()
    again.open()
    expect(again.json()[0]).toEqual({ type: 'hello', name: 'たろう', token: TOKEN_A })
    again.receive({ type: 'welcome', slot: 0, token: TOKEN_A, code: 'K7QM', serverNow: 2 })
    expect(c.status()).toBe('ok')
    expect(rejoined).toBe(true)
    expect(statuses).toEqual(['reconnecting', 'ok'])
  })

  it('試合中に切れて20秒戻れなければ、あきらめて lost を知らせる', async () => {
    const t = setup()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', env: t.env, store: memorySeatStore() }).connect()
    t.last().open()
    t.last().receive({ type: 'welcome', slot: 1, token: TOKEN_A, code: 'K7QM', serverNow: 1 })
    t.last().receive({ type: 'room', serverNow: 1, room: roomView({ phase: 'playing', round: 1, startAt: 1, seed: 5 }) })
    await c.ready()
    t.last().serverClose(1006)
    // つなぎ直しは毎回すぐに切れる（電波が無い）
    for (let i = 0; i < 40 && c.status() !== 'lost'; i++) {
      t.clock.advance(1000)
      const s = t.last()
      if (s.readyState === 0) s.serverClose(1006)
    }
    expect(c.status()).toBe('lost')
    expect(t.clock.now - 1000).toBeLessThanOrEqual(PLAYING_GRACE_MS + 1000)
  })

  it('戻ろうとして断られた（部屋が片付いた）ら、すぐに lost', async () => {
    const t = setup()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', env: t.env, store: memorySeatStore() }).connect()
    t.last().open()
    t.last().receive({ type: 'welcome', slot: 1, token: TOKEN_A, code: 'K7QM', serverNow: 1 })
    await c.ready()
    t.last().serverClose(1006)
    t.clock.advance(300)
    t.last().open()
    t.last().receive({ type: 'error', code: 'room-not-found' })
    expect(c.status()).toBe('lost')
    expect(c.rejectionReason).toBe('room-not-found')
  })

  it('leave は bye を送って 4001 で閉じ、札を忘れる', async () => {
    const t = setup()
    const store = memorySeatStore()
    const c = new RoomClient({ code: 'K7QM', name: 'たろう', env: t.env, store }).connect()
    const s = t.last()
    s.open()
    s.receive({ type: 'welcome', slot: 0, token: TOKEN_A, code: 'K7QM', serverNow: 1 })
    await c.ready()
    let left = false
    c.on((e) => {
      if (e.type === 'left') left = true
    })
    c.leave()
    expect(s.json().at(-1)).toEqual({ type: 'bye' })
    expect(s.closedBy?.code).toBe(CLOSE_LEAVE)
    expect(left).toBe(true)
    expect(store.load()).toBeNull()
    expect(c.send({ type: 'start' })).toBe(false)
  })
})

describe('createRoom', () => {
  it('201 ならあいことばを返し、断られたら理由つきの RoomJoinError', async () => {
    const t = setup()
    t.setFetch(async () => new Response(JSON.stringify({ code: 'K7QM' }), { status: 201 }))
    await expect(createRoom({ env: t.env })).resolves.toBe('K7QM')
    t.setFetch(async () => new Response(JSON.stringify({ error: 'daily-limit' }), { status: 503 }))
    await expect(createRoom({ env: t.env })).rejects.toEqual(new RoomJoinError('daily-limit'))
    t.setFetch(async () => new Response(JSON.stringify({ error: 'rate-limited' }), { status: 429 }))
    await expect(createRoom({ env: t.env })).rejects.toEqual(new RoomJoinError('rate-limited'))
    t.setFetch(async () => new Response(JSON.stringify({ code: 'K0QM' }), { status: 201 }))
    await expect(createRoom({ env: t.env })).rejects.toEqual(new RoomJoinError('network'))
    t.setFetch(async () => {
      throw new Error('offline')
    })
    await expect(createRoom({ env: t.env })).rejects.toEqual(new RoomJoinError('network'))
  })
})

describe('matchmake：相手探し', () => {
  it('20秒で見つからなければ timeout を知らせる', () => {
    const t = setup()
    const reasons: MatchmakeFailure[] = []
    const h = matchmake({ onStart: () => {}, onGiveUp: (r) => reasons.push(r) }, { env: t.env })
    const lobby = t.last()
    expect(lobby.url).toBe('ws://test/api/match/ws')
    lobby.open()
    lobby.receive({ type: 'waiting' })
    expect(h.secondsLeft()).toBe(20)
    t.clock.advance(MATCH_TIMEOUT_MS - 1)
    expect(reasons).toEqual([])
    t.clock.advance(1)
    expect(reasons).toEqual(['timeout'])
    expect(lobby.closedBy).not.toBeNull()
  })

  it('見つかったら札で部屋に入り、試合が始まったら onStart に RoomClient を渡す', async () => {
    const t = setup()
    const started: RoomClient[] = []
    const matched: string[] = []
    matchmake(
      { character: 'ch/character-male-e', onMatched: (i) => matched.push(i.code), onStart: (c) => started.push(c), onGiveUp: () => {} },
      { env: t.env },
    )
    const lobby = t.last()
    lobby.open()
    lobby.receive({ type: 'matched', code: 'K7QM', ticket: TOKEN_B })
    expect(matched).toEqual(['K7QM'])
    const room = t.last()
    expect(room.url).toBe('ws://test/api/rooms/K7QM/ws')
    room.open()
    // 相手探しでは名前を送らない（部屋が仮名を付ける）
    expect(room.json()[0]).toEqual({ type: 'hello', character: 'ch/character-male-e', token: TOKEN_B })
    room.receive({ type: 'welcome', slot: 1, token: TOKEN_B, code: 'K7QM', serverNow: 1 })
    room.receive({ type: 'room', serverNow: 1, room: roomView({ kind: 'match', phase: 'lobby' }) })
    expect(started).toHaveLength(0)
    room.receive({ type: 'room', serverNow: 1, room: roomView({ kind: 'match', phase: 'countdown', round: 1, startAt: 3501, seed: 9 }) })
    expect(started).toHaveLength(1)
    expect(started[0]?.slot).toBe(1)
    await flush()
  })

  it('見つかったのに相手が10秒来なければ timeout。きょうはいっぱいなら daily-limit', () => {
    const t = setup()
    const reasons: MatchmakeFailure[] = []
    matchmake({ onStart: () => {}, onGiveUp: (r) => reasons.push(r) }, { env: t.env })
    t.last().open()
    t.last().receive({ type: 'matched', code: 'K7QM', ticket: TOKEN_B })
    const room = t.last()
    room.open()
    room.receive({ type: 'welcome', slot: 0, token: TOKEN_B, code: 'K7QM', serverNow: 1 })
    t.clock.advance(MATCH_JOIN_TIMEOUT_MS)
    expect(reasons).toEqual(['timeout'])
    // 部屋からも出る
    expect(room.json().at(-1)).toEqual({ type: 'bye' })

    const t2 = setup()
    const reasons2: MatchmakeFailure[] = []
    matchmake({ onStart: () => {}, onGiveUp: (r) => reasons2.push(r) }, { env: t2.env })
    t2.last().open()
    t2.last().receive({ type: 'error', code: 'daily-limit' })
    expect(reasons2).toEqual(['daily-limit'])
  })

  it('やめたら行列を抜け、それ以上は何も知らせない', () => {
    const t = setup()
    const reasons: MatchmakeFailure[] = []
    const h = matchmake({ onStart: () => {}, onGiveUp: (r) => reasons.push(r) }, { env: t.env })
    t.last().open()
    h.cancel()
    expect(t.last().closedBy).not.toBeNull()
    t.clock.advance(MATCH_TIMEOUT_MS * 2)
    expect(reasons).toEqual([])
    expect(h.secondsLeft()).toBe(0)
  })

  it('行列の接続が見つかる前に切れたら error', () => {
    const t = setup()
    const reasons: MatchmakeFailure[] = []
    matchmake({ onStart: () => {}, onGiveUp: (r) => reasons.push(r) }, { env: t.env })
    t.last().open()
    t.last().serverClose(CLOSE_REJECTED)
    expect(reasons).toEqual(['error'])
  })
})
