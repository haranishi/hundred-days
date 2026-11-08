import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRecommendations } from '../lib/search.js';
import { searchNearby } from '../lib/openpoi.js';
import { recommend } from '../lib/recommend.js';

const center = { lat: 35.68, lng: 139.76 };
const answers = { mood: 'meal', genre: 'fish', dish: 'grilled_fish', space: 'quiet', walk: 'near' };
const place = (name, offset = 0.008) => ({ name, lat: center.lat + offset, lng: center.lng, category: 'restaurant' });
const ok = (results) => ({ ok: true, json: async () => ({ results }) });

test('希望圏で見つかれば1回で終え、選んだ料理と回答を保つ', async () => {
  const calls = [];
  const result = await findRecommendations(center, answers, 'partner', { fetcher: async (url) => {
    calls.push(url); return ok([place('試験焼き魚', .0002)]);
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('q'), '焼き魚');
  assert.equal(result.radius, 180);
  assert.equal(result.scope, 'dish');
  assert.equal(result.places[0].name, '試験焼き魚');
  assert.equal(answers.walk, 'near');
});
test('0件だけで1500mまで広げ、圏外のAPI結果を除き実距離を返す', async () => {
  const radii = []; const progress = [];
  const result = await findRecommendations(center, answers, 'partner', { onProgress: step => progress.push(step.radius), fetcher: async url => {
    const radius = Number(url.searchParams.get('radius')); radii.push(radius);
    return ok([place('試験焼き魚'), place('5km圏外の焼き魚', .1)]);
  } });
  assert.deepEqual(radii, [180, 1500]); assert.deepEqual(progress, radii);
  assert.equal(result.preferredRadius, 180); assert.equal(result.radius, 1500);
  assert.equal(result.places.length, 1); assert.ok(result.places[0].distance > 800);
  assert.ok(result.places[0].minutes > 3);
});
test('5000mでも料理で検索し、見つかればジャンル検索しない', async () => {
  const calls = [];
  const result = await findRecommendations(center, { ...answers, walk: 'stroll' }, 'solo', { fetcher: async url => {
    calls.push([url.searchParams.get('radius'), url.searchParams.get('q')]);
    return ok(Number(url.searchParams.get('radius')) === 5000 ? [place('試験焼き魚', .025)] : []);
  } });
  assert.deepEqual(calls, [['600', '焼き魚'], ['1500', '焼き魚'], ['5000', '焼き魚']]);
  assert.equal(result.scope, 'dish'); assert.equal(result.places.length, 1);
});
test('料理で全0件の場合だけ同じ魚ジャンルを使い、別案と分かる結果を返す', async () => {
  const queries = [];
  const result = await findRecommendations(center, answers, 'solo', { fetcher: async url => {
    const q = url.searchParams.get('q'); queries.push(q);
    return ok(q === '焼き魚' ? [] : [place('試験寿司', .0003), place('試験ステーキ', .0001)]);
  } });
  assert.deepEqual(queries, ['焼き魚', '焼き魚', '焼き魚', '寿司 海鮮丼 刺身 焼き魚']);
  assert.equal(result.scope, 'genre'); assert.equal(result.places.length, 1);
  assert.equal(result.places[0].name, '試験寿司'); assert.equal(answers.dish, 'grilled_fish');
});
test('全0件は4回で終了し、データのない店を作らない', async () => {
  let calls = 0;
  const result = await findRecommendations(center, answers, 'solo', { fetcher: async () => { calls++; return ok([]); } });
  assert.equal(calls, 4); assert.deepEqual(result.places, []); assert.equal(result.radius, 5000);
});
test('外出はジャンル検索せず3回を上限にする', async () => {
  let calls = 0;
  await findRecommendations(center, { mood: 'outside', space: 'quiet', walk: 'near' }, 'solo', { fetcher: async () => { calls++; return ok([]); } });
  assert.equal(calls, 3);
});
test('通信失敗を0件扱いして次の範囲を探さない', async () => {
  let calls = 0;
  await assert.rejects(findRecommendations(center, answers, 'solo', { fetcher: async () => { calls++; return { ok: false, status: 429 }; } }), { code: 'busy' });
  assert.equal(calls, 1);
});
test('段階の途中で取り消したら次の通信をしない', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(findRecommendations(center, answers, 'solo', { signal: controller.signal, fetcher: async () => {
    calls++; controller.abort(); return ok([]);
  } }), { code: 'aborted' });
  assert.equal(calls, 1);
});
test('一連の検索は合計12秒で打ち切り、遅い結果を表示しない', async () => {
  let time = 0; let calls = 0;
  await assert.rejects(findRecommendations(center, answers, 'solo', { now: () => time, fetcher: async () => {
    calls++; time += 6000; return ok(calls === 2 ? [place('遅すぎた焼き魚')] : []);
  } }), { code: 'timeout' });
  assert.equal(calls, 2);
});
for (const radius of [0, -1, 5001, Infinity, '1500']) {
  test(`不正な拡大半径を通信・候補選択で拒否する: ${radius}`, async () => {
    await assert.rejects(searchNearby(center, answers, { radius, fetcher: () => assert.fail('must not fetch') }), { code: 'input' });
    assert.deepEqual(recommend([place('試験焼き魚')], center, answers, 'solo', { radius }), []);
  });
}
test('5kmを超えた完全一致の結果も混ぜない', () => {
  assert.deepEqual(recommend([place('試験焼き魚', .1)], center, answers, 'solo', { radius: 5000 }), []);
});
