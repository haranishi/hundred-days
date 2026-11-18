// HostSession と GuestSession を Node で動かす。部屋はメモリの中の偽物で、振り分けと final は部屋の本物の決まり（room-core）を使う。
// 届くまでの遅れ（片道40ms）も入れる。描画は無く、GameSession.update() が返す WorldView だけを見る。

import { describe, expect, it } from 'vitest'
import type { NetLink } from '../../src/client/net/link'
import type { RoomClientEvent } from '../../src/client/net/room-client'
import { GuestSession } from '../../src/game/session/GuestSession'
import { HostSession } from '../../src/game/session/HostSession'
import { standPoint } from '../../src/game/sim/ai/cpu'
import { EMPTY_INPUT, type InputState } from '../../src/shared/input'
import { homeTransforms, parseMatchResult, StoreFrameEncoder, type RoomView } from '../../src/shared/protocol'
import type { MatchResult, WorldView } from '../../src/shared/view'
import { createRoomRecord, finishGame, joinRoom, roomView, routeBinary, startGame, type RoomRecord } from '../../src/worker/room-core'

const FRAME_MS = 1000 / 60

/** メモリの中の部屋：本物の決まり（room-core）で振り分け、片道 latency ミリ秒あとに届ける */
class MemoryRoom {
  now = 1_000_000
  latency = 40
  room: RoomRecord
  readonly links = new Map<number, MemoryLink>()
  private queue: { at: number; seq: number; fn: () => void }[] = []
  private seq = 0

  constructor(names: string[]) {
    let room = createRoomRecord({ code: 'K7QM', kind: 'friends', now: this.now })
    names.forEach((name, i) => {
      const r = joinRoom(room, { name, character: i === 0 ? 'ch/character-male-e' : 'ch/character-female-f' }, this.now, `token-${String(i).padStart(20, '0')}`)
      if (!r.ok) throw new Error(r.code)
      room = r.room
    })
    this.room = room
    for (const s of room.seats) this.links.set(s.slot, new MemoryLink(this, s.slot))
  }

  start(): RoomView {
    const r = startGame(this.room, 0, false, this.now, 4242)
    if (!r.ok) throw new Error(r.code)
    this.room = r.room
    this.broadcastRoom()
    return roomView(this.room, this.now)
  }

  link(slot: number): MemoryLink {
    return this.links.get(slot) as MemoryLink
  }

  later(fn: () => void): void {
    this.queue.push({ at: this.now + this.latency, seq: this.seq++, fn })
  }

  /** 時計を進め、届く時刻になったものを届ける */
  advance(ms: number): void {
    this.now += ms
    for (;;) {
      const due = this.queue.filter((q) => q.at <= this.now).sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!due) return
      this.queue = this.queue.filter((q) => q !== due)
      due.fn()
    }
  }

  relay(sender: number, data: Uint8Array): void {
    const copy = data.slice()
    this.later(() => {
      const route = routeBinary(this.room, sender, copy, this.now)
      if ('drop' in route) return
      const targets = route.to === 'host' ? [route.slot] : route.slots
      for (const slot of targets) this.later(() => this.link(slot).emitBinary(copy))
    })
  }

  final(sender: number, round: number, result: MatchResult): void {
    // 部屋と同じく、JSON で届いたものを確かめてから受け付ける
    const checked = parseMatchResult(JSON.parse(JSON.stringify(result)))
    this.later(() => {
      if (!checked) return
      const r = finishGame(this.room, sender, round, checked, this.now)
      if (!r.ok) return
      this.room = r.room
      const g = r.room.game
      for (const l of this.links.values()) this.later(() => l.emit({ type: 'result', round, result: g?.result as MatchResult }))
      this.broadcastRoom()
    })
  }

  hostLeft(round: number): void {
    for (const l of this.links.values()) l.emit({ type: 'host-left', round })
  }

  broadcastRoom(): void {
    const view = roomView(this.room, this.now)
    for (const l of this.links.values()) {
      l.room = view
      l.emit({ type: 'room', room: view })
    }
  }
}

class MemoryLink implements NetLink {
  room: RoomView | null = null
  private readonly listeners = new Set<(e: RoomClientEvent) => void>()
  private readonly binListeners = new Set<(d: Uint8Array) => void>()
  constructor(
    private readonly hub: MemoryRoom,
    readonly slot: number,
  ) {}
  matchTime(): number | null {
    const s = this.room?.startAt
    return s === null || s === undefined ? null : this.hub.now - s
  }
  localNow(): number {
    return this.hub.now
  }
  status(): 'ok' {
    return 'ok'
  }
  sendBinary(data: Uint8Array): boolean {
    this.hub.relay(this.slot, data)
    return true
  }
  final(round: number, result: MatchResult): boolean {
    this.hub.final(this.slot, round, result)
    return true
  }
  on(l: (e: RoomClientEvent) => void): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  onBinary(l: (d: Uint8Array) => void): () => void {
    this.binListeners.add(l)
    return () => this.binListeners.delete(l)
  }
  emit(e: RoomClientEvent): void {
    for (const l of [...this.listeners]) l(e)
  }
  emitBinary(d: Uint8Array): void {
    for (const l of [...this.binListeners]) l(d)
  }
}

