// 模型の決まり（docs/04）を、描画なしで確かめる。名所を足したら、ここが門番になる
import { describe, expect, it } from 'vitest'
import { buildLandmark, hasModel, MODELED_IDS, preloadLandmark } from '../../src/client/landmarks'
import { buildModel, hashString, Kit, LIMITS, REACH_LIMIT, seededRandom, type LandmarkModel } from '../../src/client/landmarks/kit'
import { buildSchedule } from '../../src/client/render/assembly'
import { STAGE_RANGES } from '../../src/client/render/stages'
import { GROUND_RADIUS } from '../../src/client/render/stageSet'
import { MODELED_LANDMARK_IDS } from '../../src/shared/landmarks'

await Promise.all(MODELED_IDS.map(preloadLandmark))

function model(id: string): LandmarkModel {
  const m = buildLandmark(id)
  if (!m) throw new Error(`模型がない: ${id}`)
  return m
}

/** 形の数値をまとめた指紋。同じ名所を作り直して同じになるかを見る */
function fingerprint(m: LandmarkModel): number {
  let h = 0
  for (const p of m.parts) {
    const pos = p.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i += 7) {
      h = (h * 31 + Math.round(pos.getX(i) * 1000) + Math.round(pos.getY(i) * 1000) * 7 + Math.round(pos.getZ(i) * 1000) * 13) | 0
    }
    h = (h * 31 + p.stage) | 0
  }
  return h
}

describe('登録した模型の決まり', () => {
  it('見本の名所とタイトルの島がある', () => {
    for (const id of ['kinkakuji', 'pyramids-giza', 'eiffel-tower', 'title']) expect(hasModel(id)).toBe(true)
    expect(hasModel('no-such-place')).toBe(false)
    expect(buildLandmark('no-such-place')).toBeNull()
  })

  it('名所の id は共有の一覧（src/shared/landmarks.ts）の模型ありの id と同じ綴り', () => {
    const shared = new Set<string>(MODELED_LANDMARK_IDS)
    expect(MODELED_IDS.filter((id) => id !== 'title').sort()).toEqual([...shared].sort())
    for (const id of MODELED_IDS) {
      if (id === 'title') continue
      expect(shared.has(id), `${id} が共有の一覧にない`).toBe(true)
    }
  })

  for (const id of MODELED_IDS) {
    describe(id, () => {
      const m = model(id)

      it(`部品 ${LIMITS.parts} 個・三角形 ${LIMITS.triangles} 枚以内で、注意が出ない`, () => {
        expect(m.parts.length).toBeLessThanOrEqual(LIMITS.parts)
        expect(m.triangles).toBeLessThanOrEqual(LIMITS.triangles)
        expect(m.warnings).toEqual([])
      })

      it('台座の上面（地面）の内側に収まり、高さは 6.5 以内', () => {
        for (const p of m.parts) {
          expect(p.reach, `部品の中心 ${p.center.toArray().map((v) => v.toFixed(2))}`).toBeLessThanOrEqual(REACH_LIMIT)
          // 斜めの角材の端は地面にわずかに埋まる。大きく地面の下にあるものだけを止める
          expect(p.minY).toBeGreaterThanOrEqual(-0.12)
        }
        expect(m.height).toBeLessThanOrEqual(6.5)
        expect(m.height).toBeGreaterThan(0.3)
      })

      it('段階1〜4の部品がどれもあり、形の数値はすべて有限で、法線は長さ1', () => {
        const stages = new Set(m.parts.map((p) => p.stage))
        expect([...stages].sort()).toEqual([1, 2, 3, 4])
        for (const p of m.parts) {
          const pos = p.geometry.getAttribute('position')
          const nor = p.geometry.getAttribute('normal')
          const fin = p.geometry.getAttribute('aFinish')
          expect(p.geometry.getAttribute('aTrue').count).toBe(pos.count)
          for (let i = 0; i < pos.count; i++) {
            expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true)
            const len = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))
            // 先が一点に集まる面（四角すいのてっぺんなど）は法線が 0 になることがあるが、その頂点は面積 0 の三角形にしか使われない
            expect(len === 0 || Math.abs(len - 1) < 1e-3).toBe(true)
            // 段階4だけが最初から色つき
            expect(fin.getZ(i)).toBe(p.stage === 4 ? 1 : 0)
          }
        }
      })

      it('同じ名所を作り直すと、同じ形・同じ予定になる（乱数は名所 id の種だけ）', () => {
        const again = model(id)
        expect(fingerprint(again)).toBe(fingerprint(m))
        const info = (x: LandmarkModel) => x.parts.map((p) => ({ stage: p.stage, order: p.order, minY: p.minY, radial: p.radial, size: p.size }))
        expect(buildSchedule(info(again))).toEqual(buildSchedule(info(m)))
      })

      it('予定に入れると、各段階の部品はその段階の区間の中で落ちて止まる', () => {
        const s = buildSchedule(m.parts.map((p) => ({ stage: p.stage, order: p.order, minY: p.minY, radial: p.radial, size: p.size })))
        for (const sp of s.parts) {
          const [from, to] = STAGE_RANGES[sp.stage]
          expect(sp.start).toBeGreaterThanOrEqual(from - 1e-9)
          expect(sp.end).toBeLessThanOrEqual(to + 1e-9)
        }
      })
    })
  }
})

