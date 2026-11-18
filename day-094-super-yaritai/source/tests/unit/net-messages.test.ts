import { describe, expect, it } from 'vitest'
import { PLAYER_CHARACTERS } from '../../src/client/contracts'
import type { MatchResult } from '../../src/shared/view'
import { sampleResult } from './net-fixtures'
import {
  DEFAULT_CHARACTERS,
  MAX_TEXT_CHARS,
  parseClientMessage,
  parseLobbyMessage,
  parseMatchResult,
  parseRoomView,
  parseServerMessage,
} from '../../src/shared/protocol'

const SAMPLE_CREDENTIAL = 'abcdefghijklmnopqrstuvwxyzABCDEF'

describe('端末→部屋の JSON', () => {
  it('決まった形のものだけを通し、知らない欄は落とす', () => {
    expect(parseClientMessage('{"type":"hello","name":" たろう ","character":"ch/character-male-a","token":"' + SAMPLE_CREDENTIAL + '","x":1}')).toEqual({
      type: 'hello',
      name: 'たろう',
      character: 'ch/character-male-a',
      token: SAMPLE_CREDENTIAL,
    })
    expect(parseClientMessage({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(parseClientMessage({ type: 'config', duration: 180 })).toEqual({ type: 'config', duration: 180 })
    expect(parseClientMessage({ type: 'start', extra: true })).toEqual({ type: 'start' })
    expect(parseClientMessage({ type: 'rematch' })).toEqual({ type: 'rematch' })
    expect(parseClientMessage({ type: 'ping', t: 12.5 })).toEqual({ type: 'ping', t: 12.5 })
    expect(parseClientMessage({ type: 'bye' })).toEqual({ type: 'bye' })
    const final = parseClientMessage({ type: 'final', round: 2, result: sampleResult() })
    expect(final).toEqual({ type: 'final', round: 2, result: sampleResult() })
  })

  it('型・範囲・長さが合わないものは null', () => {
    const bad: unknown[] = [
      'not json',
      '',
      'x'.repeat(MAX_TEXT_CHARS + 1),
      '[]',
      null,
      { type: 'dance' },
      { type: 'hello', name: 5 },
      { type: 'hello', name: 'あ'.repeat(200) },
      { type: 'hello', character: '../../etc' },
      { type: 'hello', character: 'mm/character-employee' },
      { type: 'hello', token: 'short' },
      { type: 'config', duration: 100 },
      { type: 'config', duration: '120' },
      { type: 'ping', t: -1 },
      { type: 'ping', t: Number.NaN },
      { type: 'final', round: 0, result: sampleResult() },
      { type: 'final', round: 1, result: { ...sampleResult(), damage: 2 } },
    ]
    for (const b of bad) expect(parseClientMessage(b), JSON.stringify(b)?.slice(0, 80)).toBeNull()
  })

  it('継承した欄（__proto__ など）は読まない', () => {
    const tricky = JSON.parse('{"__proto__":{"type":"start"}}') as unknown
    expect(parseClientMessage(tricky)).toBeNull()
  })
})

describe('最終結果（final）の確かめ', () => {
  it('名前と称号は整え、ほかの欄はそのまま通す', () => {
    const r = parseMatchResult(sampleResult({ players: [{ ...sampleResult().players[0]!, name: 'た\nろう​です長い名前', title: '\u0007称号' }] , winnerSlots: [0] }))
    expect(r?.players[0]?.name).toBe('たろうです長い名')
    expect(r?.players[0]?.title).toBe('称号')
  })

  it('内訳の外の加点（extras：完全制覇・ひみつ）を受け付け、行の名前は整える', () => {
    const p = sampleResult().players[0]!
    const extras = [
      { label: 'やっちゃダメ全制覇', points: 3000 },
      { label: 'ひみつ\n「カートで缶ピラミッドに突っ込む」', points: 800 },
    ]
    const r = parseMatchResult(sampleResult({ players: [{ ...p, extras }], winnerSlots: [0] }))
    expect(r?.players[0]?.extras).toEqual([
      { label: 'やっちゃダメ全制覇', points: 3000 },
      { label: 'ひみつ「カートで缶ピラミッドに突っ込む」', points: 800 },
    ])
    // extras が無い人には付けない
    expect(parseMatchResult(sampleResult())?.players[0]).not.toHaveProperty('extras')
    // 壊れた extras は結果ごと捨てる
    expect(parseMatchResult(sampleResult({ players: [{ ...p, extras: [{ label: 'x', points: Number.NaN }] }], winnerSlots: [0] }))).toBeNull()
    expect(parseMatchResult(sampleResult({ players: [{ ...p, extras: 'x' as never }], winnerSlots: [0] }))).toBeNull()
  })

  it('壊れた結果は null', () => {
    const p = sampleResult().players[0]!
    const bad: MatchResult[] = [
      sampleResult({ players: [] }),
      sampleResult({ players: [p, p] }), // 同じ slot が2人
      sampleResult({ winnerSlots: [3] }), // いない人が勝ち
      sampleResult({ players: [{ ...p, achieved: ['bell', 'bell'] }], winnerSlots: [0] }),
      sampleResult({ players: [{ ...p, achieved: ['fly' as never] }], winnerSlots: [0] }),
      sampleResult({ players: [{ ...p, breakdown: { dance: { count: 1, points: 1 } } as never }], winnerSlots: [0] }),
      sampleResult({ players: [{ ...p, score: Number.POSITIVE_INFINITY }], winnerSlots: [0] }),
      sampleResult({ players: [{ ...p, rank: 0 }], winnerSlots: [0] }),
      sampleResult({ players: [{ ...p, slot: 4 }], winnerSlots: [] }),
    ]
    for (const b of bad) expect(parseMatchResult(b)).toBeNull()
  })
})

describe('部屋→端末の JSON（端末の側で確かめる）', () => {
  const room = {
    code: 'K7QM',
    kind: 'friends',
    phase: 'countdown',
    hostSlot: 0,
    members: [
      { slot: 0, name: 'たろう', character: 'ch/character-female-b', connected: true },
      { slot: 1, name: 'はなこ', character: 'ch/character-male-f', connected: false },
    ],
    duration: 120,
    round: 1,
    startAt: 1_800_000_000_000,
    seed: 4_000_000_000,
  }

  it('welcome・room・result・host-left・pong・error が通る', () => {
    expect(parseServerMessage({ type: 'welcome', slot: 1, token: SAMPLE_CREDENTIAL, code: 'K7QM', serverNow: 5 })).toEqual({
      type: 'welcome',
      slot: 1,
      token: SAMPLE_CREDENTIAL,
      code: 'K7QM',
      serverNow: 5,
    })
    expect(parseServerMessage({ type: 'room', serverNow: 1, room })).toEqual({ type: 'room', serverNow: 1, room })
    expect(parseServerMessage({ type: 'result', round: 1, result: sampleResult() })?.type).toBe('result')
    expect(parseServerMessage({ type: 'host-left', round: 3 })).toEqual({ type: 'host-left', round: 3 })
    expect(parseServerMessage({ type: 'pong', t: 1, serverNow: 2 })).toEqual({ type: 'pong', t: 1, serverNow: 2 })
    expect(parseServerMessage({ type: 'error', code: 'room-full' })).toEqual({ type: 'error', code: 'room-full' })
  })

  it('おかしな部屋の形・知らない理由は null', () => {
    expect(parseRoomView({ ...room, code: 'K0QM' })).toBeNull()
    expect(parseRoomView({ ...room, phase: 'party' })).toBeNull()
    expect(parseRoomView({ ...room, hostSlot: 9 })).toBeNull()
    expect(parseRoomView({ ...room, members: [room.members[0], room.members[0]] })).toBeNull()
    expect(parseRoomView({ ...room, seed: -1 })).toBeNull()
    expect(parseServerMessage({ type: 'error', code: 'because' })).toBeNull()
    expect(parseServerMessage({ type: 'welcome', slot: 1, token: 'x', code: 'K7QM', serverNow: 5 })).toBeNull()
  })

  it('相手探しの知らせ', () => {
    expect(parseLobbyMessage('{"type":"waiting"}')).toEqual({ type: 'waiting' })
    expect(parseLobbyMessage({ type: 'matched', code: 'K7QM', ticket: SAMPLE_CREDENTIAL })).toEqual({ type: 'matched', code: 'K7QM', ticket: SAMPLE_CREDENTIAL })
    expect(parseLobbyMessage({ type: 'matched', code: 'K7Q', ticket: SAMPLE_CREDENTIAL })).toBeNull()
    expect(parseLobbyMessage({ type: 'error', code: 'daily-limit' })).toEqual({ type: 'error', code: 'daily-limit' })
  })
})

describe('キャラの既定の並び', () => {
  it('Worker が写して持つ並びは、画面のキャラ選び（PLAYER_CHARACTERS）と同じ', () => {
    expect([...DEFAULT_CHARACTERS]).toEqual(PLAYER_CHARACTERS.map((c) => c.key))
  })
})
