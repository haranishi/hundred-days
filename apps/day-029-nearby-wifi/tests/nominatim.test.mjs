import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabel, searchPlaces, shortPlaceName } from '../lib/nominatim.js';

test('shortPlaceName: カンマ区切りの先頭3要素を日本語読点でつなぐ', () => {
  const name = '仙台, 杜の陽だまりガレリア(仙台駅東西自由通路), 中央一丁目, 宮城県, 日本';
  assert.equal(shortPlaceName(name), '仙台、杜の陽だまりガレリア(仙台駅東西自由通路)、中央一丁目');
  assert.equal(placeLabel(name), '仙台');
});

test('searchPlaces: typeなしの既存レスポンスも受け取る', async () => {
  const places = await searchPlaces('秋田駅', async () => new Response(JSON.stringify({
    places: [{ name: '秋田駅', lat: 39.7, lng: 140.1 }],
  }), { status: 200 }));
  assert.deepEqual(places, [{ name: '秋田駅', lat: 39.7, lng: 140.1 }]);
});
