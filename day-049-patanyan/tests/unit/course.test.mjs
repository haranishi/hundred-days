import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCourse, firstPoleX, COURSE } from '../../lib/course.js';
import { PHYS, WORLD } from '../../lib/physics.js';
import { gapFor, pitchFor } from '../../lib/difficulty.js';
import { jstDateKey } from '../../lib/date.js';

const strip = (p) => ({ x: p.x, center: p.center, gap: p.gap, fish: p.fish && { x: p.fish.x, y: p.fish.y } });

test('同じシードなら同じコース（先まで作っても、作る順が違っても同じ）', () => {
  const a = createCourse(20260924);
  const b = createCourse(20260924);
  a.ensureCount(120);
  b.ensureCount(10);
  b.ensureCount(120);
  assert.deepEqual(a.poles.map(strip), b.poles.map(strip));
  const c = createCourse(20260925);
  c.ensureCount(120);
  assert.notDeepEqual(a.poles.map(strip), c.poles.map(strip));
});

test('きょうのコースのシードは日本時間の日付', () => {
  assert.equal(jstDateKey(Date.UTC(2026, 8, 23, 15, 0, 0)), 20260924);
  assert.equal(jstDateKey(Date.UTC(2026, 8, 23, 14, 59, 59)), 20260923);
});

test('助走は約1.6秒：猫の前の縁が最初のポールに届くまで', () => {
  const t = (firstPoleX() - (WORLD.catX + PHYS.catR)) / PHYS.speed;
  assert.ok(Math.abs(t - COURSE.runUp) < 1e-9);
  const c = createCourse(1);
  c.ensureCount(1);
  assert.equal(c.poles[0].x, firstPoleX());
});

test('すき間の中心は天井+70〜地面-70、前との差は110以内、間隔と高さは難しさの曲線どおり', () => {
  for (let seed = 1; seed <= 400; seed += 1) {
    const c = createCourse(seed * 7919);
    c.ensureCount(80);
    c.poles.forEach((p, i) => {
      assert.ok(p.center >= 70 - 1e-9 && p.center <= WORLD.bandH - 70 + 1e-9, `中心が範囲外 seed=${seed} n=${p.n}`);
      assert.equal(p.gap, gapFor(p.n));
      assert.equal(p.w, WORLD.poleW);
      if (i === 0) {
        assert.ok(Math.abs(p.center - WORLD.bandH / 2) <= COURSE.firstSpread + 1e-9);
        return;
      }
      const prev = c.poles[i - 1];
      assert.ok(Math.abs(p.center - prev.center) <= COURSE.maxDelta + 1e-9, `差が110超 seed=${seed} n=${p.n}`);
      assert.ok(Math.abs(p.x - prev.x - pitchFor(p.n)) < 1e-9);
    });
  }
});

test('魚は約35%のすき間に、中心から上下にすき間の30%以内、ポールに重ならない', () => {
  let total = 0;
  let withFish = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const c = createCourse(seed);
    c.ensureCount(60);
    for (const p of c.poles) {
      total += 1;
      if (!p.fish) continue;
      withFish += 1;
      assert.ok(Math.abs(p.fish.y - p.center) <= COURSE.fishSpread * p.gap + 1e-9);
      assert.ok(p.fish.y - COURSE.fishR > p.top && p.fish.y + COURSE.fishR < p.bottom, `魚がポールに重なる n=${p.n}`);
      assert.equal(p.fish.x, p.x + p.w / 2);
    }
  }
  const rate = withFish / total;
  assert.ok(rate > 0.32 && rate < 0.38, `魚の割合 ${rate}`);
});
