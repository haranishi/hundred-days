import test from 'node:test';
import assert from 'node:assert/strict';

import { accuracy, formatYen, keysPerSecond, priceOfReading, scaledTarget, settle, stumbles } from '../lib/scoring.js';

test('値段は打鍵数で決まる（かなの文字数ではない）', () => {
  // はたはた は4かなだが8打、じゅんさい は5かなだが6打。打つ手間の順になっているか
  assert.ok(priceOfReading('はたはた') > priceOfReading('じゅんさい'));
  assert.equal(priceOfReading('じゅんさい'), 100);
  assert.equal(priceOfReading('しょっつるなべ'), 350);
});

test('会計は得・損・ちょうどを見分ける', () => {
  assert.equal(settle(3200, 3000).verdict, 'profit');
  assert.equal(settle(2800, 3000).verdict, 'loss');
  assert.equal(settle(3000, 3000).verdict, 'even');
  assert.equal(settle(2800, 3000).diff, -200);
});

test('回を短くするとコース料金も按分される', () => {
  // 既定の60秒はそのまま
  assert.equal(scaledTarget(3000, 60_000, 60_000), 3000);
  // 15秒なら4分の1。50円単位に丸める
  assert.equal(scaledTarget(3000, 15_000, 60_000), 750);
  assert.equal(scaledTarget(1500, 15_000, 60_000), 400);
  // どんなに短くしても0円のコースにはしない
  assert.equal(scaledTarget(1500, 5_000, 60_000), 150);
  assert.ok(scaledTarget(100, 5_000, 60_000) >= 50);
});

test('打鍵速度と正確率', () => {
  assert.equal(keysPerSecond(120, 60_000), 2);
  assert.equal(keysPerSecond(10, 0), 0);
  assert.equal(accuracy(90, 10), 90);
  assert.equal(accuracy(0, 0), 0);
});

test('つまずいた打鍵は多い順。同数はキーの順で安定する', () => {
  const top = stumbles({ b: 3, a: 1, z: 5, y: 1, q: 0 });
  assert.deepEqual(top, [{ key: 'z', count: 5 }, { key: 'b', count: 3 }, { key: 'a', count: 1 }]);
});

test('1度もミスしていなければ空', () => {
  assert.deepEqual(stumbles({}), []);
  assert.deepEqual(stumbles({ a: 0 }), []);
});

test('金額の表示', () => {
  assert.equal(formatYen(3000), '¥3,000');
  assert.equal(formatYen(-200), '-¥200');
  assert.equal(formatYen(0), '¥0');
});
