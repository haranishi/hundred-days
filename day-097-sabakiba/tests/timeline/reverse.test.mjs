// 切りの向き（reverse）の試験。親の担当。尾→頭に引く切りで、刃・切り込みの向きが逆になる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProcedure } from '../../lib/contract.js';
import { createProcedure, stateAt } from '../../lib/timeline.js';
import aji from '../../lib/procedures/aji.js';
import { fakeAnatomy as anatomy } from '../fixtures/fake-anatomy.js';

const withReverse = (flag) => {
  const raw = structuredClone(aji);
  const step = raw.steps.find((s) => (s.cuts || []).some((c) => c.curve === 'boneCut'));
  const cut = step.cuts.find((c) => c.curve === 'boneCut');
  cut.reverse = !!flag; // 手順側が逆向きでも、ここで明示的に決める
  return { raw, index: raw.steps.indexOf(step), cut };
};

test('reverse は真偽値だけを受け付ける', () => {
  const { raw, cut } = withReverse(true);
  assert.deepEqual(validateProcedure(raw), []);
  cut.reverse = 'yes';
  assert.ok(validateProcedure(raw).some((m) => /reverse/.test(m)));
});

test('reverse の切りは、カーブの終点から始点へ刃が進み、切り込みに reverse が付く', () => {
  const a = withReverse(false), b = withReverse(true);
  const pa = createProcedure(a.raw, anatomy), pb = createProcedure(b.raw, anatomy);
  const [w0, w1] = a.cut.window;
  const early = (p, idx) => stateAt(p, idx, w0 + 0.05 * (w1 - w0)).knife;
  const late = (p, idx) => stateAt(p, idx, w1 - 0.05 * (w1 - w0)).knife;
  const startA = early(pa, a.index).pos, startB = early(pb, b.index).pos;
  const endA = late(pa, a.index).pos, endB = late(pb, b.index).pos;
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  assert.ok(dist(startA, endB) < dist(startA, startB), '逆向きの始まりは、順向きの終わり側にある');
  assert.ok(dist(endA, startB) < dist(endA, endB), '逆向きの終わりは、順向きの始まり側にある');
  const inc = stateAt(pb, b.index, 1).incisions.find((c) => c.curve === 'boneCut');
  assert.equal(inc.reverse, true);
  assert.equal(stateAt(pa, a.index, 1).incisions.find((c) => c.curve === 'boneCut').reverse, false);
});
