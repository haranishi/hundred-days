import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTrains, onRequest } from '../../functions/api/day-044/trains.js';
import { RAILWAY } from '../lib/network.js';
const now = Date.parse('2026-09-20T12:00:00+09:00');
const raw = { 'odpt:railway': RAILWAY, 'owl:sameAs': 'test-train', 'odpt:trainNumber': 'TEST01', 'odpt:railDirection': 'odpt.RailDirection:InnerLoop', 'odpt:fromStation': 'odpt.Station:JR-East.Yamanote.ShinOkubo', 'odpt:toStation': 'odpt.Station:JR-East.Yamanote.Shinjuku', 'odpt:destinationStation': ['odpt.Station:JR-East.Yamanote.Osaki'], 'dc:date': new Date(now).toISOString(), 'dct:valid': new Date(now + 30000).toISOString() };
const context = (env = {}) => ({ request: new Request('https://example.test/api/day-044/trains'), env });
// この値はテスト専用の架空値。実際の認証情報は使用しない。
const fakeCredential = 'test-only-not-a-real-key';
const configured = () => context({ ODPT_CHALLENGE_TOKEN: fakeCredential, ODPT_USE_CONFIRMED: 'true' });
test('本番ハンドラはキー設定があっても実データを公開しない', async () => {
  const response = await onRequest(configured());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'DEMO_ONLY' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('未設定・条件未確認では上流へアクセスしない', async () => {
  const fetcher = () => { throw new Error('Should not fetch'); };
  assert.equal((await handleTrains(context(), { fetch: fetcher })).status, 503);
  const pending = await handleTrains(context({ ODPT_CHALLENGE_TOKEN: fakeCredential }), { fetch: fetcher });
  assert.deepEqual(await pending.json(), { code: 'ACCESS_PENDING' });
});
test('山手線に限定して取得し、キーや生データを応答に含めない', async () => {
  let requestUrl;
  const response = await handleTrains(configured(), { now: () => now, fetch: async url => { requestUrl = new URL(url); return Response.json([{ ...raw, privateExtra: 'not-returned' }]); } });
  assert.equal(requestUrl.hostname, 'api-challenge.odpt.org');
  assert.equal(requestUrl.searchParams.get('odpt:railway'), RAILWAY);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes(fakeCredential) && !text.includes('privateExtra'));
  assert.equal(JSON.parse(text).status, 'live');
});
test('配信0件と古い情報と形式変更を区別する', async () => {
  const run = data => handleTrains(configured(), { now: () => now, fetch: async () => Response.json(data) });
  assert.equal((await (await run([])).json()).status, 'empty');
  assert.equal((await (await run([{ ...raw, 'dc:date': new Date(now - 200000).toISOString() }])).json()).status, 'stale');
  assert.equal((await run({ trains: [] })).status, 502);
  assert.equal((await (await run([{ ...raw, 'odpt:railDirection': 'changed-schema' }])).json()).code, 'UNSUPPORTED_UPSTREAM');
});
test('上流の認証失敗・例外の本文や認証URLを外へ漏らさない', async () => {
  const response = await handleTrains(configured(), { fetch: async () => new Response('secret-response', { status: 403 }) });
  assert.deepEqual(await response.json(), { code: 'ACCESS_DENIED' });
  const failure = await handleTrains(configured(), { fetch: async url => { throw new Error(url); } });
  assert.deepEqual(await failure.json(), { code: 'UPSTREAM_UNAVAILABLE' });
});
test('サイズ超過の上流レスポンスを打ち切る', async () => {
  const response = await handleTrains(configured(), { fetch: async () => new Response('x'.repeat(1_000_001)) });
  assert.equal(response.status, 502);
});
test('キャッシュキーからクエリを除き、保存はwaitUntilで待つ', async () => {
  let savedKey, pending;
  const c = configured(); c.request = new Request('https://example.test/api/day-044/trains?random=1'); c.waitUntil = promise => { pending = promise; };
  const cache = { match: async () => null, put: async key => { savedKey = key.url; } };
  const response = await handleTrains(c, { cache, now: () => now, fetch: async () => Response.json([raw]) });
  await pending; assert.equal(savedKey, 'https://example.test/api/day-044/trains'); assert.match(response.headers.get('Cache-Control'), /s-maxage=30/);
});
