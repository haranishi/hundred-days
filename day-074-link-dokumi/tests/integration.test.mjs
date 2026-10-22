/* 担当をまたぐ整合の試験（メインの持ち物）。住所・判定・観測の3つが同じ前提で動くことを固定する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateResult } from '../lib/contract.js';
import { parseInput } from '../lib/url-input.js';
import { analyzeLexical } from '../lib/lexical.js';
import { evaluate } from '../lib/rules.js';
import { validateTarget } from '../lib/target-guard.js';
import { SAMPLES } from '../lib/samples.js';
import * as messages from '../lib/messages.js';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const NOW = Date.parse('2026-10-22T09:00:00Z');
const BANNED = messages.BANNED_PHRASES ?? [];

const run = (url, trace = null, around = null) => {
  const parsed = parseInput(url);
  assert.ok(parsed.ok, `${url}: ${parsed.reason}`);
  const lexical = analyzeLexical(parsed);
  return { parsed, lexical, result: evaluate({ parsed, lexical, trace, around, now: NOW }) };
};
const text = (result) => JSON.stringify(result);

test('攻撃用のURLは、住所の事前判定でも宛先検査でも「接続しない」で一致する', () => {
  const { attack } = load('attack-urls.json');
  for (const raw of attack) {
    const parsed = parseInput(raw);
    const pre = !parsed.ok || parsed.fetch.allowed === false;
    const guard = validateTarget(raw, { selfHosts: ['hundred-days.pages.dev'] });
    assert.ok(guard.ok === false, `宛先検査が通してしまう: ${JSON.stringify(raw)}`);
    /* 改行を含む入力は、画面側では「メッセージの全文」として最初のリンクだけを取り出す（正しい動き）。
       取り出した後のURLが通るのは意図どおりなので、事前判定の一致は、改行を含まない入力だけで見る */
    if (!/[\n\r\t]/.test(raw)) assert.ok(pre, `事前判定が通してしまう（サーバーは断るが、無駄な通信になる）: ${JSON.stringify(raw)}`);
  }
});

test('ふつうのURLは、どちらも通す', () => {
  for (const raw of load('attack-urls.json').benign) {
    const parsed = parseInput(raw);
    assert.ok(parsed.ok && parsed.fetch.allowed, `事前判定が断る: ${raw} ${JSON.stringify(parsed.fetch)}`);
    assert.ok(validateTarget(raw).ok, `宛先検査が断る: ${raw}`);
  }
});

test('見本3つは、実在しない名前で、通信なしに結果を出せる', () => {
  assert.equal(SAMPLES.length, 3);
  for (const sample of SAMPLES) {
    assert.match(new URL(sample.url).hostname, /\.example$/, `${sample.id}: 実在しない予約済みTLDではない`);
    const { result } = run(sample.url, sample.trace, sample.around);
    const check = validateResult(result);
    assert.ok(check.ok, `${sample.id}: ${check.errors.slice(0, 3).join(' / ')}`);
  }
});

test('見本の判定：なりすまし風はdanger、しっかりしたサイトはok・A、古いサイトはwarn以上・F', () => {
  const by = Object.fromEntries(SAMPLES.map((s) => [s.id, run(s.url, s.trace, s.around).result]));
  assert.equal(by.lookalike.visitor.level, 'danger');
  assert.equal(by.clean.visitor.level, 'ok');
  assert.equal(by.clean.owner.grade, 'A');
  assert.ok(['warn', 'danger'].includes(by.legacy.visitor.level), by.legacy.visitor.level);
  assert.equal(by.legacy.owner.grade, 'F');
  // 2つの軸は混ざらない：守りが堅いサイトは、守りがAでも「安全」とは言わない
  assert.ok(!/安全です/.test(text(by.clean)));
});

test('観測データのすべての組み合わせ（nullも）で、判定が例外なく契約に合う', () => {
  const traces = readdirSync(dir).filter((n) => n.startsWith('trace-'));
  const arounds = readdirSync(dir).filter((n) => n.startsWith('around-'));
  let count = 0;
  for (const t of [null, ...traces]) {
    for (const a of [null, ...arounds]) {
      const trace = t ? load(t) : null;
      const around = a ? load(a) : null;
      const url = trace?.requested?.startsWith('http') && parseInput(trace.requested).ok ? trace.requested : 'https://www.well-kept.example/';
      const { result } = run(url, trace, around);
      const check = validateResult(result);
      assert.ok(check.ok, `${t}×${a}: ${check.errors.slice(0, 3).join(' / ')}`);
      count += 1;
    }
  }
  assert.ok(count >= 60, `組み合わせが少ない: ${count}`);
});

test('どの結果にも、断定する語が出ない', () => {
  assert.ok(BANNED.length >= 6, 'BANNED_PHRASESが未定義、または少なすぎる');
  const traces = readdirSync(dir).filter((n) => n.startsWith('trace-'));
  for (const t of [null, ...traces]) {
    const trace = t ? load(t) : null;
    const url = trace?.requested?.startsWith('http') && parseInput(trace.requested).ok ? trace.requested : 'https://www.well-kept.example/';
    const around = t === 'trace-clean.json' ? load('around-clean.json') : t === 'trace-lookalike.json' ? load('around-lookalike.json') : null;
    const { result } = run(url, trace, around);
    const body = text(result);
    for (const phrase of BANNED) assert.ok(!body.includes(phrase), `${t}: 「${phrase}」が出ている`);
  }
});

test('敵対的な値が、判定の文面に生のHTMLとして混ざらない（画面は文字としてだけ表示する前提）', () => {
  const trace = load('trace-hostile.json');
  const { result } = run('https://hostile.example/', trace, null);
  // 判定側は値をそのまま運んでよい（描画側が textContent で出す）。ただし制御文字は持ち込まない
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text(result)));
  assert.ok(validateResult(result).ok);
});
