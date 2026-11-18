import { describe, expect, it } from 'vitest'
import type { WorldStatic, WorldView } from '../../src/shared/view'
import {
  decodeStoreFrame,
  KEYFRAME_INTERVAL_MS,
  MAX_BINARY_BYTES,
  PROP_ENTRY_BYTES,
  StoreFrameEncoder,
  WorldMirror,
  type StoreFrame,
} from '../../src/shared/protocol'
import { POS_MAX_ERROR, QUAT_MAX_ERROR_RAD, quatAngle, YAW_MAX_ERROR } from '../../src/shared/protocol/quant'
import { avatar, lcg, makeView, makeWorld, npc, nudgeProp } from './net-fixtures'

function decode(bytes: Uint8Array): StoreFrame {
  const f = decodeStoreFrame(bytes)
  if (!f) throw new Error('読めなかった')
  return f
}

/** 主の view と、参加者が組み立て直した view の商品が、量子化の誤差の中で一致するか */
function expectPropsMatch(host: WorldView, guest: WorldView, n: number): void {
  for (let id = 0; id < n; id++) {
    const o = id * 7
    expect(guest.propHidden[id], `hidden ${id}`).toBe(host.propHidden[id])
    for (let j = 0; j < 3; j++) {
      expect(Math.abs((guest.propTransforms[o + j] as number) - (host.propTransforms[o + j] as number)), `pos ${id}`).toBeLessThanOrEqual(POS_MAX_ERROR + 1e-6)
    }
    const angle = quatAngle(host.propTransforms.subarray(o + 3, o + 7), guest.propTransforms.subarray(o + 3, o + 7))
    expect(angle, `rot ${id}`).toBeLessThanOrEqual(QUAT_MAX_ERROR_RAD)
  }
}

/** 主の試合を1刻み（1/15秒）進めたことにする：いくつかの商品を動かす */
function step(view: WorldView, rnd: () => number, count: number, n: number): number[] {
  const moved: number[] = []
  for (let k = 0; k < count; k++) {
    const id = Math.floor(rnd() * n)
    nudgeProp(view, id, (rnd() - 0.5) * 0.4, -0.05, (rnd() - 0.5) * 0.6)
    moved.push(id)
  }
  return moved
}

