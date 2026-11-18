import { describe, expect, it } from 'vitest'
import { isAppOrigin, WORKER_ORIGIN } from '../../../src/shared/hosts'
import { corsHeaders, isAllowedOrigin, isSameOrigin } from '../../../src/worker/origin'

const REQUEST_URL = `${WORKER_ORIGIN}/api/rooms`
const APPS = ['https://day94.rairakku.com', 'https://super-yaritai-day94.pages.dev']
const DENIED = [
  'https://day94.rairakku.com.evil.example',
  'http://day94.rairakku.com',
  'https://day94.rairakku.com:8443',
  'https://day94.rairakku.com:443',
  'https://day94.rairakku.com/',
  'https://day94.rairakku.com/path',
  'https://DAY94.rairakku.com',
  'HTTPS://day94.rairakku.com',
  'https://evil.example',
  'https://super-yaritai-day94.pages.dev.evil.example',
  'https://super-yaritai-day94.pages.dev/',
  'https://day94.rairakku.com@evil.example',
  'http://localhost:5332',
  'http://127.0.0.1:5332',
  'http://[::1]:5332',
  'null',
  null,
  '',
  'broken-url',
  'https://[broken',
]

describe('Worker の Origin の境目', () => {
  it('同じホストは従来どおり受け、CORS は付けない', () => {
    expect(isSameOrigin(WORKER_ORIGIN, REQUEST_URL)).toBe(true)
    expect(isAllowedOrigin(WORKER_ORIGIN, REQUEST_URL)).toBe(true)
    expect(corsHeaders(WORKER_ORIGIN, REQUEST_URL)).toEqual({})
    expect(isSameOrigin('http://localhost:5332', 'http://localhost:8798/api/rooms')).toBe(false)
  })

  it.each(APPS)('%s を完全一致で許可し、その Origin を CORS に返す', (origin) => {
    expect(isAppOrigin(origin)).toBe(true)
    expect(isAllowedOrigin(origin, REQUEST_URL)).toBe(true)
    expect(corsHeaders(origin, REQUEST_URL)).toEqual({ 'access-control-allow-origin': origin, vary: 'Origin' })
  })

  it.each(DENIED)('公開 Worker に届いた %s は拒否し、CORS を付けない', (origin) => {
    if (origin !== null) expect(isAppOrigin(origin)).toBe(false)
    expect(isAllowedOrigin(origin, REQUEST_URL)).toBe(false)
    expect(corsHeaders(origin, REQUEST_URL)).toEqual({})
  })

  it.each([
    ['http://localhost:5332', 'http://localhost:8798/api/rooms'],
    ['http://127.0.0.1:5332', 'http://localhost:8798/api/rooms'],
    ['http://[::1]:5332', 'http://127.0.0.1:8798/api/rooms'],
    ['http://localhost:5332', 'http://[::1]:8798/api/rooms'],
    ['https://localhost:5332', 'http://localhost:8798/api/rooms'],
  ])('ローカルの画面 %s と Worker %s は別ポートでも通す', (origin, url) => {
    expect(isAllowedOrigin(origin, url)).toBe(true)
    expect(corsHeaders(origin, url)).toEqual({ 'access-control-allow-origin': origin, vary: 'Origin' })
  })

  it.each(['https://evil.example', 'http://localhost.evil.example:5332', 'null', null, 'broken-url'])('ローカル Worker でも %s は拒否する', (origin) => {
    expect(isAllowedOrigin(origin, 'http://localhost:8798/api/rooms')).toBe(false)
    expect(corsHeaders(origin, 'http://localhost:8798/api/rooms')).toEqual({})
  })

  it('CORS にワイルドカードや Cookie の許可を含めない', () => {
    for (const origin of [...APPS, ...DENIED, WORKER_ORIGIN]) {
      const headers = corsHeaders(origin, REQUEST_URL)
      expect(Object.values(headers)).not.toContain('*')
      expect(headers).not.toHaveProperty('access-control-allow-credentials')
    }
  })
})
