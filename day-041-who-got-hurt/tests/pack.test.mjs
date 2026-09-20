import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HEADER_BYTES, RECORD_BYTES, HOUR_UNKNOWN, MAGIC,
  F_BIKE, F_CROSS, F_DEATH, F_ELDER, F_MOTOR, F_NIGHT, F_WALKER,
  meshBounds, meshCodeOf, packTime, parentMesh, quantize, readPack, unpackHour, unpackYear, writeHeader,
} from '../lib/pack.js';
import { distanceM } from '../lib/geo.js';

const index = JSON.parse(readFileSync(new URL('../data/index.json', import.meta.url)));

/* ビルドと同じ手順で1件ぶんを詰める。読み出しは本番と同じ readPack を通す */
function packOne(code, record) {
  const box = meshBounds(code);
  const buffer = new ArrayBuffer(HEADER_BYTES + RECORD_BYTES);
  const view = new DataView(buffer);
  writeHeader(view, String(code).length, 1);
  view.setUint16(HEADER_BYTES, quantize(record.lat, box.lat, box.latSpan), true);
  view.setUint16(HEADER_BYTES + 2, quantize(record.lng, box.lng, box.lngSpan), true);
  view.setUint8(HEADER_BYTES + 4, packTime(record.year, record.hour));
  view.setUint8(HEADER_BYTES + 5, record.flags);
  return buffer;
}
const roundTrip = (code, record) => readPack(packOne(code, record), code)[0];

test('6バイトに詰めて戻しても、位置のずれは1m未満（2次メッシュ）', () => {
  for (const at of [
    { lat: 35.681236, lng: 139.767125 }, { lat: 35.749999, lng: 139.874999 },
    { lat: 35.666667, lng: 139.750000 }, { lat: 35.700003, lng: 139.800007 },
  ]) {
    const code = meshCodeOf(at.lat, at.lng, 2);
    const back = roundTrip(code, { ...at, year: 2021, hour: 8, flags: 0 });
    assert.ok(distanceM(at, back) < 1, `${code} で ${distanceM(at, back)}m ずれた`);
  }
});

test('1次メッシュ（約80km四方）に詰めても、位置のずれは1m未満', () => {
  for (const at of [
    { lat: 39.718600, lng: 140.102500 }, { lat: 35.333334, lng: 139.000001 },
    { lat: 35.999999, lng: 139.999999 },
  ]) {
    const code = parentMesh(meshCodeOf(at.lat, at.lng, 2));
    const back = roundTrip(code, { ...at, year: 2019, hour: 0, flags: 0 });
    assert.ok(distanceM(at, back) < 1, `${code} で ${distanceM(at, back)}m ずれた`);
  }
});

test('フラグ7つは往復で1ビットも壊れない', () => {
  const all = F_WALKER | F_BIKE | F_MOTOR | F_DEATH | F_ELDER | F_CROSS | F_NIGHT;
  const at = { lat: 35.68, lng: 139.76, year: 2024, hour: 17 };
  for (const flags of [0, F_WALKER, F_DEATH, F_WALKER | F_DEATH | F_ELDER, all]) {
    assert.equal(roundTrip('533946', { ...at, flags }).flags, flags);
  }
  const back = roundTrip('533946', { ...at, flags: all });
  assert.equal(back.year, 2024);
  assert.equal(back.hour, 17);
});

test('年と時。時刻が記録されていないものは24になる', () => {
  for (let year = 2019; year <= 2024; year += 1) {
    for (const hour of [0, 7, 23]) {
      const byte = packTime(year, hour);
      assert.equal(unpackYear(byte), year);
      assert.equal(unpackHour(byte), hour);
    }
  }
  for (const hour of [-1, 24, 99, Number.NaN]) {
    assert.equal(unpackHour(packTime(2020, hour)), HOUR_UNKNOWN);
  }
  assert.throws(() => packTime(2018, 0), /年が範囲外/);
});

test('メッシュ番号は実測どおりになり、境目は大きいほうのメッシュに入る', () => {
  assert.equal(meshCodeOf(35.6812, 139.7671, 2), '533946'); /* 東京駅 */
  assert.equal(meshCodeOf(39.7186, 140.1025, 2), '594040'); /* 秋田駅 */
  assert.equal(meshCodeOf(33.5665, 133.5432, 2), '503324'); /* 高知駅 */
  assert.equal(meshCodeOf(35.6812, 139.7671, 1), '5339');
  assert.equal(parentMesh('533946'), '5339');
  const box = meshBounds('533946');
  assert.equal(meshCodeOf(box.lat, box.lng, 2), '533946');
  assert.equal(meshCodeOf(box.lat + box.latSpan, box.lng + box.lngSpan, 2), '533957');
});

test('メッシュの範囲は1次が緯度40分・経度1度、2次はその8分の1', () => {
  const first = meshBounds('5339');
  assert.equal(first.latSpan, 2 / 3);
  assert.equal(first.lngSpan, 1);
  assert.ok(Math.abs(first.lat - 53 / 1.5) < 1e-12);
  assert.equal(first.lng, 139);
  const second = meshBounds('533946');
  assert.ok(Math.abs(second.latSpan - (2 / 3) / 8) < 1e-12);
  assert.equal(second.lngSpan, 1 / 8);
  assert.equal(second.lng, 139.75);
  for (const bad of ['53394', '53', '5339468', '5339a6', '533986']) {
    assert.throws(() => meshBounds(bad));
  }
});

test('4桁と6桁を取り違えたファイルは読まずに投げる', () => {
  const buffer = packOne('533946', { lat: 35.68, lng: 139.76, year: 2020, hour: 9, flags: F_BIKE });
  assert.throws(() => readPack(buffer, '5339'), /メッシュの桁が食い違う/);
  const wide = packOne('5339', { lat: 35.68, lng: 139.76, year: 2020, hour: 9, flags: F_BIKE });
  assert.throws(() => readPack(wide, '533946'), /メッシュの桁が食い違う/);
});

test('目印・長さ・件数が合わないファイルは投げる', () => {
  assert.throws(() => readPack(new ArrayBuffer(8), '5339'), /短すぎ/);
  const broken = packOne('5339', { lat: 35.5, lng: 139.5, year: 2019, hour: 1, flags: 0 });
  new DataView(broken).setUint32(0, MAGIC + 1, false);
  assert.throws(() => readPack(broken, '5339'), /目印が違う/);
  const short = packOne('5339', { lat: 35.5, lng: 139.5, year: 2019, hour: 1, flags: 0 }).slice(0, HEADER_BYTES + 4);
  assert.throws(() => readPack(short, '5339'), /件数と大きさが合わない/);
});

test('同梱ファイルは索引の件数どおりに読め、6年の範囲に収まる', () => {
  for (const code of ['533946', '5339', '594040']) {
    const file = readFileSync(new URL(`../data/m/${code}.bin`, import.meta.url));
    const records = readPack(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), code);
    assert.equal(records.length, index.files[code], `${code} の件数`);
    const box = meshBounds(code);
    for (const record of records) {
      assert.ok(record.year >= 2019 && record.year <= 2024);
      assert.ok(record.hour >= 0 && record.hour <= 24);
      assert.ok(record.lat >= box.lat && record.lat <= box.lat + box.latSpan);
      assert.ok(record.lng >= box.lng && record.lng <= box.lng + box.lngSpan);
    }
  }
});
