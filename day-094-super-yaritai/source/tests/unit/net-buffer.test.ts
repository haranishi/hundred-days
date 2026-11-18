import { describe, expect, it } from 'vitest'
import { SnapshotBuffer, type Snapshot } from '../../src/client/net/snapshot-buffer'
import { decodeStoreFrame, StoreFrameEncoder, WorldMirror } from '../../src/shared/protocol'
import type { WorldView } from '../../src/shared/view'
import { avatar, makeView, makeWorld, npc, nudgeProp } from './net-fixtures'

const world = makeWorld(20)

function snap(t: number, x: number, over: Partial<WorldView> = {}, changed: number[] | null = [0]): Snapshot {
  const view = makeView(world, { avatars: [avatar(0, { pos: { x, y: 0, z: 0 }, yaw: 0, anim: x > 5 ? 'run' : 'walk', score: x * 10 })], ...over })
  // 商品0を x と同じだけ東へ
  view.propTransforms[0] = x
  return { seq: t, t, view, changed }
}

describe('SnapshotBuffer：約100ms遅らせて補間する', () => {
  it('2枚の間の時刻では、位置を線形に補間し、動きや点数は近い方の値を使う', () => {
    const buf = new SnapshotBuffer()
    buf.push(snap(0, 0), 1000)
    buf.push(snap(100, 10), 1100)
    const v = buf.sample(25)
    expect(v?.avatars[0]?.pos.x).toBeCloseTo(2.5, 6)
    expect(v?.avatars[0]?.anim).toBe('walk')
    expect(v?.avatars[0]?.score).toBe(0)
    expect(v?.propTransforms[0]).toBeCloseTo(2.5, 5)
    const w = buf.sample(75)
    expect(w?.avatars[0]?.pos.x).toBeCloseTo(7.5, 6)
    expect(w?.avatars[0]?.anim).toBe('run')
    expect(w?.avatars[0]?.score).toBe(100)
  })

  it('範囲の外は端の1枚（先を読んで動かしすぎない）。空なら null', () => {
    const buf = new SnapshotBuffer()
    expect(buf.sample(0)).toBeNull()
    buf.push(snap(0, 0), 0)
    buf.push(snap(66, 6), 66)
    expect(buf.sample(-500)?.avatars[0]?.pos.x).toBe(0)
    expect(buf.sample(9999)?.avatars[0]?.pos.x).toBe(6)
  })

  it('描く時刻は「いちばん速く届いた遅れ＋100ms」だけ過去', () => {
    const buf = new SnapshotBuffer({ delayMs: 100 })
    expect(buf.renderTime(0)).toBeNull()
    // 主の時刻 t の1枚が、端末の時計で t+5000（＝遅れ5000）〜t+5040 に届く
    const jitter = [0, 30, 10, 40, 5, 20]
    jitter.forEach((j, i) => buf.push(snap(i * 66, i), 5000 + i * 66 + j))
    // 遅れの最小は5000。端末の時計 6000 のときは 6000-5000-100 = 900 を描く（少しずつ寄せるので、ほぼ900）
    expect(buf.renderTime(6000)).toBeGreaterThanOrEqual(899)
    expect(buf.renderTime(6000)).toBeLessThanOrEqual(901)
  })

  it('向きは近い回り方で補間する（π をまたぐ）', () => {
    const buf = new SnapshotBuffer()
    buf.push(snap(0, 0, { avatars: [avatar(0, { yaw: 3.0 })] }), 0)
    buf.push(snap(100, 0, { avatars: [avatar(0, { yaw: -3.0 })] }), 100)
    const yaw = buf.sample(50)?.avatars[0]?.yaw ?? 0
    // 3.0 と −3.0 の真ん中は π（0 ではない）
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(1e-6)
  })

  it('店員・カートも補間し、片方にしかいないものは新しい方の値を使う', () => {
    const buf = new SnapshotBuffer()
    const a = snap(0, 0, { npcs: [npc(0, { pos: { x: 0, y: 0, z: 0 } })] })
    const b = snap(100, 0, { npcs: [npc(0, { pos: { x: 4, y: 0, z: 0 } }), npc(1, { pos: { x: 9, y: 0, z: 9 } })] })
    a.view.carts[0] = { id: 0, pos: { x: 0, y: 0, z: 0 }, yaw: 0, riderSlot: null, speed: 0 }
    b.view.carts[0] = { id: 0, pos: { x: 2, y: 0, z: 0 }, yaw: 0, riderSlot: 0, speed: 10 }
    buf.push(a, 0)
    buf.push(b, 100)
    const v = buf.sample(50)
    expect(v?.npcs[0]?.pos.x).toBeCloseTo(2, 6)
    expect(v?.npcs[1]?.pos.x).toBe(9)
    expect(v?.carts[0]?.pos.x).toBeCloseTo(1, 6)
    expect(v?.carts[0]?.speed).toBeCloseTo(5, 6)
  })

  it('主の時計が少し戻っても時刻の順を保ち、大きく戻ったら（次の試合）前の分を捨てる', () => {
    const buf = new SnapshotBuffer()
    buf.push(snap(0, 0), 0)
    buf.push(snap(100, 1), 100)
    buf.push(snap(90, 2), 190) // 少し戻った
    expect(buf.size).toBe(2)
    expect(buf.latest()?.t).toBe(90)
    expect(buf.latest()?.changed).toBeNull()
    buf.push(snap(-3000, 3), 300) // 次の試合のカウントダウン
    expect(buf.size).toBe(1)
  })

  it('組み立て直した1枚（WorldMirror）をつなげて補間すると、回転は単位四元数のまま動いた商品だけが動く', () => {
    const enc = new StoreFrameEncoder(world)
    const mirror = new WorldMirror(world, 1)
    const buf = new SnapshotBuffer()
    const view = makeView(world)
    const s0 = mirror.apply(decodeStoreFrame(enc.encode(view, 0))!)
    buf.push(s0, 0)
    nudgeProp(view, 3, 1, 0, 1.2)
    const s1 = mirror.apply(decodeStoreFrame(enc.encode(view, 66))!)
    expect([...s1.changed]).toEqual([3])
    buf.push(s1, 66)
    const mid = buf.sample(33)!
    const o = 3 * 7
    const q = Array.from(mid.propTransforms.subarray(o + 3, o + 7))
    expect(Math.hypot(...q)).toBeCloseTo(1, 5)
    expect(mid.propTransforms[o]).toBeCloseTo(((s0.view.propTransforms[o] as number) + (s1.view.propTransforms[o] as number)) / 2, 4)
    // 動いていない商品は元のまま
    expect(Array.from(mid.propTransforms.subarray(7, 14))).toEqual(Array.from(s1.view.propTransforms.subarray(7, 14)))
  })
})
