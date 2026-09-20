import test from 'node:test';
import assert from 'node:assert/strict';
import { endingOf, widthAt, strokeOutline, numberAnchor } from '../lib/brush.js';

const line = (n = 21) => Array.from({ length: n }, (_, i) => [i * 5, 0]);

test('endingOf: 画の種別から終わり方を決める', () => {
  assert.equal(endingOf('㇐'), 'stop');
  assert.equal(endingOf('㇑'), 'stop');
  assert.equal(endingOf('㇔'), 'stop');
  assert.equal(endingOf('㇒'), 'taper');
  assert.equal(endingOf('㇏'), 'sweep');
  assert.equal(endingOf('㇚'), 'hook');
});

test('endingOf: 末尾の変種と斜線のあとは見ない', () => {
  assert.equal(endingOf('㇕a'), 'stop');
  assert.equal(endingOf('㇟a'), 'hook');
  assert.equal(endingOf('㇆/㇚'), 'hook');
  assert.equal(endingOf('㇑a/㇒'), 'stop');
});

test('endingOf: 種別が無い画は止めとして扱う', () => {
  assert.equal(endingOf(''), 'stop');
  assert.equal(endingOf(undefined), 'stop');
});

test('widthAt: どの終わり方でも入りは細い', () => {
  for (const ending of ['stop', 'taper', 'hook', 'sweep']) {
    assert.ok(widthAt(0, ending) < widthAt(0.3, ending), ending);
  }
});

test('widthAt: 払いは細く抜け、止めは太いまま終わる', () => {
  assert.ok(widthAt(1, 'taper') < 0.1);
  assert.ok(widthAt(1, 'stop') > 0.9);
});

test('widthAt: 跳ねは払いより手前まで太さを保つ', () => {
  assert.ok(widthAt(0.7, 'hook') > widthAt(0.7, 'taper'));
  assert.ok(widthAt(1, 'hook') < 0.3);
});

test('widthAt: 捺は送りでいちばん太くなる', () => {
  assert.ok(widthAt(0.8, 'sweep') > widthAt(0.8, 'stop'));
  assert.ok(widthAt(1, 'sweep') < widthAt(0.8, 'sweep'));
});

test('widthAt: 範囲の外は端の値に丸める', () => {
  assert.equal(widthAt(-1, 'stop'), widthAt(0, 'stop'));
  assert.equal(widthAt(2, 'taper'), widthAt(1, 'taper'));
});

test('strokeOutline: 進み具合が0なら何も描かない', () => {
  assert.deepEqual(strokeOutline(line(), 'stop', 8, 0), []);
  assert.deepEqual(strokeOutline([[0, 0]], 'stop', 8, 1), []);
});

test('strokeOutline: 途中まで描くと、その先には輪郭が伸びない', () => {
  const half = strokeOutline(line(), 'stop', 8, 0.5);
  const full = strokeOutline(line(), 'stop', 8, 1);
  const right = (poly) => Math.max(...poly.map((p) => p[0]));
  assert.ok(right(half) < right(full));
  assert.ok(Math.abs(right(half) - 50) < 6, `途中の右端 ${right(half)}`);
});

test('strokeOutline: 横線の輪郭は基準の太さぶんの幅を持つ', () => {
  const poly = strokeOutline(line(), 'stop', 8, 1);
  const top = Math.min(...poly.map((p) => p[1]));
  const bottom = Math.max(...poly.map((p) => p[1]));
  assert.ok(bottom - top > 7 && bottom - top < 9, `太さ ${bottom - top}`);
});

test('strokeOutline: 払いの終わりは止めの終わりより細い', () => {
  const widthAtEnd = (ending) => {
    const poly = strokeOutline(line(), ending, 8, 1);
    const near = poly.filter((p) => p[0] > 98);
    return Math.max(...near.map((p) => p[1])) - Math.min(...near.map((p) => p[1]));
  };
  assert.ok(widthAtEnd('taper') < widthAtEnd('stop'));
});

test('numberAnchor: 番号は画が来る向きと逆へ逃げる', () => {
  const [x, y] = numberAnchor(line(), 7);
  assert.ok(x < 0, `x=${x}`);
  assert.ok(Math.abs(y) < 1e-6);
});