interface Match {
  hub: MemoryRoom
  host: HostSession
  guest: GuestSession
  hostView: () => WorldView
  guestView: () => WorldView
  /** 1/60秒ずつ進める。guestInput は毎フレームの参加者の入力 */
  run(seconds: number, guestInput?: (frame: number) => Partial<InputState>): void
}

async function match(): Promise<Match> {
  const hub = new MemoryRoom(['あるじ', 'さんか'])
  const view = hub.start()
  const host = await HostSession.create({ link: hub.link(0), room: view })
  const guest = await GuestSession.create({ link: hub.link(1), room: view })
  let hv = host.update(0, EMPTY_INPUT)
  let gv = guest.update(0, EMPTY_INPUT)
  return {
    hub,
    host,
    guest,
    hostView: () => hv,
    guestView: () => gv,
    run(seconds, guestInput) {
      const frames = Math.round(seconds * 60)
      for (let f = 0; f < frames; f++) {
        hub.advance(FRAME_MS)
        hv = host.update(1 / 60, EMPTY_INPUT)
        gv = guest.update(1 / 60, { ...EMPTY_INPUT, ...(guestInput?.(f) ?? {}) })
      }
    },
  }
}

/** 連打：period 秒ごとに押して、次のフレームで離す */
function mash(period: number): (frame: number) => Partial<InputState> {
  const every = Math.round(period * 60)
  return (f) => (f % every === 0 ? { action: true, actionPressed: true } : f % every === 1 ? { actionReleased: true } : {})
}

