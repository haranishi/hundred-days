// v3 P0-5: the coat whitens continuously into the light cat (PLAN-v3.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_SPEED } from '../lib/milestones.js';
import { MAX_SPEED, FINISH_RATIO, advanceSpeed } from '../lib/physics.js';
import { catLightAppearance } from '../lib/cat-light.js';

// scene.js passes the speed "level" (log scale 0..1) and the light-speed ratio.
const levelOf = v => Math.min(1, Math.log10(1 + v) / 9);
const whiten = ratio => catLightAppearance(levelOf(ratio * LIGHT_SPEED), ratio).whiten;
// Floating point may land 1 ulp under 99.9%; the spec's 80% is not a 1e-16 requirement.
const EPS = 1e-9;

test('毛色の白化は光速比99%までは0、99%から進み、99.9%で8割以上', () => {
  for (const r of [0, .5, .9, .95, .98]) assert.equal(whiten(r), 0, `光速比${r}で白化 ${whiten(r)}`);
  assert.ok(whiten(.995) > 0, `99.5%で白化が始まっていない（${whiten(.995)}）`);
  for (const r of [.999, .9999, FINISH_RATIO]) assert.ok(whiten(r) >= .8 - EPS, `光速比${r}の白化 ${whiten(r)}（0.8以上）`);
});

test('白化は光速比に対して単調で、どんな入力でも0〜1に収まる', () => {
  const ratios = [];
  for (let r = 0; r < .9; r += .01) ratios.push(r);
  for (let k = 1; k <= 5.5; k += .005) ratios.push(1 - 10 ** -k);
  let previous = 0;
  for (const r of ratios) {
    const w = whiten(r);
    assert.ok(Number.isFinite(w) && w >= 0 && w <= 1, `光速比${r}：${w}`);
    assert.ok(w >= previous - 1e-12, `光速比${r}で白化が戻った：${previous} → ${w}`);
    previous = w;
  }
  for (const [level, ratio] of [[NaN, NaN], [-1, -1], [Infinity, Infinity], [-Infinity, 2], [1, 1.5], [0, NaN]]) {
    const w = catLightAppearance(level, ratio).whiten;
    assert.ok(Number.isFinite(w) && w >= 0 && w <= 1, `(${level}, ${ratio})：${w}`);
  }
});

test('最大推力の進行では、白化が1tickで0.1を超えて跳ばない（連続変化）', () => {
  let v = 0, previous = 0, jump = 0, at = 0;
  for (let i = 1; i <= 120 * 60 && v < MAX_SPEED; i++) {
    v = advanceSpeed(v, 1, 1 / 60);
    const w = whiten(v / LIGHT_SPEED);
    if (Math.abs(w - previous) > jump) { jump = Math.abs(w - previous); at = i / 60; }
    previous = w;
  }
  assert.ok(previous >= .8 - EPS, `完走時の白化 ${previous}`);
  assert.ok(jump <= .1, `${at.toFixed(3)}秒で1tickに ${jump.toFixed(3)} 変化`);
});

test('減速して光速比99%を下回れば、毛色は元に戻る', () => {
  assert.ok(whiten(.9999) >= .8 - EPS);
  assert.equal(whiten(.98), 0);
  assert.equal(whiten(0), 0);
});
