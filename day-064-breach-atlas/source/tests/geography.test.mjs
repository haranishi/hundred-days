import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOCATIONS, GEO_BASIS, locateRecord, groupLocations, geographicPosition, projectedPosition } from '../src/geo-model.mjs';
import { decodeIndex } from '../src/engine.mjs';
const full = JSON.parse(readFileSync(new URL('../src/data.json', import.meta.url), 'utf8')).incidents;
const records = decodeIndex(JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8')));

test('every actual record is accounted for by exactly one auditable geographic group', () => {
  const groups = groupLocations(records, records.map((_, index) => index));
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 18001);
  assert.equal(new Set(groups.flatMap(group => group.indices)).size, 18001);
  for (const record of full) {
    assert.ok(LOCATIONS[record.geoCode]); assert.ok(GEO_BASIS[record.geoBasis]);
    const expected = locateRecord(record);
    assert.equal(expected.code, record.geoCode); assert.equal(expected.basis, record.geoBasis);
  }
  assert.equal(full.filter(record => record.geoBasis === 'named-prefecture').length, 2351);
  assert.equal(full.filter(record => record.geoCode === 'JP').length, 2301);
});

test('ambiguous prefectures and missing source fields stay country-level without headquarters guesses', () => {
  assert.deepEqual(locateRecord({ company: '東京都と神奈川県の共同事業', region: 'japan' }), { code: 'JP', basis: 'country-only' });
  assert.deepEqual(locateRecord({ company: '東京都府中市', region: 'japan' }), { code: 'JP-13', basis: 'named-prefecture' });
  assert.deepEqual(locateRecord({ company: 'KDDI', region: 'japan' }), { code: 'JP', basis: 'country-only' });
  assert.deepEqual(locateRecord({ registry: 'hhs', registerDetails: { state: 'ZZ' } }), { code: 'US', basis: 'country-only' });
  assert.deepEqual(locateRecord({ registry: 'hhs', registerDetails: { state: 'PR' } }), { code: 'US-PR', basis: 'reported-state' });
});

test('notification jurisdiction and reported organization state preserve different bases', () => {
  const ca = full.filter(record => record.registry === 'california');
  assert.equal(ca.length, 5336);
  assert.ok(ca.every(record => record.geoCode === 'US-CA' && record.geoBasis === 'notification-jurisdiction'));
  for (const record of full.filter(record => record.registry === 'hhs' && record.registerDetails.state)) {
    assert.equal(record.geoCode, `US-${record.registerDetails.state}`);
    assert.equal(record.geoBasis, 'reported-state');
  }
});

test('filtered grouping keeps exact counts, causes and evidence bases', () => {
  const indices = records.flatMap((record,index) => record.geoCode === 'JP-13' ? [index] : []);
  const [group] = groupLocations(records, indices);
  assert.equal(group.code,'JP-13'); assert.equal(group.count,55);
  assert.equal(Object.values(group.causes).reduce((sum, value) => sum + value, 0),55);
  assert.deepEqual(group.bases,{'named-prefecture':55});
  assert.deepEqual(groupLocations(records, []),[]);
});

test('geographic projections retain orientation, distance and dateline positions', () => {
  assert.deepEqual(geographicPosition(0,0),[100,0,-0]);
  assert.ok(geographicPosition(0,90)[2] < -99.9);
  assert.ok(geographicPosition(90,0)[1] > 99.9);
  for(const location of Object.values(LOCATIONS)) assert.ok(Math.abs(Math.hypot(...geographicPosition(location.lat,location.lon)) - 100) < 1e-9);
  assert.deepEqual(projectedPosition(0,-180),[0,250]);
  assert.deepEqual(projectedPosition(0,180),[1000,250]);
});
