/* 独立レビュー（J1〜J8）で見つかった入力を、住所→判定の全体で固定する（メインの持ち物）。
   各担当の単体試験が通っていても、担当をまたぐ入力（転送先の偽装・利用者のサブドメイン・実在ドメイン一覧）はここで見る。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateResult } from '../lib/contract.js';
import { parseInput } from '../lib/url-input.js';
import { analyzeLexical } from '../lib/lexical.js';
import { evaluate } from '../lib/rules.js';
import { registrableDomain } from '../lib/psl.js';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const NOW = Date.parse('2026-10-22T09:00:00Z');
const RANK = { unknown: -1, ok: 0, note: 1, warn: 2, danger: 3 };

function run(raw, trace = null, around = null) {
  const parsed = parseInput(raw);
  assert.ok(parsed.ok, `${raw}: ${parsed.reason}`);
  const result = evaluate({ parsed, lexical: analyzeLexical(parsed), trace, around, now: NOW });
  const check = validateResult(result);
  assert.ok(check.ok, `${raw}: ${check.errors.slice(0, 3).join(' / ')}`);
  return result;
}
const ids = (result, prefix = '') => result.findings.filter((f) => f.id.startsWith(prefix)).map((f) => f.id);
const find = (result, id) => result.findings.find((f) => f.id === id);

/** 取得済みのきれいなサイトの観測を、指定ホストに合わせる（ホストだけ違う対照。実サイトの観測ではない） */
function observe(finalUrl, { requested = finalUrl, hops = [], html = {} } = {}) {
  const trace = load('trace-clean.json');
  const around = load('around-clean.json');
  const u = new URL(finalUrl);
  trace.requested = requested;
  trace.hops = hops;
  Object.assign(trace.final, { url: u.href, host: u.hostname, scheme: u.protocol.slice(0, -1) });
  Object.assign(trace.html, { forms: [], passwordFields: 0, ...html });
  trace.html.scripts.external = [];
  trace.html.styles.external = [];
  Object.assign(around, { host: u.hostname, registrable: registrableDomain(u.hostname).registrable, scheme: u.protocol.slice(0, -1) });
  return { trace, around };
}
const hop = (url, location) => ({ url, host: new URL(url).hostname, status: 301, location, ms: 1 });
const passwordForm = (actionHost) => ({ method: 'post', action: actionHost ? `https://${actionHost}/login` : '/login', actionHost: actionHost ?? null, hasPassword: true, hasEmail: false, hasCardLike: false, hasFileUpload: false, fieldCount: 2, hidden: false });

test('実在の正規ドメイン241件: ブランド所見が1件も出ない（誤検知0）', () => {
  const hosts = [...load('legit-domains.json'), ...load('legit-domains-jp.json')];
  assert.ok(hosts.length >= 241, `件数: ${hosts.length}`);
  const flagged = [];
  for (const host of hosts) {
    const raw = `https://${host}/`;
    const offline = run(raw);
    const { trace, around } = observe(raw);
    const clean = run(raw, trace, around);
    for (const result of [offline, clean]) {
      const brand = ids(result, 'V-BRAND-');
      if (brand.length) flagged.push(`${host}: ${brand.join(',')}`);
    }
    assert.ok(RANK[clean.visitor.level] <= RANK.ok, `${host}: ${clean.visitor.level} ${clean.visitor.points}点`);
  }
  assert.deepEqual(flagged, []);
});

test('フィッシング型34件: 限界の3件を名指しで固定し、残りは「注意」以上', () => {
  const types = load('phish-types.json');
  assert.equal(types.length, 34);
  // 設計上の限界：パスの語だけ／弱い語だけ／ブランド名のない共有ホスト。これ以外が「注意」未満になったら見逃し。
  const WEAK = new Set(['https://random.top/amazon/login', 'https://smbc-vpass.top/', 'https://bank-login.sakura.ne.jp/']);
  const missed = [];
  for (const { url } of types) {
    const { trace, around } = observe(url);
    const result = run(url, trace, around);
    const weak = RANK[result.visitor.level] < RANK.warn;
    if (weak !== WEAK.has(url)) missed.push(`${url}: ${result.visitor.level} ${result.visitor.points}点 ${ids(result, 'V-').join(',')}`);
  }
  assert.deepEqual(missed, []);
});

test('J1: 短縮URL・転送サービス経由で偽装先に着いても、直接入力と同じ所見が出る', () => {
  const spoof = 'https://amazon.co.jp.account-check.xyz/signin';
  const direct = run(spoof, ...Object.values(observe(spoof)));
  assert.equal(direct.visitor.level, 'danger');
  for (const entrance of ['https://bit.ly/test', 'https://t.co/test', 'https://www.google.com/url?q=x']) {
    const { trace, around } = observe(spoof, { requested: entrance, hops: [hop(entrance, spoof)] });
    const via = run(entrance, trace, around);
    assert.equal(via.visitor.level, 'danger', `${entrance}: ${via.visitor.level} ${via.visitor.points}点`);
    assert.ok(ids(via).includes('V-BRAND-SUBDOMAIN'), entrance);
    assert.notEqual(find(via, 'V-OFFICIAL-DOMAIN')?.status, 'good', `${entrance}: 入口の公式一致を転送先の保証にしている`);
  }
});

