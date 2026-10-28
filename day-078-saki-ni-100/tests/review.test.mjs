import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../lib/stages.js';
import { createState, applyMove } from '../lib/rules.js';
import { createSolver } from '../lib/solver.js';
import { findTurningPoint, findMistakes, describeLoss, describeWin, explain } from '../lib/review.js';
import { oracle } from './helpers.mjs';
const historyOf = ns => ns.reduce((s,n)=>applyMove(s,n),createState(STAGES[0])).history;
test('最初の分かれ目と、そのとき勝てた数',()=>{
  assert.deepEqual(findTurningPoint(STAGES[0],historyOf([2,1,1,2,1,3])),{index:2,total:3,n:1,winningMoves:[3]});
  assert.deepEqual(findTurningPoint(STAGES[0],historyOf([1,1,1,1,1,1,1,1,1,1])),{index:0,total:0,n:1,winningMoves:[2]});
});
test('最善手を続けた人間に分かれ目はない',()=>{
  for(const stage of STAGES){
    const solver=createSolver(stage);let state=createState(stage);
    while(!state.winner){
      const moves=solver.winningMoves(state.total);
      const n=state.turn==='human' ? moves[0] : stage.moves.find(k=>state.total+k<=stage.target);
      assert.ok(n);state=applyMove(state,n);
    }
    assert.equal(state.winner,'human');assert.equal(findTurningPoint(stage,state.history),null);
  }
});
test('からくりの数字一覧・間隔は実際の勝ちの合計と一致し、ふぞろいは一覧',()=>{
  for(const stage of STAGES){
    const expected=oracle(stage).map((win,t)=>!win&&t>0?t:null).filter(t=>t!==null);
    const explanation=explain(stage);
    assert.deepEqual(explanation.winningTotals,expected);
    const list=explanation.text.match(/勝ちの合計は ([\d・]+)。/)[1].split('・').map(Number);
    assert.deepEqual(list,expected);
    const interval=expected.length>1&&expected.slice(1).every((n,i)=>n-expected[i]===expected[1]-expected[0])?expected[1]-expected[0]:null;
    assert.equal(explanation.interval,interval);
    if(interval) assert.ok(explanation.text.includes(`合わせて${interval}になる`));
    else if(explanation.period) assert.ok(explanation.text.includes(`${explanation.period}ずつ、同じ形がくり返します`));
    else assert.ok(explanation.text.includes('目標から逆に数えていくと'));
    if(stage.misere) assert.ok(!expected.includes(stage.target));
  }
  assert.equal(explain(STAGES[0]).interval,4);
  assert.equal(explain(STAGES[11]).interval,11);
  assert.equal(explain(STAGES[6]).interval,null);
});
test('くり返しの周期は、勝ちの合計を独立に調べた結果と一致する（7面は7、9面は8、8面はくり返さない）',()=>{
  // 目標から数えた位置（目標−合計）の集合が、p ずつずらしても同じ形になるか。独立に書き直した判定。
  const periodicOffsets=(stage)=>{
    const table=oracle(stage);
    const offsets=new Set();
    for(let t=1;t<=stage.target;t++) if(!table[t]) offsets.add(stage.target-t);
    for(let p=2;p*2<=stage.target;p++){
      let ok=true;
      for(let o=0;o+p<=stage.target-1;o++) if(offsets.has(o)!==offsets.has(o+p)){ok=false;break;}
      if(ok) return p;
    }
    return null;
  };
  for(const stage of STAGES){
    const e=explain(stage);
    if(e.interval) assert.equal(e.period,null,`面${stage.id}`);
    else assert.equal(e.period,periodicOffsets(stage),`面${stage.id}`);
  }
  assert.equal(explain(STAGES[6]).period,7);
  assert.equal(explain(STAGES[8]).period,8);
  assert.equal(explain(STAGES[7]).period,null);
  assert.ok(explain(STAGES[7]).text.includes('目標から逆に数えていくと'));
});
test('負けの説明：最後に見逃したその場の勝ちを先に、最初の分かれ目はあとに',()=>{
  // 1面：あなた 1,1,1,1 / あいて 1,1,2,2。合計7のとき3を足せばその場で勝てた。
  const history=historyOf([1,1,1,1,1,2,1,2]);
  const mistakes=findMistakes(STAGES[0],history);
  assert.deepEqual(mistakes.map(m=>[m.total,m.n,m.immediate]),[[0,1,false],[4,1,false],[7,1,true]]);
  const loss=describeLoss(STAGES[0],history);
  assert.equal(loss.lines.length,2);
  assert.ok(loss.lines[0].startsWith('いちばん惜しかったのは、合計7から1を足した手。3を足せば、その場で勝てました。'));
  assert.ok(loss.lines[1].startsWith('最初の分かれ目は、合計0から1を足した手。2を足せば、勝ちをつなげました。'));
});
test('負けの説明：その場の勝ちの見逃しが無ければ、最初の分かれ目だけ',()=>{
  // あなた 1,1,1 / あいて 1,3,3 。外したのは最初の手だけ（合計2・6では、あなたに勝てる手がない）。
  const history=historyOf([1,1,1,3,1,3]);
  const loss=describeLoss(STAGES[0],history);
  assert.deepEqual(loss.lines,['分かれ目は、合計0から1を足した手。2を足せば、勝ちをつなげました。']);
  // 1ばかり押し続けると、合計8でその場の勝ち（2を足せば10）も見逃す。
  assert.equal(describeLoss(STAGES[0],historyOf([1,1,1,1,1,1,1,1,1,1])).lines.length,2);
  assert.deepEqual(describeLoss(STAGES[0],[]).lines,['今回は、分かれ目がありません。もう一度、勝ちの合計を目指そう。']);
});
test('勝ちの説明：勝ち筋を外した手があれば、あいてのミスに助けられたと伝える',()=>{
  const clean=describeWin(STAGES[0],historyOf([2,2,2]));
  assert.equal(clean.clean,true);assert.equal(clean.lines.length,1);
  const lucky=describeWin(STAGES[0],historyOf([1,1,2,3,3]));
  assert.equal(lucky.clean,false);
  assert.ok(lucky.lines[0].includes('勝ち筋を外した手が1回'));
  assert.ok(lucky.lines[1].includes('勝ちの合計は 2・6・10'));
});
test('その場で勝てる手の見逃しは、さかさまの面でも「その場で勝てた」と数える（足せる数が無くなる形）',()=>{
  // 11面（さかさま・目標21・1〜3）：20 に置けば相手は21を踏むしかない。
  const stage=STAGES[10];
  const solver=createSolver(stage);
  let state=createState(stage);
  // あいてが先に1。あなたは勝てる手があるのに、わざと別の手を打つ。
  state=applyMove(state,1);
  const wins=solver.winningMoves(state.total);
  const wrong=stage.moves.find(n=>!wins.includes(n));
  assert.ok(wrong,'勝てない手がある局面');
  state=applyMove(state,wrong);
  const [first]=findMistakes(stage,state.history);
  assert.equal(first.n,wrong);
  assert.deepEqual(first.winningMoves,wins);
});
