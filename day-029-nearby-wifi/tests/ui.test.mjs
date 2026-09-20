import test from 'node:test';
import assert from 'node:assert/strict';
import { legendVisibility } from '../lib/ui.js';

test('legendVisibility: 地図に出る層とOSM料金区分だけを表示対象にする', () => {
  assert.deepEqual(legendVisibility([
    { layer: 'municipal', fee: 'free' },
    { layer: 'osm', fee: 'customers' },
    { layer: 'osm', fee: 'paid' },
    { layer: 'chain', fee: 'estimated' },
  ]), {
    municipal: true,
    free: false,
    customers: true,
    paid: true,
    unknown: false,
    chain: true,
  });
});

test('legendVisibility: ピンがなければ全区分を非表示にする', () => {
  assert.deepEqual(legendVisibility([]), {
    municipal: false,
    free: false,
    customers: false,
    paid: false,
    unknown: false,
    chain: false,
  });
});
