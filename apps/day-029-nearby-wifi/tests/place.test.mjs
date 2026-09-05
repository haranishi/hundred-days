import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, onRequestGet, trimPlaces, upstreamQuery } from '../../../functions/api/day-029/place.js';

test('upstreamQuery: 末尾の駅だけに空白を挿入し、入力値は変えない', () => {
  assert.equal(upstreamQuery('仙台駅'), '仙台 駅');
  assert.equal(upstreamQuery('仙台 駅'), '仙台 駅');
  assert.equal(upstreamQuery('駅前'), '駅前');
  assert.equal(normalizeQuery(' 仙台駅 '), '仙台駅');
});

test('trimPlaces: addresstype優先でtypeを付ける', () => {
  assert.deepEqual(trimPlaces([
    { display_name: '仙台駅', lat: '38.26', lon: '140.88', addresstype: 'station', type: 'halt' },
    { display_name: '東京駅', lat: '35.68', lon: '139.76', type: 'station' },
  ]), [
    { name: '仙台駅', lat: 38.26, lng: 140.88, type: 'station' },
    { name: '東京駅', lat: 35.68, lng: 139.76, type: 'station' },
  ]);
});

test('onRequestGet: 上流だけ駅に空白を入れ、日本に限定する', async () => {
  let upstreamUrl = '';
  const response = await onRequestGet({ request: new Request('https://example.test/api/day-029/place?q=%E4%BB%99%E5%8F%B0%E9%A7%85') }, {
    fetchImpl: async (url) => {
      upstreamUrl = url;
      return new Response(JSON.stringify([{ display_name: '仙台駅', lat: '38.26', lon: '140.88', addresstype: 'station' }]), { status: 200 });
    },
  });
  const target = new URL(upstreamUrl);
  assert.equal(target.searchParams.get('q'), '仙台 駅');
  assert.equal(target.searchParams.get('countrycodes'), 'jp');
  assert.equal((await response.json()).places[0].type, 'station');
});
