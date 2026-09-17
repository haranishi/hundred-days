import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bytesFor, fileForPoint, filesForCircle, fileUrl, yearSpan } from '../lib/mesh.js';

const real = JSON.parse(readFileSync(new URL('../data/index.json', import.meta.url)));

test('2次メッシュが索引にあればそれを使う', () => {
  const index = { files: { 533946: 27270, 5339: 11091 } };
  assert.equal(fileForPoint(index, 35.6812, 139.7671), '533946');
  // 実データでも同じ（東京駅の区画は単独ファイルになっている）
  assert.equal(fileForPoint(real, 35.6812, 139.7671), '533946');
});

test('2次メッシュが索引に無ければ親の4桁に落ちる', () => {
  const index = { files: { 5339: 11091 } };
  assert.equal(fileForPoint(index, 35.6812, 139.7671), '5339');
  // 実データ：知床岬の2次メッシュは単独ファイルにならず、親の6645へまとまっている
  assert.equal(fileForPoint(real, 44.3308, 145.339), '6645');
});

test('2次も4桁も無い場所は null（そこには1件も記録が無い）', () => {
  assert.equal(fileForPoint({ files: {} }, 35.6812, 139.7671), null);
  assert.equal(fileForPoint({}, 35.6812, 139.7671), null);
  // 実データ：日本から離れた海上
  assert.equal(fileForPoint(real, 30.0, 150.0), null);
});

test('メッシュの真ん中なら、半径1kmでもファイルは1本', () => {
  const index = { files: { 533946: 1, 533945: 1, 533936: 1, 533935: 1 } };
  assert.deepEqual(filesForCircle(index, { lat: 35.7083, lng: 139.8125 }, 1000), ['533946']);
  assert.deepEqual(filesForCircle(real, { lat: 39.7186, lng: 140.1025 }, 1000), ['594040']);
});

test('メッシュの境目をまたぐと2本、角では4本まで増える', () => {
  const index = { files: { 533946: 1, 533945: 1, 533936: 1, 533935: 1 } };
  // 533946 の南西の角（lat 35.666667 / lng 139.75）のすぐ内側
  assert.deepEqual(filesForCircle(index, { lat: 35.667, lng: 139.7505 }, 1000),
    ['533935', '533936', '533945', '533946']);
  // 緯度だけまたぐ位置
  assert.deepEqual(filesForCircle(index, { lat: 35.667, lng: 139.8 }, 1000), ['533936', '533946']);
  // 半径300mなら境目に届かない
  assert.deepEqual(filesForCircle(index, { lat: 35.672, lng: 139.8 }, 300), ['533946']);
});

test('親の4桁へまとまっていれば、境目をまたいでも1本で済む', () => {
  const index = { files: { 5339: 11091 } };
  assert.deepEqual(filesForCircle(index, { lat: 35.667, lng: 139.7505 }, 1000), ['5339']);
});

test('ファイルの場所と、取る前に分かる大きさ', () => {
  assert.equal(fileUrl('533946'), './data/m/533946.bin');
  assert.equal(fileUrl('5339'), './data/m/5339.bin');
  // 見出し12バイト＋1件6バイト
  assert.equal(bytesFor({ files: { 533946: 10 } }, ['533946']), 72);
  assert.equal(bytesFor(real, ['533946']), 12 + real.files['533946'] * 6);
  assert.equal(bytesFor(real, []), 0);
});

test('索引が持つ年の幅は6年', () => {
  assert.equal(yearSpan(real), 6);
  assert.equal(yearSpan({ years: [2019, 2019] }), 1);
  assert.equal(yearSpan({}), 0);
});
