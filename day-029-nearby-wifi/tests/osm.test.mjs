import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  WIFI_QUERY,
  brandQuery,
  createDataset,
  elementToChainSpot,
  elementToWifiSpot,
  fetchOverpass,
  main,
  publicChains,
  transformChains,
  transformWifi,
  wifiExclusionReason,
} from '../tools/fetch-osm.mjs';

test('elementToWifiSpot: 名前の優先順・分類・料金・SSID・座標丸めを同梱形式へ変換する', () => {
  const spot = elementToWifiSpot({
    type: 'way', id: 123, center: { lat: 35.123456, lon: 139.987654 },
    tags: {
      'name:ja': `${'あ'.repeat(81)}`, name: 'English', brand: 'Brand', amenity: 'cafe',
      'internet_access:fee': 'no', 'internet_access:ssid': 'Cafe Wi-Fi',
    },
  });
  assert.deepEqual(spot, {
    id: 'way/123', cat: 'カフェ', fee: 'free', lat: 35.12346, lng: 139.98765,
    name: 'あ'.repeat(80), ssid: 'Cafe Wi-Fi',
  });
});

test('elementToWifiSpot: 名前とSSIDのタグがなければプロパティを省略する', () => {
  assert.deepEqual(elementToWifiSpot({ type: 'node', id: 1, lat: 35, lon: 139, tags: {} }), {
    id: 'node/1', cat: 'その他', fee: 'unknown', lat: 35, lng: 139,
  });
  assert.equal(Object.hasOwn(elementToWifiSpot({
    type: 'node', id: 2, lat: 35, lon: 139, tags: { name: '   ' },
  }), 'name'), false);
});

test('Wi-Fi除外判定: internet_access=no と座標なしを理由別に数える', () => {
  const denied = { type: 'node', id: 1, lat: 35, lon: 139, tags: { internet_access: 'no' } };
  const missing = { type: 'relation', id: 2, tags: { wifi: 'free' } };
  assert.equal(wifiExclusionReason(denied), 'internet_access=no');
  assert.equal(wifiExclusionReason(missing), '座標なし');
  assert.equal(elementToWifiSpot(denied), null);
  assert.equal(elementToWifiSpot(missing), null);
  assert.deepEqual(transformWifi({ elements: [denied, missing] }).stats, {
    fetched: 2, excluded: { 'internet_access=no': 1, '座標なし': 1 }, output: 0,
  });
});

test('elementToChainSpot: Wi-Fiタグの有無にかかわらずブランド店舗へ変換する', () => {
  assert.deepEqual(elementToChainSpot({
    type: 'node', id: 9, lat: 34.123456, lon: 135.654321,
    tags: { name: '店舗', internet_access: 'wlan' },
  }, { id: 'sample' }), {
    id: 'node/9', brand: 'sample', name: '店舗', lat: 34.12346, lng: 135.65432,
  });
  assert.equal(elementToChainSpot({ type: 'way', id: 10, tags: {} }, { id: 'sample' }), null);
});

test('transformChains: 1ブランドに複数のQ番号があっても順に変換する', () => {
  const rawByBrand = new Map([
    ['Q1', { elements: [{ type: 'node', id: 1, lat: 35, lon: 139, tags: { name: 'A' } }] }],
    ['Q2', { elements: [{ type: 'node', id: 2, lat: 36, lon: 140, tags: { name: 'B' } }] }],
  ]);
  const result = transformChains(rawByBrand, [{ id: 'sample', brandWikidata: ['Q1', 'Q2'] }]);
  assert.deepEqual(result.spots.map(({ id, brand }) => ({ id, brand })), [
    { id: 'node/1', brand: 'sample' }, { id: 'node/2', brand: 'sample' },
  ]);
});

test('createDataset: OSMの出典メタデータと件数を先頭に持つ', () => {
  const output = createDataset([{ id: 'node/1' }], WIFI_QUERY, '2026-09-04');
  assert.deepEqual(Object.keys(output), [
    'generatedAt', 'source', 'license', 'licenseUrl', 'attributionUrl', 'extractedVia', 'query', 'count', 'spots',
  ]);
  assert.equal(output.generatedAt, '2026-09-04');
  assert.equal(output.source, '© OpenStreetMap contributors');
  assert.equal(output.license, 'ODbL 1.0');
  assert.equal(output.licenseUrl, 'https://opendatacommons.org/licenses/odbl/1-0/');
  assert.equal(output.attributionUrl, 'https://www.openstreetmap.org/copyright');
  assert.equal(output.extractedVia, 'Overpass API');
  assert.equal(output.query, WIFI_QUERY);
  assert.equal(output.count, 1);
});

