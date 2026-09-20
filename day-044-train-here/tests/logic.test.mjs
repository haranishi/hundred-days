import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, stopsBetween, shortestDirection, routeStations, pointAt, RAILWAY } from '../lib/network.js';
import { normalizeTrain, isFresh, candidates, demoTrains, boardingText, locationText } from '../lib/trains.js';
const now = Date.parse('2026-09-20T12:00:00+09:00');
export function sample(overrides = {}) {
  return { 'odpt:railway': RAILWAY, 'owl:sameAs': 'odpt.Train:JR-East.Yamanote.Test', 'odpt:trainNumber': 'TEST001',
    'odpt:railDirection': 'odpt.RailDirection:InnerLoop',
    'odpt:fromStation': 'odpt.Station:JR-East.Yamanote.ShinOkubo',
    'odpt:toStation': 'odpt.Station:JR-East.Yamanote.Shinjuku',
    'odpt:destinationStation': ['odpt.Station:JR-East.Yamanote.Osaki'],
    'dc:date': new Date(now - 5000).toISOString(), 'dct:valid': new Date(now + 40000).toISOString(), 'odpt:delay': 60, ...overrides };
}
test('新宿から渋谷は内回り3駅、逆方向は27駅', () => {
  assert.equal(STATIONS.length, 30);
  assert.equal(stopsBetween('Shinjuku', 'Shibuya', 'inner'), 3);
  assert.equal(stopsBetween('Shinjuku', 'Shibuya', 'outer'), 27);
  assert.equal(shortestDirection('Shinjuku', 'Shibuya'), 'inner');
  assert.deepEqual(routeStations('Shinjuku', 'Shibuya', 'inner').map(s => s.id), ['Shinjuku', 'Yoyogi', 'Harajuku', 'Shibuya']);
});
test('東京と神田の境界、同じ駅、不正な駅を処理する', () => {
  assert.equal(stopsBetween('Tokyo', 'Kanda', 'inner'), 1);
  assert.equal(stopsBetween('Kanda', 'Tokyo', 'outer'), 1);
  assert.deepEqual(routeStations('Tokyo', 'Tokyo', 'outer'), []);
  assert.equal(stopsBetween('Nowhere', 'Tokyo', 'inner'), null);
  assert.deepEqual(pointAt(30), pointAt(0));
});
test('駅間は中点、駅付近は停車中と断定しない', () => {
  const train = normalizeTrain(sample(), now);
  assert.equal(train.position, 14.5); assert.equal(train.delay, 60);
  assert.equal(boardingText(train, 'Shinjuku'), '1駅手前');
  const near = normalizeTrain(sample({ 'odpt:toStation': null }), now);
  assert.equal(locationText(near), '新大久保駅付近');
});
test('古い情報・将来時刻・有効期限切れ・不明方向・飛び駅を拒否する', () => {
  for (const fields of [
    { 'dc:date': new Date(now - 121000).toISOString() },
    { 'dc:date': new Date(now + 31000).toISOString() },
    { 'dct:valid': new Date(now).toISOString() },
    { 'dct:valid': 'not-a-date' },
    { 'odpt:railDirection': 'unknown' },
    { 'odpt:toStation': 'odpt.Station:JR-East.Yamanote.Shibuya' },
    { 'odpt:toStation': 'odpt.Station:TokyoMetro.X.Y' },
  ]) assert.equal(normalizeTrain(sample(fields), now), null);
});
test('遅延なしと遅延情報なしを分ける', () => {
  assert.equal(normalizeTrain(sample({ 'odpt:delay': 0 }), now).delay, 0);
  for (const invalid of [null, undefined, '0', -1]) assert.equal(normalizeTrain(sample({ 'odpt:delay': invalid }), now).delay, null);
});
test('乗車駅の手前でも目的地より前に終着する列車は案内しない', () => {
  const train = normalizeTrain(sample(), now);
  assert.equal(candidates([train], 'Shinjuku', 'Shibuya', 'inner', now).length, 1);
  assert.equal(candidates([train], 'Shinjuku', 'Tokyo', 'inner', now).length, 0);
  const unknownDestination = normalizeTrain(sample({ 'odpt:destinationStation': [] }), now);
  assert.equal(candidates([unknownDestination], 'Shinjuku', 'Shibuya', 'inner', now).length, 0);
});
test('別方向・通過後・期限切れの列車は候補に出さない', () => {
  const train = normalizeTrain(sample(), now);
  assert.equal(candidates([train], 'Shinjuku', 'Shibuya', 'outer', now).length, 0);
  assert.equal(candidates([train], 'Ikebukuro', 'Shinjuku', 'inner', now).length, 0);
  assert.equal(candidates([train], 'Shinjuku', 'Shibuya', 'inner', now + 41000).length, 0);
  assert.equal(isFresh(train, now + 41000), false);
});
test('架空デモは明示され、環状境界を跨いでも座標とIDを維持する', () => {
  const first = demoTrains(0), later = demoTrains(700);
  assert.equal(first.length, 20); assert.deepEqual(first.map(t => t.id), later.map(t => t.id));
  assert.ok(later.every(t => t.position >= 0 && t.position < 30 && t.source === 'demo' && t.delay === null));
  assert.ok(candidates(first, 'Shinjuku', 'Shibuya', 'inner', now).length > 0);
  assert.notEqual(first[0].position, later[0].position);
});