describe('道具の決まり', () => {
  it('はみ出しの基準は、地面の半径にわずかな余裕を足した値', () => {
    expect(REACH_LIMIT).toBeGreaterThan(GROUND_RADIUS)
    expect(REACH_LIMIT - GROUND_RADIUS).toBeLessThan(0.05)
  })

  it('乱数は種だけで決まる', () => {
    const a = seededRandom(hashString('kinkakuji'))
    const b = seededRandom(hashString('kinkakuji'))
    const c = seededRandom(hashString('tokyo-tower'))
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
    expect([c(), c(), c()]).not.toEqual(xs)
  })

  it('part の中で作った形は1つの部品になり、段階4は最初から色つき', () => {
    const m = buildModel('test', (kit) => {
      kit.stage(4)
      kit.part(() => {
        kit.box({ w: 1, h: 1, d: 1 })
        kit.cylinder({ r: 0.2, h: 1, at: [0, 1, 0] })
      })
      kit.box({ w: 1, h: 1, d: 1, at: [2, 0, 0] })
    })
    expect(m.parts).toHaveLength(2)
    expect(m.parts[0]?.maxY).toBeCloseTo(2, 6)
    expect(m.parts[0]?.geometry.getAttribute('aFinish').getZ(0)).toBe(1)
  })

  it('at は形の底の中心を置く', () => {
    const m = buildModel('test', (kit) => {
      kit.box({ w: 2, h: 1, d: 2, at: [1, 0.5, -1] })
    })
    const p = m.parts[0]
    expect(p?.minY).toBeCloseTo(0.5, 6)
    expect(p?.maxY).toBeCloseTo(1.5, 6)
    expect(p?.center.x).toBeCloseTo(1, 6)
    expect(p?.center.z).toBeCloseTo(-1, 6)
  })

  it('groundAt は作った丘の上の高さを返す', () => {
    const kit = new Kit('test')
    kit.mound({ r: 2, h: 0.6, at: [1, 0, 0] })
    expect(kit.groundAt(1, 0)).toBeCloseTo(0.6, 6)
    expect(kit.groundAt(2, 0)).toBeCloseTo(0.3, 6)
    expect(kit.groundAt(3.5, 0)).toBe(0)
  })

  it('反り屋根は上を向く面が外向き（上から見える）', () => {
    for (const style of ['irimoya', 'yosemune', 'hogyo', 'skirt'] as const) {
      const m = buildModel('test', (kit) => kit.curvedRoof({ w: 2, d: 1.4, h: 0.6, style, top: { w: 1, d: 0.8 } }))
      const p = m.parts[0]
      if (!p) throw new Error('屋根ができない')
      const pos = p.geometry.getAttribute('position')
      const nor = p.geometry.getAttribute('normal')
      // 屋根の面のうち、高さが中ほどより上の頂点は、法線が上を向いている
      let up = 0
      let total = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.15 && Math.abs(nor.getY(i)) > 0.2) {
          total++
          if (nor.getY(i) > 0) up++
        }
      }
      expect(total).toBeGreaterThan(10)
      expect(up / total, style).toBeGreaterThan(0.95)
    }
  })

  it('上限を超えると注意が出る', () => {
    const m = buildModel('test', (kit) => {
      for (let i = 0; i < LIMITS.parts + 1; i++) kit.box({ w: 0.01, h: 0.01, d: 0.01 })
    })
    expect(m.warnings.join('')).toContain('部品が')
  })
})
