import { describe, expect, it } from 'vitest'
import {
  AssemblyEvents,
  buildSchedule,
  clampProgress,
  paintAmount,
  partPose,
  type PartInfo,
  type Schedule,
} from '../../src/client/render/assembly'
import {
  CONTACT_AT,
  FALL_P,
  FALL_SECONDS,
  PAINT_END,
  PAINT_START,
  PEDESTAL_END,
  STAGE_RANGES,
  type StageNo,
} from '../../src/client/render/stages'
import { BUILD_MS } from '../../src/shared/config'

// 名所1か所ぶんに近い部品の並び（段階ごとに高さと中心からの距離をばらす）。作る順はわざと乱しておく
function sampleParts(): PartInfo[] {
  const parts: PartInfo[] = []
  const counts: Record<StageNo, number> = { 1: 14, 2: 22, 3: 31, 4: 40 }
  let seed = 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (const stage of [3, 1, 4, 2] as const) {
    for (let i = 0; i < counts[stage]; i++) {
      parts.push({ stage, minY: rand() * 5, radial: rand() * 4.5, size: 0.1 + rand() })
    }
  }
  return parts
}

function stageOf(schedule: Schedule, stage: StageNo) {
  return schedule.parts.filter((sp) => sp.stage === stage)
}

describe('段階の境目と落ちる長さ', () => {
  it('docs/03 の表と同じ境目を使う', () => {
    expect(PEDESTAL_END).toBe(0.05)
    expect(STAGE_RANGES[1]).toEqual([0.05, 0.4])
    expect(STAGE_RANGES[2]).toEqual([0.4, 0.62])
    expect(STAGE_RANGES[3]).toEqual([0.62, 0.72])
    expect([PAINT_START, PAINT_END]).toEqual([0.72, 0.8])
    expect(STAGE_RANGES[4]).toEqual([0.8, 1.0])
  })

  it('落ちる長さは 0.35 秒を BUILD_MS で p に直した値', () => {
    expect(FALL_SECONDS).toBe(0.35)
    expect(FALL_P).toBeCloseTo(0.35 / (BUILD_MS / 1000), 12)
    const schedule = buildSchedule(sampleParts())
    for (const sp of schedule.parts) {
      expect(sp.end - sp.start).toBeCloseTo(FALL_P, 12)
      expect(sp.land - sp.start).toBeCloseTo(FALL_P * CONTACT_AT, 12)
    }
  })

  it('どの部品も自分の段階の区間で落ち始め、区間の終わりまでに止まる。最後の部品は終わりちょうどに止まる', () => {
    const schedule = buildSchedule(sampleParts())
    for (const stage of [1, 2, 3, 4] as const) {
      const [from, to] = STAGE_RANGES[stage]
      const members = stageOf(schedule, stage)
      for (const sp of members) {
        expect(sp.start).toBeGreaterThanOrEqual(from - 1e-12)
        expect(sp.end).toBeLessThanOrEqual(to + 1e-12)
      }
      expect(Math.max(...members.map((m) => m.end))).toBeCloseTo(to, 12)
      expect(Math.min(...members.map((m) => m.start))).toBeCloseTo(from, 12)
    }
  })
})

describe('同じ p なら同じ絵', () => {
  it('予定も見え方も、作り直しても同じ', () => {
    const a = buildSchedule(sampleParts())
    const b = buildSchedule(sampleParts())
    expect(b).toEqual(a)
    for (const p of [0, 0.03, 0.05, 0.1, 0.2731, 0.4, 0.55, 0.64, 0.72, 0.77, 0.8, 0.91, 1]) {
      const poseA = a.parts.map((sp) => partPose(sp, p))
      const poseB = b.parts.map((sp) => partPose(sp, p))
      expect(poseB).toEqual(poseA)
      expect(a.parts.map((sp) => partPose(sp, p))).toEqual(poseA)
      expect(paintAmount(p)).toBe(paintAmount(p))
    }
  })
})

describe('段階の境目で見えるもの', () => {
  const schedule = buildSchedule(sampleParts())
  const poses = (p: number) => schedule.parts.map((sp) => ({ sp, pose: partPose(sp, clampProgress(p)) }))

  it('台座だけの区間（0〜0.05）では部品は1つも出ない', () => {
    for (const p of [0, 0.02, 0.05]) {
      expect(poses(p).some(({ pose }) => pose.visible)).toBe(false)
    }
  })

  it('各段階の終わりでは、その段階までが全部止まり、次の段階はまだ出ていない', () => {
    const checks: [number, StageNo][] = [
      [0.4, 1],
      [0.62, 2],
      [0.72, 3],
      [0.8, 3],
    ]
    for (const [p, last] of checks) {
      for (const { sp, pose } of poses(p)) {
        if (sp.stage <= last) expect(pose).toMatchObject({ visible: true, t: 1, lift: 0 })
        else expect(pose.visible).toBe(false)
      }
    }
  })

  it('色塗りの区間（0.72〜0.80）で白から本当の色へなめらかに変わる', () => {
    expect(paintAmount(0)).toBe(0)
    expect(paintAmount(0.72)).toBe(0)
    expect(paintAmount(0.8)).toBe(1)
    expect(paintAmount(1)).toBe(1)
    let prev = 0
    for (let p = 0.72; p <= 0.8; p += 0.002) {
      const v = paintAmount(p)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v - prev).toBeLessThan(0.05)
      prev = v
    }
  })

  it('1 で完成。1 を超えても完成のまま', () => {
    expect(poses(1).every(({ pose }) => pose.visible && pose.t === 1)).toBe(true)
    expect(poses(1.4)).toEqual(poses(1))
    expect(poses(Infinity)).toEqual(poses(1))
  })
})

