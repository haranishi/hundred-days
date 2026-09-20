/* 投影と、描くものが全部入る範囲。地図ライブラリを使わないので、ここが唯一の座標変換。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf, createProjection, mercatorLat, mercatorY, padBounds } from '../lib/project.js';
import { convexHull, frameFor } from '../lib/map.js';
import { parseForecast } from '../lib/jma.js';
import { rawForecast } from './fixtures.mjs';

test('メルカトルは赤道で0、北が正、行き来しても戻る', () => {
  assert.ok(Math.abs(mercatorY(0)) < 1e-12);
  /* x は経度を度のまま使うので、y も「赤道上の1度」に揃えてある（赤道での伸びが1） */
  assert.ok(Math.abs(mercatorY(0.001) / 0.001 - 1) < 1e-6);
  assert.ok(mercatorY(35) > 0);
  assert.ok(mercatorY(-35) < 0);
  assert.ok(Math.abs(mercatorLat(mercatorY(35.68)) - 35.68) < 1e-9);
  assert.ok(Number.isFinite(mercatorY(90)), '極でも発散させない');
});

test('枠は点を全部囲み、余白は枠の大きさの割合で広げる', () => {
  const bounds = boundsOf([{ lat: 30, lng: 130 }, { lat: 40, lng: 140 }, null, { lat: NaN, lng: 1 }]);
  assert.deepEqual(bounds, { west: 130, east: 140, south: 30, north: 40 });
  assert.deepEqual(padBounds(bounds, 0.1), { west: 129, east: 141, south: 29, north: 41 });
  assert.equal(boundsOf([]), null);
});

test('縦横比を保つ。枠より画面が横長なら、横に広がって余る', () => {
  const projection = createProjection({ west: 130, east: 140, south: 30, north: 40 }, 800, 400);
  const left = projection.toPixel(35, 130);
  const right = projection.toPixel(35, 140);
  const top = projection.toPixel(40, 135);
  const bottom = projection.toPixel(30, 135);
  assert.ok(right.x - left.x < 800, '枠の幅が画面いっぱいにならない（縦に合わせている）');
  assert.ok(Math.abs((bottom.y - top.y) - 400) < 1, '縦は画面いっぱい');
  assert.ok(Math.abs((left.x + right.x) / 2 - 400) < 1e-6, '中心が画面の中心に来る');
  assert.ok(top.y < bottom.y, '北が上');
});

test('メートルの半径は、その緯度の尺度でピクセルに直す', () => {
  const projection = createProjection({ west: 130, east: 150, south: 20, north: 45 }, 600, 450);
  const north = projection.metersToPixels(100000, 45);
  const south = projection.metersToPixels(100000, 20);
  assert.ok(north > south, '高緯度ほどメルカトルは伸びる');
  /* 円の中心から半径ぶん動かした点と、実際に投影した点がおおむね合う */
  const center = projection.toPixel(35, 140);
  const east = projection.toPixel(35, 140 + 1 / Math.cos((35 * Math.PI) / 180));
  assert.ok(Math.abs((east.x - center.x) - projection.metersToPixels(111320, 35)) < 1);
});

test('地図の範囲に、経路・予報円・暴風警戒域と選んだ街が全部入る', () => {
  const forecast = parseForecast(rawForecast);
  const home = { lat: 35.6933, lng: 139.7552 };
  const frame = frameFor(forecast, home);
  assert.ok(frame.south < 12.1 && frame.north > 40.6, '発生地点から93時間後の予報まで入る');
  assert.ok(frame.west < 135 && frame.east > 154, '暴風警戒域の東西が入る');
  assert.ok(frame.south < home.lat && frame.north > home.lat);
  assert.ok(frame.west < home.lng && frame.east > home.lng);
  /* 選んだ街が枠の外にあるときは、その街まで枠が伸びる */
  const far = frameFor(forecast, { lat: 24.3, lng: 124.2 });
  assert.ok(far.west < 124.2);
});

test('2つの円を包む形は、境界の点の凸包で作れる', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
  const hull = convexHull(square);
  assert.equal(hull.length, 4, '内側の点は落ちる');
  assert.ok(hull.every((at) => at.x === 0 || at.x === 10));
  assert.deepEqual(convexHull([{ x: 1, y: 1 }, { x: 2, y: 2 }]), [{ x: 1, y: 1 }, { x: 2, y: 2 }]);
});
