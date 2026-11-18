import { describe, expect, it } from 'vitest'
import { joinFailureText, lobbyModelOf, lostText, matchFailureText, noticeText } from '../../src/client/net/texts'
import type { JoinFailure } from '../../src/client/net/room-client'
import type { RoomView } from '../../src/shared/protocol'

const room: RoomView = {
  code: 'K7QM',
  kind: 'friends',
  phase: 'lobby',
  hostSlot: 0,
  members: [
    { slot: 0, name: 'あるじ', character: 'ch/character-male-e', connected: true },
    { slot: 1, name: 'さんか', character: 'ch/character-female-f', connected: true },
  ],
  duration: 180,
  round: 0,
  startAt: null,
  seed: null,
}

describe('待合室の形', () => {
  it('主の端末では「はじめる」が押せる（2人以上つながっているとき）。参加者では押せない', () => {
    const host = lobbyModelOf(room, 0, 'K7QM', 'https://example.test/?room=K7QM')
    expect(host).toMatchObject({ code: 'K7QM', isHost: true, duration: 180, canStart: true, url: 'https://example.test/?room=K7QM' })
    expect(host.players.map((p) => [p.slot, p.isHost, p.isYou])).toEqual([
      [0, true, true],
      [1, false, false],
    ])
    const guest = lobbyModelOf(room, 1, 'K7QM', 'u')
    expect(guest.isHost).toBe(false)
    expect(guest.canStart).toBe(false)
    expect(guest.players.find((p) => p.slot === 1)?.isYou).toBe(true)
  })

  it('1人しかつながっていない・試合中なら押せない。部屋がまだ届いていなければ自分だけの待合室', () => {
    const away = { ...room, members: [room.members[0]!, { ...room.members[1]!, connected: false }] }
    expect(lobbyModelOf(away, 0, 'K7QM', 'u').canStart).toBe(false)
    expect(lobbyModelOf({ ...room, phase: 'countdown' }, 0, 'K7QM', 'u').canStart).toBe(false)
    expect(lobbyModelOf(null, null, 'ABCD', 'u')).toMatchObject({ code: 'ABCD', players: [], isHost: false, canStart: false, duration: 120 })
  })
})

describe('文言', () => {
  it('入れなかった理由ごとに、何が起きたかと次にできることを出す', () => {
    const codes: JoinFailure[] = [
      'room-not-found',
      'room-full',
      'already-started',
      'bad-code',
      'name-required',
      'daily-limit',
      'rate-limited',
      'room-closed',
      'network',
      'not-host',
    ]
    const texts = codes.map(joinFailureText)
    for (const t of texts) expect(t.length).toBeGreaterThan(8)
    expect(joinFailureText('room-not-found')).toContain('見つかりませんでした')
    expect(joinFailureText('room-full')).toContain('4人まで')
    expect(joinFailureText('already-started')).toContain('始めています')
    expect(joinFailureText('daily-limit')).toContain('ひとりで遊ぶ')
    // 知らない理由はつながらなかった扱い
    expect(joinFailureText('not-host')).toBe(joinFailureText('network'))
  })

  it('戻れなかった・断られた・相手が見つからなかったときの文言', () => {
    expect(lostText(null)).toContain('ひとりで遊ぶ')
    expect(lostText('room-closed')).toContain('部屋が閉じられた')
    expect(noticeText('not-enough-players')).toContain('2人以上')
    expect(matchFailureText('timeout')).toContain('CPUと遊ぶ')
    expect(matchFailureText('daily-limit')).toBe(joinFailureText('daily-limit'))
  })
})
