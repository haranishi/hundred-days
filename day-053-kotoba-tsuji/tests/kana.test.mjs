import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED, normalizeAnswer, toggleDakuten, toggleHandakuten, BOARD_COLUMNS, kanjiNumeral,
} from '../lib/kana.js';

test('ALLOWED：清音46＋濁音20＋半濁音5、ゐゑゔ・ー・小さい字は無い', () => {
  assert.equal(ALLOWED.size, 71);
  for (const ch of 'あんをがぢづぽ') assert.ok(ALLOWED.has(ch), ch);
  for (const ch of 'ゐゑゔーぁっゃゎ') assert.ok(!ALLOWED.has(ch), ch);
});

test('normalizeAnswer：カタカナ・小さい字・ー・漢字・記号', () => {
  const cases = [
    ['ねこ', 'ねこ'],
    ['ネコ', 'ねこ'],
    ['きゅうり', 'きゆうり'],
    ['キュウリ', 'きゆうり'],
    ['きっぷ', 'きつぷ'],
    ['ぁぃぅぇぉっゃゅょゎ', 'あいうえおつやゆよわ'],
    ['ﾈｺ', 'ねこ'], // 半角カナ
    ['がみ', 'がみ'], // 濁点が結合文字で届いた形（NFD）
    ['ラーメン', null],
    ['猫', null],
    ['ねこ！', null],
    ['ね こ', null],
    ['ヴァイオリン', null],
    ['ゐど', null],
    ['', null],
  ];
  for (const [input, want] of cases) assert.equal(normalizeAnswer(input), want, input);
  assert.equal(normalizeAnswer(null), null);
  assert.equal(normalizeAnswer(12), null);
});

test('toggleDakuten／toggleHandakuten', () => {
  const daku = [['か', 'が'], ['が', 'か'], ['し', 'じ'], ['つ', 'づ'], ['は', 'ば'], ['ば', 'は'], ['ぱ', 'ば'], ['ほ', 'ぼ']];
  for (const [a, b] of daku) assert.equal(toggleDakuten(a), b, a);
  for (const ch of ['あ', 'う', 'な', 'ん', 'を', '']) assert.equal(toggleDakuten(ch), null, ch);
  const handa = [['は', 'ぱ'], ['ぱ', 'は'], ['ば', 'ぱ'], ['ほ', 'ぽ'], ['ぼ', 'ぽ']];
  for (const [a, b] of handa) assert.equal(toggleHandakuten(a), b, a);
  for (const ch of ['か', 'が', 'あ', 'ん']) assert.equal(toggleHandakuten(ch), null, ch);
});

test('BOARD_COLUMNS：右から あ・か…わ の10列、空きは null', () => {
  assert.equal(BOARD_COLUMNS.length, 10);
  assert.deepEqual(BOARD_COLUMNS[0], ['あ', 'い', 'う', 'え', 'お']);
  assert.deepEqual(BOARD_COLUMNS[7], ['や', null, 'ゆ', null, 'よ']);
  assert.deepEqual(BOARD_COLUMNS[9], ['わ', null, 'を', null, 'ん']);
  const chars = BOARD_COLUMNS.flat().filter(Boolean);
  assert.equal(chars.length, 46);
  assert.equal(new Set(chars).size, 46);
  for (const ch of chars) assert.ok(ALLOWED.has(ch), ch);
});

test('kanjiNumeral', () => {
  const cases = [[1, '一'], [9, '九'], [10, '十'], [11, '十一'], [12, '十二'], [20, '二十'], [21, '二十一'], [99, '九十九']];
  for (const [n, want] of cases) assert.equal(kanjiNumeral(n), want, String(n));
});
