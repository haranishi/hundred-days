// 身が2枚あって同じ文の手の印が2つ出る手順では、いま包丁が働いている側の1つだけを出す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHands, createProcedure, stateAt } from '../../lib/timeline.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { SPECIES_IDS } from '../../lib/contract.js';
import { fakeAnatomy } from '../fixtures/fake-anatomy.js';

test('activeHands は、同じ手・同じ文の印を、包丁の側の1つに絞り、違う文の印は残す', () => {
  const R = { who: 'off', text: '身を支えます', owner: 'R.dorsal' }, L = { ...R, owner: 'L.dorsal' };
  const other = { who: 'dom', text: '刃を引きます', owner: 'R.dorsal' };
  assert.deepEqual(activeHands([R, L, other], { owner: 'L.strip' }), [L, other]);
  assert.deepEqual(activeHands([R, L, other], { owner: 'skin.R' }), [R, other]);
  assert.deepEqual(activeHands([R, L, other], null), [R, other]);
  assert.deepEqual(activeHands([R], { owner: 'L.strip' }), [R]);
  assert.deepEqual(activeHands([], null), []);
});

test('アジの腹骨の手順では、右の身を切る間は右、左の身を切る間は左の印だけが出る', () => {
  const raw = getProcedure('aji'), proc = createProcedure(raw, fakeAnatomy);
  const index = raw.steps.findIndex(s => s.id === 'ribs');
  const [right, left] = raw.steps[index].cuts;
  const sideOf = hand => hand.owner.split('.')[0];
  for (const [cut, side] of [[right, 'R'], [left, 'L']]) {
    const state = stateAt(proc, index, (cut.window[0] + cut.window[1]) / 2);
    assert.deepEqual(state.hands.map(sideOf), [side], cut.id);
  }
});

test('全種・全手順・全進度で、同じ手と同じ文の印は2つ出ない', () => {
  for (const id of SPECIES_IDS) {
    const raw = getProcedure(id), proc = createProcedure(raw, fakeAnatomy);
    raw.steps.forEach((step, i) => {
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        const keys = stateAt(proc, i, u).hands.map(h => h.who + '|' + h.text);
        assert.equal(new Set(keys).size, keys.length, id + '/' + step.id + ' u=' + u);
      }
    });
  }
});
