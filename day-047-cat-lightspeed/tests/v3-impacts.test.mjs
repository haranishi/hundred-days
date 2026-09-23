// v3 P0-4: contacts that can be read one at a time (PLAN-v3.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImpacts, updateImpacts, impactCounts } from '../lib/impacts.js';
import { MAX_SPEED, advanceSpeed } from '../lib/physics.js';
import { WORLDS, worldAt } from '../lib/worlds.js';

const DT = 1 / 60;
// Mirror app3d.js: start() primes the farm with dt 0, then every tick passes the new speed and its world.
function drive(thrust, { seconds = 70, reduced = false, stopAtFinish = true } = {}) {
  const s = createImpacts();
  updateImpacts(s, { speed: 0, world: 'farm', dt: 0, reduced });
  let v = 0;
  const ticks = [];
  for (let i = 1; i <= seconds * 60; i++) {
    const t = i / 60;
    v = advanceSpeed(v, thrust(t), DT);
    const world = worldAt(v).id, events = updateImpacts(s, { speed: v, world, dt: DT, reduced });
    ticks.push({ t, v, world, events, counts: impactCounts(s) });
    if (stopAtFinish && v >= MAX_SPEED) break;
  }
  return { s, ticks };
}
const full = drive(() => 1), calm = drive(() => 1, { reduced: true });
const eventTime = (e, k) => Number.isFinite(e.time) ? e.time : k.t;
// "Main contacts": events within 0.25 s of the current group's first event are one contact
// (e.g. two lanes of the same row). 0.25 s is well under the 0.6 s lower target, so it cannot merge two contacts.
function mainContacts(ticks) {
  const times = ticks.flatMap(k => k.events.map(e => eventTime(e, k))).sort((a, b) => a - b), starts = [];
  for (const t of times) if (!starts.length || t - starts.at(-1) > .25) starts.push(t);
  return starts;
}
const peak = (ticks, key) => Math.max(0, ...ticks.map(k => k.counts[key]));

test('最大推力では、開始から2秒以内に最初の接触が起きる', () => {
  const first = full.ticks.find(k => k.events.length);
  assert.ok(first, '完走まで一度も接触しない');
  assert.ok(first.t <= 2 + 1e-9, `最初の接触は ${first.t.toFixed(3)}秒（2秒以内）`);
});

test('完走までずっと、同時に飛ぶ本体は4以下・破片は12以下', () => {
  assert.ok(peak(full.ticks, 'flying') >= 1, '本体が一度も飛ばない（検査が空振り）');
  assert.ok(peak(full.ticks, 'flying') <= 4, `同時に飛ぶ本体 最大${peak(full.ticks, 'flying')}`);
  assert.ok(peak(full.ticks, 'fragments') <= 12, `同時の破片 最大${peak(full.ticks, 'fragments')}`);
});

test('reduced motion では同時の破片が4以下（本体も4以下）', () => {
  assert.ok(calm.ticks.some(k => k.events.length), 'reduced で一度も接触しない');
  assert.ok(peak(calm.ticks, 'fragments') <= 4, `reduced の破片 最大${peak(calm.ticks, 'fragments')}`);
  assert.ok(peak(calm.ticks, 'flying') <= 4, `reduced の本体 最大${peak(calm.ticks, 'flying')}`);
});

test('主な接触はおおむね0.6〜1.2秒間隔（中央値0.6〜1.2秒・8割が0.5〜1.4秒・最長2.4秒）', () => {
  const starts = mainContacts(full.ticks), gaps = starts.slice(1).map((t, i) => t - starts[i]);
  assert.ok(gaps.length >= 30, `完走までの主な接触が ${starts.length}回しかない`);
  const sorted = [...gaps].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  const inBand = gaps.filter(g => g >= .5 && g <= 1.4).length / gaps.length, longest = sorted.at(-1);
  const detail = `中央値${median.toFixed(3)}秒・0.5〜1.4秒の割合${(inBand * 100).toFixed(0)}%・最長${longest.toFixed(3)}秒・${gaps.length}間隔`;
  assert.ok(median >= .6 && median <= 1.2, detail);
  assert.ok(inBand >= .8, detail);
  assert.ok(longest <= 2.4, detail);
});

