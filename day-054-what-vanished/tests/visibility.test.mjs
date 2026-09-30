import test from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../lib/nav.js';
import { obstacles } from '../lib/place.js';
import { SLOTS } from '../lib/plan.js';
import { slotVisibility } from '../lib/visibility.js';
import { dedicatedArrangement, manifest } from './helpers.mjs';

// 合格の線は、見た目で決めた。ソファの裏の床（小物を置くと見落として当然の場所）が21%だったので、
// 「同じ部屋の歩ける場所の4分の1以上から見え、2m以内に見える場所がある」を公平の下限にする。
const MIN_SEEN = 0.25;
const MAX_NEAREST = 2.0;

test('どの置き場所も、同じ部屋の歩ける場所から隠れずに見える（覚えようのない物を消さない）', () => {
  const grid = new NavGrid(obstacles(manifest, dedicatedArrangement));
  const v = slotVisibility(manifest, grid);
  const bad = SLOTS.filter(s => v[s.id].seen < MIN_SEEN || v[s.id].nearest > MAX_NEAREST)
    .map(s => `${s.id} ${(v[s.id].seen * 100).toFixed(0)}% ${v[s.id].nearest.toFixed(2)}m`);
  assert.deepEqual(bad, []);
});

test('判定は隠れた場所を見逃さない（テレビ台の裏・ベッドの下・閉じた棚の中は不合格になる）', () => {
  const hidden = [
    { id: 'X-behind-tv', room: 'living', kind: 'floor', x: 2.5, y: 0, z: 4.12, rot: 0 },
    { id: 'X-under-bed', room: 'bedroom', kind: 'floor', x: 2.3, y: 0, z: 1.2, rot: 0 },
    { id: 'X-in-cabinet', room: 'dining', kind: 'top', x: 9.2, y: 0.5, z: 4.34, rot: 0 }
  ];
  SLOTS.push(...hidden);
  try {
    const grid = new NavGrid(obstacles(manifest, dedicatedArrangement));
    const v = slotVisibility(manifest, grid);
    for (const h of hidden) assert.ok(v[h.id].seen < MIN_SEEN, `${h.id} が ${(v[h.id].seen * 100).toFixed(0)}% で合格してしまう`);
  } finally {
    SLOTS.splice(SLOTS.length - hidden.length, hidden.length);
  }
});
