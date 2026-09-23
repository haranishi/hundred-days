// 画面の文言（lib/view.js）。問数・推測の残り・当たりの見出し・料理の絵のパス
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { counterText, guessesLeftText, counterSpeech, wonHeadline, giveupCountText, dishImage } from '../lib/view.js';
import { buildModel } from '../lib/oracle.js';

test('問数は上限つきで、推測の残りは1問目から出す', () => {
  assert.equal(counterText(0), '1問目／25');
  assert.equal(counterText(11), '12問目／25');
  assert.equal(guessesLeftText(0), '推測 あと3回');
  assert.equal(guessesLeftText(2), '推測 あと1回');
  assert.equal(guessesLeftText(5), '推測 あと0回');
});

test('読み上げの問数は「／25」を言わず、外したあとだけ残りの推測を添える', () => {
  assert.equal(counterSpeech(0, 0), '1問目');
  assert.equal(counterSpeech(7, 1), '8問目、推測 あと2回');
});

test('1回目の推測で当たったときだけ「やはり、〜でしたか。」、2回目以降は「見えました。〜ですね。」', () => {
  assert.deepEqual(wonHeadline(1), { lead: 'やはり、', tail: 'でしたか。' });
  assert.deepEqual(wonHeadline(2), { lead: '見えました。', tail: 'ですね。' });
  assert.deepEqual(wonHeadline(3), { lead: '見えました。', tail: 'ですね。' });
});

test('教えずに終えたときの一行', () => {
  assert.equal(giveupCountText(25, 3), '25問と、推測3回では見えませんでした。');
  assert.equal(giveupCountText(25, 0), '25問では見えませんでした。');
});

test('料理の絵：一覧の料理は料理ごと、教わった料理は覆いをかけた皿。全品の絵がある', () => {
  assert.equal(dishImage({ id: 'curry', custom: false }), 'assets/dishes/curry.webp');
  assert.equal(dishImage({ id: 'u1', custom: true }), 'assets/dishes/mystery.webp');
  assert.equal(dishImage({ custom: true }), 'assets/dishes/mystery.webp');
  const root = new URL('../', import.meta.url);
  for (const item of buildModel().items) assert.ok(existsSync(new URL(dishImage(item), root)), `${item.id} の絵が無い`);
  assert.ok(existsSync(new URL(dishImage({ custom: true }), root)));
});
