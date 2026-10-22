import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeLexical } from '../lib/lexical.js';
import { parseInput } from '../lib/url-input.js';
import { validateTarget } from '../lib/target-guard.js';
import { BRANDS, findOfficialBrand, matchBrands, brandKeywordsInText, UNVERIFIED_DOMAINS } from '../lib/brands.js';
import { SHARED_HOSTS, FREE_HOSTS, USER_CONTENT_HOSTS, isUserContentHost } from '../lib/lists.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const facts = url => {
  const parsed = parseInput(url);
  assert.equal(parsed.ok, true, url);
  return analyzeLexical(parsed);
};
const legit = fixture('legit-domains');
for (const host of legit) test(`A1F 正規ドメインの誤検知なし: ${host}`, () => {
  const { brand } = facts('https://' + host + '/');
  assert.deepEqual([brand.subdomain, brand.typo, brand.keyword], [[], [], []]);
});
for (const { url, expect } of fixture('phish-urls')) test(`A1F 見逃しを防ぐ: ${url}`, () => {
  const value = facts(url);
  for (const [key, expected] of Object.entries(expect)) {
    if (['subdomain', 'typo', 'keyword'].includes(key)) {
      assert.ok(value.brand[key].some(hit => hit.id === expected && (!expect.where || hit.where === expect.where)), key);
    } else if (key === 'keywordCount') assert.equal(value.brand.keyword.length, expected);
    else if (key === 'official') assert.equal(value.brand.official, expected);
    else if (key === 'freeHost') assert.equal(Boolean(value.freeHost), expected);
    else if (key !== 'where') assert.equal(value[key], expected, key);
  }
});
const extraOfficial = {
  microsoft: ['office365.com', 'microsoft365.com', 'windows.com', 'bing.com', 'msn.com', 'xbox.com', 'skype.com', 'msftauth.net'],
  yamato: ['yamato-hd.co.jp'], docomo: ['nttdocomo.co.jp'], apple: ['apple.co.jp', 'apple.com.cn'],
  mizuho: ['mizuho-fg.co.jp', 'mizuho-sc.com'], smbc_card: ['vpass.ne.jp'],
  rakuten: ['rakuten-sec.co.jp', 'rakuten-insurance.co.jp', 'rakuten.com', 'rakuten.ne.jp']
};
test('A1H 追加したドメインは一次資料の確認状態を区別する', () => {
  for (const [id, domains] of Object.entries(extraOfficial)) for (const domain of domains) {
    const brand = BRANDS.find(row => row.id === id);
    if (UNVERIFIED_DOMAINS.some(row => row.domain === domain)) {
      assert.equal(brand.domains.includes(domain), false);
      assert.equal(findOfficialBrand('www.' + domain), null);
    } else {
      assert.ok(brand.domains.includes(domain));
      assert.equal(brand.domainSources[domain].confidence, 'high');
      assert.match(brand.domainSources[domain].source, /^https:\/\//);
      assert.equal(findOfficialBrand('www.' + domain)?.id, id);
    }
  }
});
test('A1F 一般語を強い語から除き、ページ本文の組織名を保つ', () => {
  for (const word of ['mitsubishi', 'sumitomo', 'mitsui', 'kurashi', 'mileage', 'suica']) {
    assert.ok(BRANDS.every(brand => !brand.keywords.includes(word)), word);
  }
  assert.ok(BRANDS.find(brand => brand.id === 'jre').weakKeywords.includes('suica'));
  for (const id of ['smbc', 'mufg']) assert.ok(brandKeywordsInText('三井住友 三菱UFJ').some(hit => hit.id === id));
});
test('A1F 曖昧な強い語は追加の手がかりがあるときだけ照合する', () => {
  for (const word of ['yamato', 'sagawa', 'saison', 'apple', 'amex', 'aeon', 'epos']) {
    assert.deepEqual(matchBrands({ host: word + '.top' }).keyword, [], word);
    assert.deepEqual(matchBrands({ host: word + '-kosan.com' }).keyword, [], word);
    for (const parts of [
      { host: word + '.top', path: '/login' },
      { host: word + '-foo-bar.com' },
      { host: word + '.icu' },
      { host: word + '.pages.dev' }
    ]) assert.ok(matchBrands(parts).keyword.some(hit => hit.keyword === word), JSON.stringify(parts));
  }
});
test('A1F 手前ラベルの4〜5字語をハイフン単位、長い語を部分一致で照合する', () => {
  assert.ok(matchBrands({ host: 'mufg-login.random.com' }).keyword.some(hit => hit.keyword === 'mufg' && hit.where === 'subdomain'));
  assert.deepEqual(matchBrands({ host: 'mufgextra.random.com' }).keyword, []);
  assert.ok(matchBrands({ host: 'amazonextra.random.com' }).keyword.some(hit => hit.keyword === 'amazon' && hit.where === 'subdomain'));
});
test('A1F パスの完全一致を区切りとURLデコード後に照合する', () => {
  for (const path of ['/amazon/login', '/x-amazon_login', '/x.amazon/login', '/%61mazon/login']) {
    assert.ok(facts('https://random.top' + path).brand.keyword.some(hit => hit.keyword === 'amazon' && hit.where === 'path'));
  }
  assert.deepEqual(facts('https://random.top/preamazon/login').brand.keyword, []);
  assert.deepEqual(facts('https://www.amazon.co.jp/amazon/login').brand.keyword, []);
});
test('A1F 共有語はkeywordとwhereごとに一件、複合名も重ねて数えない', () => {
  const hits = matchBrands({ host: 'rakuten-card-login.cn', path: '/rakuten/login' }).keyword;
  assert.deepEqual(hits.map(({ id, keyword, where }) => ({ id, keyword, where })), [
    { id: 'rakuten', keyword: 'rakuten', where: 'registrable' },
    { id: 'rakuten', keyword: 'rakuten', where: 'path' }
  ]);
});
test('A1F 利用者コンテンツの境界を完全ホスト名またはその配下で扱う', () => {
  for (const host of USER_CONTENT_HOSTS) {
    for (const name of [host, 'tenant.' + host]) {
      assert.equal(isUserContentHost(name), true, name);
      assert.equal(findOfficialBrand(name), null, name);
      const value = facts('https://' + name + '/');
      assert.equal(value.userContentHost, true, name);
      assert.equal(value.brand.official, null, name);
    }
    assert.equal(isUserContentHost(host + '.evil.com'), false);
  }
  for (const host of ['google.com', 'mail.google.com', 'microsoft.com', 'windows.net', 'evilsharepoint.com']) assert.equal(isUserContentHost(host), false, host);
  assert.equal(isUserContentHost('SITES.GOOGLE.COM.'), true);
});
test('A1F Herokuは第三者公開先に含め、互換名を維持する', () => {
  assert.equal(FREE_HOSTS, SHARED_HOSTS);
  assert.deepEqual(facts('https://tenant.herokuapp.com/').freeHost, { provider: 'Heroku', domain: 'herokuapp.com' });
});
test('A1F 配達・金銭・脅しの語をホストとパスから拾う', () => {
  const words = 'delivery redelivery parcel tracking shipment package invoice refund prize 配達 配送 荷物 お届け 返金 請求 当選 未納 利用停止 緊急 ご確認'.split(' ');
  for (const word of words) assert.ok(facts('https://random.com/' + encodeURIComponent(word)).sensitiveWords.includes(word), word);
  assert.deepEqual(facts('https://random.com/?prize=refund').sensitiveWords, []);
});
const extraVectors = [
  'https://example.com:80/', 'http://example.com:443/', 'https://example.com:8080/',
  'https://example.com:443/', 'http://example.com:80/', 'https://@example.com/',
  'https://:pass@example.com/', 'https://user@example.com/',
  'https://a.corp/', 'https://a.intranet/', 'https://a.private/', 'https://a.arpa/',
  'https://under_score.com/', 'https://-first.com/', 'https://last-.com/',
  'https://example.com./', 'https://local/', 'https://example.com/\tpath',
  'https://example.com/path?next=https://second.com/',
  'https://example.com/' + 'x'.repeat(2048)
];
const attackVectors = fixture('attack-urls');
for (const raw of [...attackVectors.attack, ...attackVectors.benign, ...extraVectors]) test(`A1F 画面と門番の一致: ${raw.slice(0, 100)}`, () => {
  const guard = validateTarget(raw);
  const parsed = parseInput(raw);
  const reasons = { credentials: 'userinfo', bad_host: 'reserved_name' };
  assert.equal(parsed.ok && parsed.fetch.allowed, guard.ok, raw);
  if (parsed.ok && !guard.ok) assert.equal(parsed.fetch.reason, reasons[guard.reason] || guard.reason, raw);
  if (guard.ok) {
    guard.url.search = '';
    assert.equal(parsed.fetch.href, guard.url.href, raw);
  }
});
