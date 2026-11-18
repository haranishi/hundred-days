import { describe, expect, it } from 'vitest'
import {
  dqPos,
  dqYaw,
  packQuat,
  POS_MAX_ERROR,
  qPos,
  QUAT_MAX_ERROR_RAD,
  quatAngle,
  qYaw,
  unpackQuat,
  YAW_MAX_ERROR,
} from '../../src/shared/protocol/quant'
import { lcg } from './net-fixtures'

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return Math.min(d, 2 * Math.PI - d)
}

describe('量子化の誤差の上限', () => {
  it('位置は cm の int16：店の中（±40m）なら誤差0.5cm以内', () => {
    const rnd = lcg(1)
    for (let i = 0; i < 10_000; i++) {
      const v = (rnd() - 0.5) * 80
      const q = qPos(v)
      expect(Number.isInteger(q)).toBe(true)
      expect(q).toBeGreaterThanOrEqual(-32768)
      expect(q).toBeLessThanOrEqual(32767)
      expect(Math.abs(dqPos(q) - v)).toBeLessThanOrEqual(POS_MAX_ERROR + 1e-9)
    }
  })

  it('位置の範囲の外は端に寄せ、NaN は0にする', () => {
    expect(qPos(1000)).toBe(32767)
    expect(qPos(-1000)).toBe(-32768)
    expect(qPos(Number.NaN)).toBe(0)
    expect(qPos(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('向きは uint16：どの角度でも誤差 π/65536 以内（負の角度・何周も回った値も）', () => {
    const rnd = lcg(2)
    for (let i = 0; i < 10_000; i++) {
      const a = (rnd() - 0.5) * 40 * Math.PI
      const q = qYaw(a)
      expect(q).toBeGreaterThanOrEqual(0)
      expect(q).toBeLessThanOrEqual(0xffff)
      expect(angleDiff(dqYaw(q), a)).toBeLessThanOrEqual(YAW_MAX_ERROR + 1e-9)
    }
    expect(dqYaw(qYaw(Math.PI))).toBeCloseTo(Math.PI, 4)
  })

  it('回転は smallest-three の32ビット：ランダムな回転2万個で誤差0.23°以内', () => {
    const rnd = lcg(3)
    const out = new Float32Array(4)
    let worst = 0
    for (let i = 0; i < 20_000; i++) {
      // 一様な回転（Shoemake の方法）
      const u1 = rnd()
      const u2 = rnd() * 2 * Math.PI
      const u3 = rnd() * 2 * Math.PI
      const q = [Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3)]
      const p = packQuat(q[0] as number, q[1] as number, q[2] as number, q[3] as number)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(0xffffffff)
      unpackQuat(p, out, 0)
      expect(Math.hypot(out[0] as number, out[1] as number, out[2] as number, out[3] as number)).toBeCloseTo(1, 5)
      worst = Math.max(worst, quatAngle(q, out))
    }
    expect(worst).toBeLessThanOrEqual(QUAT_MAX_ERROR_RAD)
  })

  it('q と −q は同じ値になり、長さが1でない・壊れた四元数は正規化か単位の回転にする', () => {
    expect(packQuat(0.1, 0.2, 0.3, 0.927)).toBe(packQuat(-0.1, -0.2, -0.3, -0.927))
    const out = [0, 0, 0, 0]
    unpackQuat(packQuat(0, 0, 0, 0), out)
    expect(out[3]).toBeCloseTo(1, 6)
    unpackQuat(packQuat(Number.NaN, 0, 0, 1), out)
    expect(out[3]).toBeCloseTo(1, 6)
    unpackQuat(packQuat(0, 0, 0, 5), out)
    expect(out[3]).toBeCloseTo(1, 6)
  })
})
