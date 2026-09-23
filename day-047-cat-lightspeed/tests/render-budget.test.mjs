import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.js';
import {audit} from '../scripts/render-budget.mjs';
import {createBatch,packBatch} from '../lib/models.js';
// v3 budget (PLAN-v3.md): 48 draw calls (v2 allowed 64) and 18,000 triangles; cat h 18–38% (v2: 15%, plus a w floor).
test('本番GLBと全世界・全姿勢・飽和プールが絶対描画予算内（48 calls・18,000三角形）、catScreenも維持',async()=>{
  const report=await audit();assert.ok(report.peak.triangles<=18000,JSON.stringify(report.peak));assert.ok(report.maxCalls<=48,`最大 ${report.maxCalls} calls`);
  for(const cap of report.impactCaps)assert.ok(cap.total<=15460);
  for(const n of Object.values(report.backgroundGeometry))assert.ok(n+512<=3404,n);
  for(const row of report.rows)if(row.catScreen){const s=row.catScreen;assert.ok(s.x>=.4&&s.x<=.6,JSON.stringify(row));assert.ok(s.head.x>s.tail.x&&s.spread>=s.w*.55&&s.flowX<0,JSON.stringify(row));assert.ok(s.h>=.18&&s.h<=.38,JSON.stringify(row));assert.ok(s.x-s.w/2>.02&&s.x+s.w/2<.98&&s.y-s.h/2>.02&&s.y+s.h/2<.98,JSON.stringify(row));}
});
test('インスタンスは有効countのみ提出し容量以上を作らない',()=>{const batch=createBatch(new THREE.BoxGeometry(),24,new THREE.MeshBasicMaterial());assert.equal(packBatch(batch,Array.from({length:100},()=>({x:0,y:0,z:0}))).triangles,24*12);packBatch(batch,[]);assert.equal(batch.count,0);assert.equal(batch.frustumCulled,false);});

// v2 shared exactly 6 batches (4 bodies + fragments + always-on ring, up to 24 bodies). v3 drops the always-on ring and
// draws at most 5 waiting + 4 flying bodies and 12 fragments (+ up to 4 short white contact marks). Nothing is built per world.
test('世界切替でも衝突の描画オブジェクトを作り直さず、描く数は本体9・破片12・白い衝撃4まで',async()=>{
  const {createImpactView}=await import('../lib/impact-view.js'),{createImpacts,updateImpacts}=await import('../lib/impacts.js');
  const g=new THREE.BoxGeometry(),models=Object.fromEntries(['log','stump','fence','stone','rock','buildingA','buildingC','buildingE','building'].map(k=>[k,g]));
  const view=createImpactView(models),s=createImpacts(),children=view.root.children.length;
  for(const world of ['farm','city','sky','orbit','solar','interstellar']){updateImpacts(s,{speed:1e6,world,dt:.3});view.sync(s,1e6,false);assert.equal(view.root.children.length,children,world);
    const drawn=view.root.children.filter(m=>m.isInstancedMesh&&m.visible!==false).reduce((sum,m)=>sum+m.count,0);assert.ok(drawn<=5+4+12+4,`${world}：${drawn}個`);}
});
