// ネット対戦の部屋と中継の結合試験（E2E_ONLINE=1）。wrangler dev（--local）を相手に、Node の WebSocket で複数の端末を作る。
// ブラウザを使わないので desktop の設定のときだけ回す。試験ごとに試験用の見出し（localhost のときだけ効く）を付け、
// 流量の上限と1日の上限を本物とは別に数える（試験どうし・手元で遊ぶ分と食い合わないように）。

import { expect, test } from '@playwright/test'
import { createRoom, joinRoom, matchmake, RoomClient, type NetEnv, type SocketLike } from '../../src/client/net'
import { memorySeatStore } from '../../src/client/net/seat-store'
import {
  BIN_EVENTS,
  BIN_INTENT,
  BIN_SELF,
  BIN_STORE,
  CLOSE_LEAVE,
  CLOSE_MATCHED,
  CLOSE_RATE_LIMITED,
  CLOSE_REJECTED,
  COUNTDOWN_MS,
  decodeEvents,
  decodeIntents,
  decodeSelfState,
  decodeStoreFrame,
  encodeEvents,
  encodeIntents,
  encodeSelfState,
  StoreFrameEncoder,
  TEST_USAGE_HEADER,
  type RoomView,
} from '../../src/shared/protocol'
import { allPseudonyms } from '../../src/shared/names'
import { makeView, makeWorld, nudgeProp, sampleResult } from '../unit/net-fixtures'

const PORT = Number(process.env.E2E_PORT || 8798)
const BASE = `http://localhost:${PORT}`
const WS_BASE = `ws://localhost:${PORT}`
const RUN = `e2e${Date.now().toString(36)}`
let testNo = 0

type Msg = Record<string, unknown> & { type?: string }
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Node の WebSocket（ブラウザと同じ形）に Origin と試験用の見出しを付けて開く */
function openSocket(path: string, usage: string | null, origin: string | null = BASE): WebSocket {
  const headers: Record<string, string> = {}
  if (origin !== null) headers.Origin = origin
  if (usage !== null) headers[TEST_USAGE_HEADER] = usage
  const ws = new WebSocket(`${WS_BASE}${path}`, { headers } as unknown as string[])
  ws.binaryType = 'arraybuffer'
  return ws
}

/** 1つの端末。届いた JSON とバイナリを全部覚えておき、条件に合うものを待てる */
class Peer {
  readonly log: Msg[] = []
  readonly bins: Uint8Array[] = []
  closed: { code: number; reason: string } | null = null
  slot = -1
  token = ''

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') this.log.push(JSON.parse(e.data) as Msg)
      else this.bins.push(new Uint8Array(e.data as ArrayBuffer))
    })
    ws.addEventListener('close', (e) => {
      this.closed = { code: e.code, reason: e.reason }
    })
  }

  /** 開けたら Peer、開けなければ null（Origin で断られたときなど） */
  static open(path: string, usage: string | null, origin: string | null = BASE): Promise<Peer | null> {
    const ws = openSocket(path, usage, origin)
    return new Promise((resolve) => {
      ws.addEventListener('open', () => resolve(new Peer(ws)), { once: true })
      ws.addEventListener('error', () => resolve(null), { once: true })
    })
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg))
  }

  sendBin(data: Uint8Array): void {
    this.ws.send(data as Uint8Array<ArrayBuffer>)
  }

  async waitFor(pred: (m: Msg) => boolean, label: string, timeout = 8000): Promise<Msg> {
    const deadline = Date.now() + timeout
    for (;;) {
      const hit = this.log.find(pred)
      if (hit) return hit
      if (Date.now() > deadline) throw new Error(`届かなかった: ${label}\n最後: ${JSON.stringify(this.log.at(-1))?.slice(0, 300)}`)
      await sleep(20)
    }
  }

  room(): RoomView | null {
    for (let i = this.log.length - 1; i >= 0; i--) if (this.log[i]?.type === 'room') return this.log[i]?.room as RoomView
    return null
  }

  async waitRoom(pred: (r: RoomView) => boolean, label: string, timeout = 8000): Promise<RoomView> {
    const deadline = Date.now() + timeout
    for (;;) {
      const r = this.room()
      if (r && pred(r)) return r
      if (Date.now() > deadline) throw new Error(`部屋がそうならなかった: ${label}\n${JSON.stringify(r)?.slice(0, 400)}`)
      await sleep(20)
    }
  }

  async waitBin(pred: (b: Uint8Array) => boolean, label: string, timeout = 8000): Promise<Uint8Array> {
    const deadline = Date.now() + timeout
    for (;;) {
      const hit = this.bins.find(pred)
      if (hit) return hit
      if (Date.now() > deadline) throw new Error(`バイナリが届かなかった: ${label}（届いた数 ${this.bins.length}）`)
      await sleep(20)
    }
  }

  /** ここまでに送った分を部屋が読み終えたことを確かめる（同じ接続の中は順番どおりに処理される） */
  async sync(): Promise<void> {
    const t = Math.floor(Math.random() * 1e9) + 1
    this.send({ type: 'ping', t })
    await this.waitFor((m) => m.type === 'pong' && m.t === t, 'pong')
  }

  async waitClose(timeout = 5000): Promise<{ code: number; reason: string }> {
    const deadline = Date.now() + timeout
    while (!this.closed) {
      if (Date.now() > deadline) throw new Error('閉じられなかった')
      await sleep(20)
    }
    return this.closed
  }

  close(code?: number, reason?: string): void {
    try {
      this.ws.close(code, reason)
    } catch {
      // すでに閉じている
    }
  }
}

