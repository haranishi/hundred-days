import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, RAILWAYS } from '../lib/railways.js';
import { STATION_COORDINATES } from '../lib/station-coordinates.js';

test('59駅すべてにWikidataの出典と版番号があり、描画座標と一致する', () => {
  assert.equal(STATION_COORDINATES.size, 59);
  assert.equal(PLACES.size, 59);
  for (const [id, point] of PLACES) {
    const source = STATION_COORDINATES.get(id);
    assert.ok(source, id);
    assert.match(source.entity, /^Q\d+$/);
    assert.ok(Number.isSafeInteger(source.revision) && source.revision > 0);
    assert.ok(source.lng > 139.54 && source.lng < 139.85);
    assert.ok(source.lat > 35.54 && source.lat < 35.80);
    assert.equal(point.lng, source.lng);
    assert.equal(point.lat, source.lat);
  }
  for (const route of RAILWAYS) assert.ok(route.stations.every(point => PLACES.has(point.id)));
});
