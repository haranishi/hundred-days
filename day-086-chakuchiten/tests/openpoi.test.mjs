import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchNearby, searchPlaces } from '../lib/openpoi.js';

const center = { lat: 35.68, lng: 139.76 };
const answers = { mood: 'cafe', space: 'quiet', walk: 'near' };
const ok = (body) => ({ ok: true, json: async () => body });

test('nearbyはcenterを経度,緯度で送り、選択した半径と検索語を使う', async () => {
  const results = [{ name: '試験用カフェ' }];
  assert.deepEqual(await searchNearby(center, answers, { fetcher: async (url, options) => {
    assert.equal(url.origin, 'https://api.openpoiapi.com');
    assert.equal(url.pathname, '/v1/search');
    assert.equal(url.searchParams.get('center'), '139.76,35.68');
    assert.equal(url.searchParams.get('radius'), '180');
    assert.ok(url.searchParams.get('q').includes('カフェ'));
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return ok({ results });
  } }), results);
});
test('散歩を選ぶと半径600mになる', async () => {
  await searchNearby(center, { ...answers, walk: 'stroll' }, { fetcher: async (url) => {
    assert.equal(url.searchParams.get('radius'), '600'); return ok({ results: [] });
  } });
});
test('入力不正なら通信しない', async () => {
  let calls = 0;
  await assert.rejects(searchNearby({}, answers, { fetcher: () => { calls++; } }), { code: 'input' });
  await assert.rejects(searchPlaces('a', { fetcher: () => { calls++; } }), { code: 'input' });
  assert.equal(calls, 0);
});
test('正常な0件は失敗と区別する', async () => {
  assert.deepEqual(await searchNearby(center, answers, { fetcher: async () => ok({ results: [] }) }), []);
});
for (const [status, code] of [[429, 'busy'], [500, 'http'], [400, 'http']]) {
  test(`HTTP ${status}を${code}として返す`, async () => {
    await assert.rejects(searchNearby(center, answers, { fetcher: async () => ({ ok: false, status }) }), { code });
  });
}
for (const body of [null, {}, { results: {} }]) {
  test(`不正な応答を空の候補にすり替えない: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(searchNearby(center, answers, { fetcher: async () => ok(body) }), { code: 'invalid' });
  });
}
test('通信失敗と壊れたJSONを区別する', async () => {
  await assert.rejects(searchNearby(center, answers, { fetcher: async () => { throw new TypeError('offline'); } }), { code: 'network' });
  await assert.rejects(searchNearby(center, answers, { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }) }), { code: 'invalid' });
});
const hanging = async (_url, { signal }) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
});
test('時間切れで通信を中断する', async () => {
  await assert.rejects(searchNearby(center, answers, { fetcher: hanging, timeout: 5 }), { code: 'timeout' });
});
test('利用者の取消は時間切れと区別する', async () => {
  const controller = new AbortController();
  const pending = searchNearby(center, answers, { fetcher: hanging, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'aborted' });
});
test('中断済みなら通信しない', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchNearby(center, answers, { signal: controller.signal, fetcher: () => assert.fail('must not fetch') }), { code: 'aborted' });
});
test('場所指定は入力語だけを送り、有効な座標と名前の候補を返す', async () => {
  const valid = { name: '試験駅', ...center };
  const places = await searchPlaces('  試験駅  ', { fetcher: async (url) => {
    assert.equal(url.pathname, '/v1/suggest');
    assert.equal(url.searchParams.get('q'), '試験駅');
    assert.equal(url.searchParams.has('center'), false);
    return ok({ suggestions: [valid, { name: '座標なし', lat: '', lng: '' }, { ...center }] });
  } });
  assert.deepEqual(places, [valid]);
});
