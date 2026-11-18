import { describe, expect, it } from 'vitest'
import { allPseudonyms, NAME_MAX_CHARS, pseudonym, sanitizeName, splitGraphemes } from '../../src/shared/names'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from '../../src/shared/roomcode'
import { lcg } from './net-fixtures'

const randomInt = (rnd: () => number) => (max: number) => Math.floor(rnd() * max)

describe('あいことば', () => {
  it('4文字で、読み違えやすい文字（0・O・1・I・L）を使わない', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31)
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch)
    const rnd = lcg(3)
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(randomInt(rnd))
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)
      expect(isValidRoomCode(code)).toBe(true)
    }
  })

  it('入力の小文字・全角・空白・ハイフンをそろえる', () => {
    expect(normalizeRoomCode('k7qm')).toBe('K7QM')
    expect(normalizeRoomCode('ｋ７ｑｍ')).toBe('K7QM')
    expect(normalizeRoomCode(' K7 - QM ')).toBe('K7QM')
    expect(normalizeRoomCode(42)).toBe('')
  })

  it('形が合わないものは通さない', () => {
    for (const bad of ['K7Q', 'K7QMM', 'K0QM', 'KOQM', 'K1QM', 'KIQM', 'KLQM', 'k7qm', '', null, 1234]) {
      expect(isValidRoomCode(bad)).toBe(false)
    }
  })
})

describe('名前', () => {
  it('8文字までにし、制御文字・改行・見えない文字を消す', () => {
    expect(NAME_MAX_CHARS).toBe(8)
    expect(sanitizeName('  たろう  ')).toBe('たろう')
    expect(sanitizeName('あいうえおかきくけこ')).toBe('あいうえおかきく')
    expect(sanitizeName('た\nろ\tう')).toBe('たろう')
    expect(sanitizeName('た  ろ　う')).toBe('た ろ う')
    expect(sanitizeName('た​ろ‮う﻿')).toBe('たろう')
    expect(sanitizeName('\u0000\u0007')).toBeNull()
    expect(sanitizeName('   ')).toBeNull()
    expect(sanitizeName(12)).toBeNull()
  })

  it('絵文字は見た目の1文字として数える', () => {
    const family = '👨‍👩‍👧‍👦'
    const name = sanitizeName(family.repeat(10)) ?? ''
    expect(splitGraphemes(name)).toHaveLength(8)
  })

  it('結合文字を重ねすぎた文字は切る', () => {
    const zalgo = `a${'́'.repeat(30)}`
    const name = sanitizeName(zalgo) ?? ''
    expect([...name].length).toBeLessThanOrEqual(5)
  })
})

describe('相手探しの仮名', () => {
  it('「試食ハンター」のような64通りで、どれも8文字以内', () => {
    const all = allPseudonyms()
    expect(all).toHaveLength(64)
    expect(all).toContain('試食ハンター')
    expect(all).toContain('カート番長')
    for (const name of all) expect(splitGraphemes(name).length).toBeLessThanOrEqual(NAME_MAX_CHARS)
  })

  it('同じ部屋の相手と重ねない', () => {
    const rnd = lcg(11)
    for (let i = 0; i < 200; i++) {
      const a = pseudonym(randomInt(rnd))
      const b = pseudonym(randomInt(rnd), [a])
      expect(b).not.toBe(a)
    }
    // 全部が使われていても1つは返す
    expect(allPseudonyms()).toContain(pseudonym(() => 0, allPseudonyms()))
  })
})
