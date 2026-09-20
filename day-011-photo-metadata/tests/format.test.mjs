import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dmsToDecimal,
  formatAltitude,
  formatBytes,
  formatCoordinate,
  formatDirection,
  formatExifDate,
  formatExifDateTime,
  formatExposureTime,
  formatFNumber,
  formatFocalLength,
  formatGpsTime,
  formatIso,
  formatLatLon,
  formatOrientation,
  isRotated,
  rationalValue
} from '../lib/format.js';

test('分数（RATIONAL）を数にする。分母0や壊れた値は null', () => {
  assert.equal(rationalValue({ n: 28, d: 10 }), 2.8);
  assert.equal(rationalValue(35), 35);
  assert.equal(rationalValue({ n: 1, d: 0 }), null);
  assert.equal(rationalValue(null), null);
  assert.equal(rationalValue(Number.NaN), null);
});

test('度分秒を十進に直す。南緯・西経は負の数', () => {
  const tokyo = [{ n: 35, d: 1 }, { n: 40, d: 1 }, { n: 52450, d: 1000 }];
  assert.equal(dmsToDecimal(tokyo, 'N').toFixed(6), '35.681236');
  assert.equal(dmsToDecimal(tokyo, 'S').toFixed(6), '-35.681236');
  assert.equal(dmsToDecimal([{ n: 139, d: 1 }, { n: 46, d: 1 }], 'E').toFixed(4), '139.7667');
  assert.equal(dmsToDecimal(null, 'N'), null);
  assert.equal(dmsToDecimal([{ n: 35, d: 0 }, { n: 40, d: 1 }, { n: 0, d: 1 }], 'N'), null);
});

test('緯度経度は十進6桁（地図の検索欄にそのまま貼れる桁）', () => {
  assert.equal(formatCoordinate(35.681236), '35.681236');
  assert.equal(formatCoordinate(Number.NaN), '');
  assert.equal(formatLatLon(35.681236, 139.767125), '35.681236, 139.767125');
  assert.equal(formatLatLon(35.681236, null), '');
});

test('Exifの日時を日本語にする。読めない形なら元の文字列のまま返す', () => {
  assert.equal(formatExifDateTime('2026:08:18 09:11:00'), '2026年8月18日 9:11:00');
  assert.equal(formatExifDateTime('2026:08:18 09:11'), '2026年8月18日 9:11');
  assert.equal(formatExifDateTime('よくわからない値'), 'よくわからない値');
  assert.equal(formatExifDateTime(null), '');
  assert.equal(formatExifDate('2026:08:18'), '2026年8月18日');
  assert.equal(formatGpsTime([{ n: 9, d: 1 }, { n: 5, d: 1 }, { n: 3200, d: 100 }]), '09:05:32');
  assert.equal(formatGpsTime([{ n: 9, d: 1 }]), '');
});

test('シャッター速度は1秒より短ければ分数で書く', () => {
  assert.equal(formatExposureTime({ n: 1, d: 250 }), '1/250秒');
  assert.equal(formatExposureTime({ n: 1, d: 3 }), '1/3秒');
  assert.equal(formatExposureTime({ n: 2, d: 1 }), '2秒');
  assert.equal(formatExposureTime({ n: 15, d: 10 }), '1.5秒');
  assert.equal(formatExposureTime({ n: 0, d: 1 }), '');
});

test('絞りと焦点距離は末尾の0を落とす', () => {
  assert.equal(formatFNumber({ n: 28, d: 10 }), 'F2.8');
  assert.equal(formatFNumber({ n: 40, d: 10 }), 'F4');
  assert.equal(formatFNumber({ n: 0, d: 10 }), '');
  assert.equal(formatFocalLength({ n: 350, d: 10 }), '35mm');
  assert.equal(formatFocalLength({ n: 505, d: 10 }), '50.5mm');
});

test('感度は配列で入っていることがある', () => {
  assert.equal(formatIso(400), 'ISO 400');
  assert.equal(formatIso([200, 0]), 'ISO 200');
  assert.equal(formatIso(0), '');
});

test('高さは海面より下かどうかで言い方が変わる', () => {
  assert.equal(formatAltitude({ n: 125, d: 10 }, 0), '海抜 12.5m');
  assert.equal(formatAltitude({ n: 30, d: 1 }, [1]), '海面下 30m');
  assert.equal(formatAltitude(null, 0), '');
});

test('カメラの向きは、真北か磁北かを書き分ける', () => {
  assert.equal(formatDirection({ n: 1234, d: 10 }, 'T'), '真北から 123.4度の向き');
  assert.equal(formatDirection({ n: 90, d: 1 }, 'M'), '磁北から 90度の向き');
  assert.equal(formatDirection(null, 'T'), '');
});

test('向きは番号と、どう回して見るかを両方書く', () => {
  assert.equal(formatOrientation(1), '1：そのまま（回さない）');
  assert.equal(formatOrientation(6), '6：時計回りに90度回して見る');
  assert.equal(formatOrientation(99), '');
  assert.equal(isRotated(1), false);
  assert.equal(isRotated(6), true);
});

test('ファイルの大きさは単位を切り替える', () => {
  assert.equal(formatBytes(512), '512バイト');
  assert.equal(formatBytes(2048), '2KB');
  assert.equal(formatBytes(1024 * 1024 * 3.5), '3.5MB');
  assert.equal(formatBytes(-1), '');
});
