// 身が2枚あって同じ文の手の印が2つ出る手順では、いま包丁が働いている側の1つだけを出す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHands, createProcedure, stateAt, workingOwner } from '../../lib/timeline.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { SPECIES_IDS } from '../../lib/contract.js';
import { fakeAnatomy } from '../fixtures/fake-anatomy.js';

test('activeHands は、同じ手・同じ文の印を、働いている側の1つに絞り、違う文の印は残す', () => {
  const R = { who: 'off', text: '身を支えます', owner: 'R.dorsal' }, L = { ...R, owner: 'L.dorsal' };
  const other = { who: 'dom', text: '刃を引きます', owner: 'R.dorsal' };
  assert.deepEqual(activeHands([R, L, other], 'L.strip'), [L, other]);
  assert.deepEqual(activeHands([R, L, other], 'skin.R'), [R, other]);
  assert.deepEqual(activeHands([R, L, other], null), [R, other]);
  assert.deepEqual(activeHands([R], 'L.dorsal'), [R]);
  assert.deepEqual(activeHands([], null), []);
});

test('workingOwner は、切りの合間と手順の終わりでも、直前に終わった切りの側を返す', () => {
  const cuts = [{ cut: { curve: 'ribStrip', side: 'R', window: [0.28, 0.47] } }, { cut: { curve: 'ribStrip', side: 'L', window: [0.69, 0.84] } }];
  assert.equal(workingOwner(cuts, 0), 'R.dorsal');
  assert.equal(workingOwner(cuts, 0.4), 'R.dorsal');
  assert.equal(workingOwner(cuts, 0.52), 'R.dorsal');
  assert.equal(workingOwner(cuts, 0.57), 'R.dorsal');
  assert.equal(workingOwner(cuts, 0.59), 'L.dorsal');
  assert.equal(workingOwner(cuts, 0.9), 'L.dorsal');
  assert.equal(workingOwner(cuts, 1), 'L.dorsal');
  assert.equal(workingOwner([], 0.5), null);
});

test('アジの腹骨の手順では、右の身を切る間は右、左の身を切り終えた手順の終わりまで左の印だけが出る', () => {
  const raw = getProcedure('aji'), proc = createProcedure(raw, fakeAnatomy);
  const index = raw.steps.findIndex(s => s.id === 'ribs');
  const [right, left] = raw.steps[index].cuts;
  const sideOf = hand => hand.owner.split('.')[0];
  for (const [u, side] of [[(right.window[0] + right.window[1]) / 2, 'R'], [(left.window[0] + left.window[1]) / 2, 'L'],
    [left.window[1] + 0.02, 'L'], [0.96, 'L'], [1, 'L']]) {
    assert.deepEqual(stateAt(proc, index, u).hands.map(sideOf), [side], 'u=' + u);
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
