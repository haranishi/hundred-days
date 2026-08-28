import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchUrl,
  nextRadius,
  normalizeStations,
  searchStations,
  searchWithExpansion,
} from '../lib/stations.js';

const origin = { lat: 35, lon: 139 };
const row = (overrides = {}) => ({
  name: 'Sample FM', url_resolved: 'https://radio.test/live', stationuuid: 'uuid-1', favicon: '',
  tags: 'music,local,talk,extra', codec: 'MP3', bitrate: 128, geo_lat: 35.1, geo_long: 139,
  countrycode: 'JP', homepage: '', ...overrides,
});

test('検索URLにAPI所定のパラメータを設定する', () => {
  const url = new URL(buildSearchUrl('https://example.test', { lat: 35, lon: 139, radiusKm: 25 }));
  assert.equal(url.pathname, '/json/stations/search');
  assert.equal(url.searchParams.get('geo_distance'), '25000');
  assert.equal(url.searchParams.get('hidebroken'), 'true');
  assert.equal(url.searchParams.get('is_https'), 'true');
  assert.equal(url.searchParams.get('limit'), '120');
  assert.equal(url.searchParams.has('order'), false);
});

test('同名+同URLの重複を除去し、タグを3件に絞る', () => {
  const stations = normalizeStations([
    row(), row({ stationuuid: 'uuid-duplicate', geo_lat: 35.2 }),
    row({ name: 'Another', stationuuid: 'uuid-2' }),
  ], origin);
  assert.equal(stations.length, 2);
  assert.deepEqual(stations.find(({ name }) => name === 'Sample FM').tags, ['music', 'local', 'talk']);
});

test('座標nullとhttp配信の局を除外し、距離順に並べ、50件に制限する', () => {
  const rows = [
    row({ name: 'Far', url_resolved: 'https://far', geo_lat: 36 }),
    row({ name: 'Near', url_resolved: 'https://near', geo_lat: 35.01 }),
    row({ name: 'Null', url_resolved: 'https://null', geo_lat: null }),
    row({ name: 'Insecure', url_resolved: 'http://insecure', geo_lat: 35.02 }),
    ...Array.from({ length: 55 }, (_, index) => row({
      name: `Station ${index}`, url_resolved: `https://station/${index}`, geo_lat: 35 + index / 1000,
    })),
  ];
  const stations = normalizeStations(rows, origin);
  assert.equal(stations.length, 50);
  assert.equal(stations.some(({ name }) => name === 'Null'), false);
  assert.equal(stations.some(({ name }) => name === 'Insecure'), false);
  assert.ok(stations.every((station, index) => index === 0 || stations[index - 1].distanceKm <= station.distanceKm));
});

test('半径段階は25→100→300→1000で終端する', () => {
  assert.equal(nextRadius(25), 100);
  assert.equal(nextRadius(100), 300);
  assert.equal(nextRadius(300), 1000);
  assert.equal(nextRadius(1000), null);
});

test('0件なら段階的に半径を拡大する', async () => {
  const requested = [];
  const fetchStub = async (url) => {
    const radius = Number(new URL(url).searchParams.get('geo_distance'));
    requested.push(radius);
    return { ok: true, status: 200, json: async () => radius < 300000 ? [] : [row()] };
  };
  const result = await searchWithExpansion({ lat: 35, lon: 139, radiusKm: 25 }, fetchStub, ['https://one.test']);
  assert.deepEqual(requested, [25000, 100000, 300000]);
  assert.equal(result.radiusKm, 300);
  assert.equal(result.stations.length, 1);
});

test('1000kmでも0件ならそこで終了する', async () => {
  const requested = [];
  const fetchStub = async (url) => {
    requested.push(Number(new URL(url).searchParams.get('geo_distance')));
    return { ok: true, status: 200, json: async () => [] };
  };
  const result = await searchWithExpansion({ lat: 35, lon: 139, radiusKm: 300 }, fetchStub, ['https://one.test']);
  assert.deepEqual(requested, [300000, 1000000]);
  assert.equal(result.radiusKm, 1000);
  assert.deepEqual(result.stations, []);
});

test('fetch失敗とHTTP 5xxで順番にミラーfallbackする', async () => {
  const called = [];
  const fetchStub = async (url) => {
    const host = new URL(url).host;
    called.push(host);
    if (host === 'one.test') throw new TypeError('network failed');
    if (host === 'two.test') return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => [row()] };
  };
  const result = await searchStations(originWithRadius(), fetchStub, ['https://one.test', 'https://two.test', 'https://three.test']);
  assert.deepEqual(called, ['one.test', 'two.test', 'three.test']);
  assert.equal(result.baseUrl, 'https://three.test');
});

test('HTTP 4xxではミラーfallbackしない', async () => {
  let calls = 0;
  const fetchStub = async () => { calls += 1; return { ok: false, status: 400 }; };
  await assert.rejects(searchStations(originWithRadius(), fetchStub, ['https://one.test', 'https://two.test']), /HTTP 400/);
  assert.equal(calls, 1);
});

function originWithRadius() {
  return { ...origin, radiusKm: 25 };
}
