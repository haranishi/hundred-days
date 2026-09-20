import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, ShapeError } from '../lib/jma.js';
const fixture = (year) => readFileSync(new URL(`./fixtures/TK-${year}.txt`, import.meta.url), 'utf8');
test('同じ年の同時・再取得は1本、必要な年窓だけ取得', async () => {
  const urls = [];
  const client = createClient(async (url, options) => { urls.push(url); assert.equal(options.credentials, 'omit'); return new Response(fixture(url.split('/').at(-2))); });
  await Promise.all([client.fetchYear('TK', 2026), client.fetchYear('TK', 2026)]);
  await client.fetchWindow('TK', Date.parse('2026-09-10T15:00:00+09:00')); assert.equal(urls.length, 1);
  await client.fetchWindow('TK', Date.parse('2026-12-31T23:45:00+09:00')); assert.equal(urls.length, 2);
  await client.fetchWindow('TK', Date.parse('2026-01-01T00:30:00+09:00')); assert.equal(urls.length, 3);
  assert.deepEqual(urls.map((u) => u.split('/').slice(-2).join('/')), ['2026/TK.txt', '2027/TK.txt', '2025/TK.txt']);
});
test('隣年404は当年で続行し、当年404は専用エラー・再試行可能', async () => {
  let fail = true, calls = 0;
  const client = createClient(async (url) => { calls++; return url.includes('/2025/') || fail ? new Response('', { status: 404 }) : new Response(fixture(2026)); });
  // 呼び出し側が地点名入りの文言と案内を選べるよう、404 は status を添えて投げる。
  await assert.rejects(client.fetchYear('TK', 2026), (error) => error.status === 404 && error.message === '潮位表が見つかりません');
  fail = false;
  const days = await client.fetchWindow('TK', Date.parse('2026-01-01T00:30:00+09:00'));
  assert.equal(days.size, 365); assert.equal(calls, 3);
});
test('形の不一致・地点違い・空を拒否', async () => {
  for (const body of ['', 'changed', fixture(2026).replace('TK', 'S1')]) await assert.rejects(createClient(async () => new Response(body)).fetchYear('TK', 2026), ShapeError);
});
test('8秒の中断機構は応答本文にも適用、タイマーを解放', async () => {
  let aborted = false;
  const client = createClient(async (_, { signal }) => ({ ok: true, text: () => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); })) }), 10);
  await assert.rejects(client.fetchYear('TK', 2026), { name: 'AbortError' }); assert.ok(aborted);
});
test('地点と年を検証して不正なURLを作らない', async () => {
  const client = createClient(() => { throw new Error('通信してはいけない'); });
  for (const [code, year] of [['../', 2026], ['TK', 2026.5], ['TK', 1999]]) await assert.rejects(client.fetchYear(code, year), TypeError);
});
