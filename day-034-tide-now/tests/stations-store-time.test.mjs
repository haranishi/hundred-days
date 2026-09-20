import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupByPref, findByCode, nearest, distanceKm } from '../lib/stations.js';
import { load, save, isAvailable } from '../lib/store.js';
import { nowWall, dateOf, clockOf, dayOf } from '../lib/time.js';
import { until, dateWindow } from '../lib/tide.js';
const { stations } = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url)));
test('239地点、39都道府県を北から、南鳥島は東京都', () => {
  assert.equal(stations.length, 239); const groups = groupByPref(stations);
  assert.equal(groups.length, 39); assert.deepEqual(groups.slice(0, 7).map((g) => g.pref), ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県']);
  assert.equal(groups.at(-1).pref, '沖縄県'); assert.equal(findByCode(stations, 'MC').pref, '東京都');
  assert.equal(findByCode(stations, '00'), null);
});
test('球面近似・最寄り秋田4kmと内陸50km以上', () => {
  const found = nearest(stations, { lat: 39.72, lon: 140.10 });
  assert.equal(found.station.code, 'S1'); assert.equal(Math.round(found.km), 4);
  assert.equal(distanceKm(stations[0], stations[0]), 0);
  assert.ok(nearest(stations, { lat: 36.39, lon: 139.06 }).km >= 50); assert.equal(nearest([], { lat: 0, lon: 0 }), null);
});
test('地点コードとmodeだけを保存、外す・不正・保存不可を扱う', () => {
  const memory = new Map(); const storage = { getItem: (name) => memory.get(name), setItem: (name, value) => memory.set(name, value), removeItem: (name) => memory.delete(name) };
  assert.ok(isAvailable(storage)); assert.ok(save({ code: 'TK', mode: 'current', lat: 35 }, storage));
  assert.equal(memory.get('day-034-tide-now'), '{"code":"TK","mode":"current"}'); assert.deepEqual(load(storage), { code: 'TK', mode: 'current' });
  for (const value of [{}, { code: 'bad', mode: 'picked' }, { code: 'TK', mode: 'none' }]) { save(value, storage); assert.equal(load(storage).code, null); }
  storage.setItem('day-034-tide-now', '{'); assert.equal(load(storage).code, null);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.equal(save({ code: 'TK', mode: 'picked' }, blocked), false); assert.equal(isAvailable(blocked), false); assert.equal(load(blocked).code, null); assert.equal(save({}, null), false);
});
test('日本時間の壁時計・日付窓は端末TZと独立', () => {
  const now = Date.parse('2026-09-10T06:00:00Z');
  assert.equal(nowWall(now), '2026-09-10T15:00'); assert.equal(dateOf(now), '2026-09-10'); assert.equal(clockOf(now), '15:00'); assert.equal(dayOf(now), '9月10日');
  assert.deepEqual(dateWindow(Date.parse('2025-12-31T15:30:00Z')), ['2025-12-31', '2026-01-01', '2026-01-02']);
});
test('あと表記：1分未満、分、時間、分0', () => {
  for (const [ms, expected] of [[0,'まもなく'],[59999,'まもなく'],[60000,'あと1分'],[3540000,'あと59分'],[3600000,'あと1時間'],[7020000,'あと1時間57分']]) assert.equal(until(ms, 0), expected);
});