describe('店の様子：前回から動いた物だけを送る', () => {
  const world: WorldStatic = makeWorld(350)
  const n = world.props.length

  it('最初の1通は鍵。商品がすべて定位置なら商品は0個（入っていない物は定位置）', () => {
    const enc = new StoreFrameEncoder(world)
    const f = decode(enc.encode(makeView(world), 0))
    expect(f.keyframe).toBe(true)
    expect(f.full).toBe(true)
    expect(f.props.ids).toHaveLength(0)
    expect(f.roster).not.toBeNull()
  })

  it('動かした商品だけが入り、動いていない回は0個になる', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    enc.encode(view, 0)
    nudgeProp(view, 5, 0.5, 0, 0.3)
    nudgeProp(view, 77, -0.2, -0.3, 1.1)
    const f1 = decode(enc.encode(view, 66))
    expect(f1.keyframe).toBe(false)
    expect(f1.props.ids.sort((a, b) => a - b)).toEqual([5, 77])
    const f2 = decode(enc.encode(view, 133))
    expect(f2.props.ids).toEqual([])
    // 名簿は変わらなければ送らない
    expect(f1.roster).toBeNull()
    expect(f2.roster).toBeNull()
  })

  it('2秒に1回の鍵には、定位置から外れている物（見えなくした物も）を全部入れる', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    enc.encode(view, 0)
    nudgeProp(view, 10, 1, 0, 0)
    nudgeProp(view, 20, 0, 0, 0.8)
    view.propHidden[30] = 1
    enc.encode(view, 66)
    let t = 133
    while (t < KEYFRAME_INTERVAL_MS) {
      expect(decode(enc.encode(view, t)).keyframe).toBe(false)
      t += 66
    }
    const key = decode(enc.encode(view, KEYFRAME_INTERVAL_MS + 10))
    expect(key.keyframe).toBe(true)
    expect(key.full).toBe(true)
    expect(key.props.ids.sort((a, b) => a - b)).toEqual([10, 20, 30])
    expect(key.props.hidden[key.props.ids.indexOf(30)]).toBe(true)
    expect(key.roster).not.toBeNull()
  })

  it('forceKeyframe で次の1通を鍵にできる（参加者がつなぎ直したとき）', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    enc.encode(view, 0)
    expect(decode(enc.encode(view, 66)).keyframe).toBe(false)
    enc.forceKeyframe()
    expect(decode(enc.encode(view, 133)).keyframe).toBe(true)
    expect(decode(enc.encode(view, 200)).keyframe).toBe(false)
  })

  it('15Hzで3秒、毎回いくつか動かしても、参加者の組み立て直しは主と量子化の誤差の中で一致する', () => {
    const enc = new StoreFrameEncoder(world)
    const mirror = new WorldMirror(world, 1)
    const view = makeView(world)
    const rnd = lcg(42)
    let bytesTotal = 0
    for (let tick = 0; tick < 45; tick++) {
      step(view, rnd, 1 + Math.floor(rnd() * 12), n)
      if (tick % 7 === 3) view.propHidden[Math.floor(rnd() * n)] = 1
      const bytes = enc.encode(view, tick * 66)
      bytesTotal += bytes.byteLength
      expect(bytes.byteLength).toBeLessThanOrEqual(MAX_BINARY_BYTES)
      const snap = mirror.apply(decode(bytes))
      expectPropsMatch(view, snap.view, n)
    }
    // ふつうの回は小さい（毎秒15回送っても数KB/秒）
    expect(bytesTotal / 45).toBeLessThan(2000)
  })

  it('途中からつないだ参加者（前の様子を知らない）も、次の鍵で主とそろう', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    const rnd = lcg(5)
    let t = 0
    for (; t < 1500; t += 66) {
      step(view, rnd, 8, n)
      enc.encode(view, t)
    }
    // ここから参加者がつなぐ（それまでの差分を受け取っていない）
    const late = new WorldMirror(world, 1)
    let synced = false
    for (; t < 4500; t += 66) {
      step(view, rnd, 3, n)
      const f = decode(enc.encode(view, t))
      const snap = late.apply(f)
      if (f.full) {
        synced = true
        expectPropsMatch(view, snap.view, n)
      }
    }
    expect(synced).toBe(true)
    expect(late.synced).toBe(true)
  })

  it('参加者が持っていた古い値（つなぎ直す前）も、全部そろった鍵で正しく直る', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    const mirror = new WorldMirror(world, 1)
    const rnd = lcg(9)
    let t = 0
    for (; t < 600; t += 66) {
      step(view, rnd, 6, n)
      mirror.apply(decode(enc.encode(view, t)))
    }
    // 切れている間に動いて、定位置へ戻された物もある
    mirror.markStale()
    expect(mirror.synced).toBe(false)
    for (let id = 0; id < n; id += 3) nudgeProp(view, id, 0.3, 0, 0.2)
    const homeAgain = makeView(world)
    view.propTransforms.set(homeAgain.propTransforms.subarray(0, 7 * 50), 0)
    for (; t < 1300; t += 66) enc.encode(view, t) // 参加者には届かない
    enc.forceKeyframe()
    const snap = mirror.apply(decode(enc.encode(view, t)))
    expect(mirror.synced).toBe(true)
    expectPropsMatch(view, snap.view, n)
  })

  it('入りきらないときは数を絞り（16KB以内）、残りは次の回に送られてそろう', () => {
    const big = makeWorld(3000)
    const enc = new StoreFrameEncoder(big, { maxBytes: 4096 })
    const view = makeView(big)
    for (let id = 0; id < big.props.length; id++) nudgeProp(view, id, 0.5, 0, 0.1)
    const mirror = new WorldMirror(big)
    let t = 0
    let frames = 0
    for (; frames < 20; frames++, t += 66) {
      const bytes = enc.encode(view, t)
      expect(bytes.byteLength).toBeLessThanOrEqual(4096)
      const f = decode(bytes)
      if (frames === 0) expect(f.full).toBe(false) // 絞った鍵は「全部そろった」と言わない
      mirror.apply(f)
    }
    const snap = mirror.apply(decode(enc.encode(view, t)))
    expectPropsMatch(view, snap.view, big.props.length)
    expect(PROP_ENTRY_BYTES).toBe(13)
  })
})

