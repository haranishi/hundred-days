import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { browserRejection, createApiGuard } from '../../functions/api/_middleware.js';

const START = 1_800_000_000_000;
const FIXTURE_KEY = 'test-only-proxy-secret-with-at-least-32-characters';
const api = 'https://hundred-days.pages.dev/api/day-030/windy?status=1';
function memoryCache() {
  const data = new Map();
  return { data, async match(key) { return data.get(key.url)?.clone(); },
    async put(key, value) { data.set(key.url, value.clone()); } };
}
function fixture(options = {}) {
  const cache = options.cache === undefined ? memoryCache() : options.cache;
  let time = START, calls = 0;
  const guard = createApiGuard({ cache, now: () => time, maxClients: options.maxClients ?? 2048 });
  const request = (url = api, headers = {}, method = 'GET', env = {}) => guard({
    request: new Request(url, { method, headers: { 'cf-connecting-ip': '203.0.113.7', ...headers } }),
    env, next: async () => { calls++; return new Response('downstream', { headers: { 'x-app': 'unchanged' } }); },
  });
  return { cache, guard, request, get calls() { return calls; },
    get time() { return time; }, advance(ms) { time += ms; } };
}
async function limited(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.ok(Number(response.headers.get('retry-after')) >= 1);
  assert.equal(typeof (await response.json()).error, 'string');
}
function proof({ ip = '203.0.113.7', time = START, url = api, secret = FIXTURE_KEY, method = 'GET' } = {}) {
  const id = createHash('sha256').update(ip).digest('hex');
  const stamp = String(Math.floor(time / 1000));
  const u = new URL(url);
  const message = JSON.stringify(['hundred-days-api-v1', stamp, id, method, u.pathname + u.search]);
  return { 'cf-connecting-ip': '2a06:98c0:3600::103', 'x-hundred-client': id, 'x-hundred-time': stamp,
    'x-hundred-signature': createHmac('sha256', secret).update(message).digest('hex') };
}
const proxyEnv = { HUNDRED_DAYS_API_PROXY_SECRET: FIXTURE_KEY };

