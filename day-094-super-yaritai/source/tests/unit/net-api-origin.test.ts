import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserNetEnv, resolveApiOrigin } from '../../src/client/net/env'
import { isLocalHostname, WORKER_ORIGIN } from '../../src/shared/hosts'

const locationOf = (url: string) => new URL(url)
afterEach(() => vi.unstubAllGlobals())

describe('画面から決める API の接続先', () => {
  it.each(['https://day94.rairakku.com', 'https://super-yaritai-day94.pages.dev'])('Pages %s は Worker につなぐ', (origin) => {
    expect(resolveApiOrigin(locationOf(origin))).toBe(WORKER_ORIGIN)
    expect(resolveApiOrigin(locationOf(`${origin}/?api=http://localhost:8798`))).toBe(WORKER_ORIGIN)
  })

  it.each([WORKER_ORIGIN, 'http://localhost:5332', 'https://unknown.example', 'https://day94.rairakku.com.evil.example'])('%s は同じ origin を使う', (origin) => {
    expect(resolveApiOrigin(locationOf(origin))).toBe(origin)
    expect(resolveApiOrigin(locationOf(`${origin}/?api=https://evil.example`))).toBe(origin)
  })

  it.each([
    ['http://localhost:8798', 'http://localhost:8798'],
    ['http://localhost:8798/api/rooms?q=1#x', 'http://localhost:8798'],
    ['https://127.0.0.1:8798/a', 'https://127.0.0.1:8798'],
    ['http://[::1]:8798/a', 'http://[::1]:8798'],
    ['https://evil.example', 'http://localhost:5332'],
    ['http://localhost.evil.example:8798', 'http://localhost:5332'],
    ['http://localhost@evil.example:8798', 'http://localhost:5332'],
    ['ftp://localhost:8798', 'http://localhost:5332'],
    ['javascript:alert(1)', 'http://localhost:5332'],
    ['broken-url', 'http://localhost:5332'],
    ['', 'http://localhost:5332'],
  ])('localhost の api=%s は %s', (api, expected) => {
    expect(resolveApiOrigin(locationOf(`http://localhost:5332/?api=${encodeURIComponent(api)}`))).toBe(expected)
  })

  it.each(['localhost', '127.0.0.1', '[::1]'])('%s の画面では localhost の上書きが使える', (hostname) => {
    expect(resolveApiOrigin(locationOf(`http://${hostname}:5332/?api=http://localhost:8798`))).toBe('http://localhost:8798')
  })

  it('公開先の画面は localhost への上書きを使わない', () => {
    for (const origin of [WORKER_ORIGIN, 'https://unknown.example']) {
      expect(resolveApiOrigin(locationOf(`${origin}/?api=http://localhost:8798`))).toBe(origin)
    }
  })

  it.each(['localhost', '127.0.0.1', '[::1]', '::1'])('ローカルのホスト名 %s を受ける', (hostname) => {
    expect(isLocalHostname(hostname)).toBe(true)
  })

  it.each(['localhost.evil.example', 'LOCALHOST', '127.0.0.2', 'example.com', ''])('ローカル以外の %s は受けない', (hostname) => {
    expect(isLocalHostname(hostname)).toBe(false)
  })
})

describe('ブラウザの通信先', () => {
  it.each([
    ['https://day94.rairakku.com', WORKER_ORIGIN, WORKER_ORIGIN.replace('https:', 'wss:')],
    ['https://super-yaritai-day94.pages.dev', WORKER_ORIGIN, WORKER_ORIGIN.replace('https:', 'wss:')],
    [WORKER_ORIGIN, WORKER_ORIGIN, WORKER_ORIGIN.replace('https:', 'wss:')],
    ['http://localhost:5332', 'http://localhost:5332', 'ws://localhost:5332'],
    ['http://localhost:5332/?api=http://localhost:8798', 'http://localhost:8798', 'ws://localhost:8798'],
    ['http://localhost:5332/?api=https://localhost:8798/path', 'https://localhost:8798', 'wss://localhost:8798'],
    ['http://localhost:5332/?api=https://evil.example', 'http://localhost:5332', 'ws://localhost:5332'],
    ['https://day94.rairakku.com/?api=http://localhost:8798', WORKER_ORIGIN, WORKER_ORIGIN.replace('https:', 'wss:')],
    ['https://unknown.example', 'https://unknown.example', 'wss://unknown.example'],
  ])('%s の httpBase と wsBase', (url, httpBase, wsBase) => {
    vi.stubGlobal('location', locationOf(url))
    const env = browserNetEnv()
    expect(env.httpBase).toBe(httpBase)
    expect(env.wsBase).toBe(wsBase)
  })

  it('Node では従来の localhost を使う', () => {
    vi.stubGlobal('location', undefined)
    const env = browserNetEnv()
    expect(env.httpBase).toBe('http://localhost')
    expect(env.wsBase).toBe('ws://localhost')
  })
})
