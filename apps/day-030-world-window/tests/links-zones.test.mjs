import test from 'node:test';
import assert from 'node:assert/strict';
import { googleMapsUrl, osmUrl } from '../lib/links.js';
import { zoneLabel } from '../lib/zones.js';

test('links: 座標と短縮OSM IDから外部地図URLを作る', () => {
  assert.equal(googleMapsUrl(35, 139), 'https://www.google.com/maps/search/?api=1&query=35,139');
  assert.equal(osmUrl('n123'), 'https://www.openstreetmap.org/node/123');
  assert.equal(osmUrl('w45'), 'https://www.openstreetmap.org/way/45');
  assert.equal(osmUrl('r1'), null);
});

test('zones: 既知区分を日本語化し未知値は情報を失わない', () => {
  assert.equal(zoneLabel('traffic'), '交通');
  assert.equal(zoneLabel('harbour'), '港');
  assert.equal(zoneLabel('unknown'), 'unknown');
  assert.equal(zoneLabel('未知'), '未知');
});