test('通常のAPI応答とヘッダーをそのまま返し、静的ページに制限を掛けない', async () => {
  const f = fixture();
  const result = await f.request();
  assert.equal(await result.text(), 'downstream');
  assert.equal(result.headers.get('x-app'), 'unchanged');
  for (let i = 0; i < 80; i++) assert.equal((await f.request('https://hundred-days.pages.dev/day-080-fifth-prince/')).status, 200);
  assert.equal(f.cache.data.size, 1);
});
test('同じIPから21回連打すると、21回目は後段を呼ばない', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) assert.equal((await f.request()).status, 200);
  await limited(await f.request(), 429);
  assert.equal(f.calls, 20);
});
test('APIのパス・クエリ・User-Agent・X-Forwarded-Forを変えても枠を増やさない', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) await f.request(api + '&q=' + i, { 'x-forwarded-for': '192.0.2.' + i, 'user-agent': 'agent-' + i });
  await limited(await f.request('https://hundred-days.pages.dev/api/day-009/vehicles'), 429);
  assert.equal(f.calls, 20);
});
test('異なる接続元IPは同時に通常利用できる', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) await f.request();
  assert.equal((await f.request(api, { 'cf-connecting-ip': '2001:db8::8' })).status, 200);
  assert.equal(f.calls, 21);
});
test('10秒窓の待ち時間が終わると再開する', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) await f.request();
  f.advance(9_500);
  const result = await f.request();
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '1');
  f.advance(500);
  assert.equal((await f.request()).status, 200);
});
test('分の固定窓では60回を超えず、次の分で復帰する', async () => {
  const f = fixture();
  for (let group = 0; group < 3; group++) {
    for (let i = 0; i < 20; i++) assert.equal((await f.request()).status, 200);
    f.advance(10_000);
  }
  const result = await f.request();
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '30');
  assert.equal(f.calls, 60);
  f.advance(30_000);
  assert.equal((await f.request()).status, 200);
});
test('45件の同時要求でも、後段へ進むのは20件まで', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 45 }, () => f.request()));
  assert.equal(responses.filter(r => r.status === 200).length, 20);
  assert.equal(responses.filter(r => r.status === 429).length, 25);
  assert.equal(f.calls, 20);
});
test('別の実行環境でもCache APIの既存カウンターを見る', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) await f.request();
  const other = fixture({ cache: f.cache });
  await limited(await other.request(), 429);
  assert.equal(other.calls, 0);
});
test('Cookie・認証情報・生のIP・要求URLを保存せず、専用のキーを使う', async () => {
  const f = fixture();
  await f.request(api + '&url=https%3A%2F%2Fexample.com%2Fprivate', { cookie: 'private-cookie', authorization: 'private-auth' });
  assert.equal(f.cache.data.size, 1);
  const [[key, value]] = f.cache.data;
  assert.match(key, /^https:\/\/api-abuse\.invalid\/v1\/[a-f0-9]{64}$/);
  const stored = key + await value.clone().text();
  for (const privateValue of ['203.0.113.7', 'private-cookie', 'private-auth', 'example.com', 'status=1']) assert.ok(!stored.includes(privateValue));
});
for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
  test(method + 'を上流処理の前に405で拒否する', async () => {
    const f = fixture();
    const r = await f.request(api, {}, method);
    assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET'); assert.equal(f.calls, 0);
  });
}
for (const headers of [{ origin: 'https://untrusted.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
  test('別サイト発のブラウザ要求を後段の前に拒否: ' + JSON.stringify(headers), async () => {
    const f = fixture();
    assert.equal((await f.request(api, headers)).status, 403);
    assert.equal(f.calls, 0);
  });
}
test('同一サイト・正式中継・通常の監視ツールは許可する', async () => {
  for (const headers of [{}, { origin: 'https://hundred-days.pages.dev', 'sec-fetch-site': 'same-origin' },
    { origin: 'https://rairakku.com', 'sec-fetch-site': 'same-origin' }, { 'user-agent': 'curl/monitor' }]) {
    assert.equal(browserRejection(new Request(api, { headers })), null);
  }
});
test('過大なURLと緊急停止はCacheにも後段にも進まない', async () => {
  let touched = false;
  const f = fixture({ cache: { match() { touched = true; } } });
  assert.equal((await f.request(api + '&q=' + 'a'.repeat(8200))).status, 414);
  await limited(await f.request(api, {}, 'GET', { PUBLIC_APIS_DISABLED: '1' }), 503);
  assert.equal(touched, false); assert.equal(f.calls, 0);
});
for (const kind of ['missing', 'read', 'write', 'invalid-json', 'invalid-count']) {
  test('状態保存の異常時は503で止める: ' + kind, async () => {
    const cache = memoryCache();
    if (kind === 'read') cache.match = async () => { throw new Error('cache unavailable'); };
    if (kind === 'write') cache.put = async () => { throw new Error('cache unavailable'); };
    if (kind === 'invalid-json') cache.match = async () => new Response('invalid');
    if (kind === 'invalid-count') cache.match = async () => Response.json({ minuteCount: -1 });
    const f = fixture({ cache: kind === 'missing' ? null : cache });
    await limited(await f.request(), 503);
    assert.equal(f.calls, 0);
  });
}
test('保持するクライアント数に上限があり、期限後に回収する', async () => {
  const f = fixture({ maxClients: 2 });
  await f.request();
  await f.request(api, { 'cf-connecting-ip': '203.0.113.8' });
  await limited(await f.request(api, { 'cf-connecting-ip': '203.0.113.9' }), 503);
  f.advance(60_001);
  assert.equal((await f.request(api, { 'cf-connecting-ip': '203.0.113.9' })).status, 200);
});
test('正しい中継署名は通り、直接アクセスと同じ利用枠になる', async () => {
  const f = fixture();
  for (let i = 0; i < 19; i++) await f.request();
  assert.equal((await f.request(api, proof(), 'GET', proxyEnv)).status, 200);
  await limited(await f.request(api, proof(), 'GET', proxyEnv), 429);
  assert.equal(f.calls, 20);
});
test('中継経由でも別の利用者を同じ固定IPの枠へ押し込まない', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) await f.request(api, proof(), 'GET', proxyEnv);
  assert.equal((await f.request(api, proof({ ip: '203.0.113.8' }), 'GET', proxyEnv)).status, 200);
});
test('署名のない別ゾーンWorkerは拒否する', async () => {
  const f = fixture();
  assert.equal((await f.request(api, { 'cf-connecting-ip': '2a06:98c0:3600::103' })).status, 403);
  assert.equal(f.calls, 0);
});
for (const kind of ['signature', 'client', 'expired', 'future', 'path', 'query', 'partial']) {
  test('中継の偽装・使い回しを拒否: ' + kind, async () => {
    const f = fixture();
    const headers = proof({ time: kind === 'expired' ? START - 31_000 : kind === 'future' ? START + 31_000 : START });
    if (kind === 'signature') headers['x-hundred-signature'] = '0'.repeat(64);
    if (kind === 'client') headers['x-hundred-client'] = 'f'.repeat(64);
    if (kind === 'partial') delete headers['x-hundred-time'];
    const target = kind === 'path' ? api.replace('day-030', 'day-025') : kind === 'query' ? api + '&id=12' : api;
    assert.equal((await f.request(target, headers, 'GET', proxyEnv)).status, 403);
    assert.equal(f.calls, 0);
  });
}
test('中継署名が届いても秘密キーが未設定なら後段へ進めない', async () => {
  const f = fixture();
  await limited(await f.request(api, proof()), 503);
  assert.equal(f.calls, 0);
});
test('Cacheが復旧すれば同じクライアントも再開できる', async () => {
  const f = fixture();
  const realPut = f.cache.put;
  f.cache.put = async () => { throw new Error('temporary failure'); };
  await limited(await f.request(), 503);
  f.cache.put = realPut;
  assert.equal((await f.request()).status, 200);
});

