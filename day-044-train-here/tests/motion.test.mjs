import test from 'node:test';
import assert from 'node:assert/strict';
import { RAILWAYS } from '../lib/railways.js';
import { PATHS, distanceAtPosition, pointOnPath, trainCars, sceneDemoTrains, sceneLiveTrains, CAR_COUNT } from '../lib/motion.js';

test('5路線の経路と駅位置は有限で、距離が単調増加する', () => {
  assert.equal(PATHS.size, 5);
  for (const route of RAILWAYS) {
    const p = PATHS.get(route.id); assert.ok(p.length > 0);
    assert.equal(p.stationDistances.length, route.stations.length + (route.closed ? 1 : 0));
    assert.ok(p.samples.every((s, i) => [s.x, s.y, s.z, s.distance].every(Number.isFinite) && (!i || s.distance > p.samples[i - 1].distance)));
  }
});
test('山手線の環状境界は連続し、負の距離でも周回できる', () => {
  const p = PATHS.get('yamanote');
  assert.deepEqual(pointOnPath(p, 0), pointOnPath(p, p.length));
  assert.equal(distanceAtPosition(p, 30), distanceAtPosition(p, 0));
  const a = pointOnPath(p, -.001), b = pointOnPath(p, .001);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < .003);
});
test('開いた区間は端点より先へ進まず、4両が重ならない', () => {
  for (const id of ['chuo', 'sobu', 'keihin', 'saikyo']) {
    const p = PATHS.get(id);
    assert.equal(distanceAtPosition(p, -99), 0); assert.equal(distanceAtPosition(p, 999), p.length);
    for (const direction of [-1, 1]) for (const distance of [0, p.length]) {
      const cars = trainCars({ railway: id, distance, direction }); assert.equal(cars.length, CAR_COUNT);
      assert.ok(cars.every(c => [c.x, c.y, c.z, c.angle].every(Number.isFinite)));
      for (let i = 1; i < cars.length; i++) assert.ok(Math.hypot(cars[i].x - cars[i - 1].x, cars[i].z - cars[i - 1].z) > 1.3);
    }
  }
});
test('架空の48編成はIDを保ち、全路線で時間とともに移動する', () => {
  const first = sceneDemoTrains(0), later = sceneDemoTrains(10);
  assert.equal(first.length, 48); assert.equal(new Set(first.map(t => t.id)).size, 48);
  assert.deepEqual(first.map(t => t.id), later.map(t => t.id));
  for (const r of RAILWAYS) assert.ok(later.some((t, i) => t.railway === r.id && t.distance !== first[i].distance));
  assert.ok(later.every(t => t.source === 'demo' && [-1, 1].includes(t.direction)));
});
test('デモは停車・加減速・折返しを行い、負時刻や長時間でも経路内に収まる', () => {
  assert.equal(sceneDemoTrains(0)[0].distance, sceneDemoTrains(1)[0].distance);
  assert.notEqual(sceneDemoTrains(0)[0].distance, sceneDemoTrains(5)[0].distance);
  const end = PATHS.get('chuo').sections * 15;
  assert.equal(sceneDemoTrains(end - .01).find(t => t.id === 'demo-chuo-0').direction, 1);
  assert.equal(sceneDemoTrains(end + .01).find(t => t.id === 'demo-chuo-0').direction, -1);
  for (const time of [-1000, 10000, 100000]) for (const t of sceneDemoTrains(time)) {
    assert.ok(t.distance >= 0 && t.distance <= PATHS.get(t.railway).length);
    assert.equal(trainCars(t).length, 4);
  }
});
test('合成ライブ位置は山手線に限定し、時刻から勝手に移動を補わない', () => {
  const input = [{ id: 'test', direction: 'inner', position: 14.5, number: 'TEST', from: 'ShinOkubo', to: 'Shinjuku', updatedAt: 123, validUntil: 456 }];
  const [t] = sceneLiveTrains(input);
  assert.equal(t.railway, 'yamanote'); assert.equal(t.source, 'live'); assert.equal(t.direction, -1);
  assert.equal(t.from, '新大久保'); assert.equal(t.to, '新宿'); assert.equal(t.updatedAt, 123);
  assert.deepEqual(sceneLiveTrains(input), sceneLiveTrains(input));
});
test('不正な編成情報は3D座標に変換しない', () => {
  assert.deepEqual(trainCars({ railway: 'unknown', direction: 1, distance: 0 }), []);
  assert.deepEqual(trainCars({ railway: 'yamanote', direction: 0, distance: 0 }), []);
  assert.deepEqual(trainCars({ railway: 'yamanote', direction: 1, distance: NaN }), []);
});
