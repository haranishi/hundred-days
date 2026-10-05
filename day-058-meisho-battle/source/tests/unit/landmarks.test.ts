import { describe, expect, it } from 'vitest'
import { FACTS_STATUS, LANDMARK_FACTS } from '../../src/shared/landmark-facts'
import { getLandmark, isLandmarkId, LANDMARKS, landmarksInScope, MODELED_LANDMARK_IDS } from '../../src/shared/landmarks'
import type { Scope } from '../../src/shared/types'

// docs/04 と docs/06 の48か所（描画側もこの id を使う）
const DOC_IDS = [
  'tokyo-tower',
  'kinkakuji',
  'itsukushima',
  'mt-fuji',
  'himeji-castle',
  'osaka-castle',
  'kaminarimon',
  'kiyomizudera',
  'todaiji',
  'fushimi-inari',
  'shirakawago',
  'goryokaku',
  'pyramids-giza',
  'eiffel-tower',
  'pisa-tower',
  'statue-of-liberty',
  'colosseum',
  'taj-mahal',
  'great-wall',
  'big-ben',
  'moai',
  'stonehenge',
  'neuschwanstein',
  'tower-bridge',
  'ginkakuji',
  'byodoin',
  'toshodaiji',
  'matsumoto-castle',
  'kumamoto-castle',
  'nagoya-castle',
  'izumo-taisha',
  'heian-jingu',
  'miyama',
  'tsumagojuku',
  'ouchijuku',
  'kintaikyo',
  'arc-de-triomphe',
  'angkor-wat',
  'machu-picchu',
  'chichen-itza',
  'abu-simbel',
  'brandenburg-gate',
  'forbidden-city',
  'mont-saint-michel',
  'brooklyn-bridge',
  'humayun-tomb',
  'blue-mosque',
  'hadrians-wall',
]

describe('名所の一覧', () => {
  it('模型のある48か所は設計の id のとおり（日本24・世界24）', () => {
    expect(MODELED_LANDMARK_IDS).toEqual(expect.arrayContaining(DOC_IDS))
    const modeled = LANDMARKS.filter((l) => l.modeled)
    expect(modeled.map((l) => l.id).sort()).toEqual([...MODELED_LANDMARK_IDS].sort())
    expect(modeled.filter((l) => l.scope === 'japan').length).toBeGreaterThanOrEqual(24)
    expect(modeled.filter((l) => l.scope === 'world').length).toBeGreaterThanOrEqual(24)
    for (const l of modeled) expect(l.nameOnly).toBe(false)
  })

  it('24模型への昇格後も、名前だけのはずれ候補を各範囲に10以上残す', () => {
    const nameOnly = LANDMARKS.filter((l) => l.nameOnly)
    expect(nameOnly.filter((l) => l.scope === 'japan').length).toBeGreaterThanOrEqual(8)
    expect(nameOnly.filter((l) => l.scope === 'world').length).toBeGreaterThanOrEqual(8)
    for (const l of nameOnly) expect(l.modeled).toBe(false)
  })

  it('id は英小文字とハイフンで重ならず、名前も重ならない', () => {
    const ids = LANDMARKS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    const names = LANDMARKS.map((l) => l.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('見間違えやすい名所は実在の id で、自分を含まず、重ならない', () => {
    for (const l of LANDMARKS) {
      expect(new Set(l.confusables).size).toBe(l.confusables.length)
      for (const id of l.confusables) {
        expect(isLandmarkId(id)).toBe(true)
        expect(id).not.toBe(l.id)
      }
      if (l.modeled) expect(l.confusables.length).toBeGreaterThan(0)
    }
  })

  it('値の範囲：難しさ1〜3、緯度経度、日本の名所は日本の中', () => {
    for (const l of LANDMARKS) {
      expect([1, 2, 3]).toContain(l.difficulty)
      expect(l.lat).toBeGreaterThanOrEqual(-90)
      expect(l.lat).toBeLessThanOrEqual(90)
      expect(l.lon).toBeGreaterThanOrEqual(-180)
      expect(l.lon).toBeLessThanOrEqual(180)
      expect(l.name.length).toBeGreaterThan(0)
      expect(l.place.length).toBeGreaterThan(0)
      expect(l.officialName.length).toBeGreaterThan(0)
      if (l.scope === 'japan') {
        expect(l.lat).toBeGreaterThan(24)
        expect(l.lat).toBeLessThan(46)
        expect(l.lon).toBeGreaterThan(122)
        expect(l.lon).toBeLessThan(154)
      }
    }
  })

  it('どの範囲にも、やさしい名所（難しさ1）が2つ以上、難しさ2以上が1つ以上ある（出題の決まりを守れる）', () => {
    for (const scope of ['japan', 'world', 'all'] as Scope[]) {
      const modeled = landmarksInScope(scope, { modeledOnly: true })
      expect(modeled.filter((l) => l.difficulty === 1).length).toBeGreaterThanOrEqual(2)
      expect(modeled.filter((l) => l.difficulty >= 2).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('使わないと決めた名所（権利・題材の重さ）が入っていない', () => {
    const names = LANDMARKS.map((l) => l.name).join('／')
    for (const banned of ['スカイツリー', 'オペラハウス', '原爆ドーム']) expect(names).not.toContain(banned)
  })

  it('調べる値の表（landmark-facts.ts）は名所と過不足なく対応する', () => {
    expect(Object.keys(LANDMARK_FACTS).sort()).toEqual(LANDMARKS.map((l) => l.id).sort())
    expect(getLandmark('kinkakuji')?.place).toBe('京都府京都市')
    expect(getLandmark('nope')).toBeUndefined()
  })

  it('調べ終わった表なら、模型のある名所すべてに豆知識と出典がある', () => {
    for (const l of LANDMARKS) {
      if (FACTS_STATUS === 'researched' && l.modeled) {
        expect(l.fact.length).toBeGreaterThan(0)
        expect(l.factSources.length).toBeGreaterThan(0)
        for (const src of l.factSources) expect(src.url).toMatch(/^https:\/\//)
      }
      if (FACTS_STATUS === 'provisional') expect(l.fact).toBe('') // 確かめる前の豆知識は書かない
    }
  })
})