describe('段階の中の順番', () => {
  it('下から上へ、同じ高さなら中心から外へ出す', () => {
    const parts: PartInfo[] = [
      { stage: 2, minY: 2.0, radial: 0, size: 1 },
      { stage: 2, minY: 0, radial: 3, size: 1 },
      { stage: 2, minY: 0, radial: 1, size: 1 },
      { stage: 2, minY: 1.0, radial: 0.5, size: 1 },
    ]
    const s = buildSchedule(parts)
    const order = [...s.parts].sort((a, b) => a.start - b.start).map((sp) => sp.index)
    expect(order).toEqual([2, 1, 3, 0])
  })

  it('順番の指定（order）があれば、それを先に効かせる', () => {
    const parts: PartInfo[] = [
      { stage: 1, minY: 0, radial: 0, size: 1 },
      { stage: 1, minY: 3, radial: 2, size: 1, order: -1 },
      { stage: 1, minY: 0, radial: 1, size: 1, order: 1 },
    ]
    const s = buildSchedule(parts)
    const order = [...s.parts].sort((a, b) => a.start - b.start).map((sp) => sp.index)
    expect(order).toEqual([1, 0, 2])
  })
})

describe('落ち方', () => {
  const [sp] = buildSchedule([{ stage: 1, minY: 0, radial: 0, size: 1 }]).parts
  if (!sp) throw new Error('予定が作れない')

  it('上から落ちて、着地の瞬間に地面に触れ、少し跳ねて止まる', () => {
    const before = partPose(sp, sp.start + FALL_P * 0.2)
    expect(before.visible).toBe(true)
    expect(before.lift).toBeGreaterThan(1)
    const contact = partPose(sp, sp.land)
    expect(contact.lift).toBeCloseTo(0, 6)
    expect(contact.scaleY).toBeLessThan(1)
    const hop = partPose(sp, sp.land + (sp.end - sp.land) / 2)
    expect(hop.lift).toBeGreaterThan(0)
    expect(hop.lift).toBeLessThan(0.3)
    expect(partPose(sp, sp.end)).toMatchObject({ t: 1, lift: 0, scaleY: 1, scaleXZ: 1 })
  })

  it('動きを減らす設定では、落下も跳ねもなく、着地の時点でその場に現れる', () => {
    for (let p = 0; p <= 0.2; p += 0.001) {
      const pose = partPose(sp, p, 'drop', true)
      expect(pose.visible).toBe(p >= sp.land)
      expect(pose.lift).toBe(0)
      expect(pose.scaleY).toBe(1)
    }
  })

  it('grow は地面から伸びて、持ち上がらない', () => {
    const mid = partPose(sp, sp.start + FALL_P * 0.3, 'grow')
    expect(mid.lift).toBe(0)
    expect(mid.scaleY).toBeGreaterThan(0)
    expect(mid.scaleY).toBeLessThan(1)
    expect(partPose(sp, sp.end, 'grow')).toMatchObject({ t: 1, scaleY: 1 })
  })
})

describe('着地と色塗りの知らせ', () => {
  const schedule = buildSchedule(sampleParts())

  it('少しずつ進めると、どの部品の着地もちょうど1回、着地の早い順に知らせる', () => {
    const events = new AssemblyEvents(schedule.byLand)
    const seen: number[] = []
    let paints = 0
    for (let i = 0; i <= 1200; i++) {
      const notice = events.advance(i / 1000)
      seen.push(...notice.landed.map((sp) => sp.index))
      if (notice.paintStarted) paints++
    }
    expect(seen).toHaveLength(schedule.parts.length)
    expect(new Set(seen).size).toBe(schedule.parts.length)
    expect(seen).toEqual(schedule.byLand.map((sp) => sp.index))
    expect(paints).toBe(1)
  })

  it('p が戻ってからまた進んでも、同じ着地を二度知らせない', () => {
    const events = new AssemblyEvents(schedule.byLand)
    const seen: number[] = []
    const path = [0.1, 0.25, 0.5, 0.31, 0.2, 0.45, 0.5, 0.74, 0.7, 0.66, 0.75, 0.9, 0.85, 1, 0.95, 1]
    let paints = 0
    for (const p of path) {
      const notice = events.advance(p)
      seen.push(...notice.landed.map((sp) => sp.index))
      if (notice.paintStarted) paints++
    }
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toHaveLength(schedule.parts.length)
    expect(paints).toBe(1)
  })

  it('p が大きく飛んでも、間の着地をまとめて知らせて欠かさない', () => {
    const events = new AssemblyEvents(schedule.byLand)
    events.advance(0.1)
    const jumped = events.advance(0.9)
    const expected = schedule.byLand.filter((sp) => sp.land > 0.1 && sp.land <= 0.9).map((sp) => sp.index)
    expect(jumped.landed.map((sp) => sp.index)).toEqual(expected)
    expect(jumped.paintStarted).toBe(true)
  })

  it('同じ p を何度渡しても、知らせは1回だけ', () => {
    const events = new AssemblyEvents(schedule.byLand)
    const first = events.advance(0.3)
    expect(first.landed.length).toBeGreaterThan(0)
    expect(events.advance(0.3).landed).toHaveLength(0)
    expect(events.advance(Number.NaN).landed).toHaveLength(0)
  })

  it('skipTo で完成まで進めると、その後は何も知らせない', () => {
    const events = new AssemblyEvents(schedule.byLand)
    events.advance(0.2)
    events.skipTo(1)
    const after = events.advance(1)
    expect(after.landed).toHaveLength(0)
    expect(after.paintStarted).toBe(false)
  })
})
