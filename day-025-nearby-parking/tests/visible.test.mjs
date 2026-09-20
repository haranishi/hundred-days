import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, matchedResults, MAX_VISIBLE, RADII, visibleResults } from '../lib/state.js';

// resultsは距離昇順で入る前提（addDistancesがsort済み）
const results = (n, tags = {}) => Array.from({ length: n }, (_, i) => ({
  id: `node/${i}`, distance: i, fee: 'unknown', restricted: false, ...tags,
}));

test('初期半径はRADIIの先頭', () => {
  assert.equal(createState().radius, RADII[0]);
});

test('表示上限: 近い順に50件で切る', () => {
  assert.equal(MAX_VISIBLE, 50);
  const state = { ...createState(), results: results(500) };
  const visible = visibleResults(state);
  assert.equal(visible.length, 50);
  assert.equal(visible[0].id, 'node/0');
  assert.equal(visible.at(-1).id, 'node/49');
});

test('表示上限: 上限より少なければそのまま出す', () => {
  assert.equal(visibleResults({ ...createState(), results: results(7) }).length, 7);
});

test('表示上限: フィルタしてから切るので、タブごとに「その条件の近い順50件」になる', () => {
  // 手前に無料以外が100件、その奥に無料が60件
  const state = {
    ...createState(),
    filter: 'no',
    results: [...results(100, { fee: 'yes' }), ...results(60, { fee: 'no' })],
  };
  const visible = visibleResults(state);
  assert.equal(visible.length, 50);
  assert.ok(visible.every((item) => item.fee === 'no'));
});

test('表示上限: restrictedを除いてから数える', () => {
  const state = {
    ...createState(),
    results: [...results(30, { restricted: true }), ...results(60)],
  };
  assert.equal(visibleResults(state).length, 50);
  assert.ok(visibleResults(state).every((item) => !item.restricted));
});

test('該当件数: 50件で切る前の件数を別に取れる（画面で「◯件中50件」と言うため）', () => {
  const state = { ...createState(), results: results(225) };
  assert.equal(matchedResults(state).length, 225);
  assert.equal(visibleResults(state).length, 50);
});

test('該当件数: フィルタとrestricted除外は効かせたうえで数える', () => {
  const state = {
    ...createState(),
    filter: 'yes',
    results: [...results(9, { fee: 'yes' }), ...results(3, { fee: 'yes', restricted: true }), ...results(40, { fee: 'no' })],
  };
  assert.equal(matchedResults(state).length, 9);
});
