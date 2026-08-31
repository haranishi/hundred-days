import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRACE_MS, FLOOR_RATIO, tailMs, revealedCount, maskReading, basePoints, scoreFor
} from '../lib/hint.js';

const TRAVEL = 6000;

test('開示は考える時間のあいだ始まらない', () => {
  for (const elapsed of [0, 200, GRACE_MS - 1]) {
    assert.equal(revealedCount({ elapsed, travelMs: TRAVEL, kanaLength: 4 }), 0);
  }
});

test('開き切るのは着弾ではなく「着弾 − 打ち切る時間」', () => {
  const kanaLength = 4;
  const full = TRAVEL - tailMs(kanaLength);
  assert.equal(revealedCount({ elapsed: full, travelMs: TRAVEL, kanaLength }), kanaLength);
  assert.ok(revealedCount({ elapsed: full - 1, travelMs: TRAVEL, kanaLength }) < kanaLength);
  // 開き切ってからでも、着弾までに打ち切る時間が残っている
  assert.ok(TRAVEL - full >= kanaLength * 200);
});

test('開示は単調に増え、かな長を超えない', () => {
  let prev = -1;
  for (let elapsed = 0; elapsed <= TRAVEL + 500; elapsed += 50) {
    const r = revealedCount({ elapsed, travelMs: TRAVEL, kanaLength: 6 });
    assert.ok(r >= prev, `${elapsed}ms で減った`);
    assert.ok(r <= 6);
    prev = r;
  }
});

test('接近が速い回でも、着弾前に開き切る', () => {
  for (const travelMs of [1200, 2000, 3600]) {
    for (const kanaLength of [2, 4, 8]) {
      const atImpact = revealedCount({ elapsed: travelMs, travelMs, kanaLength });
      assert.equal(atImpact, kanaLength, `travel=${travelMs} len=${kanaLength}`);
    }
  }
});

test('伏せ字は開示ぶんだけ開く', () => {
  assert.equal(maskReading('のぞき', 0), '○○○');
  assert.equal(maskReading('のぞき', 1), 'の○○');
  assert.equal(maskReading('のぞき', 3), 'のぞき');
});

test('開示が少ないほど点が高い', () => {
  const base = 300;
  const kanaLength = 4;
  const pts = [0, 1, 2, 3, 4].map((revealed) => scoreFor({ base, revealed, kanaLength }));
  assert.equal(pts[0], base);
  assert.equal(pts[4], Math.round(base * FLOOR_RATIO));
  for (let i = 1; i < pts.length; i += 1) assert.ok(pts[i] < pts[i - 1]);
});

test('開き切っても点は0にならない（0だと打つ意味が消える）', () => {
  assert.ok(scoreFor({ base: 100, revealed: 5, kanaLength: 5 }) > 0);
});

test('満点は難読度で決まり、範囲外を渡しても壊れない', () => {
  assert.ok(basePoints(1) > basePoints(0));
  assert.equal(basePoints(-5), basePoints(0));
  assert.equal(basePoints(99), basePoints(1));
});
