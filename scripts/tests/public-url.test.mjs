import test from 'node:test';
import assert from 'node:assert/strict';
import { dnsFallbackUrl, fetchPublicUrl } from '../lib/public-url.mjs';

const BASE = 'https://rairakku.com/100days';
const ORIGIN = 'https://hundred-days.pages.dev';
const NEW = `${BASE}/day-081-sample/`;
const failure = (code) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
const options = { canonicalBase: BASE, siteOrigin: ORIGIN };

test('名前を引けない失敗では、中継の下のURLを行き先の同じパスに替える', () => {
  assert.equal(dnsFallbackUrl(failure('ENOTFOUND'), NEW, options), `${ORIGIN}/day-081-sample/`);
});

test('一時的に引けない失敗（EAI_AGAIN）も同じ', () => {
  assert.equal(dnsFallbackUrl(failure('EAI_AGAIN'), NEW, options), `${ORIGIN}/day-081-sample/`);
});

test('名前以外の失敗（接続拒否・タイムアウト・証明書）は代わりにしない', () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED']) {
    assert.equal(dnsFallbackUrl(failure(code), NEW, options), null, code);
  }
  assert.equal(dnsFallbackUrl(new Error('boom'), NEW, options), null);
});

test('中継の下にないURL（GitHub・pages.dev のまま）は代わりにしない', () => {
  assert.equal(dnsFallbackUrl(failure('ENOTFOUND'), 'https://github.com/haranishi/hundred-days', options), null);
  assert.equal(dnsFallbackUrl(failure('ENOTFOUND'), `${ORIGIN}/day-064-breach-atlas/`, options), null);
  assert.equal(dnsFallbackUrl(failure('ENOTFOUND'), 'https://rairakku.com/100days-other/x/', options), null);
});

test('canonicalBase の末尾の / があっても、クエリがあっても同じ結果', () => {
  assert.equal(dnsFallbackUrl(failure('ENOTFOUND'), `${NEW}?a=1`, { ...options, canonicalBase: `${BASE}/` }), `${ORIGIN}/day-081-sample/?a=1`);
});

test('取得できれば、そのまま返す', async () => {
  const seen = [];
  const fetchImpl = async (target) => { seen.push(target); return { ok: true, status: 200 }; };
  const result = await fetchPublicUrl(NEW, { ...options, fetchImpl });
  assert.deepEqual(seen, [NEW]);
  assert.equal(result.fetchedUrl, NEW);
  assert.equal(result.dnsError, '');
  assert.equal(result.response.status, 200);
});

test('名前を引けないときだけ、行き先で取り直し、その旨を返す', async () => {
  const seen = [];
  const fetchImpl = async (target) => {
    seen.push(target);
    if (target === NEW) throw failure('ENOTFOUND');
    return { ok: true, status: 200 };
  };
  const result = await fetchPublicUrl(NEW, { ...options, fetchImpl });
  assert.deepEqual(seen, [NEW, `${ORIGIN}/day-081-sample/`]);
  assert.equal(result.fetchedUrl, `${ORIGIN}/day-081-sample/`);
  assert.equal(result.dnsError, 'ENOTFOUND');
});

test('名前以外の失敗は取り直さず、そのまま投げる', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw failure('ECONNREFUSED'); };
  await assert.rejects(() => fetchPublicUrl(NEW, { ...options, fetchImpl }), /fetch failed/);
  assert.equal(calls, 1);
});

test('行き先でも失敗したら、その失敗を投げる', async () => {
  const fetchImpl = async (target) => { throw failure(target === NEW ? 'ENOTFOUND' : 'ECONNREFUSED'); };
  await assert.rejects(() => fetchPublicUrl(NEW, { ...options, fetchImpl }), (error) => error.cause.code === 'ECONNREFUSED');
});

test('HTTPエラーは取り直さない（応答があった＝名前は引けている）', async () => {
  const seen = [];
  const fetchImpl = async (target) => { seen.push(target); return { ok: false, status: 502 }; };
  const result = await fetchPublicUrl(NEW, { ...options, fetchImpl });
  assert.deepEqual(seen, [NEW]);
  assert.equal(result.response.status, 502);
});