test('J1: 途中だけ偽装ドメインを経由して、最終ページがきれいでも事実として出す', () => {
  const clean = 'https://ordinary.example.org/';
  const middle = 'https://amazon.co.jp.account-check.xyz/r';
  const { trace, around } = observe(clean, { requested: 'https://bit.ly/test', hops: [hop('https://bit.ly/test', middle), hop(middle, clean)] });
  const result = run('https://bit.ly/test', trace, around);
  assert.ok(RANK[result.visitor.level] >= RANK.warn, `${result.visitor.level} ${result.visitor.points}点`);
  assert.ok(ids(result).includes('V-BRAND-SUBDOMAIN'));
});

test('J2: S3のバケットに置いたAmazon確認画面は、公式扱いにならず注意以上', () => {
  for (const raw of ['https://bucket.s3.amazonaws.com/', 'https://amazon-login.s3.amazonaws.com/']) {
    const { trace, around } = observe(raw, { html: { title: 'Amazon アカウント確認', passwordFields: 1, forms: [passwordForm()] } });
    const result = run(raw, trace, around);
    assert.ok(RANK[result.visitor.level] >= RANK.warn, `${raw}: ${result.visitor.level} ${result.visitor.points}点`);
    assert.equal(find(result, 'V-OFFICIAL-DOMAIN'), undefined, raw);
    assert.ok(ids(result).includes('V-SHARED-HOST'), raw);
    assert.ok(ids(result).includes('V-BRAND-CONTENT'), raw);
  }
  // 同じ内容をAmazon自身のドメインに置いても、利用者のページとは見なさない（対照）
  const official = 'https://www.amazon.co.jp/ap/signin';
  const { trace, around } = observe(official, { html: { title: 'Amazon ログイン', passwordFields: 1, forms: [passwordForm()] } });
  assert.deepEqual(ids(run(official, trace, around), 'V-BRAND-'), []);
});

test('J3: 別々の利用者のサブドメインへパスワードを送るフォームは、別の登録ドメイン宛てとして検出する', () => {
  for (const [from, to] of [['first.sakura.ne.jp', 'second.sakura.ne.jp'], ['first.tokyo.jp', 'second.tokyo.jp'], ['first.s3.amazonaws.com', 'second.s3.amazonaws.com'], ['alice.github.io', 'bob.github.io']]) {
    const raw = `https://${from}/`;
    const { trace, around } = observe(raw, { html: { passwordFields: 1, forms: [passwordForm(to)] } });
    const result = run(raw, trace, around);
    assert.ok(ids(result).includes('V-CROSS-FORM'), `${from} → ${to}: ${ids(result).join(',')}`);
    assert.ok(RANK[result.visitor.level] >= RANK.warn, `${from} → ${to}`);
  }
  // 同じ利用者の別ホストは、同じ登録ドメイン宛て（対照）
  const raw = 'https://www.alice.github.io/';
  const { trace, around } = observe(raw, { html: { passwordFields: 1, forms: [passwordForm('login.alice.github.io')] } });
  assert.ok(!ids(run(raw, trace, around)).includes('V-CROSS-FORM'));
});

test('J5: ハイフンを含む短い語（e-tax）を、ドメイン・サブドメイン・パスのどこでも拾う', () => {
  for (const raw of ['https://e-tax-login.top/', 'https://verify.e-tax.top/', 'https://ordinary.top/e-tax/login', 'https://e-tax-refund-confirm.top/']) {
    const { trace, around } = observe(raw);
    const result = run(raw, trace, around);
    assert.ok(ids(result).includes('V-BRAND-KEYWORD'), `${raw}: ${ids(result).join(',')}`);
  }
  // 語の途中には当たらない（対照）
  for (const raw of ['https://some-e-taxi.example.org/', 'https://www.nta.go.jp/', 'https://www.e-tax.nta.go.jp/']) {
    const { trace, around } = observe(raw);
    assert.deepEqual(ids(run(raw, trace, around), 'V-BRAND-').filter((id) => id !== 'V-BRAND-CONTENT'), [], raw);
  }
});

test('J6: 制御文字と長すぎるホストは、通信の前に入力エラーとして断る', () => {
  for (const raw of ['example.com/a\u0000b', 'example.com/a\u0001b', 'example.com/a\u0085b', 'example.com\u007f/']) {
    const parsed = parseInput(raw);
    assert.equal(parsed.ok, false, JSON.stringify(raw));
  }
  const long = parseInput(`https://${'a.'.repeat(130)}com/`);
  assert.equal(long.ok, false);
  assert.equal(long.reason, 'too_long');
});
