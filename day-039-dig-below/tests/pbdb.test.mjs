import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecords } from '../lib/pbdb.js';
const point = { lat: 35.6812, lng: 139.7671 };
const rows = (n) => Array.from({ length: n }, (_, i) => ({ oid: `col:${i}`, lat: 35 + i / 100, lng: 139 }));
for (const stage of [1, 2, 3]) test(`第${stage}段で40件揃えば停止し化石は1回だけ`, async () => {
  const urls = [];
  await findRecords(point, { fetcher: async (url) => {
    urls.push(new URL(url));
    return { ok: true, json: async () => ({ records: url.includes('occs/') ? [] : rows(urls.length >= stage ? 45 : 10) }) };
  } });
  assert.equal(urls.length, stage + 1);
  assert.equal(urls.at(-1).searchParams.get('coll_id').split(',').length, 40);
  assert.equal(urls.at(-1).searchParams.get('show'), 'class,ref');
  assert.equal(urls[0].searchParams.get('lngmin'), '139.5');
  if (stage >= 2) assert.equal(urls[1].searchParams.get('lngmin'), '138.9');
  if (stage === 3) assert.equal(urls[2].searchParams.get('lngmin'), '136.3');
});
test('0件は3段で終了し化石APIを呼ばない', async () => {
  let calls = 0;
  const result = await findRecords(point, { fetcher: async () => { calls++; return { ok: true, json: async () => ({ records: [] }) }; } });
  assert.equal(calls, 3); assert.equal(result.collections.length, 0);
});
test('HTTP失敗と形式不正はエラー、空件数として扱わない', async () => {
  await assert.rejects(findRecords(point, { fetcher: async () => ({ ok: false }) }));
  await assert.rejects(findRecords(point, { fetcher: async () => ({ ok: true, json: async () => ({}) }) }));
});
