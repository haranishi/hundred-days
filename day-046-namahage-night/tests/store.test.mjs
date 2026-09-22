import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, RULES_VERSION, SEAL, defaults, readStore, writeStore, recordClear, sanitize, sealCount } from '../lib/store.js';
test('1キーだけで記録と音設定を読み書きし、v2の記録を持つ', () => {
  const map = new Map(), storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
  const value = { ...defaults(), unlockedWorld: 2, recordsV2: { '1-5': { bestTicks: 1234, bestScore: 900, seals: 5 } }, muted: true };
  assert.ok(writeStore(storage, value));
  assert.deepEqual(readStore(storage), value);
  assert.deepEqual([...map.keys()], [KEY]);
  assert.equal(JSON.parse(map.get(KEY)).rulesVersion, RULES_VERSION);
});
test('壊れたJSON・例外・不正値を無視', () => {
  for (const text of ['{', 'null', '[]', '42']) assert.deepEqual(readStore({ getItem: () => text }), defaults());
  assert.deepEqual(readStore(), defaults());
  assert.equal(writeStore(), false);
  assert.deepEqual(sanitize({ unlockedWorld: 99, muted: 'true', recordsV2: { '5-1': { bestTicks: 1, bestScore: 0, seals: 0 } } }), defaults());
});
test('v2記録は非整数・負値・未知ID・範囲外のお札を捨てる', () => {
  const kept = sanitize({ recordsV2: {
    '1-1': { bestTicks: 600, bestScore: 1200, seals: 7 },
    '1-2': { bestTicks: 0, bestScore: 10, seals: 0 },
    '1-3': { bestTicks: 600, bestScore: -1, seals: 0 },
    '1-4': { bestTicks: 600.5, bestScore: 10, seals: 0 },
    '1-5': { bestTicks: 600, bestScore: 10, seals: 8 },
    '9-9': { bestTicks: 600, bestScore: 10, seals: 0 },
    '2-1': 'こわれた',
  } }).recordsV2;
  assert.deepEqual(Object.keys(kept), ['1-1']);
  assert.deepEqual(kept['1-1'], { bestTicks: 600, bestScore: 1200, seals: 7 });
});
test('旧bestMsは残すが、新しい面のベストには使わない', () => {
  const kept = sanitize({ bestMs: { '1-1': 12345, '1-2': -1 } });
  assert.deepEqual(kept.bestMs, { '1-1': 12345 });
  assert.deepEqual(kept.recordsV2, {});
});
test('各ワールドの5面クリアだけが次の世界を解放', () => {
  for (let w = 1; w <= 4; w++) {
    const initial = { ...defaults(), unlockedWorld: w };
    for (let n = 1; n <= 4; n++) assert.equal(recordClear(initial, `${w}-${n}`, { ticks: 600, score: 1, seals: 0 }).unlockedWorld, w);
    assert.equal(recordClear(initial, `${w}-5`, { ticks: 600, score: 1, seals: 0 }).unlockedWorld, Math.min(4, w + 1));
  }
});
test('ベストは時間が短く得点が高いほうを残し、お札は積み上げる', () => {
  const a = recordClear(defaults(), '1-1', { ticks: 900, score: 1000, seals: SEAL.dash });
  const b = recordClear(a, '1-1', { ticks: 1200, score: 1500, seals: SEAL.unhurt });
  assert.deepEqual(b.recordsV2['1-1'], { bestTicks: 900, bestScore: 1500, seals: SEAL.dash | SEAL.unhurt });
  const c = recordClear(b, '1-1', { ticks: 700, score: 10, seals: SEAL.fortune });
  assert.deepEqual(c.recordsV2['1-1'], { bestTicks: 700, bestScore: 1500, seals: 7 });
  assert.equal(sealCount(c.recordsV2['1-1'].seals), 3);
  assert.equal(sealCount('7'), 0);
  assert.deepEqual(recordClear(defaults(), '9-9', { ticks: 1 }).recordsV2, {});
});
