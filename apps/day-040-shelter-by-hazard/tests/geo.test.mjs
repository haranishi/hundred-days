import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, formatDistance, inJapan, walkMinutes, walkText } from '../lib/geo.js';

test('距離は赤道1度と日付変更線で誤差1%以内、同一点は0', () => {
  for (const [a, b] of [[{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], [{ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 }]]) {
    assert.ok(Math.abs(distanceM(a, b) / 111320 - 1) < 0.01);
  }
  assert.equal(distanceM({ lat: 39.7186, lng: 140.1025 }, { lat: 39.7186, lng: 140.1025 }), 0);
});

test('距離の表示は1km未満が10m単位、1km以上は小数1桁のkm', () => {
  assert.equal(formatDistance(174), '170m');
  assert.equal(formatDistance(1234), '1.2km');
  assert.equal(formatDistance(4), '0m');
  assert.equal(formatDistance(217), '220m');
  // 四捨五入で1000mに届いたらkmへ繰り上げる（「1000m」と出さない）
  assert.equal(formatDistance(996), '1.0km');
  assert.equal(formatDistance(994), '990m');
});

test('徒歩の目安は80m/分の切り上げ', () => {
  assert.equal(walkMinutes(174), 3);
  assert.equal(walkMinutes(1234), 16);
  assert.equal(walkMinutes(80), 1);
  assert.equal(walkMinutes(81), 2);
  assert.equal(walkText(174), '徒歩およそ3分');
  assert.equal(walkText(1234), '徒歩およそ16分');
});

test('日本の範囲は境界を含み、外側と非数値を弾く', () => {
  assert.equal(inJapan({ lat: 20, lng: 122 }), true);
  assert.equal(inJapan({ lat: 46.5, lng: 154 }), true);
  for (const p of [{ lat: 19.9, lng: 139 }, { lat: 46.6, lng: 139 }, { lat: 35, lng: 121.9 },
    { lat: 35, lng: 154.1 }, { lat: null, lng: 139 }, { lat: 35, lng: 'あ' }]) {
    assert.equal(inJapan(p), false);
  }
  assert.equal(inJapan(null), false);
});
