import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchList, ENDPOINT, parseList, ShapeError } from '../lib/jma.js';
test('一覧1本をGETし、取得時刻を返す。実データの形も通る', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/jma-list-2026-09-08.json', import.meta.url)));
  const result = await fetchList({ now: () => 1234, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://www.jma.go.jp/bosai/quake/data/list.json'); assert.equal(url, ENDPOINT);
    assert.equal(options.signal.aborted, false);
    return { ok: true, json: async () => fixture };
  } });
  assert.equal(result.fetchedAt, 1234); assert.equal(result.list.length, 365);
});
test('空配列は空として返し、配列以外や壊れた行は形の不一致', () => {
  assert.deepEqual(parseList([]), []);
  for (const value of [{}, null, '[]', [null], [{}]]) assert.throws(() => parseList(value), ShapeError);
});
test('HTTPエラーとJSONでない応答を知らせる', async () => {
  await assert.rejects(fetchList({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(fetchList({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }), ShapeError);
});
test('時間切れで取得を中断する', async () => {
  await assert.rejects(fetchList({ timeoutMs: 5, fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('時間切れ', 'AbortError')));
  }) }), { name: 'AbortError' });
});
test('震度や市区町村の形が変わったら観測なしにせず止める', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/jma-list-2026-09-08.json', import.meta.url)));
  assert.throws(() => parseList([{ ...fixture[0], maxi: '?' }]), ShapeError);
  assert.throws(() => parseList([{ ...fixture[0], int: [{ code: '43', maxi: '1', city: [null] }] }]), ShapeError);
});
