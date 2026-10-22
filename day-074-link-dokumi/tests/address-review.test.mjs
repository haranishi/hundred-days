import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseInput } from '../lib/url-input.js';
import { analyzeLexical } from '../lib/lexical.js';
import { matchBrands, findOfficialBrand, BRANDS, BRAND_DOMAIN_SOURCES, UNVERIFIED_DOMAINS } from '../lib/brands.js';
import { sensitiveWordsInText } from '../lib/lists.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const facts = url => {
  const parsed = parseInput(url);
  assert.equal(parsed.ok, true, url);
  return analyzeLexical(parsed);
};
for (const host of fixture('legit-domains-jp')) test(`A1H 日本の正規ホスト: ${host}`, () => {
  const { brand } = facts('https://' + host + '/');
  assert.deepEqual([brand.subdomain, brand.typo, brand.keyword], [[], [], []]);
});
for (const suffix of ['sakura.ne.jp', 's3.amazonaws.com', 'cloudfront.net', 'azurewebsites.net', 'pages.dev', 'tokyo.jp']) test(`A1H PSLの登録境界と共有先: ${suffix}`, () => {
  const first = facts('https://first.' + suffix + '/');
  const second = facts('https://second.' + suffix + '/');
  assert.notEqual(first.registrable, second.registrable);
  const parsed = parseInput('https://first.' + suffix + '/');
  assert.equal(parsed.registrable, first.registrable);
  assert.equal(parsed.suffix, first.suffix);
  if (suffix !== 'tokyo.jp') {
    assert.equal(first.userContentHost, true);
    assert.ok(first.freeHost);
    assert.equal(first.brand.official, null);
  }
});
test('A1H PRIVATE区画は既知の提供者がなければsuffixを返す', () => {
  const value = facts('https://bank-login.sakura.ne.jp/');
  assert.deepEqual(value.freeHost, { provider: 'sakura.ne.jp', domain: 'sakura.ne.jp' });
});
test('A1H AWSの基盤名を公式免除やブランド一致にしない', () => {
  for (const host of ['amazonaws.com', 's3.amazonaws.com', 'bucket.s3.amazonaws.com', 'bucket.s3-website-ap-northeast-1.amazonaws.com']) {
    const value = facts('https://' + host + '/');
    assert.equal(findOfficialBrand(host), null);
    assert.equal(value.userContentHost, true);
    assert.deepEqual([value.brand.subdomain, value.brand.typo, value.brand.keyword], [[], [], []]);
  }
  const value = facts('https://amazon-login.s3.amazonaws.com/');
  assert.ok(value.brand.keyword.some(hit => hit.keyword === 'amazon' && hit.where === 'registrable'));
});
for (const suffix of ['ac.jp', 'ed.jp', 'go.jp', 'lg.jp']) test(`A1H 資格JPでは登録名の照合だけを抑える: ${suffix}`, () => {
  for (const label of ['mizuho', 'amazon-login', 'amazom']) {
    const result = matchBrands({ host: label + '.' + suffix });
    assert.deepEqual(result.keyword, []);
    assert.deepEqual(result.typo, []);
  }
  assert.ok(matchBrands({ host: 'amazon-login.school.' + suffix }).keyword.some(hit => hit.where === 'subdomain'));
  assert.ok(matchBrands({ host: 'school.' + suffix, path: '/amazon/login' }).keyword.some(hit => hit.where === 'path'));
});
test('A1H 瑞穂は地名・人名として追加条件なしでは一致させない', () => {
  assert.deepEqual(matchBrands({ host: 'mizuho.top' }).keyword, []);
  assert.ok(matchBrands({ host: 'mizuho-login.top' }).keyword.some(hit => hit.id === 'mizuho'));
});
for (const keyword of ['e-tax', 'smbc-card', 'rakuten-card', 'rakuten-bank', 'etc-meisai', 'eki-net', 'd-account', 'jp-bank', 'yu-cho']) {
  for (const where of ['registrable', 'subdomain', 'path']) test(`A1H 複合語の境界: ${keyword}/${where}`, () => {
    const parts = where === 'registrable' ? { host: keyword + '-login.top' } : where === 'subdomain' ? { host: keyword + '.ordinary.top' } : { host: 'ordinary.top', path: '/' + keyword + '/login' };
    // 楽天の複合語は、先に見つかった共通語rakutenと重ねて数えない。
    const word = keyword.startsWith('rakuten-') ? 'rakuten' : keyword === 'smbc-card' ? 'smbc' : keyword;
    assert.ok(matchBrands(parts).keyword.some(hit => hit.keyword === word && hit.where === where), JSON.stringify(parts));
  });
}
test('A1H 複合語は語の途中で一致しない', () => {
  for (const parts of [{ host: 'some-e-taxi.top' }, { host: 'some-e-taxi.ordinary.top' }, { host: 'ordinary.top', path: '/some-e-taxi/login' }]) {
    assert.ok(!matchBrands(parts).keyword.some(hit => hit.id === 'nta'));
  }
});
for (const code of [0, 1, 9, 10, 13, 31, 127, 128, 159]) test(`A1H 省略形の制御文字を拒否: ${code}`, () => {
  for (const prefix of ['', 'https://']) {
    const value = parseInput(prefix + 'example.com/a' + String.fromCharCode(code) + 'b');
    assert.equal(value.ok, false);
    assert.equal(value.reason, 'invalid');
  }
});
test('A1H punycode後のホスト253字までと254字以上を区別する', () => {
  const host = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.');
  assert.equal(host.length, 253);
  assert.equal(parseInput('https://' + host + '/').ok, true);
  assert.equal(parseInput('https://' + host + 'x/').reason, 'too_long');
  assert.equal(parseInput('https://' + 'a.'.repeat(130) + 'com/').reason, 'too_long');
  assert.equal(parseInput('https://' + [...Array(10).fill('あ'.repeat(20)), 'com'].join('.') + '/').reason, 'too_long');
});
test('A1H 凍結・認証とローマ字日本語を追加する', () => {
  const words = 'locked unlock suspended suspend restricted reactivate recovery expired authentication auth kakunin ninsho teishi seigen'.split(' ');
  for (const word of words) assert.ok(facts('https://ordinary.top/' + word).sensitiveWords.includes(word));
  for (const path of ['/auth/', '/auth-login', '/auth_check', '/auth.html']) assert.ok(facts('https://ordinary.top' + path).sensitiveWords.includes('auth'));
  assert.deepEqual(sensitiveWordsInText('ordinary.top/author/authorization'), []);
  assert.ok(!facts('https://auth.ordinary.top/').sensitiveWords.includes('authentication'));
});
test('A1H 公式免除は確認済みの出典だけに限る', () => {
  for (const brand of BRANDS) for (const domain of [...brand.domains, ...brand.staticDomains]) {
    const source = BRAND_DOMAIN_SOURCES.find(row => row.brandId === brand.id && row.domain === domain);
    assert.equal(source.confidence, 'high');
    assert.equal(source.userPublishing, false);
    assert.equal(source.checkedAt, '2026-10-22');
    assert.notEqual(source.source, '公知');
    assert.ok(source.purpose);
  }
  for (const row of UNVERIFIED_DOMAINS) assert.equal(findOfficialBrand(row.domain), null);
  for (const host of ['ahamo.com', 'docomo-cycle.jp', 'rakuten.today', 'rakuten-wallet.co.jp']) assert.ok(findOfficialBrand(host));
});
test('A1H 34型の検出と設計上の弱い手がかりを固定する', () => {
  const rows = fixture('phish-types');
  assert.equal(rows.length, 34);
  const missing = rows.filter(({ url }) => {
    const value = facts(url);
    return !value.brand.subdomain.length && !value.brand.typo.length && !value.brand.keyword.length && !value.hasUserinfo && !value.isIpHost && !value.mixedScript && !value.tldRisky;
  }).map(row => row.url);
  // 指示の「3件」は弱い検出も含む。既存の強いSMBC語を消して件数を合わせない。
  assert.deepEqual(missing, ['https://bank-login.sakura.ne.jp/']);
  const pathOnly = facts('https://random.top/amazon/login');
  assert.ok(pathOnly.brand.keyword.every(hit => hit.where === 'path'));
  const weak = facts('https://smbc-vpass.top/');
  assert.deepEqual(weak.sensitiveWords, []);
  assert.ok(weak.brand.keyword.some(hit => hit.keyword === 'smbc'));
  for (const [url, word] of [['https://apple-id-locked.icu/', 'locked'], ['https://aeon-card-auth.icu/', 'auth']]) assert.ok(facts(url).sensitiveWords.includes(word));
  assert.ok(facts('https://e-tax-refund-confirm.top/').brand.keyword.some(hit => hit.id === 'nta'));
});
