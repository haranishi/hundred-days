import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImpacts,updateImpacts,sweepQueues,impactCounts,LIMITS,flowSpeed} from '../lib/impacts.js';
import {advanceSpeed} from '../lib/physics.js';
const item=(s,id=String(s),x=0)=>({s,id,x,y:.5,rx:.22,ry:.4,slot:1});
test('掃引は複数列とちょうどの境界を一度だけ命中、移動0では命中しない',()=>{const q=[[item(1),item(2)],[],[]];assert.equal(sweepQueues(q,0,0,1).length,0);const h=sweepQueues(q,0,2,1);assert.deepEqual(h.map(o=>o.alpha),[.5,1]);assert.equal(sweepQueues(q,2,3,1).length,0);});
// v3 places every target on one ground-level centre lane (P0-4), so the v2 height filter for stacked rows is gone.
test('横幅の範囲外は通過して返却',()=>{const q=[[item(1,'a',1.25),item(2,'b',-1.25)],[],[]];assert.equal(sweepQueues(q,0,3,.55).length,0);assert.equal(q[0].length,0);});
test('高速の巻き込みは左右3レーンに到達する',()=>{const q=[[-1.25],[0],[1.25]].map(xs=>xs.map(x=>item(1,String(x),x)));assert.equal(sweepQueues(q,0,2,1.45).length,3);});
// v2: first hit 1.5–3 s. v3 P0-4: the first contact comes within 2 s at maximum thrust.
test('停止時は物体を動かさず、最大推力の最初の命中は2秒以内',()=>{const s=createImpacts();updateImpacts(s,{speed:0,world:'farm',dt:3});assert.equal(s.distance,0);assert.equal(s.total,0);let v=0,t=0;while(!s.total&&t<3){v=advanceSpeed(v,1,1/60);updateImpacts(s,{speed:v,world:'farm',dt:1/60});t+=1/60;}assert.ok(s.total>0);assert.ok(t>0&&t<=2+1e-9,`最初の命中 ${t.toFixed(3)}秒`);assert.equal(flowSpeed(.009),0);});
test('30/60/120Hzと巨大dtを分割したキュー結果が一致',()=>{const run=hz=>{const s=createImpacts();for(let i=0;i<hz*10;i++)updateImpacts(s,{speed:1e7,world:'interstellar',dt:1/hz});return s;};const a=run(30),b=run(60),c=run(120),d=createImpacts();updateImpacts(d,{speed:1e7,world:'interstellar',dt:10});for(const s of [b,c,d]){assert.equal(s.total,a.total);assert.equal(s.last.id,a.last.id);assert.ok(Math.abs(s.distance-a.distance)<1e-8);}});
// v2 hit >500 targets in 100 s (3 dense lanes). v3 spaces main contacts 0.6–1.2 s, so ~80–170 in 100 s.
// A pool that LIMITS does not declare must stay empty.
test('長時間飽和でも上限を超えず世代IDは重複しない',()=>{const s=createImpacts(),ids=new Set();for(let i=0;i<6000;i++){const events=updateImpacts(s,{speed:1e9,world:'interstellar',dt:1/60});for(const e of events){assert.ok(!ids.has(e.id));ids.add(e.id);}for(const [key,n] of Object.entries(impactCounts(s)))assert.ok(n<=(LIMITS[key]??0),`${key}=${n}（上限 ${LIMITS[key]}）`);}assert.ok(ids.size>=50,`100秒の接触 ${ids.size}件`);});
// v2 refilled 9+ targets (3 lanes x 3 rows). v3 shows 3–5 intact targets, so at least 3 must be queued at once.
test('世界切替は即座に新しい対象を3つ以上補充、旧飛翔は120ms以内に返却',()=>{const s=createImpacts();updateImpacts(s,{speed:500,world:'city',dt:2});const old=s.generation;updateImpacts(s,{speed:2000,world:'sky',dt:.05});assert.ok(s.generation>old);assert.ok(impactCounts(s).waiting>=3,`待機 ${impactCounts(s).waiting}`);updateImpacts(s,{speed:2000,world:'sky',dt:.1});assert.ok(s.flying.every(o=>o.world==='sky'));});
// v2 fixed the factor at 0.18 and 16 fragments. v3: parallax (the near flow) at most 20% of normal, fragments 4 or fewer, no shake.
test('reduced motion は物体の流れが通常の20%以下、破片4以下、揺れなし',()=>{const a=createImpacts(),b=createImpacts();updateImpacts(a,{speed:1e8,world:'solar',dt:5});updateImpacts(b,{speed:1e8,world:'solar',dt:5,reduced:true});assert.ok(b.distance>0&&b.distance<=a.distance*.2+1e-9,`${b.distance} / ${a.distance}`);assert.ok(b.total<a.total);assert.ok(impactCounts(b).fragments<=4);assert.equal(b.shake,null);});