const peers: Peer[] = []
const clients: RoomClient[] = []

/** 試験ごとの数え先（流量と1日の上限を本物と分ける） */
function usageId(extra = ''): string {
  testNo++
  return `${RUN}-${testNo}${extra}`
}

async function createRoomRaw(usage: string): Promise<string> {
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: BASE, [TEST_USAGE_HEADER]: usage } })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { code: string }
  expect(body.code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)
  return body.code
}

/** 部屋に入って名乗る。welcome まで待つ */
async function join(code: string, usage: string, hello: Record<string, unknown>): Promise<Peer> {
  const p = await Peer.open(`/api/rooms/${code}/ws`, usage)
  if (!p) throw new Error('開けなかった')
  peers.push(p)
  p.send({ type: 'hello', ...hello })
  const w = await p.waitFor((m) => m.type === 'welcome' || m.type === 'error', `welcome ${code}`)
  if (w.type === 'error') throw new Error(`入れなかった: ${String(w.code)}`)
  p.slot = Number(w.slot)
  p.token = String(w.token)
  return p
}

async function expectRejected(code: string, usage: string, hello: Record<string, unknown>, reason: string): Promise<void> {
  const p = await Peer.open(`/api/rooms/${code}/ws`, usage)
  if (!p) throw new Error('開けなかった')
  peers.push(p)
  p.send({ type: 'hello', ...hello })
  const err = await p.waitFor((m) => m.type === 'error', `error ${reason}`)
  expect(err.code).toBe(reason)
  expect((await p.waitClose()).code).toBe(CLOSE_REJECTED)
  expect(p.log.some((m) => m.type === 'welcome')).toBe(false)
}

/** Node で RoomClient を動かす道具（ブラウザの代わり）。Origin と試験用の見出しを付ける */
function nodeEnv(usage: string): Partial<NetEnv> {
  return {
    openSocket: (url) => openSocket(url.replace(WS_BASE, ''), usage) as unknown as SocketLike,
    now: () => performance.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    wsBase: WS_BASE,
    httpBase: BASE,
    fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: BASE, [TEST_USAGE_HEADER]: usage } }),
    onVisible: () => () => {},
    onOnline: () => () => {},
  }
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'ブラウザを使わないので desktop の1回だけ回す')
})

