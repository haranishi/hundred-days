import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bundleDuplicates,
  detectEncoding,
  matchColumns,
  normalizeCoordinate,
  parseCsv,
  transformSource,
} from '../tools/fetch-municipal.mjs';

test('detectEncoding detects UTF-8 and UTF-16LE BOMs and uses the configured fallback', () => {
  assert.deepEqual(detectEncoding(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]), 'shift_jis'), {
    encoding: 'utf-8', offset: 3,
  });
  assert.deepEqual(detectEncoding(Uint8Array.from([0xff, 0xfe, 0x61, 0x00]), 'shift_jis'), {
    encoding: 'utf-16le', offset: 2,
  });
  assert.deepEqual(detectEncoding(Uint8Array.from([0x93, 0x73]), 'shift_jis'), {
    encoding: 'shift_jis', offset: 0,
  });
});

test('parseCsv supports escaped quotes and line breaks inside quoted fields', () => {
  const csv = 'name,note\r\n"北九州,駅","一行目\r\n二行目"\r\n"a""b",end\r\n';
  assert.deepEqual(parseCsv(csv), [
    ['name', 'note'],
    ['北九州,駅', '一行目\r\n二行目'],
    ['a"b', 'end'],
  ]);
});

test('matchColumns trims headers and accepts spelling aliases', () => {
  const result = matchColumns(
    [' _id ', ' 名称 ', ' 緯度', '経度 ', '所在地_連結標記', '建物名等（肩書）'],
    {
      name: '名称',
      lat: '緯度',
      lng: '経度',
      address: ['所在地_連結表記', '所在地_連結標記'],
      ssid: 'SSID',
      operator: '設置者',
      area: '提供エリア',
      addressParts: [],
    },
  );
  assert.equal(result.name, 1);
  assert.equal(result.address, 4);
  assert.equal(result.ssid, -1);
});

test('normalizeCoordinate trims, swaps reversed coordinates and rejects invalid values', () => {
  assert.deepEqual(normalizeCoordinate(' 35.68123 ', ' 139.76712 ', 'auto'), {
    ok: true, lat: 35.68123, lng: 139.76712, swapped: false,
  });
  assert.deepEqual(normalizeCoordinate('127.72', '26.27', 'auto'), {
    ok: true, lat: 26.27, lng: 127.72, swapped: true,
  });
  assert.equal(normalizeCoordinate('', '139', 'auto').reason, 'empty');
  assert.equal(normalizeCoordinate('-', '-', 'auto').reason, 'empty');
  assert.equal(normalizeCoordinate('abc', '139', 'auto').reason, 'nonNumeric');
  assert.equal(normalizeCoordinate('35', '13549866651.0', 'auto').reason, 'oversized');
  assert.equal(normalizeCoordinate('4.877991', '136', 'auto').reason, 'outOfRange');
  assert.equal(normalizeCoordinate('999.0', '999.0', 'auto').reason, 'sentinel999');
});

test('bundleDuplicates only merges equal names and rounded coordinates within a source', () => {
  const bundled = bundleDuplicates([
    { src: 'a', name: '駅', lat: 35.123456, lng: 139.123456, addr: '', apCount: 1 },
    { src: 'a', name: '駅', lat: 35.123457, lng: 139.123457, addr: '住所', ssid: 'wifi', apCount: 1 },
    { src: 'b', name: '駅', lat: 35.123456, lng: 139.123456, addr: '別出典', apCount: 1 },
  ]);
  assert.equal(bundled.length, 2);
  assert.deepEqual(bundled[0], {
    src: 'a', name: '駅', lat: 35.12346, lng: 139.12346, addr: '住所', apCount: 2, ssid: 'wifi',
  });
  assert.equal(bundled[1].src, 'b');
});

test('transformSource drops _id, truncates names and joins address parts', () => {
  const csv = [
    '_id, 名称 ,緯度,経度,SSID,所在地_連結表記,所在地_都道府県,所在地_市区町村,所在地_町字,所在地_番地以下',
    `1,${'あ'.repeat(81)},35.123456,139.123456,, ,東京都,千代田区,丸の内,1-1`,
    `2,${'あ'.repeat(81)},35.123457,139.123457,wifi,東京都千代田区丸の内1-1,東京都,千代田区,丸の内,1-1`,
  ].join('\r\n');
  const source = {
    id: 'test', encoding: 'utf-8', fixes: { swapLatLng: 'auto' },
    columns: {
      name: '名称', lat: '緯度', lng: '経度', address: '所在地_連結表記', ssid: 'SSID',
      operator: '設置者', area: '提供エリア',
      addressParts: ['所在地_都道府県', '所在地_市区町村', '所在地_町字', '所在地_番地以下'],
    },
  };
  const { spots, stats } = transformSource(new TextEncoder().encode(csv), source);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].name.length, 80);
  assert.equal(spots[0].addr, '東京都千代田区丸の内1-1');
  assert.equal(spots[0].ssid, 'wifi');
  assert.equal(spots[0].apCount, 2);
  assert.equal(stats.bundled, 1);
});