test('publicChains: brandWikidataを除き各項目へ確認日を付ける', () => {
  assert.deepEqual(publicChains([{ id: 'sample', label: '例', brandWikidata: ['Q1'], tier: 'all' }], '2026-09-04'), [
    { id: 'sample', label: '例', tier: 'all', checkedAt: '2026-09-04' },
  ]);
});

for (const limitedStatus of [429, 406]) {
  test(`fetchOverpass: ${limitedStatus}は30秒待って同じ上流を再試行する`, async () => {
    const statuses = [limitedStatus, 200];
    const waits = [];
    const endpoints = [];
    const result = await fetchOverpass('query', {
      upstreams: ['https://primary.example/api', 'https://mirror.example/api'],
      wait: async (milliseconds) => waits.push(milliseconds),
      fetchImpl: async (endpoint) => {
        endpoints.push(endpoint);
        const status = statuses.shift();
        return { status, ok: status === 200, json: async () => ({ elements: [] }) };
      },
    });
    assert.deepEqual(result, { elements: [] });
    assert.deepEqual(waits, [30_000]);
    assert.deepEqual(endpoints, ['https://primary.example/api', 'https://primary.example/api']);
  });
}

test('fetchOverpass: 通常の失敗は待たずに次のミラーへ切り替える', async () => {
  const waits = [];
  const endpoints = [];
  await fetchOverpass('query', {
    upstreams: ['https://primary.example/api', 'https://mirror.example/api'],
    wait: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async (endpoint) => {
      endpoints.push(endpoint);
      if (endpoints.length === 1) throw new Error('offline');
      return { status: 200, ok: true, json: async () => ({ elements: [1] }) };
    },
  });
  assert.deepEqual(waits, []);
  assert.deepEqual(endpoints, ['https://primary.example/api', 'https://mirror.example/api']);
});

test('main: --from-file と --from-dir だけでWi-Fi・ブランド生JSONを変換する', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'day029-osm-'));
  const rawDirectory = join(directory, 'raw');
  const outputDirectory = join(directory, 'output');
  mkdirSync(rawDirectory);
  const wifiPath = join(directory, 'wifi.json');
  const brandsPath = join(directory, 'chains.json');
  writeFileSync(wifiPath, JSON.stringify({ elements: [
    { type: 'node', id: 1, lat: 35.1, lon: 139.1, tags: { wifi: 'free', name: 'Wi-Fi' } },
  ] }));
  writeFileSync(brandsPath, JSON.stringify({ checkedAt: '2026-09-04', chains: [
    { id: 'sample', label: '例', brandWikidata: 'Q123', tier: 'all', condition: '登録不要', sourceUrl: 'https://example.test/' },
  ] }));
  writeFileSync(join(rawDirectory, 'brand-Q123.json'), JSON.stringify({ elements: [
    { type: 'node', id: 2, lat: 35.2, lon: 139.2, tags: { brand: 'Sample' } },
  ] }));

  let fetched = false;
  const result = await main([
    '--from-file', wifiPath, '--brands', brandsPath, '--from-dir', rawDirectory,
  ], {
    fetcher: async () => { fetched = true; throw new Error('ネットワーク取得禁止'); },
    outputDirectory,
    log: () => {},
  });

  assert.equal(fetched, false);
  assert.equal(result.wifi.count, 1);
  assert.equal(result.chains.count, 1);
  assert.equal(result.chains.query, brandQuery('Q123'));
  assert.deepEqual(result.chains.chains, [{ id: 'sample', label: '例', tier: 'all', condition: '登録不要', sourceUrl: 'https://example.test/', checkedAt: '2026-09-04' }]);
  assert.equal(JSON.parse(readFileSync(join(outputDirectory, 'osm-wifi.json'), 'utf8')).spots[0].name, 'Wi-Fi');
  assert.equal(JSON.parse(readFileSync(join(outputDirectory, 'osm-chains.json'), 'utf8')).spots[0].brand, 'sample');
});
