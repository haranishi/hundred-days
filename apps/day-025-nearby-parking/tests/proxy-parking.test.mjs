import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuery, fetchUpstream, onRequestGet, parseParams, roundCoord, TIMEOUT_MS, trimElements,
} from '../../../functions/api/day-025/parking.js';

const params = (query) => new URL(`https://x/api/day-025/parking${query}`).searchParams;
const ctx = (query) => ({ request: new Request(`https://x/api/day-025/parking${query}`) });
const upstream = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('座標は約110m四方に丸める（近い場所からの検索が同じキャッシュを引く）', () => {
  assert.equal(roundCoord(39.717612), 39.718);
  assert.equal(roundCoord(140.130554), 140.131);
});

test('引数の検証: 緯度経度の範囲と、許可した半径だけ通す', () => {
  assert.deepEqual(parseParams(params('?lat=39.7176&lng=140.1305&radius=800')), { lat: 39.718, lng: 140.131, radius: 800 });
  assert.equal(parseParams(params('?lat=91&lng=140&radius=800')), null);
  assert.equal(parseParams(params('?lat=39&lng=181&radius=800')), null);
  assert.equal(parseParams(params('?lat=39&lng=140&radius=50')), null, '任意の半径を通すと上流の負荷を制御できない');
  assert.equal(parseParams(params('?lat=abc&lng=140&radius=800')), null);
});

test('クエリはamenity=parkingに限り、上限500件で出す', () => {
  const query = buildQuery(39.718, 140.131, 800);
  assert.match(query, /nwr\["amenity"="parking"\]\(around:800,39\.718,140\.131\)/);
  assert.match(query, /out tags center 500;/);
});

test('返す項目は画面が使うタグだけに削る（上流の1日10MBの枠を延ばす）', () => {
  const [node] = trimElements([{
    type: 'node', id: 1, lat: 39.7, lon: 140.1,
    tags: { amenity: 'parking', name: 'A', fee: 'yes', operator: '誰か', 'survey:date': '2020-01-01' },
  }]);
  assert.deepEqual(Object.keys(node.tags).sort(), ['amenity', 'fee', 'name']);
  assert.equal(node.tags.operator, undefined);
});

test('座標を持たない要素は落とす／way・relationはcenterを使う', () => {
  const trimmed = trimElements([
    { type: 'way', id: 2, center: { lat: 39.7, lon: 140.1 }, tags: {} },
    { type: 'way', id: 3, tags: {} },
    null,
  ]);
  assert.equal(trimmed.length, 1);
  assert.deepEqual(trimmed[0].center, { lat: 39.7, lon: 140.1 });
});

test('上流には識別できるUser-Agentを付ける（Overpassの利用方針の要求）', async () => {
  let sent;
  await fetchUpstream('q', { fetchImpl: async (_url, init) => { sent = init; return upstream({ elements: [] }); } });
  assert.match(sent.headers['User-Agent'], /hundred-days-day025/);
  assert.match(sent.headers['User-Agent'], /hundred-days\.pages\.dev/);
});

test('1系統目が落ちたら2系統目へ回す', async () => {
  const calls = [];
  const data = await fetchUpstream('q', {
    timeoutMs: 100,
    fetchImpl: async (url) => { calls.push(url); return calls.length === 1 ? upstream({}, 504) : upstream({ elements: [1] }); },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(data.elements, [1]);
});

test('429・406は追い打ちしない（方針どおり30秒空ける側に倒す）', async () => {
  for (const status of [429, 406]) {
    const calls = [];
    await assert.rejects(
      fetchUpstream('q', { timeoutMs: 100, fetchImpl: async (url) => { calls.push(url); return upstream({}, status); } }),
      (error) => error.rateLimited === true,
    );
    assert.equal(calls.length, 1, `${status} で2系統目まで叩いてはいけない`);
  }
});

test('onRequestGet: 不正な引数は上流に行かず400', async () => {
  let called = false;
  const response = await onRequestGet(ctx('?lat=abc'), { fetchImpl: async () => { called = true; } });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test('onRequestGet: 正常系はelementsと出典を返し、長くキャッシュさせる', async () => {
  const response = await onRequestGet(ctx('?lat=39.7176&lng=140.1305&radius=800'), {
    fetchImpl: async () => upstream({ elements: [{ type: 'node', id: 1, lat: 39.7, lon: 140.1, tags: { fee: 'no' } }] }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /s-maxage=604800/);
  const body = await response.json();
  assert.equal(body.elements.length, 1);
  assert.equal(body.source.license, 'ODbL 1.0');
  assert.deepEqual(body.center, { lat: 39.718, lng: 140.131 });
});

test('onRequestGet: 上流のレート制限は429とRetry-Afterで返す', async () => {
  const response = await onRequestGet(ctx('?lat=39.7&lng=140.1&radius=800'), { fetchImpl: async () => upstream({}, 429) });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('onRequestGet: 上流が落ちているときは502', async () => {
  const response = await onRequestGet(ctx('?lat=39.7&lng=140.1&radius=800'), { fetchImpl: async () => upstream({}, 500) });
  assert.equal(response.status, 502);
});

test('座標は緯度と経度の両方を必須にする（片方だけNaNの要素も落とす）', () => {
  const kept = trimElements([
    { type: 'node', id: 1, lat: 39.7, lon: Number.NaN, tags: {} },
    { type: 'node', id: 2, lat: Number.NaN, lon: 140.1, tags: {} },
    { type: 'way', id: 3, center: { lat: 39.7, lon: undefined }, tags: {} },
    { type: 'node', id: 4, lat: 39.7, lon: 140.1, tags: {} },
  ]);
  assert.deepEqual(kept.map((e) => e.id), [4]);
});

test('打ち切りは、上流に許した計算時間より必ず長くする', () => {
  const seconds = Number(buildQuery(39.7, 140.1, 800).match(/\[timeout:(\d+)\]/)[1]);
  assert.ok(TIMEOUT_MS > seconds * 1000,
    `打ち切り${TIMEOUT_MS}msが上流の${seconds}sより短いと、答えが来る前に必ず諦める`);
});
