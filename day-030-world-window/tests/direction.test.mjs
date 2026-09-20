import test from 'node:test';
import assert from 'node:assert/strict';
import { compassLabel, parseDirection } from '../lib/direction.js';

test('direction: 数値・範囲・複数値の先頭を0〜359度にする', () => {
  assert.equal(parseDirection(90), 90);
  assert.equal(parseDirection('90-180'), 90);
  assert.equal(parseDirection('90;180'), 90);
  assert.equal(parseDirection('-10'), 350);
  assert.equal(parseDirection('360'), 0);
  assert.equal(parseDirection('不明'), null);
});

test('direction: 16方位語と日本語ラベルを相互に扱う', () => {
  assert.equal(parseDirection('NE'), 45);
  assert.equal(parseDirection('SSW'), 203);
  assert.equal(compassLabel(0), '北');
  assert.equal(compassLabel(45), '北東');
  assert.equal(compassLabel(202.5), '南南西');
  assert.equal(compassLabel(359), '北');
});
