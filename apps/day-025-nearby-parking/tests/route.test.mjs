import test from 'node:test';
import assert from 'node:assert/strict';
import { routeUrl } from '../lib/geo.js';

test('ルートURL: Google Maps directions APIを使う', () => {
  const url = new URL(routeUrl(39.7167, 140.1297));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
});

test('ルートURL: 緯度経度をdestinationにする', () => {
  const url = new URL(routeUrl(-1.25, 2.5));
  assert.equal(url.searchParams.get('destination'), '-1.25,2.5');
});
