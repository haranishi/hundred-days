import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, candidateSlots, propDims } from '../lib/arrange.js';
import { PROPS } from '../lib/catalog.js';
import { PLACEMENT, SLOTS } from '../lib/plan.js';
import { manifest } from './helpers.mjs';

const ids = Object.keys(PROPS);

test('どの小物にも置ける場所が1つ以上ある', () => {
  for (const id of ids) assert.ok(candidateSlots(manifest, id).length >= 1, id);
});

test('300の種×3問で、全部の小物が決まりどおりの場所に1つずつ置ける', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (let round = 0; round < 3; round++) {
      const a = arrange(manifest, seed, round);
      assert.deepEqual(Object.keys(a).sort(), [...ids].sort());
      const used = new Set();
      for (const [id, { slot, yaw }] of Object.entries(a)) {
        assert.ok(!used.has(slot), `同じ場所に2つ: ${slot}`);
        used.add(slot);
        const s = SLOTS.find(x => x.id === slot);
        const rule = PLACEMENT[id];
        assert.ok(rule.kinds.includes(s.kind), `${id} を ${slot} に置いた`);
        if (rule.rooms) assert.ok(rule.rooms.includes(s.room), `${id} を ${s.room} に置いた`);
        assert.ok(Math.abs(yaw) <= 30, `${id} のずれ ${yaw}`);
      }
    }
  }
});

test('置き場所は物の大きさに足りている（棚の高さ・天板の広さ）', () => {
  for (const id of ids) {
    const d = propDims(manifest, id);
    for (const slotId of candidateSlots(manifest, id)) {
      const s = SLOTS.find(x => x.id === slotId);
      if (s.maxH !== undefined) assert.ok(d.h <= s.maxH, `${id} は ${slotId} に高すぎる`);
      if (s.maxW !== undefined) assert.ok(Math.max(d.w, d.d) <= Math.max(s.maxW, s.maxD), `${id} は ${slotId} に広すぎる`);
    }
  }
});

test('同じ種・同じ問題なら必ず同じ置き方になる', () => {
  assert.deepEqual(arrange(manifest, 777, 1), arrange(manifest, 777, 1));
});

test('問題ごとに小物の置き場所が入れ替わる（同じ部屋を覚え直すだけにしない）', () => {
  let moved = 0;
  let movable = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const a = arrange(manifest, seed, 0);
    const b = arrange(manifest, seed, 1);
    for (const id of ids) {
      if (candidateSlots(manifest, id).length < 2) continue;
      movable++;
      if (a[id].slot !== b[id].slot) moved++;
    }
  }
  assert.ok(moved / movable >= 0.6, `入れ替わった割合 ${(moved / movable).toFixed(2)}`);
});
