/* 実在のサイトを、ローカルのworkerd（本物の観測API）に通して保存した応答（tests/fixtures/real/）を使う回帰試験（メインの持ち物）。
   「スタブは実応答から作る」ため。手書きのfixtureと違い、実際の応答の形・上限・値の癖がそのまま入っている。
   取得日：2026-10-22。サイトの中身は変わるので、期待は幅を持たせ、細かい点数は固定しない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateTrace, validateAround, validateResult } from '../lib/contract.js';
import { parseInput } from '../lib/url-input.js';
import { analyzeLexical } from '../lib/lexical.js';
import { evaluate } from '../lib/rules.js';

const dir = fileURLToPath(new URL('./fixtures/real/', import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const NOW = Date.parse('2026-10-22T09:00:00Z');
const run = (traceFile, aroundFile = null) => {
  const trace = load(traceFile);
  const around = aroundFile ? load(aroundFile) : null;
  const parsed = parseInput(trace.requested);
  assert.ok(parsed.ok, trace.requested);
  const result = evaluate({ parsed, lexical: analyzeLexical(parsed), trace, around, now: NOW });
  const check = validateResult(result);
  assert.ok(check.ok, check.errors.slice(0, 3).join(' / '));
  return result;
};

test('実応答はすべて契約に合う（上限・許可リスト・Cookieの値なし）', () => {
  const files = readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 8);
  for (const name of files) {
    const value = load(name);
    const check = name.includes('around') ? validateAround(value) : validateTrace(value);
    assert.ok(check.ok, `${name}: ${check.errors.slice(0, 3).join(' / ')}`);
    assert.ok(!/set-cookie/i.test(JSON.stringify(value)), `${name}: set-cookie`);
    assert.ok(JSON.stringify(value).length < 65536, `${name}: 64KiB超`);
  }
});

test('example.com：兆候なし。守りは低い（HSTS・CSPなし、HTTPの入口が転送しない）', () => {
  const r = run('real-trace-example-com.json', 'real-around-example-com.json');
  assert.equal(r.visitor.level, 'ok');
  assert.ok(['D', 'F'].includes(r.owner.grade), r.owner.grade);
  const ids = r.findings.filter((f) => f.status === 'bad').map((f) => f.id);
  for (const id of ['O-HSTS-MISSING', 'O-CSP-MISSING']) assert.ok(ids.includes(id), `${id}がない`);
});

test('github.com：兆候なし。守りは高い', () => {
  const r = run('real-trace-github-com.json', 'real-around-github-com.json');
  assert.equal(r.visitor.level, 'ok');
  assert.ok(['A', 'B'].includes(r.owner.grade), `${r.owner.grade} ${r.owner.score}`);
  assert.ok(r.findings.some((f) => f.id === 'O-HSTS-OK'), 'HSTSの良い所見がない');
});

test('httpforever.com：HTTPだけのサイトは、訪問者は注意以下・運営者はHTTPSなしを指摘する', () => {
  const r = run('real-trace-httpforever-com.json');
  assert.ok(['note', 'warn'].includes(r.visitor.level), r.visitor.level);
  assert.ok(r.findings.some((f) => f.id === 'V-HTTP'));
});

test('mozilla.org：兆候なし', () => {
  const r = run('real-trace-mozilla-org-ja.json');
  assert.equal(r.visitor.level, 'ok');
});

test('expired.badssl.com：HTTPSで失敗しHTTPには応答がある→段階はunknown（断定しない）', () => {
  const trace = load('real-trace-expired-badssl-com.json');
  assert.equal(trace.ok, false);
  assert.equal(trace.error.code, 'tls_failed');
  const r = run('real-trace-expired-badssl-com.json');
  assert.equal(r.visitor.level, 'unknown');
  assert.equal(r.owner.score, null);
  assert.ok(!/期限切れです|証明書が切れ/.test(JSON.stringify(r)), '証明書の期限切れと断定している');
});

test('実応答のCSP・クッキー・HTML要素の例が、判定に届いている', () => {
  const github = load('real-trace-github-com.json');
  assert.ok(github.final.headers['content-security-policy']);
  assert.ok(github.final.cookies.length >= 1);
  assert.ok(github.html.scripts.external.length >= 1);
});
