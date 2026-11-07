import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,paperPoint} from '../lib/sheet.js';
import {applyOp,assertSheet,resolveLine} from '../lib/ops.js';
import {distance} from '../lib/math.js';
const paper={width:1,height:1};
const fold={type:'fold',line:{through:['T','B']},moving:'BR',mode:'valley'};
test('valley folds rigidly with distinct overlap ranks and fixed hinge vertices',()=>{
  const s=createSheet(paper),r=applyOp(s,fold,.004);
  assertSheet(s,paper);
  assert.ok(distance(paperPoint(s,[1,0]),[-.5,0,.5])<1e-12);
  for(const i of r.movingVertices) assert.ok(r.before.vertices[i].p[0]>0);
  assert.ok(s.triangles.some(t=>t.rank>0));
});
test('mountain goes below the stationary layers',()=>{
  const s=createSheet(paper);applyOp(s,{...fold,mode:'mountain'},.004);
  assertSheet(s,paper);assert.ok(s.triangles.some(t=>t.rank<0));
});
test('invalid layer selection fails before tearing a shared hinge vertex',()=>{
  const s=createSheet(paper);s.triangles[0].tags=['one'];
  assert.throws(()=>applyOp(s,{...fold,select:{tags:['one']}},.004),e=>e.code==='HINGE_TEAR');
});
test('crease opens exactly, scribe does not move, and turn reverses ranks',()=>{
  const s=createSheet(paper);applyOp(s,{...fold,type:'crease'},.004);
  assertSheet(s,paper);assert.ok(distance(paperPoint(s,[1,0]),[.5,0,.5])<1e-12);
  assert.ok(s.creases.length);
  applyOp(s,{type:'scribe',segments:[['TL','BR']]},.004);
  applyOp(s,fold,.004);
  const ranks=s.triangles.map(t=>t.rank);
  applyOp(s,{type:'turn',axis:'vertical'},.004);
  assert.deepEqual(s.triangles.map(t=>t.rank),ranks.map(r=>-r));assertSheet(s,paper);
});
test('hinge rotates offsets too and disallows later flat folds',()=>{
  const s=createSheet(paper);applyOp(s,fold,.004);
  applyOp(s,{type:'hinge',axis:{through:['T','B']},degrees:90},.004);
  assertSheet(s,paper);
  assert.ok(s.triangles.some(t=>Math.abs(t.offset[0])>0));
  assert.throws(()=>applyOp(s,fold,.004),e=>e.code==='NOT_FLAT');
});
test('line resolvers support perpendicular and chosen angle bisectors',()=>{
  const s=createSheet(paper);
  assert.deepEqual(resolveLine(s,{perpBisector:['BL','BR']}).o,[0,.5]);
  const l=resolveLine(s,{angleBisector:[{point:[0,0],dir:[1,0]},{point:[0,0],dir:[0,1]}],containing:[.2,.2]});
  assert.ok(Math.abs(l.d[0]-l.d[1])<1e-12);
});
