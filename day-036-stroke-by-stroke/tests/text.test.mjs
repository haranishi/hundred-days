import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, codePointsOf, MAX_CHARS } from '../lib/text.js';

test('normalizeInput: 空白と制御文字を落とす', () => {
  const { chars, dropped } = normalizeInput(' 秋　田\n');
  assert.deepEqual(chars, ['秋', '田']);
  assert.equal(dropped, true);
});

test('normalizeInput: 結合用の濁点はNFCで1字にまとまる', () => {
  const { chars } = normalizeInput('が');
  assert.deepEqual(chars, ['が']);
});

test('normalizeInput: 異体字選択符号は落とす', () => {
  const { chars } = normalizeInput('葛︀城');
  assert.deepEqual(chars, ['葛', '城']);
});

test(`normalizeInput: ${MAX_CHARS}字を超えたら切って知らせる`, () => {
  const { chars, trimmed } = normalizeInput('あいうえおかきくけこ');
  assert.equal(chars.length, MAX_CHARS);
  assert.equal(trimmed, true);
  assert.deepEqual(chars, ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く']);
});

test('normalizeInput: 8字ちょうどは切らない', () => {
  const { trimmed } = normalizeInput('あいうえおかきく');
  assert.equal(trimmed, false);
});

test('normalizeInput: サロゲートペアを1字として数える', () => {
  const { chars } = normalizeInput('𠮷野家');
  assert.deepEqual(chars, ['𠮷', '野', '家']);
  assert.deepEqual(codePointsOf(chars), [0x20bb7, 0x91ce, 0x5bb6]);
});

test('normalizeInput: 空・null は空の配列', () => {
  assert.deepEqual(normalizeInput('').chars, []);
  assert.deepEqual(normalizeInput(null).chars, []);
  assert.deepEqual(normalizeInput('   ').chars, []);
});
