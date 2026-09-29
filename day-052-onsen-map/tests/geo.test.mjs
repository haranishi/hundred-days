import test from 'node:test';
import assert from 'node:assert/strict';
import { JAPAN_BOXES, MAIN_ISLAND_EDGES, circleRing, haversineKm, inJapan, robustBounds } from '../lib/geo.js';

test('circleRing: 閉じた32角形で、どの頂点も中心から約14km', () => {
  const ring = circleRing(140.1, 39.7);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[32]);
  for (const [lng, lat] of ring) {
    const km = haversineKm({ lat: 39.7, lng: 140.1 }, { lat, lng });
    assert.ok(Math.abs(km - 14) < 0.2, `${km}`);
  }
  assert.equal(circleRing(0, 0, 5, 8).length, 9);
});

test('haversineKm: 東京駅〜大阪駅は約400km', () => {
  const km = haversineKm({ lat: 35.6812, lng: 139.7671 }, { lat: 34.7025, lng: 135.4959 });
  assert.ok(km > 395 && km < 410, `${km}`);
  assert.equal(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});

test('inJapan: 列島と離島は中、近隣の国は外', () => {
  const inside = {
    秋田駅: [39.7176, 140.1305], 那覇: [26.2124, 127.6809], 根室: [43.33, 145.58], 稚内: [45.415, 141.673], 対馬厳原: [34.2, 129.29],
    八丈島: [33.11, 139.79], 佐多岬: [30.99, 130.66], 石垣島: [24.34, 124.16], 与那国島: [24.47, 122.99], 南鳥島: [24.28, 153.98], 佐渡: [38.02, 138.37], 屋久島: [30.35, 130.53],
  };
  const outside = { ソウル: [37.566, 126.978], 釜山: [35.18, 129.07], 浦項: [36.02, 129.37], ウラジオストク: [43.12, 131.89], 台北: [25.03, 121.56], パリ: [48.85, 2.35] };
  for (const [name, [lat, lng]] of Object.entries(inside)) assert.equal(inJapan({ lat, lng }), true, name);
  for (const [name, [lat, lng]] of Object.entries(outside)) assert.equal(inJapan({ lat, lng }), false, name);
  assert.equal(inJapan({ lat: Number.NaN, lng: 140 }), false);
  assert.equal(inJapan(null), false);
  assert.ok(JAPAN_BOXES.every(([west, south, east, north]) => west < east && south < north));
});

test('MAIN_ISLAND_EDGES: 主な4島の外形の目印は日本の中にあり、沖縄は入れない', () => {
  assert.equal(MAIN_ISLAND_EDGES.length, 24);
  assert.ok(MAIN_ISLAND_EDGES.every((point) => inJapan(point)));
  assert.ok(MAIN_ISLAND_EDGES.every((point) => point.lat > 30.5), '沖縄（北緯26度付近）は構図の計算に入れない');
  const lats = MAIN_ISLAND_EDGES.map((point) => point.lat);
  assert.ok(Math.max(...lats) > 45.5 && Math.min(...lats) < 31, '北は宗谷岬・南は佐多岬まで');
});

test('robustBounds: 20件以上なら両端3%の外れ（離島）を外す', () => {
  const points = Array.from({ length: 99 }, (_, index) => ({ lat: 35 + index / 1000, lng: 139 + index / 1000 }));
  points.push({ lat: 27.1, lng: 142.2 }); // 小笠原のような外れ
  const [[west, south], [east, north]] = robustBounds(points);
  assert.ok(south > 30, `${south}`);
  assert.ok(east < 140, `${east}`);
  assert.ok(west >= 139 && north <= 35.1);
});

test('robustBounds: 少ないときはそのまま、1点だけなら少し広げ、空なら null', () => {
  const few = [{ lat: 35, lng: 139 }, { lat: 36, lng: 140 }];
  assert.deepEqual(robustBounds(few), [[139, 35], [140, 36]]);
  assert.deepEqual(robustBounds([{ lat: 35, lng: 139 }]), [[138.98, 34.98], [139.02, 35.02]]);
  assert.equal(robustBounds([]), null);
  assert.equal(robustBounds(null), null);
  assert.equal(robustBounds([{ lat: 'x', lng: 1 }]), null);
});
