import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGES } from '../lib/stages.js';
import { createState, legalMoves, applyMove } from '../lib/rules.js';
import { createSolver } from '../lib/solver.js';
import { oracle } from './helpers.mjs';

for (const stage of STAGES) {
  test(`面${stage.id}：全局面・全合法手を独立計算と照合し、人間側の必勝を全探索`, () => {
    const table = oracle(stage), solver = createSolver(stage);
    const seen = new Map();
    function humanCanWin(state) {
      if (state.winner) return state.winner === 'human';
      const key = `${state.total}:${state.turn}`;
      if (seen.has(key)) return seen.get(key);
      const outcomes = legalMoves(state).map(n => humanCanWin(applyMove(state, n)));
      const can = state.turn === 'human' ? outcomes.some(Boolean) : outcomes.every(Boolean);
      seen.set(key, can); return can;
    }
    assert.equal(humanCanWin(createState(stage)), true);
    for (let t = 0; t <= stage.target; t++) {
      assert.equal(solver.moverWins(t), table[t], `total ${t}`);
      assert.deepEqual(solver.winningMoves(t), stage.moves.filter(n => t < stage.target && t + n <= stage.target && !table[t + n]));
    }
    if (stage.first === 'cpu') {
      for (const n of legalMoves(createState(stage))) assert.equal(table[n], true, `CPU first ${n}`);
    } else assert.equal(table[0], true);
  });
}
test('第12面の勝ちの合計', () => {
  assert.deepEqual(createSolver(STAGES[11]).winningTotals, [1,12,23,34,45,56,67,78,89,100]);
});
test('36通りの先攻必勝26・後攻必勝10', () => {
  let first = 0, second = 0;
  for (const target of [50,75,100]) for (const moves of [[1,2,3],[1,2,3,4,5],[1,2,3,4,5,6,7,8,9,10],[1,3,5,7],[1,2,5,10],[2,3,7]]) for (const misere of [false,true]) {
    const stage = { target, moves, misere };
    const actual = createSolver(stage).moverWins(0);
    assert.equal(actual, oracle(stage)[0]);
    if (actual) first++; else second++;
  }
  assert.deepEqual([first, second], [26,10]);
});
test('さかさまは目標を踏んだ側が負ける／踏むしかないときに勝ち手はない', () => {
  const stage = { target: 4, moves: [1,2,3], misere: true, first: 'human' };
  const state = applyMove(createState(stage), 3);
  assert.deepEqual(legalMoves(state), [1]);
  assert.deepEqual(createSolver(stage).winningMoves(3), []);
  assert.equal(applyMove(state, 1).winner, 'human');
});
test('目標超過・不正な数・終了後の手を拒否し、元の状態を変えない', () => {
  const initial = createState(STAGES[0]);
  const snapshot = structuredClone(initial);
  const next = applyMove(initial, 2);
  assert.deepEqual(initial, snapshot);
  assert.deepEqual(next.history, [{by:'human',n:2,total:2}]);
  for (const n of [0,-1,4,1.5,'2',NaN]) assert.throws(() => applyMove(initial, n), RangeError);
  const near = {...initial,total:9};
  assert.deepEqual(legalMoves(near), [1]);
  assert.throws(() => applyMove(near, 2), RangeError);
  const done = applyMove(near, 1);
  assert.equal(done.winner, 'human');
  assert.deepEqual(legalMoves(done), []);
  assert.throws(() => applyMove(done, 1), RangeError);
});
test('足せる数が残らない場合は次の人が負ける（目標未満でも終了）', () => {
  const stage = {target:8,moves:[2,3],misere:false,first:'human'};
  const done = applyMove({...createState(stage),total:5}, 2);
  assert.equal(done.total, 7); assert.equal(done.winner, 'human');
  assert.deepEqual(legalMoves(done), []);
});
test('12面の定義をdesign.mdの表から直接照合', () => {
  const design = readFileSync(new URL('../../.kiro/specs/day-078-saki-ni-100/design.md', import.meta.url), 'utf8');
  const rows = design.split('\n').filter(line => /^\| \d+ \|/.test(line));
  assert.equal(rows.length, 12);
  const expand = text => text.includes('〜') ? Array.from({length:Number(text.split('〜')[1])}, (_,i)=>i+1) : text.split('・').map(Number);
  assert.deepEqual(STAGES.map(s => [s.id,s.chapter,s.target,[...s.moves],s.misere,s.first,s.cpuError]), rows.map(row => {
    const c = row.split('|').slice(1,-1).map(x=>x.trim());
    return [Number(c[0]),c[1],Number(c[2]),expand(c[3]),c[4] === 'さかさま',c[5] === 'あなた' ? 'human' : 'cpu',Number(c[7].replace('%',''))/100];
  }));
});
