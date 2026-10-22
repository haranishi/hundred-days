import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  API_VERSION, LIMITS, HEADER_ALLOWLIST, validateTrace, validateAround, validateResult, validateHtmlFacts
} from '../lib/contract.js';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();

test('手書きの観測データはすべて契約に合う', () => {
  assert.ok(names.length >= 10, '観測データが少なすぎる');
  for (const name of names) {
    const value = load(name);
    const result = name.startsWith('around-') ? validateAround(value) : name.startsWith('trace-') ? validateTrace(value) : null;
    if (result) assert.ok(result.ok, `${name}: ${result.errors.slice(0, 3).join(' / ')}`);
  }
});

test('LIMITSは設計の数字と食い違わない', () => {
  assert.equal(API_VERSION, 1);
  assert.equal(LIMITS.MAX_REDIRECTS, 5);
  assert.equal(LIMITS.BODY_CAP_BYTES, 64 * 1024);
  assert.equal(LIMITS.RATE_PER_MINUTE, 12);
  assert.equal(LIMITS.CACHE_TTL_S, 300);
  assert.equal(LIMITS.MAX_URL_LENGTH, 2048);
  assert.ok(Object.isFrozen(LIMITS));
});

test('traceの意味の整合を見る', () => {
  const ok = load('trace-clean.json');
  assert.ok(validateTrace(ok).ok);
  assert.ok(!validateTrace({ ...ok, final: null }).ok, 'ok=trueでfinalがない');
  assert.ok(!validateTrace({ ...ok, error: { code: 'timeout', stage: 'timeout', host: null, detail: null } }).ok, 'ok=trueでerrorがある');
  const failed = load('trace-dns-failed.json');
  assert.ok(validateTrace(failed).ok);
  assert.ok(!validateTrace({ ...failed, error: null }).ok, 'ok=falseでerrorがない');
  assert.ok(!validateTrace({ ...ok, html: ok.html, final: { ...ok.final, kind: 'other' } }).ok, 'HTML以外にhtmlがある');
});

test('許可リスト外のヘッダー・未定義のキー・上限超過・制御文字・転送の多すぎを拒む', () => {
  const base = load('trace-clean.json');
  const withHeader = structuredClone(base);
  withHeader.final.headers['set-cookie'] = 'sid=secret';
  assert.ok(!validateTrace(withHeader).ok, 'set-cookieを返してはいけない');
  assert.ok(validateTrace(withHeader, { strict: false }).ok, '画面側の寛容な検査は未知のヘッダーを許す');

  const extra = structuredClone(base);
  extra.final.typo = 1;
  assert.ok(!validateTrace(extra).ok);

  const long = structuredClone(base);
  long.html.title = 'あ'.repeat(LIMITS.STR_SHORT + 1);
  assert.ok(!validateTrace(long).ok);

  const ctrl = structuredClone(base);
  ctrl.html.h1 = 'a\u0000b';
  assert.ok(!validateTrace(ctrl).ok);

  const hops = structuredClone(load('trace-shortener.json'));
  hops.hops = Array.from({ length: LIMITS.MAX_REDIRECTS + 1 }, () => hops.hops[0]);
  assert.ok(!validateTrace(hops).ok);

  const cookies = structuredClone(base);
  cookies.final.cookies = Array.from({ length: LIMITS.MAX_COOKIES + 1 }, () => cookies.final.cookies[0]);
  assert.ok(!validateTrace(cookies).ok);
});

test('HEADER_ALLOWLISTにCookieと認証情報を入れない', () => {
  for (const banned of ['set-cookie', 'cookie', 'authorization', 'proxy-authorization']) {
    assert.ok(!HEADER_ALLOWLIST.includes(banned), banned);
  }
  assert.equal(new Set(HEADER_ALLOWLIST).size, HEADER_ALLOWLIST.length);
  assert.ok(HEADER_ALLOWLIST.every((name) => name === name.toLowerCase()));
});

test('aroundは失敗の型も受け付け、形が違えば拒む', () => {
  assert.ok(validateAround(load('around-unavailable.json')).ok);
  const clean = load('around-clean.json');
  assert.ok(!validateAround({ ...clean, rdap: { registeredAt: 'x' } }).ok);
  assert.ok(!validateAround({ ...clean, dns: { a: [] } }).ok);
});

test('HtmlFactsの検査単体', () => {
  assert.ok(validateHtmlFacts(load('trace-clean.json').html).ok);
  assert.ok(!validateHtmlFacts({}).ok);
});

test('Resultの検査は最小の形を受け付け、段階の列挙外を拒む', () => {
  const result = {
    v: 1,
    target: { input: 'https://x.example/', href: 'https://x.example/', host: 'x.example', hostUnicode: 'x.example', registrable: 'x.example', finalUrl: null, finalHost: null, chain: [] },
    visitor: { level: 'ok', points: 0, headline: 'h', summary: 's', actions: [], reasons: [] },
    owner: { score: null, grade: null, note: '', provisional: false, topFixes: [] },
    findings: [], limits: [], partial: { trace: false, around: false }, evaluatedAt: '2026-10-22T00:00:00Z'
  };
  assert.ok(validateResult(result).ok, validateResult(result).errors.join());
  assert.ok(!validateResult({ ...result, visitor: { ...result.visitor, level: 'safe' } }).ok, '「safe」という段階は存在しない');
  assert.ok(!validateResult({ ...result, visitor: { ...result.visitor, actions: ['a', 'b', 'c', 'd'] } }).ok);
});
