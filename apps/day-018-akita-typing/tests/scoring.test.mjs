import test from 'node:test';
import assert from 'node:assert/strict';

import { accuracy, formatYen, keysPerSecond, paceDelta, priceOfReading, scaledTarget, settle, stumbles } from '../lib/scoring.js';

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

test('元が取れるペースからのずれ', () => {
  // 始まった瞬間は誰も遅れていない（要求は0円）
  assert.equal(paceDelta(0, 3000, 0, 60_000), 0);
  // 半分の時点で半分食べていればちょうど
  assert.equal(paceDelta(1500, 3000, 30_000, 60_000), 0);
  assert.equal(paceDelta(1000, 3000, 30_000, 60_000), -500);
  assert.equal(paceDelta(2000, 3000, 30_000, 60_000), 500);
  // 終了時は目標との差そのもの
  assert.equal(paceDelta(2830, 3000, 60_000, 60_000), -170);
  // すでに目標へ届いていれば、残り時間があっても必ず先行
  assert.ok(paceDelta(3000, 3000, 1, 60_000) > 0);
  // 時間を超えて呼ばれても要求は目標額で頭打ち
  assert.equal(paceDelta(3000, 3000, 90_000, 60_000), 0);
  // 按分後の目標額でも同じ計算になる（?duration=15 の回）
  assert.equal(paceDelta(375, scaledTarget(3000, 15_000, 60_000), 7_500, 15_000), 0);
});
