import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUrl, parseInput } from '../lib/url-input.js';
import { validateTarget } from '../lib/target-guard.js';

const INPUTS = {
  queryHash: 'https://example.com/a?x=1#secret',
  queryExpected: 'https://example.com/a?x=1',
  hashOnly: 'https://example.com/a#?x=1',
  idn: 'https://日本語.jp/',
  idnAscii: 'https://xn--wgv71a119e.jp/',
  emptyUserinfo: 'https://@example.com/',
};

const extraction = [
  ['こちら https://example.com/a。 次 https://second.net/', 'https://example.com/a', 1],
  ['（https://example.com/a）', 'https://example.com/a', 0],
  ['https://example.com/a(b)).', 'https://example.com/a(b)', 0],
  ['「https://example.com/a」', 'https://example.com/a', 0],
  ['詳しくは「https://example.com/a」を見てください', 'https://example.com/a', 0],
  ['hxxps://example[.]com/a', 'https://example.com/a', 0],
  ['hxxp://example(.)com/a', 'http://example.com/a', 0],
  [' ＨＴＴＰＳ：／／ＥＸＡＭＰＬＥ．ＣＯＭ／ａ ', 'HTTPS://EXAMPLE.COM/a', 0],
  ['example.com/path', 'example.com/path', 0],
  ['https://example.com/a#part', 'https://example.com/a#part', 0],
  ['これはリンクではありません', '', 0]
];
for (const [raw, url, otherLinks] of extraction) test(`リンク抽出: ${raw}`, () => assert.deepEqual(extractUrl(raw), { url, otherLinks }));
const failures = [
  ['', 'empty'], ['  ', 'empty'], [null, 'empty'], ['文章です', 'no_url'], ['https://', 'invalid'],
  ['https://[bad]/', 'invalid'], ['ftp://example.com/', 'scheme'], ['javascript:alert(1)', 'scheme'],
  ['data:text/plain,hello', 'scheme'], ['file:///etc/hosts', 'scheme'], ['https://example.com/' + 'a'.repeat(2048), 'too_long']
];
for (const [raw, reason] of failures) test(`入力エラー: ${String(raw).slice(0, 30)}`, () => {
  const parsed = parseInput(raw);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, reason);
  assert.ok(parsed.message.length);
});
test('Parsedの形・スキーム補完・秘密を送らない既定値', () => {
  const parsed = parseInput('example.com/a?token=abc#fragment');
  assert.deepEqual(parsed, {
    ok: true, raw: 'example.com/a?token=abc#fragment', original: 'example.com/a?token=abc#fragment', otherLinks: 0, assumedScheme: true,
    href: 'https://example.com/a?token=abc#fragment', scheme: 'https', hostname: 'example.com', hostUnicode: 'example.com', registrable: 'example.com', suffix: 'com', labels: ['example', 'com'],
    hasUserinfo: false, port: '', path: '/a', hasQuery: true, hasHash: true,
    fetch: { allowed: true, reason: null, href: 'https://example.com/a' }, hints: { oneTime: ['token'] }
  });
});
test('明示選択だけクエリを送る・フラグメントは選択しても送らない', () => {
  assert.equal(parseInput(INPUTS.queryHash, { includeQuery: true }).fetch.href, INPUTS.queryExpected);
  assert.equal(parseInput(INPUTS.hashOnly).hasQuery, false);
});
test('IDNの表示はUnicode、送信はASCII', () => {
  const parsed = parseInput(INPUTS.idn);
  assert.equal(parsed.hostname, 'xn--wgv71a119e.jp');
  assert.equal(parsed.hostUnicode, '日本語.jp');
  assert.equal(parsed.fetch.href, INPUTS.idnAscii);
});
const blocked = [
  ['https://amazon.co.jp@evil.net/', 'userinfo'], ['https://user:pass@example.com/', 'userinfo'],
  ['http://127.0.0.1/', 'numeric_host'], ['http://2130706433/', 'numeric_host'], ['http://0x7f000001/', 'numeric_host'],
  ['http://0177.0.0.1/', 'numeric_host'], ['http://127.1/', 'numeric_host'], ['http://0/', 'numeric_host'], ['http://[::1]/', 'numeric_host'],
  ['http://[::ffff:127.0.0.1]/', 'numeric_host'], ['http://8.8.8.8/', 'numeric_host'],
  ['http://localhost/', 'reserved_name'], ['http://a.local/', 'reserved_name'], ['http://a.internal/', 'reserved_name'],
  ['http://a.localdomain/', 'reserved_name'], ['http://a.home/', 'reserved_name'], ['http://a.lan/', 'reserved_name'],
  ['http://a.onion/', 'reserved_name'], ['http://a.example/', 'reserved_name'], ['http://a.test/', 'reserved_name'],
  ['http://a.invalid/', 'reserved_name'], ['http://a.home.arpa/', 'reserved_name'], ['http://intranet/', 'reserved_name'],
  ['http://example.com./', 'reserved_name'], ['https://example.com:8080/', 'port'],
  ['https://hundred-days.pages.dev/', 'self'], ['https://preview.hundred-days.pages.dev/', 'self']
];
for (const [raw, reason] of blocked) test(`通信を控える: ${raw}`, () => {
  const parsed = parseInput(raw);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.fetch, { allowed: false, reason, href: null });
});
test('クライアントとサーバーの共通宛先ベクトルは同じ許可判定', () => {
  const vectors = [...blocked.map(([raw]) => ({ raw, allowed: false })),
    { raw: 'https://example.com/', allowed: true }, { raw: 'http://example.com:80/a', allowed: true },
    { raw: 'https://example.com:443/a', allowed: true }, { raw: 'https://www.amazon.co.jp/', allowed: true },
    { raw: INPUTS.idn, allowed: true }];
  for (const { raw, allowed } of vectors) {
    assert.equal(parseInput(raw).fetch.allowed, allowed, raw);
    assert.equal(validateTarget(raw).ok, allowed, raw);
  }
});
test('スキームの既定以外のポートは通信を控える', () => {
  for (const raw of ['https://example.com:80/', 'http://example.com:443/', 'https://example.com:8080/']) assert.equal(parseInput(raw).fetch.reason, 'port');
});
test('空のuserinfoは正規化後に認証情報なしとして通信を許可する', () => {
  assert.equal(parseInput(INPUTS.emptyUserinfo).hasUserinfo, false);
  assert.equal(parseInput(INPUTS.emptyUserinfo).fetch.allowed, true);
});
const hints = [
  ['https://svc.example/verify?token=abc', ['token']],
  ['https://svc.example/reset/AbCdEfGhIjKlMnOpQr', ['reset']],
  ['https://example.com/news/2026', []],
  ['https://example.com/reset/short', []],
  ['https://example.com/AbCdEfGhIjKlMnOpQr', []],
  ['https://example.com/unsubscribe/AbCdEfGhIjKlMnOpQr?TOKEN=x&token=y&Code=z', ['token', 'code', 'unsubscribe']],
  ['https://example.com/reset/%41bCdEfGhIjKlMnOpQr', ['reset']]
];
for (const [raw, expected] of hints) test(`一度きりの手がかり: ${raw}`, () => assert.deepEqual(parseInput(raw).hints.oneTime, expected));
test('巨大入力・過剰なラベル・壊れた値でも例外を出さない', () => {
  for (const raw of ['https://example.com/' + 'x'.repeat(100000), 'https://' + 'a.'.repeat(900) + 'com/', 'https://%/', 'https://example.com/%ZZ', '.'.repeat(100000) + '@', {}]) assert.doesNotThrow(() => parseInput(raw));
});
