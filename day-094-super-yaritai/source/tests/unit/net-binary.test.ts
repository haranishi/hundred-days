import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/shared/view'
import {
  BIN_EVENTS,
  BIN_INTENT,
  BIN_SELF,
  BIN_STORE,
  binaryKind,
  decodeEvents,
  decodeIntents,
  decodeSelfState,
  decodeStoreFrame,
  encodeEvents,
  encodeIntents,
  encodeSelfState,
  MAX_INTENTS_PER_FRAME,
  SLOT_UNSET,
  StoreFrameEncoder,
} from '../../src/shared/protocol'
import { POS_MAX_ERROR, YAW_MAX_ERROR } from '../../src/shared/protocol/quant'
import { ANIM_NAMES, EVENT_TYPES, SFX_NAMES } from '../../src/shared/protocol/tables'
import { avatar, lcg, makeView, makeWorld } from './net-fixtures'

const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps + 1e-9

describe('種類1：自分の様子', () => {
  it('往復で位置・速さ・向き・動き・カート・持ち物・連番がそろう（誤差は量子化の範囲）', () => {
    const src = {
      seq: 123456,
      t: -2500,
      pos: { x: -17.234, y: 1.05, z: 13.999 },
      vel: { x: 8.88, y: -3.2, z: 0.004 },
      yaw: -2.9,
      anim: 'ride-cart' as const,
      ridingCart: 3,
      holding: 271,
      actionHeld: true,
    }
    const bytes = encodeSelfState(src)
    expect(bytes[0]).toBe(BIN_SELF)
    expect(bytes[1]).toBe(SLOT_UNSET)
    expect(bytes.byteLength).toBeLessThanOrEqual(32)
    // 部屋が送り主を書き込む
    bytes[1] = 2
    const got = decodeSelfState(bytes)
    expect(got).not.toBeNull()
    expect(got?.slot).toBe(2)
    expect(got?.seq).toBe(123456)
    expect(got?.t).toBe(-2500)
    expect(got?.anim).toBe('ride-cart')
    expect(got?.ridingCart).toBe(3)
    expect(got?.holding).toBe(271)
    expect(got?.actionHeld).toBe(true)
    for (const k of ['x', 'y', 'z'] as const) {
      expect(near(got?.pos[k] ?? 99, src.pos[k], POS_MAX_ERROR)).toBe(true)
      expect(near(got?.vel[k] ?? 99, src.vel[k], POS_MAX_ERROR)).toBe(true)
    }
    expect(Math.abs((got?.yaw ?? 0) - src.yaw)).toBeLessThanOrEqual(YAW_MAX_ERROR + 1e-9)
  })

  it('乗っていない・持っていないは null のまま戻る。すべての動きの名前が往復する', () => {
    for (const anim of ANIM_NAMES) {
      const got = decodeSelfState(
        encodeSelfState({ seq: 1, t: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, anim, ridingCart: null, holding: null, actionHeld: false }),
      )
      expect(got?.anim).toBe(anim)
      expect(got?.ridingCart).toBeNull()
      expect(got?.holding).toBeNull()
    }
  })
})

describe('種類4：意図', () => {
  it('押した・離した・相手の番号が順番どおりに戻る', () => {
    const intents = [
      { kind: 'press' as const, target: 12, t: 1000 },
      { kind: 'release' as const, target: null, t: 1066 },
      { kind: 'jump' as const, target: null, t: 1100 },
      { kind: 'dash' as const, target: 65534, t: 1133 },
    ]
    const bytes = encodeIntents(9, intents)
    expect(binaryKind(bytes)).toBe(BIN_INTENT)
    bytes[1] = 3
    expect(decodeIntents(bytes)).toEqual({ slot: 3, seq: 9, intents })
  })

  it('1通に入れるのは64個まで', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ kind: 'press' as const, target: i, t: i }))
    expect(decodeIntents(encodeIntents(1, many))?.intents).toHaveLength(MAX_INTENTS_PER_FRAME)
  })
})

