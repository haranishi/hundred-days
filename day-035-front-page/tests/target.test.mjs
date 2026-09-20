import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTarget, isNumericHost, displayHost, fetchGuarded, MAX_URL_LENGTH } from '../lib/target.js';

test('validateTarget: 普通のURLは通る', () => {
  assert.equal(validateTarget('https://www3.nhk.or.jp/news/')?.href, 'https://www3.nhk.or.jp/news/');
  assert.equal(validateTarget('  http://example.com/a?b=1  ')?.href, 'http://example.com/a?b=1');
});

test('validateTarget: 全角で貼られたURLも通る', () => {
  assert.equal(validateTarget('ｈｔｔｐｓ：／／example.com/')?.href, 'https://example.com/');
});

test('validateTarget: ハッシュは落とす（同じページを二重に載せない）', () => {
  assert.equal(validateTarget('https://example.com/a#b')?.href, 'https://example.com/a');
});

test('validateTarget: http/https 以外は拒む', () => {
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<b>', 'ftp://example.com/']) {
    assert.equal(validateTarget(value), null, value);
  }
});

test('validateTarget: 内部を指す形は拒む', () => {
  for (const value of [
    'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/',
    'http://0x7f.0.0.1/', 'http://printer.local/', 'http://nas.internal/', 'http://192.168.0.1/'
  ]) {
    assert.equal(validateTarget(value), null, value);
  }
});

test('validateTarget: 認証情報つきURLは拒む', () => {
  assert.equal(validateTarget('http://user:pass@example.com/'), null);
});

test('validateTarget: 長すぎるURLは拒む', () => {
  assert.equal(validateTarget(`https://example.com/${'a'.repeat(MAX_URL_LENGTH)}`), null);
});

test('validateTarget: 文字列でなければ拒む', () => {
  for (const value of [null, undefined, 42, {}]) assert.equal(validateTarget(value), null);
});

test('isNumericHost: 数字で始まるだけの名前は通す', () => {
  assert.equal(isNumericHost('3ds.com'), false);
  assert.equal(isNumericHost('127.0.0.1'), true);
});

test('displayHost: www と www3 は落とす', () => {
  assert.equal(displayHost('https://www.asahi.com/articles/1'), 'asahi.com');
  assert.equal(displayHost('https://www3.nhk.or.jp/news/'), 'nhk.or.jp');
  assert.equal(displayHost('こわれたURL'), '');
});

test('fetchGuarded: リダイレクト先も毎回検証する', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return { status: 301, headers: new Map([['location', 'http://127.0.0.1/secret']]) };
    return { status: 200, headers: new Map() };
  };
  const result = await fetchGuarded(validateTarget('https://example.com/'), {
    fetchImpl: (url, init) => fetchImpl(url, init)
  });
  assert.equal(result.error, 'blocked_redirect');
  assert.equal(result.response, null);
  assert.equal(calls.length, 1);
});

test('fetchGuarded: 許されたリダイレクトは追う', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (seen.length === 1) return { status: 302, headers: new Map([['location', '/next']]) };
    return { status: 200, headers: new Map() };
  };
  const result = await fetchGuarded(validateTarget('https://example.com/first'), { fetchImpl });
  assert.equal(result.response.status, 200);
  assert.equal(result.finalUrl.href, 'https://example.com/next');
});

test('fetchGuarded: 転送が多すぎたら諦める', async () => {
  const fetchImpl = async () => ({ status: 302, headers: new Map([['location', 'https://example.com/loop']]) });
  const result = await fetchGuarded(validateTarget('https://example.com/'), { fetchImpl, maxRedirects: 2 });
  assert.equal(result.error, 'too_many_redirects');
});
