import test from 'node:test';
import assert from 'node:assert/strict';
import { BRANDS, findOfficialBrand, matchBrands, brandKeywordsInText } from '../lib/brands.js';

const officialHosts = [
  'www.amazon.co.jp', 'amazon.com', 'smile.amazon.co.jp', 'www.rakuten.co.jp', 'www.apple.com', 'appleid.apple.com', 'icloud.com',
  'login.microsoftonline.com', 'outlook.com', 'office.com', 'live.com', 'youtube.com', 'gmail.com', 'www.google.co.jp',
  'news.yahoo.co.jp', 'jp.mercari.com', 'www.kuronekoyamato.co.jp', 'www.netflix.com', 'www.softbank.jp', 'www.au.com'
];
for (const host of officialHosts) test(`公式の誤検知なし: ${host}`, () => {
  const result = matchBrands({ host });
  assert.ok(result.official, host);
  assert.deepEqual([result.subdomain, result.typo, result.keyword], [[], [], []]);
});
for (const host of ['github.com', 'wikipedia.org', 'pineapple.com', 'applebees.com', 'example.com', 'taurus.com', 'airline.com', 'postcard.com', 'office-party.com', 'nhk.example', 'mileage-calculator.com', 'kurashi-note.com']) test(`一般語の誤検知なし: ${host}`, () => {
  const result = matchBrands({ host });
  assert.deepEqual(result, { official: null, subdomain: [], typo: [], keyword: [] });
});
const suspicious = [
  ['www.amazon.co.jp.account-check.example', 'subdomain', 'amazon'],
  ['arnazon.co.jp', 'typo', 'amazon'], ['amaz0n.co.jp', 'typo', 'amazon'], ['amazom.co.jp', 'typo', 'amazon'],
  ['amazon-co-jp.verify-login.example', 'keyword', 'amazon'], ['rakuten-card-login.example', 'keyword', 'rakuten'],
  ['yamato-redelivery.example', 'keyword', 'yamato'], ['apple.com.verify.example', 'subdomain', 'apple'],
  ['appleid-apple-verify.example', 'keyword', 'apple'], ['paypa1.example', 'typo', 'paypay'],
  ['amazno.example', 'typo', 'amazon'], ['amzon.example', 'typo', 'amazon'], ['amaazon.example', 'typo', 'amazon']
];
for (const [host, kind, id] of suspicious) test(`ブランドの兆候: ${host}`, () => assert.ok(matchBrands({ host })[kind].some(hit => hit.id === id)));
test('紛らわしい文字・距離1の種別を区別する', () => {
  assert.equal(matchBrands({ host: 'arnazon.co.jp' }).typo[0].kind, 'confusable');
  assert.equal(matchBrands({ host: 'amazom.co.jp' }).typo[0].kind, 'distance1');
  assert.equal(matchBrands({ host: new URL('https://' + 'аmazon.example').hostname }).typo[0].kind, 'confusable');
});
test('短い語の部分一致・短い語の距離1は使わない', () => {
  for (const host of ['myapple.example', 'pineapple.example', 'applebees.example', 'applf.example', 'apple.sub.example', 'au-login.example']) assert.equal(matchBrands({ host }).keyword.length + matchBrands({ host }).typo.length, 0, host);
  assert.ok(matchBrands({ host: 'apple-login.example' }).keyword.some(hit => hit.id === 'apple'));
});
test('別ブランドそのものの語はつづり違い扱いしない', () => {
  for (const brand of BRANDS) for (const word of brand.keywords) assert.deepEqual(matchBrands({ host: word + '.example' }).typo, []);
});
test('公式ドメインは全登録先・配信先・サブドメインで除外する', () => {
  assert.equal(BRANDS.length, 36);
  assert.equal(new Set(BRANDS.map(brand => brand.id)).size, 36);
  for (const brand of BRANDS) {
    assert.equal(brand.source, 'research/R1 §A2');
    for (const domain of [...brand.domains, ...brand.staticDomains]) {
      assert.ok(findOfficialBrand('sub.' + domain, domain));
      assert.deepEqual(matchBrands({ host: 'sub.' + domain }).typo, []);
    }
  }
  assert.equal(BRANDS.find(brand => brand.id === 'amazon').domainSources['amazon.com'].confidence, 'high');
});
test('公式に似た別名・ユーザーが作れる公開先は公式にしない', () => {
  for (const host of ['amazon.com.evil.example', 'evil-amazon.com', 'google-login.pages.dev', 'evil.web.app']) assert.equal(findOfficialBrand(host), null);
  assert.equal(findOfficialBrand('evil.example', 'amazon.com'), null);
});
test('ページ内容はNFKC・大文字小文字・複合名・重複を扱う', () => {
  const hits = brandKeywordsInText('ＡＭＡＺＯＮ Amazon ヤマト運輸 佐川急便 日本郵便 ETC利用照会サービス 国税庁 マイナポータル Yahoo! JAPAN');
  for (const id of ['amazon', 'yamato', 'sagawa', 'japanpost', 'etc', 'nta', 'myna', 'yahoo']) assert.ok(hits.some(hit => hit.id === id), id);
  assert.equal(hits.filter(hit => hit.id === 'amazon').length, 1);
  assert.deepEqual(brandKeywordsInText('post line au etc ana office'), []);
});
test('深いラベルでも公式名はラベル単位で照合する', () => {
  assert.deepEqual(matchBrands({ host: 'notamazon.co.jp.evil.example' }).subdomain, []);
  assert.deepEqual(matchBrands({ host: 'amazon.co.jpx.evil.example' }).subdomain, []);
});

test('BMP外の1文字も編集距離の1文字として扱う', () => {
  const host = new URL(['https://amazo😀.example/'][0]).hostname;
  assert.ok(matchBrands({ host }).typo.some(hit => hit.id === 'amazon' && hit.kind === 'distance1'));
});
