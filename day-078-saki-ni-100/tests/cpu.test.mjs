import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../lib/stages.js';
import { createState, legalMoves, applyMove } from '../lib/rules.js';
import { createSolver } from '../lib/solver.js';
import { chooseCpuMove } from '../lib/cpu.js';
import { createRandom } from '../lib/random.js';
import { oracle, randomSequence } from './helpers.mjs';

test('ミス率0は全ての勝ち局面で勝ち手、1は負け手があるとき必ず負け手', () => {
  for (const stage of STAGES) {
    const solver = createSolver(stage), table = oracle(stage);
    for (let total = 0; total < stage.target; total++) {
      const state = {...createState(stage),total,turn:'cpu'};
      const legal = legalMoves(state);
      if (!legal.length) continue;
      const good = legal.filter(n => !table[total+n]);
      for (const value of [0,.25,.5,.999999]) {
        const perfect = chooseCpuMove(solver, state, () => value, 0);
        const mistake = chooseCpuMove(solver, state, () => value, 1);
        assert.ok(legal.includes(perfect));
        if (good.length) assert.ok(good.includes(perfect));
        if (good.length && good.length < legal.length) assert.ok(!good.includes(mistake));
        else if (good.length) assert.ok(good.includes(mistake));
      }
    }
  }
});
test('ミス率pを固定乱数列で厳密に確かめる', () => {
  const stage = STAGES[0], solver = createSolver(stage), state = {...createState(stage),turn:'cpu'};
  for (const p of [0,.05,.2,.35,.5,.8,1]) {
    const values = Array.from({length:100},(_,i)=>[(i+.5)/100,.3]).flat();
    const random = randomSequence(values);
    let misses=0;
    for (let i=0;i<100;i++) if(!solver.winningMoves(0).includes(chooseCpuMove(solver,state,random,p))) misses++;
    assert.equal(misses, Math.round(p*100));
  }
});
test('負け局面では返し手の負ける割合を独立計算し、最大の手を選ぶ', () => {
  let unequal = 0;
  for (const stage of STAGES) {
    const solver = createSolver(stage), table = oracle(stage);
    for (let total=0;total<stage.target;total++) {
      const state = {...createState(stage),total,turn:'cpu'}, legal = legalMoves(state);
      if (table[total] || !legal.length) continue;
      const scores = legal.map(n => {
        const replies = stage.moves.filter(k => total+n+k<=stage.target);
        return replies.length ? replies.filter(k=>table[total+n+k]).length/replies.length : 0;
      });
      if (new Set(scores).size>1) unequal++;
      const best = Math.max(...scores);
      for (const value of [0,.5,.999999]) {
        const move = chooseCpuMove(solver,state,()=>value,.9);
        assert.ok(Math.abs(scores[legal.indexOf(move)]-best)<1e-12);
      }
    }
  }
  assert.ok(unequal>0, '常に同点の局面だけでは検証不足');
});
test('同じseedで同じ対局、整数以外のseedは無視する', () => {
  function match() {
    const stage=STAGES[5],solver=createSolver(stage),random=createRandom('?seed=-123');let state=createState(stage);
    while (!state.winner) state=applyMove(state,chooseCpuMove(solver,state,random,.5));
    return state.history;
  }
  assert.deepEqual(match(),match());
  const fallback=()=>.77;
  for(const query of ['', '?seed=', '?seed=1.5','?seed=abc','?seed=1e2','?seed=9007199254740992']) assert.equal(createRandom(query,fallback),fallback);
  for(const seed of ['0','1','-1','42']) { const random=createRandom('?seed='+seed); for(let i=0;i<100;i++){const n=random();assert.ok(n>=0&&n<1);} }
});
test('終局であいては手を返さない',()=>{
  assert.equal(chooseCpuMove(createSolver(STAGES[0]),{...createState(STAGES[0]),winner:'human'},()=>0,0),null);
});
