import test from 'node:test';
import assert from 'node:assert/strict';
import {FRUITS,TOP,SCORES,clampAim,canConsumePair,mergeOutcome,advanceDanger} from '../lib/rules.mjs';

test('largest fruit still fits between the walls at either aiming extreme',()=>{
  for(const fruit of FRUITS){assert.ok(clampAim(-999,fruit.r)-fruit.r>14);assert.ok(clampAim(999,fruit.r)+fruit.r<406);}
});
test('matching fruit consumed by another contact cannot score twice',()=>{
  const a={lv:0,dead:false},b={lv:0,dead:false},c={lv:0,dead:false};
  assert.equal(canConsumePair(a,b),true);a.dead=b.dead=true;
  assert.equal(canConsumePair(a,c),false);assert.equal(canConsumePair(b,c),false);
});
test('different fruit and wall contacts cannot merge',()=>{
  assert.equal(canConsumePair({lv:1},{lv:2}),false);
  assert.equal(canConsumePair({lv:1},{}),false);
  assert.equal(canConsumePair({lv:-1},{lv:-1}),false);
});
test('every merge grows one stage, and two final fruits clear instead of indexing past catalog',()=>{
  for(let i=0;i<TOP;i++)assert.deepEqual(mergeOutcome(i),{level:i+1,score:SCORES[i+1]});
  assert.deepEqual(mergeOutcome(TOP),{level:null,score:640});
  for(const invalid of [-1,10,NaN,1.5])assert.throws(()=>mergeOutcome(invalid),RangeError);
});
test('new or airborne fruit cannot trigger game over when passing through the danger line',()=>{
  assert.equal(advanceDanger({landed:false,age:5000,top:70,previous:0},50),0);
  assert.equal(advanceDanger({landed:true,age:420,top:70,previous:0},50),0);
});
test('a landed fruit gets 1.7 seconds to settle and recovers when it falls below the line',()=>{
  let danger=0;
  for(let i=0;i<34;i++)danger=advanceDanger({landed:true,age:1000,top:131,previous:danger},50);
  assert.equal(danger,1700);
  danger=advanceDanger({landed:true,age:1000,top:132,previous:danger},50);
  assert.equal(danger,1590);
});
