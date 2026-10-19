import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { HIT, hitTest, propBounds, propScreenRect } from '../lib/hit.js';
import { createTransform } from '../lib/transform.js';

const stageOfId = (id) => stageOf(CASES.find((item) => item.id === id));
const startOf = (stage) => ({ ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((prop) => [prop.id, prop.x.start])) });
const t = createTransform(358, 248);

test('道具の外接矩形は、形の大きさと位置から決まる', () => {
  const stage = stageOfId('bag');
  const bag = stage.props.find((prop) => prop.id === 'bag');
  const b = propBounds(bag, 100);
  assert.ok(Math.abs((b.maxX - b.minX) - 30 * bag.scale) < 1e-6);
  assert.ok(Math.abs((b.minX + b.maxX) / 2 - 100) < 1e-6);
  assert.ok(b.maxY > b.minY && b.minY < bag.y && b.maxY > bag.y - 1);
});

test('小さな道具でも、つかめる範囲は44px以上', () => {
  const stage = stageOfId('bag');
  const hat = stage.props.find((prop) => prop.id === 'hat');
  const rect = propScreenRect(t, hat, hat.x.start);
  assert.ok(rect.right - rect.left >= HIT.propMin - 1e-9);
  assert.ok(rect.bottom - rect.top >= HIT.propMin - 1e-9);
});

test('灯りの玉・レール・すべれる道具を見分け、固定の道具と何も無い所は null', () => {
  const stage = stageOfId('bag');
  const arrangement = startOf(stage);
  const orb = t.toScreen(stage.lamp.x, arrangement.ly);
  assert.equal(hitTest(t, stage, arrangement, orb.x, orb.y), 'lamp');
  assert.equal(hitTest(t, stage, arrangement, orb.x + HIT.railHalf - 2, orb.y + 60), 'lamp', 'レールの近く');
  const hat = stage.props.find((prop) => prop.id === 'hat');
  const hatRect = propScreenRect(t, hat, arrangement.xs.hat);
  assert.equal(hitTest(t, stage, arrangement, hatRect.cx, hatRect.cy), 'hat');
  assert.equal(hitTest(t, stage, arrangement, 4, 240), null, '何も無い所');

  const rack = stageOfId('rack');
  const rackArrangement = startOf(rack);
  const rackRect = propScreenRect(t, rack.props[0], rackArrangement.xs.rack);
  const lamp = t.toScreen(rack.lamp.x, rackArrangement.ly);
  const onRack = hitTest(t, rack, rackArrangement, rackRect.cx, rackRect.cy);
  assert.notEqual(onRack, 'rack', '固定の道具はつかめない');
  assert.ok(onRack === null || onRack === 'lamp');
  assert.equal(hitTest(t, rack, rackArrangement, lamp.x, lamp.y), 'lamp');
});

test('灯りの玉の上に道具が重なっていても、玉の中心では灯りを優先する', () => {
  const stage = stageOfId('bag');
  const coat = stage.props.find((prop) => prop.id === 'coat');
  // 灯りを外套の棚の高さへ上げ、外套を灯りの真下へすべらせて、玉と外套を重ねる。
  const arrangement = { ly: coat.y, xs: { ...startOf(stage).xs, coat: stage.lamp.x } };
  const orb = t.toScreen(stage.lamp.x, arrangement.ly);
  const rect = propScreenRect(t, coat, stage.lamp.x);
  assert.ok(orb.x >= rect.left && orb.x <= rect.right && orb.y >= rect.top && orb.y <= rect.bottom, '玉は外套の枠の中');
  assert.equal(hitTest(t, stage, arrangement, orb.x, orb.y), 'lamp');
  assert.equal(hitTest(t, stage, arrangement, rect.left + 4, rect.bottom - 4), 'coat', '玉から離れた所は外套');
});