test('速度0（入力なし）では、どの世界でも10秒間接触せず、物体も近づかない', () => {
  for (const { id } of WORLDS) {
    const s = createImpacts();
    updateImpacts(s, { speed: 0, world: id, dt: 0 });
    for (let i = 0; i < 600; i++) assert.deepEqual(updateImpacts(s, { speed: 0, world: id, dt: DT }), [], id);
    assert.equal(s.total, 0, id); assert.equal(s.distance, 0, id); assert.equal(impactCounts(s).flying, 0, id);
  }
  const idle = drive(() => 0, { seconds: 10, stopAtFinish: false });
  assert.ok(idle.ticks.every(k => k.v === 0 && k.events.length === 0));
});

test('完走まで、また減速→再加速を挟んでも、同じidを二重に数えず破片も増え続けない', () => {
  const again = drive(t => t < 12 ? 1 : t < 18 ? 0 : 1, { seconds: 45, stopAtFinish: false });
  const at = t => again.ticks.find(k => k.t >= t - 1e-9);
  assert.ok(at(18).v < at(12).v, '12〜18秒で減速していない（検査が空振り）');
  assert.ok(again.ticks.some(k => k.t > 18 && k.events.length), '再加速のあとに接触しない（検査が空振り）');
  for (const [name, run] of [['完走', full], ['減速→再加速', again]]) {
    const ids = run.ticks.flatMap(k => k.events.map(e => e.id));
    assert.equal(new Set(ids).size, ids.length, `${name}：同じidの接触が重複`);
    assert.equal(run.s.total, ids.length, `${name}：total と接触数が一致しない`);
    assert.ok(peak(run.ticks, 'fragments') <= 12 && peak(run.ticks, 'flying') <= 4, `${name}：本体${peak(run.ticks, 'flying')}・破片${peak(run.ticks, 'fragments')}`);
  }
});

test('最大速度が長く続いても、本体4・破片12（reduced は破片4）を超えない', () => {
  for (const reduced of [false, true]) {
    const s = createImpacts();
    let flying = 0, fragments = 0;
    for (let i = 0; i < 6000; i++) {
      updateImpacts(s, { speed: 1e9, world: 'interstellar', dt: DT, reduced });
      const c = impactCounts(s);
      flying = Math.max(flying, c.flying); fragments = Math.max(fragments, c.fragments);
    }
    assert.ok(s.total > 0, 'reduced=' + reduced + '：接触しない');
    assert.ok(flying <= 4, `reduced=${reduced}：本体 最大${flying}`);
    assert.ok(fragments <= (reduced ? 4 : 12), `reduced=${reduced}：破片 最大${fragments}`);
  }
});

// The white contact mark: v2 counted it as `rings` (plus one always-on ring); v3 names it `flashes`
// and keeps the snapshot field `rings`. Counting both keeps the check independent of the name.
const marks = c => (c.flashes ?? 0) + (c.rings ?? 0);
test('接触のない間は衝撃の輪を出さず（常時の輪なし）、接触後の白い衝撃は0.1〜0.2秒で消える', () => {
  for (const { id } of WORLDS) {
    const s = createImpacts();
    updateImpacts(s, { speed: 1e6, world: id, dt: 0 });
    assert.equal(marks(impactCounts(s)), 0, `${id}：接触前から輪・衝撃が出ている`);
  }
  // The first contact that has no other contact within 0.4 s after it.
  const ticks = full.ticks, times = ticks.flatMap(k => k.events.map(e => eventTime(e, k)));
  const index = ticks.findIndex(k => k.events.length && !times.some(t => t > eventTime(k.events.at(-1), k) + 1e-9 && t < k.t + .4));
  assert.ok(index >= 0, '単独の接触が見つからない');
  assert.ok(marks(ticks[index].counts) > 0, '接触した瞬間に白い衝撃が出ない');
  let end = index;
  while (end < ticks.length && marks(ticks[end].counts) > 0) end++;
  const shown = (end - index) / 60;
  assert.ok(shown >= .1 - DT && shown <= .2 + DT, `白い衝撃の表示 ${shown.toFixed(3)}秒（0.1〜0.2秒）`);
});
