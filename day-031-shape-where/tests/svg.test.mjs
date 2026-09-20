import assert from 'node:assert/strict';
import { test } from 'node:test';

import { placeRings, placedPath, ringsToPath } from '../lib/svg.js';

const SQUARE = [0, 0, 1000, 0, 1000, 1000, 0, 1000];
const HOLE = [250, 250, 750, 250, 750, 750, 250, 750];

test('1本のリングは M で始まり Z で閉じる', () => {
  assert.equal(ringsToPath([SQUARE]), 'M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z');
});

test('穴も外側も同じ d につないで evenodd で塗る', () => {
  const path = ringsToPath([SQUARE, HOLE]);
  assert.equal(path.match(/M /g).length, 2);
  assert.equal(path.match(/Z/g).length, 2);
  assert.ok(path.includes('M 250 250'));
});

test('絵にならないリングは捨てる', () => {
  assert.equal(ringsToPath([[0, 0, 10, 0, 10, 10]]), '');
  assert.equal(ringsToPath([[0, 0, 1, 1, 2]]), '');
  assert.equal(ringsToPath([]), '');
  assert.equal(ringsToPath(null), '');
  assert.equal(ringsToPath([SQUARE, [1, 2]]), ringsToPath([SQUARE]));
});

test('県の枠に置くと、長い辺が size・中心が cx, cy になる', () => {
  const [ring] = placeRings([SQUARE], [500, 300, 200]);
  const xs = ring.filter((_, index) => index % 2 === 0);
  const ys = ring.filter((_, index) => index % 2 === 1);
  assert.equal(Math.max(...xs) - Math.min(...xs), 200);
  assert.equal(Math.max(...ys) - Math.min(...ys), 200);
  assert.equal((Math.max(...xs) + Math.min(...xs)) / 2, 500);
  assert.equal((Math.max(...ys) + Math.min(...ys)) / 2, 300);
});

test('置いた形の縦横比は変わらない', () => {
  const tall = [400, 0, 600, 0, 600, 1000, 400, 1000];
  const [ring] = placeRings([tall], [500, 500, 300]);
  const xs = ring.filter((_, index) => index % 2 === 0);
  const ys = ring.filter((_, index) => index % 2 === 1);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  assert.equal(height, 300);
  assert.ok(Math.abs(width / height - 0.2) < 1e-9);
});

test('位置が無ければ何も描かない', () => {
  assert.deepEqual(placeRings([SQUARE], null), []);
  assert.deepEqual(placeRings([SQUARE], [1, 2]), []);
  assert.deepEqual(placeRings([SQUARE], [500, 500, 0]), []);
  assert.equal(placedPath([SQUARE], null), '');
});

test('置いてから path にする', () => {
  assert.equal(placedPath([SQUARE], [500, 500, 100]), 'M 450 450 L 550 450 L 550 550 L 450 550 Z');
});