describe('種類3：出来事', () => {
  const all: GameEvent[] = [
    { t: 'score', slot: 1, kind: 'pyramid', points: 22.5, multiplier: 1.5, pos: { x: 3.5, y: 0.2, z: 3 } },
    { t: 'achieve', slot: 0, id: 'secret-cart-strike', bonus: 800 },
    { t: 'achieve', slot: 2, id: 'bell', bonus: 300 },
    { t: 'complete', slot: 3, bonus: 3000 },
    { t: 'combo', slot: 0, level: 3, multiplier: 2 },
    { t: 'combo-break', slot: 1 },
    { t: 'notice', npc: 4, target: 2 },
    { t: 'caught', slot: 2, npc: 1 },
    { t: 'escape', slot: 0 },
    { t: 'slip', slot: null, npc: 3, by: 1, pos: { x: -1, y: 0, z: 2 } },
    { t: 'slip', slot: 2, npc: null, by: null, pos: { x: 1, y: 0, z: -2 } },
    { t: 'sfx', name: 'bell' },
    { t: 'sfx', name: 'crash', pos: { x: 0, y: 1, z: 0 }, volume: 0.5 },
    { t: 'pa', slot: 1, text: 'ただいまよりタイムセールです！🎉' },
    { t: 'phase', phase: 'ended' },
    { t: 'last-spurt' },
    { t: 'manager' },
    { t: 'reset', station: 'watermelons' },
  ]

  it('全部の種類が往復する（点と倍率は丸めない）', () => {
    const frames = encodeEvents(5, 64000, all)
    expect(frames).toHaveLength(1)
    expect(binaryKind(frames[0] as Uint8Array)).toBe(BIN_EVENTS)
    const got = decodeEvents(frames[0] as Uint8Array)
    expect(got?.seq).toBe(5)
    expect(got?.t).toBe(64000)
    expect(got?.events).toEqual(all)
    // 表にある種類はすべて試した
    expect(new Set(all.map((e) => e.t)).size).toBe(EVENT_TYPES.length)
  })

  it('効果音の名前はすべて往復する', () => {
    const sfx: GameEvent[] = SFX_NAMES.map((name) => ({ t: 'sfx', name }))
    expect(decodeEvents(encodeEvents(0, 0, sfx)[0] as Uint8Array)?.events).toEqual(sfx)
  })

  it('16KBを超えそうなら分けて送る（どの1通も16KB以内、つなげると元どおり）', () => {
    const many: GameEvent[] = Array.from({ length: 400 }, (_, i) => ({ t: 'pa', slot: i % 4, text: 'あ'.repeat(80) }))
    const frames = encodeEvents(0, 0, many)
    expect(frames.length).toBeGreaterThan(1)
    const back: GameEvent[] = []
    for (const f of frames) {
      expect(f.byteLength).toBeLessThanOrEqual(16 * 1024)
      back.push(...(decodeEvents(f)?.events ?? []))
    }
    expect(back).toEqual(many)
    expect(encodeEvents(0, 0, [])).toEqual([])
  })
})

describe('壊れたデータを捨てる', () => {
  const world = makeWorld(60)
  const store = new StoreFrameEncoder(world).encode(makeView(world, { avatars: [avatar(0, { prompt: { label: '鳴らす', press: 'mash', misdeed: 'bell' } }), avatar(1)] }), 0)
  const self = encodeSelfState({ seq: 1, t: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, anim: 'idle', ridingCart: null, holding: null, actionHeld: false })
  const events = encodeEvents(0, 0, [{ t: 'manager' }, { t: 'sfx', name: 'go' }])[0] as Uint8Array
  const intents = encodeIntents(0, [{ kind: 'press', target: null, t: 0 }])
  const cases = [
    { name: '店の様子', bytes: store, decode: decodeStoreFrame },
    { name: '自分の様子', bytes: self, decode: decodeSelfState },
    { name: '出来事', bytes: events, decode: decodeEvents },
    { name: '意図', bytes: intents, decode: decodeIntents },
  ]

  for (const c of cases) {
    it(`${c.name}：途中で切れた・余りがある・種類ちがい・空は null`, () => {
      expect(c.decode(c.bytes)).not.toBeNull()
      for (let cut = 0; cut < c.bytes.byteLength; cut++) expect(c.decode(c.bytes.subarray(0, cut))).toBeNull()
      const longer = new Uint8Array(c.bytes.byteLength + 1)
      longer.set(c.bytes)
      expect(c.decode(longer)).toBeNull()
      const other = c.bytes.slice()
      other[0] = other[0] === BIN_STORE ? BIN_SELF : BIN_STORE
      expect(c.decode(other)).toBeNull()
      expect(c.decode(new Uint8Array(0))).toBeNull()
    })

    it(`${c.name}：でたらめに書き換えても例外を投げない`, () => {
      const rnd = lcg(c.bytes.byteLength)
      for (let i = 0; i < 300; i++) {
        const b = c.bytes.slice()
        const flips = 1 + Math.floor(rnd() * 4)
        for (let k = 0; k < flips; k++) b[1 + Math.floor(rnd() * (b.byteLength - 1))] = Math.floor(rnd() * 256)
        expect(() => c.decode(b)).not.toThrow()
      }
    })
  }

  it('表の外の番号（動きの名前など）は null', () => {
    const b = self.slice()
    // 動きの番号は 2+4+4+6+6+2 = 24 バイト目
    b[24] = ANIM_NAMES.length
    expect(decodeSelfState(b)).toBeNull()
  })

  it('16KBを超える1通は読まない', () => {
    const big = new Uint8Array(16 * 1024 + 1)
    big[0] = BIN_EVENTS
    expect(decodeEvents(big)).toBeNull()
  })
})
