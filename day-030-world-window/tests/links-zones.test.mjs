import test from 'node:test';
import assert from 'node:assert/strict';
import { googleMapsUrl, osmUrl, safeHttpsUrl } from '../lib/links.js';
import { zoneLabel } from '../lib/zones.js';

test('links: 座標と短縮OSM IDから外部地図URLを作る', () => {
  assert.equal(googleMapsUrl(35, 139), 'https://www.google.com/maps/search/?api=1&query=35,139');
  assert.equal(osmUrl('n123'), 'https://www.openstreetmap.org/node/123');
  assert.equal(osmUrl('w45'), 'https://www.openstreetmap.org/way/45');
  assert.equal(osmUrl('r1'), null);
});

test('safeHttpsUrl: https のみ許可し http/javascript/data 等を拒む', () => {
  assert.equal(safeHttpsUrl('https://www.windy.com/webcams/1'), 'https://www.windy.com/webcams/1');
  assert.equal(safeHttpsUrl('  https://example.com/a?x=1  '), 'https://example.com/a?x=1');
  for (const bad of ['http://example.com/a', 'javascript:alert(1)', 'data:text/html,<script>', 'vbscript:1', '', null]) {
    assert.equal(safeHttpsUrl(bad), null, String(bad));
  }
});

test('zones: 既知区分を日本語化し未知値は情報を失わない', () => {
  assert.equal(zoneLabel('traffic'), '交通');
  assert.equal(zoneLabel('harbour'), '港');
  assert.equal(zoneLabel('unknown'), 'unknown');
  assert.equal(zoneLabel('未知'), '未知');
});
