import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domainToASCII } from 'node:url';
import { registrableDomain, PSL_VERSION } from '../lib/psl.js';
import { PSL_RULES, PSL_RULE_COUNT, PSL_OMITTED_RULES, PSL_COMMIT } from '../lib/psl-data.js';

// PSL公式の試験ベクタ(パブリックドメイン)。登録ドメインが無い(＝ホスト自身が公開サフィックス)ときは null。
const vectors = readFileSync(new URL('./fixtures/psl-test-vectors.txt', import.meta.url), 'utf8')
  .split('\n')
  .map(line => line.match(/^checkPublicSuffix\((null|'[^']*'), (null|'[^']*')\);$/))
  .filter(Boolean)
  .map(([, input, expected]) => [input === 'null' ? null : input.slice(1, -1), expected === 'null' ? null : expected.slice(1, -1)]);

const actualOf = (host) => {
  const result = registrableDomain(host);
  return result.isPublicSuffix ? null : result.registrable;
};

test('PSL公式の試験ベクタを数が合うまで通す', () => {
  assert.ok(vectors.length >= 75, `ベクタが読めていない: ${vectors.length}`);
  let checked = 0;
  for (const [input, expected] of vectors) {
    // null入力は呼び出し前に落ちる。先頭ドットはURLの標準が拒否する(parseInputがinvalidで返す)のでこの層の対象外。
    if (input === null || input.startsWith('.')) continue;
    assert.equal(actualOf(input), expected === null ? null : domainToASCII(expected), `${input} → ${expected}`);
    checked++;
  }
  assert.ok(checked >= 70, `検査数が少ない: ${checked}`);
});

test('日本の自治体: 政令市の例外規則とワイルドカード', () => {
  const cases = {
    'www.city.sapporo.jp': 'city.sapporo.jp',
    'www.city.kawasaki.jp': 'city.kawasaki.jp',
    // hamamatsu.shizuoka.jp・sagamihara.kanagawa.jp はそれ自体が公開サフィックスなので、city は普通のラベル
    'www.city.hamamatsu.shizuoka.jp': 'city.hamamatsu.shizuoka.jp',
    'www.city.sagamihara.kanagawa.jp': 'city.sagamihara.kanagawa.jp',
    'www.pref.hokkaido.jp': 'pref.hokkaido.jp',
    // lg.jp はPSL上は普通の公開サフィックス。県の名前(akita)までが登録ドメインになる
    'www.city.akita.lg.jp': 'akita.lg.jp',
    'a.b.kawasaki.jp': 'a.b.kawasaki.jp',
    'www.example.co.jp': 'example.co.jp',
    'www.example.tokyo.jp': 'example.tokyo.jp',
  };
  for (const [host, expected] of Object.entries(cases)) assert.equal(actualOf(host), expected, host);
});

test('利用者がサブドメインを取れるサービスは、利用者ごとに別の登録ドメインになる（J3）', () => {
  const first = registrableDomain('first.sakura.ne.jp');
  const second = registrableDomain('second.sakura.ne.jp');
  assert.equal(first.registrable, 'first.sakura.ne.jp');
  assert.equal(second.registrable, 'second.sakura.ne.jp');
  assert.equal(first.suffix, 'sakura.ne.jp');
  assert.equal(first.section, 'private');
  assert.deepEqual(first.subdomainLabels, []);
  const bucket = registrableDomain('bucket.s3.amazonaws.com');
  assert.equal(bucket.registrable, 'bucket.s3.amazonaws.com');
  assert.equal(bucket.suffix, 's3.amazonaws.com');
  assert.equal(bucket.section, 'private');
  const page = registrableDomain('www.user.github.io');
  assert.equal(page.registrable, 'user.github.io');
  assert.deepEqual(page.subdomainLabels, ['www']);
  assert.equal(registrableDomain('tenant.pages.dev').section, 'private');
  assert.equal(registrableDomain('app.vercel.app').section, 'private');
});

test('通常のドメインはICANN区画で、サブドメインの数を数え直す', () => {
  const result = registrableDomain('a.b.example.com');
  assert.deepEqual({ registrable: result.registrable, suffix: result.suffix, section: result.section, isPublicSuffix: result.isPublicSuffix }, { registrable: 'example.com', suffix: 'com', section: 'icann', isPublicSuffix: false });
  assert.deepEqual(result.subdomainLabels, ['a', 'b']);
  assert.equal(registrableDomain('www.amazon.co.jp.account-check.xyz').registrable, 'account-check.xyz');
  assert.equal(registrableDomain('smbc-card.com.login-secure.example').registrable, 'login-secure.example');
  // PSLに無いTLDは既定の「*」(最後の1ラベルだけが公開サフィックス)
  assert.equal(registrableDomain('www.something.zzzunlisted').registrable, 'something.zzzunlisted');
});