test.afterEach(() => {
  for (const p of peers.splice(0)) p.close(CLOSE_LEAVE, 'test-end')
  for (const c of clients.splice(0)) c.leave()
})

test.describe('部屋と中継（RoomDO）', () => {
  test('部屋を作る→あいことばで入る→start→主の店の様子が参加者に、参加者の様子が slot つきで主に届く→なりすましは捨てる→final で両方に結果', async () => {
    const usage = usageId()
    const code = await createRoomRaw(usage)
    const host = await join(code, usage, { name: 'あるじ', character: 'ch/character-male-e' })
    const guest = await join(code, usage, { name: 'さんか', character: 'ch/character-female-f' })
    expect([host.slot, guest.slot]).toEqual([0, 1])
    const lobby = await guest.waitRoom((r) => r.members.length === 2, '2人が並ぶ')
    expect(lobby).toMatchObject({ code, kind: 'friends', phase: 'lobby', hostSlot: 0, round: 0, startAt: null, seed: null })
    expect(lobby.members.map((m) => [m.name, m.character])).toEqual([
      ['あるじ', 'ch/character-male-e'],
      ['さんか', 'ch/character-female-f'],
    ])

    // 主以外は始められない。主は試合の長さを選べる
    guest.send({ type: 'start' })
    await guest.waitFor((m) => m.type === 'error' && m.code === 'not-host', 'not-host')
    host.send({ type: 'config', duration: 90 })
    await guest.waitRoom((r) => r.duration === 90, '90秒になる')

    // 試合の前のバイナリは捨てる
    host.sendBin(new StoreFrameEncoder(makeWorld(40)).encode(makeView(makeWorld(40)), 0))
    await host.sync()

    const before = Date.now()
    host.send({ type: 'start' })
    const cd = await guest.waitRoom((r) => r.phase === 'countdown', 'カウントダウン')
    expect(cd.round).toBe(1)
    expect(typeof cd.seed).toBe('number')
    expect(cd.startAt).toBeGreaterThanOrEqual(before + COUNTDOWN_MS - 50)
    expect(cd.startAt).toBeLessThanOrEqual(Date.now() + COUNTDOWN_MS + 50)
    expect(guest.bins).toHaveLength(0)

    // カウントダウン中に結果は送れない
    host.send({ type: 'final', round: 1, result: sampleResult() })
    await host.waitFor((m) => m.type === 'error' && m.code === 'not-playing', 'not-playing')

    // ── 中継 ──
    const world = makeWorld(350, cd.seed ?? 1)
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    const key = enc.encode(view, -2000)
    host.sendBin(key)
    const got = await guest.waitBin((b) => b[0] === BIN_STORE, '店の様子（鍵）')
    expect([...got]).toEqual([...key])
    nudgeProp(view, 7, 0.5, -0.2, 0.9)
    const delta = enc.encode(view, -1933)
    host.sendBin(delta)
    const got2 = await guest.waitBin((b) => b[0] === BIN_STORE && b !== got, '店の様子（差分）')
    expect(decodeStoreFrame(got2)?.props.ids).toEqual([7])
    host.sendBin(encodeEvents(0, -1900, [{ t: 'sfx', name: 'countdown' }])[0] as Uint8Array)
    expect(decodeEvents(await guest.waitBin((b) => b[0] === BIN_EVENTS, '出来事'))?.events).toEqual([{ t: 'sfx', name: 'countdown' }])

    const self = encodeSelfState({ seq: 1, t: -1800, pos: { x: 3, y: 0, z: 11.5 }, vel: { x: 0, y: 0, z: -4 }, yaw: 0, anim: 'run', ridingCart: null, holding: null, actionHeld: false })
    self[1] = 0 // 主になりすまそうとしても
    guest.sendBin(self)
    const atHost = await host.waitBin((b) => b[0] === BIN_SELF, '自分の様子')
    expect(atHost[1]).toBe(1) // 部屋が本当の送り主に書き換える
    expect(decodeSelfState(atHost)?.anim).toBe('run')
    guest.sendBin(encodeIntents(1, [{ kind: 'press', target: 12, t: -1700 }]))
    expect(decodeIntents(await host.waitBin((b) => b[0] === BIN_INTENT, '意図'))).toEqual({ slot: 1, seq: 1, intents: [{ kind: 'press', target: 12, t: -1700 }] })

    // なりすまし・知らない種類・大きすぎるものは、どこにも届かない
    const hostBins = host.bins.length
    const guestBins = guest.bins.length
    guest.sendBin(enc.encode(view, -1600)) // 主でない人の店の様子
    guest.sendBin(encodeEvents(0, 0, [{ t: 'manager' }])[0] as Uint8Array)
    host.sendBin(encodeSelfState({ seq: 2, t: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, anim: 'idle', ridingCart: null, holding: null, actionHeld: false }))
    host.sendBin(new Uint8Array([9, 0, 0, 0]))
    guest.sendBin(new Uint8Array([0, 0]))
    const huge = new Uint8Array(16 * 1024 + 1)
    huge[0] = BIN_STORE
    host.sendBin(huge)
    await Promise.all([host.sync(), guest.sync()])
    await sleep(150)
    expect(host.bins.length).toBe(hostBins)
    expect(guest.bins.length).toBe(guestBins)
    expect(host.closed).toBeNull()
    expect(guest.closed).toBeNull()

    // 試合が始まってから final：両方に結果。名前は部屋の知っている値に置き換わる
    await guest.waitRoom(() => Date.now() >= (cd.startAt ?? 0) + 50, '開始時刻を過ぎる', 6000)
    host.send({ type: 'final', round: 1, result: sampleResult({ players: sampleResult().players.map((p) => ({ ...p, name: 'にせもの' })) }) })
    for (const p of [host, guest]) {
      const r = await p.waitFor((m) => m.type === 'result', '結果')
      expect(r.round).toBe(1)
      const names = (r.result as { players: { name: string }[] }).players.map((x) => x.name)
      expect(names).toEqual(['あるじ', 'さんか'])
    }
    await guest.waitRoom((r) => r.phase === 'result', '結果の段階')
    // 結果のあとのバイナリは捨てる
    const n = guest.bins.length
    host.sendBin(delta)
    await host.sync()
    await sleep(100)
    expect(guest.bins.length).toBe(n)

    // もう一回：試合の番号が増え、新しい開始時刻と種
    host.send({ type: 'rematch' })
    const again = await guest.waitRoom((r) => r.round === 2, 'もう一回')
    expect(again.phase).toBe('countdown')
    expect(again.startAt).toBeGreaterThan(cd.startAt ?? 0)
  })

  test('満員・途中参加・名前なし・存在しない部屋を断る', async () => {
    const usage = usageId()
    const code = await createRoomRaw(usage)
    const four: Peer[] = []
    for (const name of ['いち', 'に', 'さん', 'よん']) four.push(await join(code, usage, { name }))
    expect(four.map((p) => p.slot)).toEqual([0, 1, 2, 3])
    await expectRejected(code, usage, { name: 'ごにんめ' }, 'room-full')
    four[3]?.close(CLOSE_LEAVE, 'leave')
    await four[0]?.waitRoom((r) => r.members.length === 3, '3人になる')
    await expectRejected(code, usage, {}, 'name-required')
    four[0]?.send({ type: 'start' })
    await four[1]?.waitRoom((r) => r.phase === 'countdown', '始まる')
    await expectRejected(code, usage, { name: 'とちゅう' }, 'already-started')
    await expectRejected('ZZZZ', usage, { name: 'まいご' }, 'room-not-found')
    await expectRejected('0000', usage, { name: 'まいご' }, 'room-not-found')
  })

  test('試合中に切れても札で同じ席に戻れる。主が抜けたら参加者に host-left が届き、次の人が主になる', async () => {
    const usage = usageId()
    const code = await createRoomRaw(usage)
    const host = await join(code, usage, { name: 'あるじ' })
    const guest = await join(code, usage, { name: 'さんか' })
    host.send({ type: 'start' })
    await guest.waitRoom((r) => r.phase === 'countdown', '始まる')

    guest.close(1000, 'network')
    const off = await host.waitRoom((r) => r.members.find((m) => m.slot === 1)?.connected === false, '参加者が切れる')
    expect(off.members).toHaveLength(2) // 席は残る
    const back = await join(code, usage, { token: guest.token })
    expect(back.slot).toBe(1)
    await host.waitRoom((r) => r.members.every((m) => m.connected), '戻る')
    back.sendBin(encodeSelfState({ seq: 9, t: 0, pos: { x: 1, y: 0, z: 1 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, anim: 'walk', ridingCart: null, holding: null, actionHeld: true }))
    const s = await host.waitBin((b) => b[0] === BIN_SELF, '戻った人の様子')
    expect(decodeSelfState(s)?.slot).toBe(1)
    expect(decodeSelfState(s)?.actionHeld).toBe(true)

    // 札ちがいは名前が無ければ断る
    const wrongCredential = 'wrong-token-0123456789'
    await expectRejected(code, usage, { token: wrongCredential }, 'already-started')

    host.send({ type: 'bye' })
    const left = await back.waitFor((m) => m.type === 'host-left', 'host-left')
    expect(left.round).toBe(1)
    const r = await back.waitRoom((x) => x.phase === 'result', '結果の段階')
    expect(r.hostSlot).toBe(1)
    expect(r.members.map((m) => m.slot)).toEqual([1])
  })

  test('試合中に主が切れて20秒戻らなければ、部屋のアラームで host-left になり、残った人が主になる', async () => {
    test.setTimeout(60_000)
    const usage = usageId()
    const code = await createRoomRaw(usage)
    const host = await join(code, usage, { name: 'あるじ' })
    const guest = await join(code, usage, { name: 'さんか' })
    host.send({ type: 'start' })
    await guest.waitRoom((r) => r.phase === 'countdown', '始まる')
    const cutAt = Date.now()
    host.close(1000, 'network') // bye を送らずに切れる（電波が途切れた）
    const off = await guest.waitRoom((r) => r.members.find((m) => m.slot === 0)?.connected === false, '主が切れる')
    expect(off.hostSlot).toBe(0) // 20秒は主のまま戻るのを待つ
    expect(guest.log.some((m) => m.type === 'host-left')).toBe(false)
    const left = await guest.waitFor((m) => m.type === 'host-left', 'host-left', 30_000)
    expect(Date.now() - cutAt).toBeGreaterThanOrEqual(19_000)
    expect(left.round).toBe(1)
    const r = await guest.waitRoom((x) => x.phase === 'result', '結果の段階')
    expect(r.hostSlot).toBe(1)
    // 主の札ではもう戻れない（席が無い・試合は始まっている）
    await expectRejected(code, usage, { token: host.token }, 'already-started')
  })

  test('1つの接続から通数の上限（毎秒40通・溜め80通）を超えたら切り、同じ札はしばらく戻れない', async () => {
    const usage = usageId()
    const code = await createRoomRaw(usage)
    const a = await join(code, usage, { name: 'れんだ' })
    for (let i = 0; i < 150; i++) a.send({ type: 'ping', t: i + 1 })
    await a.waitFor((m) => m.type === 'error' && m.code === 'rate-limited', 'rate-limited')
    expect((await a.waitClose()).code).toBe(CLOSE_RATE_LIMITED)
    await expectRejected(code, usage, { token: a.token }, 'rate-limited')
  })

  test('部屋づくりは1分に5回まで（6回目は429）。1日の上限なら daily-limit', async () => {
    const usage = usageId()
    for (let i = 0; i < 5; i++) await createRoomRaw(usage)
    const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: BASE, [TEST_USAGE_HEADER]: usage } })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate-limited' })

    const none = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: BASE, [TEST_USAGE_HEADER]: `${usageId()};room=0` } })
    expect(none.status).toBe(503)
    expect(await none.json()).toEqual({ error: 'daily-limit' })

    // 試合の上限が0なら、はじめるで全員に daily-limit を知らせて閉じる
    const noGame = `${usageId()};game=0`
    const code = await createRoomRaw(noGame)
    const a = await join(code, noGame, { name: 'あ' })
    const b = await join(code, noGame, { name: 'い' })
    a.send({ type: 'start' })
    for (const p of [a, b]) {
      await p.waitFor((m) => m.type === 'error' && m.code === 'daily-limit', 'daily-limit')
      expect((await p.waitClose()).code).toBe(CLOSE_REJECTED)
    }
  })

  test('Origin が同じホスト・許可リスト・localhost の例外に当たらなければ、部屋づくりも WebSocket も断る', async () => {
    // localhost の別ポートは分割構成の試験で許可するため、偽装したホストを拒否対象にする。
    for (const headers of [{}, { Origin: 'https://evil.example' }, { Origin: 'http://localhost.evil.example:5341' }] as Record<string, string>[]) {
      const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers })
      expect(res.status).toBe(403)
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    }
    const usage = usageId()
    const code = await createRoomRaw(usage)
    for (const origin of [null, 'https://evil.example']) {
      expect(await Peer.open(`/api/rooms/${code}/ws`, usage, origin)).toBeNull()
      expect(await Peer.open('/api/match/ws', usage, origin)).toBeNull()
    }
    const res = await fetch(`${BASE}/api/nothing`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-security-policy')).toContain("'wasm-unsafe-eval'")
  })
})

