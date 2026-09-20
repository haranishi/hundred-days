import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPAND_DELAY_MS, searchNearby } from '../lib/api.js';
import { displayableCount } from '../lib/state.js';

const node = (id, tags) => ({ type: 'node', id, lat: 39.7 + id / 10000, lon: 140.1, tags: { amenity: 'parking', ...tags } });
const restricted = (id) => node(id, { access: 'private' });
const open = (id) => node(id, { fee: 'yes' });
const noCache = { getItem: () => null, setItem: () => {} };

const run = (plan) => {
  const radii = [];
  const waits = [];
  return searchNearby({ lat: 39.7167, lng: 140.1297 }, {
    cache: noCache,
    waitFn: async (ms) => { waits.push(ms); },
    fetchFn: async (url) => {
      const radius = Number(new URL(url, 'http://x').searchParams.get('radius'));
      radii.push(radius);
      return { ok: true, status: 200, json: async () => ({ elements: plan(radius) }) };
    },
  }).then((result) => ({ ...result, radii, waits }));
};

test('半径拡大: restrictedしか無い場所では拡大する（生件数で止めない）', async () => {
  const result = await run((radius) => (radius === 800
    ? [restricted(1), restricted(2), restricted(3), restricted(4)]
    : [open(5), open(6), open(7)]));
  assert.equal(displayableCount([{ restricted: true }, { restricted: false }, { restricted: true }]), 1);
  assert.equal(result.radius, 3200);
  assert.deepEqual(result.radii, [800, 3200]);
  assert.equal(result.results.length, 3);
});

test('半径拡大: 表示対象が3件あれば800mで止める（1往復）', async () => {
  const result = await run(() => [open(1), open(2), open(3), restricted(4)]);
  assert.equal(result.radius, 800);
  assert.deepEqual(result.radii, [800]);
});

test('半径拡大: 0件でも往復は最大2回（旧400/800/1600/3200の4往復を廃止）', async () => {
  const result = await run(() => []);
  assert.deepEqual(result.radii, [800, 3200]);
});

test('半径拡大: 連続リクエストの間に300ms空ける・最初は待たない', async () => {
  assert.equal(EXPAND_DELAY_MS, 300);
  assert.deepEqual((await run((r) => (r === 3200 ? [open(1), open(2), open(3)] : []))).waits, [300]);
  assert.deepEqual((await run(() => [open(1), open(2), open(3)])).waits, []);
});