describe('店の様子：人・店員・カート・場所', () => {
  const world = makeWorld(40)

  it('全員の位置・状態・点数・コンボ・達成と、店員・カート・皮・場所の状態が戻る', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world, {
      phase: 'playing',
      timeLeft: 9.87,
      duration: 180,
      lastSpurt: true,
      damage: 0.4321,
      avatars: [
        avatar(0, {
          pos: { x: 1.234, y: 0.5, z: -3.21 },
          yaw: 1.2,
          anim: 'sweep',
          holding: 12,
          score: 4567.5,
          combo: { level: 3, multiplier: 2, remaining: 2.37 },
          heat: 63.5,
          achieved: ['bell', 'sweep', 'pa'],
          secrets: ['secret-cart-strike'],
          prompt: { label: '鳴らす', press: 'mash', misdeed: 'bell' },
        }),
        avatar(2, {
          kind: 'cpu',
          name: 'CPU',
          character: 'ch/character-male-a',
          anim: 'ride-cart',
          ridingCart: 4,
          stunned: 2.5,
          connected: false,
          prompt: { label: '駄々をこねる', press: 'hold', progress: 0.5, misdeed: 'tantrum' },
        }),
      ],
      npcs: [npc(0, { state: 'chase', target: 2, bubble: 'こらー！', anim: 'run' }), npc(7, { role: 'shopper', character: 'ch/character-female-c', bubble: null })],
      peels: [{ id: 300, owner: 1, pos: { x: 4, y: 0, z: 5 } }],
      stations: {
        pyramid: { collapsed: true, rebuildIn: 12.34 },
        bowling: { pinsDown: 7, resetIn: 3.5 },
        samples: { left: 3, refillIn: 17 },
        watermelons: { left: 0, refillIn: 14.9 },
        pa: { activeSlot: 1, holdProgress: 0.75, cooldown: 4 },
        freezerSlots: [0, 3],
      },
    })
    view.carts[4] = { id: 4, pos: { x: 3, y: 0, z: 5 }, yaw: 0.5, riderSlot: 2, speed: 8.25 }
    const mirror = new WorldMirror(world, 2)
    const got = mirror.apply(decode(enc.encode(view, 1234))).view
    expect(got.phase).toBe('playing')
    expect(got.timeLeft).toBeCloseTo(9.87, 3)
    expect(got.duration).toBe(180)
    expect(got.lastSpurt).toBe(true)
    expect(got.damage).toBeCloseTo(0.4321, 4)
    const [a0, a2] = got.avatars
    expect(a0?.name).toBe('たろう')
    expect(a0?.anim).toBe('sweep')
    expect(a0?.holding).toBe(12)
    expect(a0?.score).toBe(4567.5)
    expect(a0?.combo).toEqual({ level: 3, multiplier: 2, remaining: 2.37 })
    expect(a0?.heat).toBeCloseTo(63.5, 2)
    expect([...(a0?.achieved ?? [])].sort()).toEqual(['bell', 'pa', 'sweep'])
    expect(a0?.secrets).toEqual(['secret-cart-strike'])
    // 案内はこの端末のキャラ（slot 2）にだけ入る
    expect(a0?.isLocal).toBe(false)
    expect(a0?.prompt).toBeNull()
    expect(a2?.isLocal).toBe(true)
    expect(a2?.kind).toBe('cpu')
    expect(a2?.character).toBe('ch/character-male-a')
    expect(a2?.ridingCart).toBe(4)
    expect(a2?.stunned).toBeCloseTo(2.5, 2)
    expect(a2?.connected).toBe(false)
    expect(a2?.prompt?.label).toBe('駄々をこねる')
    expect(a2?.prompt?.press).toBe('hold')
    expect(a2?.prompt?.misdeed).toBe('tantrum')
    expect(a2?.prompt?.progress).toBeCloseTo(0.5, 2)
    expect(Math.abs((a0?.pos.x ?? 0) - 1.234)).toBeLessThanOrEqual(POS_MAX_ERROR)
    expect(Math.abs((a0?.yaw ?? 0) - 1.2)).toBeLessThanOrEqual(YAW_MAX_ERROR + 1e-9)
    expect(got.npcs[0]).toMatchObject({ id: 0, state: 'chase', target: 2, bubble: 'こらー！', anim: 'run', character: 'mm/character-employee' })
    expect(got.npcs[1]).toMatchObject({ id: 7, role: 'shopper', character: 'ch/character-female-c', bubble: null })
    expect(got.carts[4]).toMatchObject({ id: 4, riderSlot: 2, speed: 8.25 })
    expect(got.peels).toEqual([{ id: 300, owner: 1, pos: { x: 4, y: 0, z: 5 } }])
    expect(got.stations.pyramid).toEqual({ collapsed: true, rebuildIn: 12.34 })
    expect(got.stations.bowling).toEqual({ pinsDown: 7, resetIn: 3.5 })
    expect(got.stations.pa.activeSlot).toBe(1)
    expect(got.stations.pa.holdProgress).toBeCloseTo(0.75, 4)
    expect(got.stations.freezerSlots).toEqual([0, 3])
    expect(got.events).toEqual([])
  })

  it('悪事ごとの進み具合（progress）が往復する。無い人には付かない', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world, {
      avatars: [avatar(0, { progress: { bell: 12, cart: 30.5, freezer: 2.73, sweep: 0 } }), avatar(1)],
    })
    const got = new WorldMirror(world, 1).apply(decode(enc.encode(view, 0))).view
    expect(got.avatars[0]?.progress).toEqual({ bell: 12, cart: 30.5, freezer: 2.73, sweep: 0 })
    expect(got.avatars[1]?.progress).toBeUndefined()
  })

  it('名簿が届く前は、部屋の顔ぶれの名前を使う。名簿は変わったときだけ送る', () => {
    const enc = new StoreFrameEncoder(world)
    const view = makeView(world)
    const first = decode(enc.encode(view, 0))
    const second = decode(enc.encode(view, 66))
    // 途中からつないだ人は、名簿の無い1通から始まる
    const late = new WorldMirror(world, 1)
    late.setMembers([
      { slot: 0, name: 'あるじ', character: 'ch/character-male-e' },
      { slot: 1, name: 'わたし', character: 'ch/character-female-f' },
    ])
    const v1 = late.apply(second).view
    expect(v1.avatars.map((a) => a.name)).toEqual(['あるじ', 'わたし'])
    late.apply(first)
    expect(late.apply(second).view.avatars.map((a) => a.name)).toEqual(['たろう', 'はなこ'])
    // 名前が変わった（CPUが加わった）ら、鍵でなくても名簿を送る
    view.avatars.push(avatar(3, { kind: 'cpu', name: 'CPU本気' }))
    const third = decode(enc.encode(view, 133))
    expect(third.keyframe).toBe(false)
    expect(third.roster?.avatars.map((a) => a.name)).toContain('CPU本気')
  })
})