test.describe('相手探し（LobbyDO）', () => {
  test('2人がつながると同じ部屋の札が配られ、仮名で入って自動で始まり、中継が動く', async () => {
    const usage = usageId()
    const l1 = await Peer.open('/api/match/ws', usage)
    const l2 = await Peer.open('/api/match/ws', usage)
    if (!l1 || !l2) throw new Error('行列に入れなかった')
    peers.push(l1, l2)
    const m1 = await l1.waitFor((m) => m.type === 'matched', 'matched 1')
    const m2 = await l2.waitFor((m) => m.type === 'matched', 'matched 2')
    expect(m1.code).toBe(m2.code)
    expect(m1.ticket).not.toBe(m2.ticket)
    // 部屋は matched のあと 4003 で閉じる。手元の wrangler dev は、端末から1通も送っていない接続の閉じる合図を
    // 最後まで届けないことがあるので、閉じ始め（readyState 2 以上）まで待てばよしとする
    for (const l of [l1, l2]) {
      await expect.poll(() => l.closed !== null || l.ws.readyState >= 2, { timeout: 5000 }).toBe(true)
      if (l.closed) expect(l.closed.code).toBe(CLOSE_MATCHED)
    }
    const code = String(m1.code)
    // 札が無い人は入れない
    await expectRejected(code, usage, { name: 'よそもの' }, 'room-full')
    const a = await join(code, usage, { token: String(m1.ticket), name: 'ほんみょう', character: 'ch/character-male-a' })
    const b = await join(code, usage, { token: String(m2.ticket) })
    const room = await a.waitRoom((r) => r.phase === 'countdown', '自動で始まる')
    expect(room.kind).toBe('match')
    expect(room.hostSlot).toBe(a.slot) // 先に来た人が主
    for (const m of room.members) expect(allPseudonyms()).toContain(m.name)
    expect(JSON.stringify(a.log)).not.toContain('ほんみょう')
    expect(room.members.find((m) => m.slot === a.slot)?.character).toBe('ch/character-male-a')
    // 中継
    a.sendBin(encodeEvents(0, 0, [{ t: 'manager' }])[0] as Uint8Array)
    await b.waitBin((x) => x[0] === BIN_EVENTS, '主の出来事')
  })

  test('待っている人が抜けたら行列から外れる', async () => {
    const usage = usageId()
    const gone = await Peer.open('/api/match/ws', usage)
    if (!gone) throw new Error('行列に入れなかった')
    await gone.waitFor((m) => m.type === 'waiting', 'waiting')
    gone.close(1000, 'cancel')
    await gone.waitClose()
    await sleep(100)
    const l1 = await Peer.open('/api/match/ws', usage)
    const l2 = await Peer.open('/api/match/ws', usage)
    if (!l1 || !l2) throw new Error('行列に入れなかった')
    peers.push(l1, l2)
    const m1 = await l1.waitFor((m) => m.type === 'matched', 'matched 1')
    const m2 = await l2.waitFor((m) => m.type === 'matched', 'matched 2')
    expect(m1.code).toBe(m2.code)
  })
})

