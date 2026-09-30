// 単語帳（data/words.js）が docs/WORDS.md の決まりを守っているかを確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, WORDS_VERSION } from '../data/words.js';
import { validateWords, normalizeAnswer, endingOf } from '../tools/validate-words.mjs';

test('単語帳は WORDS.md の決まりに1件も違反しない', () => {
  const { errors } = validateWords(WORDS);
  assert.deepEqual(errors, []);
});

test('WORDS_VERSION と項目の形', () => {
  assert.equal(WORDS_VERSION, 1);
  for (const w of WORDS) assert.deepEqual(Object.keys(w).sort(), ['c', 'g', 'k', 'r', 't']);
});

test('正規化は ENGINE.md の normalizeAnswer と同じ規則', () => {
  assert.equal(normalizeAnswer('きゅうり'), 'きゆうり');
  assert.equal(normalizeAnswer('トマト'), 'とまと');
  assert.equal(normalizeAnswer('らっこ'), 'らつこ');
  assert.equal(normalizeAnswer('ゔぁいおりん'), null);
  assert.equal(normalizeAnswer('ケーキ'), null);
  assert.equal(normalizeAnswer('ゐど'), null);
  assert.equal(normalizeAnswer('猫'), null);
});

test('検証は違反を見逃さない', () => {
  const bad = [
    { r: 'ねこ', k: '猫', t: 1, g: '動物', c: '猫はにゃあと鳴く家の用心棒でござる' },
    { r: 'ねこ', k: '猫', t: 1, g: '動物', c: 'にゃあと鳴いて鼠を捕る家の用心棒じゃ' },
    { r: 'けえき', k: 'ケーキ', t: 1, g: '菓子・飲み物', c: '誕生日に切り分ける甘い洋菓子じゃ' },
    { r: 'はし', k: '箸', t: 4, g: '道具', c: '短い' },
  ];
  const { errors } = validateWords(bad);
  const has = (s) => errors.some((e) => e.includes(s));
  assert.ok(has('答えの漢字「猫」'), '答えの漢字');
  assert.ok(has('盤での形「ねこ」'), '盤での形の重複');
  assert.ok(has('「ー」を含む'), '「ー」');
  assert.ok(has('t は 1・2・3'), '難しさ');
  assert.ok(has('分類 g'), '分類');
  assert.ok(has('問の長さ'), '問の長さ');
  assert.ok(has('合計'), '件数');
});

test('文末の種類の見分け', () => {
  assert.equal(endingOf('鍋をかける道具でござる'), 'ござる');
  assert.equal(endingOf('鍋をかける道具にござる'), 'ござる');
  assert.equal(endingOf('鍋をかける道具じゃ'), 'じゃ');
  assert.equal(endingOf('鍋をかける道具であろう'), 'であろう');
  assert.equal(endingOf('鍋をかける道具は何かの？'), 'かの？');
});