describe('HostSession と GuestSession（メモリの中の中継）', () => {
  it('カウントダウンのあと、主の店の様子が参加者に届き、参加者の動きが主の店に映る', async () => {
    const m = await match()
    expect(m.hostView().phase).toBe('countdown')
    expect(m.guestView().phase).toBe('countdown')
    m.run(4)
    expect(m.hostView().phase).toBe('playing')
    expect(m.guestView().phase).toBe('playing')
    // 残り時間は、主と参加者で（遅れの分を除いて）そろう
    expect(Math.abs(m.hostView().timeLeft - m.guestView().timeLeft)).toBeLessThan(0.2)
    // 参加者が東へ走る → 主の店でも参加者のキャラが東へ動く
    const before = m.hostView().avatars.find((a) => a.slot === 1)!.pos.x
    m.run(1, () => ({ moveX: 1 }))
    const after = m.hostView().avatars.find((a) => a.slot === 1)!.pos.x
    expect(after - before).toBeGreaterThan(2)
    // 参加者の画面の自分は手元の位置、主のキャラは届いた位置（名前は部屋の顔ぶれ）
    const g = m.guestView()
    expect(g.avatars.find((a) => a.slot === 1)?.isLocal).toBe(true)
    expect(g.avatars.find((a) => a.slot === 0)?.name).toBe('あるじ')
    m.host.dispose()
    m.guest.dispose()
  })

  it('参加者がベルを連打すると、主の店で参加者の slot に点が入り、参加者の画面にもその点が出る', async () => {
    const m = await match()
    m.run(4)
    const bell = m.host.sim.layout.places.bell
    m.guest.sim.teleport(1, bell.x, bell.z)
    m.run(1)
    // 主の店で、参加者のキャラがベルの前に来て、ベルの案内が出ている（参加者の画面に届く案内も主が作る）
    expect(m.host.sim.avatarBySlot(1)?.offer?.system.id).toBe('bell')
    expect(m.guestView().avatars.find((a) => a.slot === 1)?.prompt?.press).toBe('mash')
    m.run(3, mash(0.15))
    const hostScore = m.hostView().avatars.find((a) => a.slot === 1)!.score
    expect(hostScore).toBeGreaterThanOrEqual(15 * 20)
    expect(m.host.sim.avatarBySlot(1)?.book.breakdown.bell?.count).toBeGreaterThanOrEqual(15)
    expect(m.hostView().avatars.find((a) => a.slot === 0)!.score).toBe(0)
    m.run(0.5)
    expect(m.guestView().avatars.find((a) => a.slot === 1)!.score).toBe(m.hostView().avatars.find((a) => a.slot === 1)!.score)
    // 進み具合（HUD の「ベル 18/20」）も参加者に届く
    expect(m.guestView().avatars.find((a) => a.slot === 1)?.progress?.bell ?? 0).toBeGreaterThanOrEqual(15)
    m.host.dispose()
    m.guest.dispose()
  })

  it('参加者が棚の前でアクションすると、主の店の商品が落ち、参加者の画面でも商品が動く', async () => {
    const m = await match()
    m.run(4)
    const face = m.host.sim.layout.faces.find((f) => f.aisle === 'drink' && f.nx === 1)!
    const p = standPoint(face)
    // 主の店のキャラは届いた位置へ歩いて追いつく（棚は抜けない）。人が歩くように、通路の入口まで出てから通路を北へ進む
    m.guest.sim.teleport(1, p.x, 4)
    m.run(1.5)
    m.guest.sim.teleport(1, p.x, p.z)
    m.guest.sim.face(1, Math.atan2(-face.nx, -face.nz))
    m.run(1.5)
    expect(m.host.sim.avatarBySlot(1)?.offer?.system.id).toBe('sweep')
    m.run(3, (f) => (f === 0 ? { action: true, actionPressed: true } : f === 1 ? { actionReleased: true } : {}))
    const swept = m.host.sim.avatarBySlot(1)?.book.breakdown.sweep?.count ?? 0
    expect(swept).toBeGreaterThanOrEqual(3)
    expect(m.hostView().damage).toBeGreaterThan(0)
    m.run(0.5)
    // 参加者の画面の商品も、定位置から動いている
    const home = homeTransforms(m.guest.world)
    const tr = m.guestView().propTransforms
    let moved = 0
    for (let id = 0; id < m.guest.world.props.length; id++) {
      const o = id * 7
      if (Math.hypot((tr[o] as number) - (home[o] as number), (tr[o + 1] as number) - (home[o + 1] as number), (tr[o + 2] as number) - (home[o + 2] as number)) > 0.3) moved++
    }
    expect(moved).toBeGreaterThanOrEqual(3)
    expect(m.guestView().damage).toBeCloseTo(m.hostView().damage, 2)
    m.host.dispose()
    m.guest.dispose()
  })

  it('主が試合を終えると final が部屋を通って両方に結果が出る（名前は部屋の値）', async () => {
    const m = await match()
    m.run(4)
    const bell = m.host.sim.layout.places.bell
    m.guest.sim.teleport(1, bell.x, bell.z)
    m.run(1)
    m.run(1.5, mash(0.15))
    m.host.sim.end()
    m.run(0.5)
    const hr = m.host.result()
    const gr = m.guest.result()
    expect(hr).not.toBeNull()
    expect(gr).not.toBeNull()
    expect(gr?.aborted).toBe(false)
    expect(gr?.players.map((p) => p.name).sort()).toEqual(['あるじ', 'さんか'])
    expect(gr?.winnerSlots).toEqual([1])
    expect(m.guestView().phase).toBe('ended')
    m.host.dispose()
    m.guest.dispose()
  })

  it('host-left が届いたら、参加者は最後に届いた点数で aborted の結果を出す', async () => {
    const m = await match()
    m.run(4)
    const bell = m.host.sim.layout.places.bell
    m.guest.sim.teleport(1, bell.x, bell.z)
    m.run(1)
    m.run(1.5, mash(0.15))
    m.run(0.3)
    const lastScore = m.guestView().avatars.find((a) => a.slot === 1)!.score
    expect(lastScore).toBeGreaterThan(0)
    m.hub.hostLeft(1)
    m.run(0.1)
    const r = m.guest.result()
    expect(r?.aborted).toBe(true)
    expect(r?.players.find((p) => p.slot === 1)?.score).toBe(lastScore)
    expect(r?.players.find((p) => p.slot === 1)?.rank).toBe(1)
    expect(m.guestView().phase).toBe('ended')
    m.host.dispose()
    m.guest.dispose()
  })

  it('いまの試合の時計から大きくずれた1通（もう一回の直後に届いた前の試合の終わり）は捨てる', async () => {
    const m = await match()
    m.run(4.5)
    const mt = m.hub.link(1).matchTime() ?? 0
    // 前の試合の終わり（phase=ended・t は1分後）の1通が遅れて届いた
    const stale = new StoreFrameEncoder(m.guest.world).encode({ ...m.hostView(), phase: 'ended' }, mt + 60_000)
    m.hub.link(1).emitBinary(stale)
    m.run(0.2)
    expect(m.guestView().phase).toBe('playing')
    expect(m.guest.result()).toBeNull()
    m.host.dispose()
    m.guest.dispose()
  })

  it('主の店の様子が22秒届かなければ、参加者は自分で結果を出す（部屋の判定が届かないときの備え）', async () => {
    const m = await match()
    m.run(4.5)
    m.host.dispose() // 主の端末が止まった（何も送らない）
    m.hub.advance(0)
    for (let i = 0; i < 23 * 4; i++) {
      m.hub.advance(250)
      m.guest.update(0.25, EMPTY_INPUT)
    }
    expect(m.guest.result()?.aborted).toBe(true)
    m.guest.dispose()
  })
})
