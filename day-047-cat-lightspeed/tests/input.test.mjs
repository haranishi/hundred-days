import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInput,reduceInput,normalizeDistance,wheelDistance,consumeInput,enqueueInput} from '../lib/input.js';
import {advanceSpeed,MAX_SPEED} from '../lib/physics.js';
import {LIGHT_SPEED} from '../lib/milestones.js';
test('移動ゼロ・NaN・Infinityは推力を作らない',()=>{for(const d of [0,NaN,Infinity,-Infinity])assert.equal(reduceInput(createInput(),{distance:d}).q,0);});
test('上下対称・高さ正規化・高さのclamp',()=>{assert.equal(normalizeDistance(100,440),normalizeDistance(-100,440));assert.equal(normalizeDistance(290,290),440);assert.equal(normalizeDistance(540,999),440);});
test('4pxの累積デッドゾーンは細かいイベントを捨てない',()=>{let s=createInput();for(let i=0;i<40;i++)s=reduceInput(s,{distance:1});assert.ok(Math.abs(s.q-reduceInput(createInput(),{distance:40}).q)<1e-12);});
test('上限450ms・末尾80ms・中断で消去・長押し中は貯めない',()=>{let s=reduceInput(createInput(),{distance:10000});assert.equal(s.q,.45);s=reduceInput(s,{dt:.41});assert.ok(Math.abs(s.u-.5)<1e-8);assert.equal(reduceInput(s,{dt:.04}).u,0);assert.equal(reduceInput(s,{reset:true}).q,0);assert.equal(reduceInput(s,{held:true,distance:100}).q,0);});
test('wheel pixel/line/page換算',()=>{assert.equal(wheelDistance(2,0,440),2);assert.equal(wheelDistance(2,1,440),32);assert.equal(wheelDistance(2,2,440),880);});
test('同時刻の同距離はイベント分割に依存しない',()=>{const run=n=>{let s=createInput();for(let i=0;i<n;i++)s=enqueueInput(s,{time:.01,distance:60/n});return consumeInput(s,.1,()=>{});};assert.ok(Math.abs(run(1).q-run(60).q)<1e-10);});
test('時刻順に消費し、未来の入力は先取りしない',()=>{let s=enqueueInput(createInput(),{time:.2,distance:100});s=consumeInput(s,.1,u=>assert.equal(u,0));assert.equal(s.q,0);s=consumeInput(s,.2,()=>{});assert.ok(s.q>0);});
test('長押し端点は既存式と一致・中間推力で上下の境界を通過できる',()=>{for(const v of [0,1,1e6,1e9])for(const dt of [0,.01,1,100]){assert.equal(advanceSpeed(v,true,dt),advanceSpeed(v,1,dt));assert.equal(advanceSpeed(v,false,dt),advanceSpeed(v,0,dt));assert.ok(advanceSpeed(v,.5,dt)>=advanceSpeed(v,0,dt));assert.ok(advanceSpeed(v,.5,dt)<=advanceSpeed(v,1,dt));}assert.ok(advanceSpeed(1e9,0,1)<1e9*.9);});
// v2 took "after 70 s" as the late phase of its 91 s curve. v3 finishes in 45–60 s, so the late phase is 90% of c onward.
test('120px/0.4秒＋持ち替え0.15秒でも75秒以内に完走し、光速比90%以降も最大推力',()=>{let s=createInput(),v=0,time=0,min=1,late=0;for(let cycle=0;cycle<220;cycle++){s=enqueueInput(s,{time:cycle*.55,stroke:true});for(let i=1;i<=24;i++)s=enqueueInput(s,{time:cycle*.55+i/60,distance:5});}while(time<120&&v<MAX_SPEED){s=consumeInput(s,1/60,(u,dt)=>{if(v>=LIGHT_SPEED*.9){min=Math.min(min,u);late++;}v=advanceSpeed(v,u,dt);});time+=1/60;}assert.equal(v,MAX_SPEED);assert.ok(time<=75,`完走 ${time.toFixed(2)}秒`);assert.ok(late>0);assert.equal(min,1);});