test('ホスト自身が公開サフィックスのとき isPublicSuffix=true で自身を返す', () => {
  for (const host of ['co.jp', 'github.io', 'com', 's3.amazonaws.com', 'x.kawasaki.jp', 'hamamatsu.shizuoka.jp']) {
    const result = registrableDomain(host);
    assert.equal(result.isPublicSuffix, true, host);
    assert.equal(result.registrable, host);
    assert.deepEqual(result.subdomainLabels, []);
  }
  // kawasaki.jp 自体は「*.kawasaki.jp」の対象外で、普通の登録ドメイン
  assert.equal(registrableDomain('kawasaki.jp').isPublicSuffix, false);
  assert.equal(registrableDomain('city.kawasaki.jp').isPublicSuffix, false);
});

test('大文字・末尾のドット・日本語名・IPアドレス・壊れた入力でも例外を出さない', () => {
  assert.equal(registrableDomain('WWW.Example.COM.').registrable, 'example.com');
  assert.equal(registrableDomain('例え.みんな').registrable, 'xn--r8jz45g.xn--q9jyb4c');
  assert.equal(registrableDomain('www.食狮.公司.cn').registrable, 'xn--85x722f.xn--55qx5d.cn');
  for (const ip of ['203.0.113.5', '0x7f.1', '[::1]', '::1', '2001:db8::1']) {
    const result = registrableDomain(ip);
    assert.equal(result.isPublicSuffix, false, ip);
    assert.deepEqual(result.subdomainLabels, [], ip);
  }
  for (const odd of ['', null, undefined, 42, {}, '.', '..', 'a..b', '__proto__', 'constructor', 'a.__proto__', 'toString.constructor']) {
    assert.doesNotThrow(() => registrableDomain(odd), String(odd));
  }
  // Objectの標準プロパティ名をTLDとして引かない
  assert.equal(registrableDomain('a.b.constructor').registrable, 'b.constructor');
  assert.equal(registrableDomain('a.b.__proto__').registrable, 'b.__proto__');
});

test('同梱データの中身: 版・出典コミット・規則数・サイズ', () => {
  assert.match(PSL_VERSION, /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC$/);
  assert.match(PSL_COMMIT, /^[0-9a-f]{40}$/);
  assert.ok(PSL_RULE_COUNT + PSL_OMITTED_RULES > 8900, `規則数: ${PSL_RULE_COUNT}+${PSL_OMITTED_RULES}`);
  // 公開前チェックに当たる自治体名の規則だけを除く仕組み。広い範囲を黙って落としていないことを固定する。
  assert.ok(Number.isInteger(PSL_OMITTED_RULES) && PSL_OMITTED_RULES >= 0 && PSL_OMITTED_RULES <= 5, `除外数: ${PSL_OMITTED_RULES}`);
  assert.ok(Object.keys(PSL_RULES).length > 300);
  assert.ok(Object.values(PSL_RULES).every(entry => Array.isArray(entry) && entry.length >= 1 && entry.length <= 2));
  const size = readFileSync(new URL('../lib/psl-data.js', import.meta.url)).length;
  assert.ok(size < 160 * 1024, `データが大きすぎる: ${size}`);
  assert.match(readFileSync(new URL('../lib/psl-data.js', import.meta.url), 'utf8').slice(0, 600), /MPL-2\.0/, 'ライセンスの表示が先頭に無い');
});

test('1万回の引きが十分に速い（無料枠のCPU対策）', () => {
  const hosts = ['www.example.com', 'a.b.sakura.ne.jp', 'x.s3.amazonaws.com', 'www.city.sapporo.jp', 'foo.bar.co.uk', 'shop.example.xn--55qx5d.cn', 'unknown.zzzunlisted', 'a.b.c.d.e.f.example.org', 'user.github.io', 'x.y.kawasaki.jp'];
  const started = performance.now();
  for (let i = 0; i < 10000; i++) registrableDomain(hosts[i % hosts.length]);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 500, `${elapsed.toFixed(1)}ms`);
});
