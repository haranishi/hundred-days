import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizePath,
  toPolyline,
  cumulativeLengths,
  resample,
  prepareStroke,
} from '../lib/path.js';

test('tokenizePath: コマンドと引数の組に分ける', () => {
  const parsed = tokenizePath('M10,20c1,2,3,4,5,6');
  assert.deepEqual(parsed, [
    { cmd: 'M', groups: [[10, 20]] },
    { cmd: 'c', groups: [[1, 2, 3, 4, 5, 6]] },
  ]);
});

test('tokenizePath: 引数を繰り返す書き方（コマンド省略）を読む', () => {
  const parsed = tokenizePath('M0,0c1,1,2,2,3,3,4,4,5,5,6,6');
  assert.equal(parsed[1].groups.length, 2);
  assert.deepEqual(parsed[1].groups[1], [4, 4, 5, 5, 6, 6]);
});

test('tokenizePath: 負号と先頭の小数点が区切りとして読める', () => {
  const parsed = tokenizePath('M20.6,24.2c2.3.3,6,.3,8.3.1');
  assert.deepEqual(parsed[1].groups[0], [2.3, 0.3, 6, 0.3, 8.3, 0.1]);
});

test('tokenizePath: 扱えないコマンドは落とす', () => {
  assert.throws(() => tokenizePath('M0,0L10,10'), /扱えないコマンド/);
  assert.throws(() => tokenizePath('M0,0c1,2,3'), /引数の数が合わない/);
});

test('toPolyline: 始点と終点が合う', () => {
  const points = toPolyline('M10,10c5,0,10,0,20,0');
  assert.deepEqual(points[0], [10, 10]);
  const last = points[points.length - 1];
  assert.ok(Math.abs(last[0] - 30) < 1e-6, `終点 x=${last[0]}`);
  assert.ok(Math.abs(last[1] - 10) < 1e-6, `終点 y=${last[1]}`);
});

test('toPolyline: S は直前の制御点を折り返す', () => {
  const points = toPolyline('M0,0c0,-10,10,-10,10,0s10,10,10,0');
  const last = points[points.length - 1];
  assert.ok(Math.abs(last[0] - 20) < 1e-6);
  assert.ok(Math.abs(last[1]) < 1e-6);
});

test('cumulativeLengths: 直線の長さを積み上げる', () => {
  const cum = cumulativeLengths([
    [0, 0],
    [3, 4],
    [3, 8],
  ]);
  assert.deepEqual(cum, [0, 5, 9]);
});

test('resample: 道のりで等間隔になる', () => {
  const points = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];
  const out = resample(points, cumulativeLengths(points), 5);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[2], [10, 0]);
  assert.deepEqual(out[4], [10, 10]);
});

test('prepareStroke: 長さに応じて点の数が増える（上限あり）', () => {
  const short = prepareStroke('M0,0c1,0,2,0,3,0');
  const long = prepareStroke('M0,0c30,0,60,0,100,0');
  assert.ok(short.points.length >= 6);
  assert.ok(long.points.length > short.points.length);
  assert.ok(long.points.length <= 220);
  assert.ok(Math.abs(long.length - 100) < 1);
});