test('識別処理が遅れて固定窓をまたいでも、新しい窓の使用数を消さない', async () => {
  const f = fixture();
  const original = crypto.subtle.verify;
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { entered = resolve; });
  let first = true;
  crypto.subtle.verify = async function (...args) {
    if (first) { first = false; entered(); await gate; }
    return original.apply(this, args);
  };
  try {
    const slow = f.request(api, proof(), 'GET', proxyEnv);
    await waiting;
    f.advance(10_000);
    for (let i = 0; i < 20; i++) assert.equal((await f.request(api, proof({ time: f.time }), 'GET', proxyEnv)).status, 200);
    release();
    assert.equal((await slow).status, 429);
    assert.equal((await f.request(api, proof({ time: f.time }), 'GET', proxyEnv)).status, 429);
  } finally { release(); crypto.subtle.verify = original; }
});
test('検証済みの利用者識別はDay74自身の制限にも届く', async () => {
  const previousCaches = globalThis.caches;
  const previousNow = Date.now;
  Date.now = () => START;
  try {
    for (const route of ['trace', 'around']) {
      const cache = memoryCache();
      globalThis.caches = { default: cache };
      const guard = createApiGuard({ cache, now: () => START });
      const entry = await import('../../functions/api/day-074/' + route + '.js');
      const path = route === 'trace' ? 'trace?url=http%3A%2F%2Flocalhost%2F' : 'around?host=localhost&scheme=https';
      const url = 'https://hundred-days.pages.dev/api/day-074/' + path;
      const run = ip => {
        const context = { request: new Request(url, { headers: proof({ ip, url }) }), data: {},
          env: { ...proxyEnv, LINK_DOKUMI_RATE_LIMIT: '1' } };
        context.next = () => entry.onRequestGet(context);
        return guard(context);
      };
      assert.equal((await run('203.0.113.7')).status, 200);
      assert.equal((await run('203.0.113.7')).status, 429);
      assert.equal((await run('203.0.113.8')).status, 200, route + ': 別の利用者を同じ枠にしない');
    }
  } finally { globalThis.caches = previousCaches; Date.now = previousNow; }
});
