import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLexical } from '../lib/lexical.js';
import { parseInput } from '../lib/url-input.js';
import { SHORTENERS, FREE_HOSTS } from '../lib/lists.js';
const INPUTS = {
  normal: 'https://www.example.com/news',
  plainCredentials: 'https://user:pass@evil.example/',
  confusable: 'https://xn--mazon-3ve.example/',
  manyVowels: 'https://internationalization.com/',
  oddLabel: 'https://a-b-c-d123.com/',
  redirects: 'https://example.com/?next=https%3A%2F%2Fevil.net%2F&url=https%3A%2F%2Fsub.example.com%2F&r=%2Flocal&link=javascript%3Ax&DEST=https%3A%2F%2Felsewhere.org%2F&u=http%3A%2F%2Fother.com%2F&returnurl=https%3A%2F%2Felse.net',
  hostedRedirect: 'https://first.pages.dev/?next=https://second.pages.dev/',
  encoded: 'https://example.com/%41%42%43%44%45%46%00%2541',
  shortenerImitation: 'https://bit.ly.evil.net/',
  googleSites: 'https://sites.google.com/site/test',
  restrictedJp: 'https://example.co.jp/',
  generalJp: 'https://example.jp/',
  sensitive: 'https://a.b.c.d.verify-account.xin/LOGIN/本人確認/login',
  queryOnly: 'https://example.com/?login=verify',
  official: 'https://login.microsoftonline.com/verify',
  immutable: 'https://example.com/a',
};
const facts = raw => analyzeLexical(parseInput(raw));
test('LexicalFactsの全項目は通常のURLで揃う', () => {
  assert.deepEqual(facts(INPUTS.normal), {
    host: 'www.example.com', hostUnicode: 'www.example.com', registrable: 'example.com', suffix: 'com', labels: ['www', 'example', 'com'], subdomainLabels: ['www'], isPublicSuffix: false, section: 'icann',
    scheme: 'https', port: '', urlLength: 28, hasUserinfo: false, userinfoLooksLikeHost: false,
    isIpHost: false, isPunycode: false, mixedScript: false, confusableChars: [], brand: { official: null, subdomain: [], typo: [], keyword: [] }, sensitiveWords: [], shortener: null, freeHost: null, userContentHost: false,
    tld: 'com', tldRisky: false, hyphenCount: 0, digitCount: 0, labelOdd: false, subdomainDepth: 1,
    encodedCount: 0, doubleEncoded: false, hasNullByte: false, redirectParams: [], jpRestricted: null
  });
});
test('userinfoのホスト風表示と一般の認証名を区別する', () => {
  for (const raw of ['https://amazon.co.jp@evil.example/', 'https://https-amazon@evil.example/']) assert.equal(facts(raw).userinfoLooksLikeHost, true);
  assert.equal(facts(INPUTS.plainCredentials).userinfoLooksLikeHost, false);
});
test('IPv4の全表記とIPv6はIPホストになる', () => {
  for (const host of ['127.0.0.1', '127.1', '0x7f000001', '0177.0.0.1', '2130706433', '[::1]', '[::ffff:192.168.1.1]']) assert.equal(facts('http://' + host).isIpHost, true, host);
});
const scripts = [
  ['aа.example', true, true], ['aο.example', true, true], ['аο.example', true, true],
  ['aա.example', true, false],
  ['a日本語.jp', false, false], ['カタカナabc.jp', false, false], ['а.example', false, true], ['a.а.example', false, true], ['日本語.jp', false, false]
];
for (const [host, mixedScript, confusable] of scripts) test(`文字体系: ${host}`, () => {
  const result = facts('https://' + host + '/');
  assert.equal(result.isPunycode, true);
  assert.equal(result.mixedScript, mixedScript);
  assert.equal(result.confusableChars.length > 0, confusable);
});
test('ASCIIのxn--ラベルはUnicodeの表示と紛らわしい文字を返す', () => {
  const result = facts(INPUTS.confusable);
  assert.equal(result.hostUnicode, 'аmazon.example');
  assert.deepEqual(result.confusableChars, ['а']);
  assert.equal(result.mixedScript, true);
});
test('ハイフン・数字・母音の少ない長い登録ラベル', () => {
  for (const label of ['a-b-c-d', 'abcdefghijkl123', 'bcdfghjklmnpqrstvwxyz']) assert.equal(facts('https://' + label + '.com/').labelOdd, true, label);
  assert.equal(facts(INPUTS.manyVowels).labelOdd, false);
  const result = facts(INPUTS.oddLabel);
  assert.equal(result.hyphenCount, 3);
  assert.equal(result.digitCount, 3);
});
test('転送パラメータは別登録ドメインの絶対http(s)だけ', () => {
  const result = facts(INPUTS.redirects);
  assert.deepEqual(result.redirectParams, [{ name: 'next', host: 'evil.net' }, { name: 'DEST', host: 'elsewhere.org' }, { name: 'u', host: 'other.com' }, { name: 'returnurl', host: 'else.net' }]);
  assert.equal(facts(INPUTS.hostedRedirect).redirectParams.length, 1);
});
test('エンコード・二重エンコード・ヌルを数える', () => {
  const result = facts(INPUTS.encoded);
  assert.equal(result.encodedCount, 8);
  assert.equal(result.doubleEncoded, true);
  assert.equal(result.hasNullByte, true);
});
test('短縮URL24件を第三者と公式に分ける', () => {
  for (const host of SHORTENERS.thirdParty) assert.equal(facts('https://' + host + '/abc').shortener, 'third-party');
  for (const host of Object.keys(SHORTENERS.official)) assert.equal(facts('https://' + host + '/abc').shortener, 'official');
  assert.equal(facts(INPUTS.shortenerImitation).shortener, null);
});
test('第三者公開先18件は登録境界と提供者を返す', () => {
  for (const [host, provider] of Object.entries(FREE_HOSTS)) assert.deepEqual(facts('https://tenant.' + host + '/').freeHost, { provider, domain: host });
  assert.equal(facts(INPUTS.googleSites).freeHost, null);
});
test('属性JP・弱いTLD・深さ・敏感語はそれぞれ独立した値', () => {
  assert.equal(facts(INPUTS.restrictedJp).jpRestricted, 'co.jp');
  assert.equal(facts(INPUTS.generalJp).jpRestricted, null);
  const result = facts(INPUTS.sensitive);
  assert.equal(result.subdomainDepth, 4);
  assert.equal(result.tldRisky, true);
  // 「本人確認」に含まれる「確認」は、同じ箇所を2回数えない（redelivery と delivery も同じ）
  assert.deepEqual(result.sensitiveWords, ['login', 'verify', 'account', '本人確認']);
  assert.equal(facts(INPUTS.queryOnly).sensitiveWords.length, 0);
});
test('公式ブランドにはブランドをまねる兆候を付けない', () => {
  const result = facts(INPUTS.official);
  assert.equal(result.brand.official.id, 'microsoft');
  assert.deepEqual([result.brand.typo, result.brand.keyword, result.brand.subdomain], [[], [], []]);
});
test('入力の破損・2KB・多数ラベルで例外を出さず、通信も保存もしない', () => {
  const rawInputs = ['https://example.com/' + 'x'.repeat(2000), 'https://' + 'a.'.repeat(900) + 'com/', 'https://[broken', 'https://example.com/%ZZ', ''];
  for (const raw of rawInputs) assert.doesNotThrow(() => facts(raw));
  for (const value of [null, undefined, {}, { ok: false }, { ok: true, href: null }]) assert.doesNotThrow(() => analyzeLexical(value));
  const parsed = parseInput(INPUTS.immutable);
  const before = JSON.stringify(parsed);
  assert.deepEqual(analyzeLexical(parsed), analyzeLexical(parsed));
  assert.equal(JSON.stringify(parsed), before);
});

test('Web標準URLが拒むヘブライ・アラビアの混在も文字体系として判定する', () => {
  for (const host of ['aא.example', 'aا.example']) {
    assert.equal(parseInput('https://' + host + '/').ok, false);
    assert.equal(analyzeLexical({ ok: true, hostname: host }).mixedScript, true);
  }
});