test.describe('端末の部品（src/client/net）を Node で動かす', () => {
  test('createRoom・joinRoom・RoomClient：時計合わせ・始める・バイナリの送受信・結果の知らせ', async () => {
    const usage = usageId()
    const env = nodeEnv(usage)
    const code = await createRoom({ env })
    const host = await joinRoom(code, 'あるじ', { env, character: 'ch/character-male-e', store: memorySeatStore() })
    const guest = await joinRoom(code.toLowerCase(), 'さんか', { env, store: memorySeatStore() })
    clients.push(host, guest)
    expect([host.slot, guest.slot]).toEqual([0, 1])
    // 時計合わせ：同じマシンなので、サーバー時刻とのずれは小さい
    await expect.poll(() => host.clock.sampleCount, { timeout: 5000 }).toBeGreaterThanOrEqual(3)
    expect(Math.abs(host.serverNow() - Date.now())).toBeLessThan(80)
    expect(host.isHost()).toBe(true)
    expect(guest.isHost()).toBe(false)

    const guestBins: Uint8Array[] = []
    guest.onBinary((d) => guestBins.push(d.slice()))
    const hostBins: Uint8Array[] = []
    host.onBinary((d) => hostBins.push(d.slice()))
    const results: unknown[] = []
    guest.on((e) => {
      if (e.type === 'result') results.push(e.result)
    })

    host.start()
    await expect.poll(() => guest.currentPhase(), { timeout: 5000 }).toBe('countdown')
    expect(guest.matchTime()).toBeLessThan(0)
    host.sendBinary(encodeEvents(1, -100, [{ t: 'sfx', name: 'go' }])[0] as Uint8Array)
    guest.sendBinary(encodeIntents(1, [{ kind: 'press', target: null, t: -90 }]))
    await expect.poll(() => guestBins.length).toBe(1)
    await expect.poll(() => hostBins.length).toBe(1)
    expect(hostBins[0]?.[1]).toBe(1)
    await expect.poll(() => guest.currentPhase(), { timeout: 6000 }).toBe('playing')
    host.final(1, sampleResult())
    await expect.poll(() => results.length).toBe(1)
    expect(guest.ending?.round).toBe(1)
  })

  test('matchmake：2人がそろうと、両方の onStart に始まった RoomClient が届く', async () => {
    const usage = usageId()
    const env = nodeEnv(usage)
    const started: RoomClient[] = []
    const giveUps: string[] = []
    const h1 = matchmake({ character: 'ch/character-female-e', onStart: (c) => started.push(c), onGiveUp: (r) => giveUps.push(r) }, { env })
    const h2 = matchmake({ onStart: (c) => started.push(c), onGiveUp: (r) => giveUps.push(r) }, { env })
    await expect.poll(() => started.length, { timeout: 10_000 }).toBe(2)
    clients.push(...started)
    expect(giveUps).toEqual([])
    expect(started[0]?.code).toBe(started[1]?.code)
    expect(new Set(started.map((c) => c.slot))).toEqual(new Set([0, 1]))
    expect(started.filter((c) => c.isHost())).toHaveLength(1)
    h1.cancel()
    h2.cancel()
  })
})
