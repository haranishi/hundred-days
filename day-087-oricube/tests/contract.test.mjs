import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,FoldError,inspectModel} from '../lib/model.js';
import {createSheet} from '../lib/sheet.js';
import {applyOp} from '../lib/ops.js';
import {assertLayers} from '../lib/stack.js';
import {distance,cross,sub,dot} from '../lib/math.js';
const paper={width:1,height:1};
const fold={type:'fold',line:{through:['T','B']},moving:'BR',mode:'valley'};
const def=ops=>({id:'fixture',paper,steps:[{id:'test',ops}]});
test('valley lifts, mountain lowers, crease folds and opens, and sequential ops get separate time spans',()=>{
  for(const mode of ['valley','mountain']) {
    const m=buildModel(def([{...fold,mode}])),{p}=inspectModel(m).pose(0,.5);
    assert.ok(p.some(v=>mode==='valley'?v[1]>.4:v[1]<-.4));
  }
  const crease=buildModel(def([{...fold,type:'crease'}]));
  assert.deepEqual(crease.frame(0,0).positions.slice(),crease.frame(0,1).positions.slice());
  assert.ok(inspectModel(crease).pose(0,.25).p.some(v=>v[1]>.4));
  const m=buildModel(def([fold,{type:'turn',axis:'vertical'}]));
  const d=inspectModel(m),p=d.pose(0,.5).p;
  assert.ok(p.every(v=>Math.abs(v[1])<1e-9));
  assert.ok(p.some(v=>v[0]<-.4));
  assert.equal(m.steps[0].guides.length,2);
});
test('together operations animate at the same progress and reject shared moving vertices',()=>{
  const m=buildModel(def([
    {type:'fold',line:{through:['T','L']},moving:'TL',mode:'valley'},
    {type:'fold',line:{through:['T','R']},moving:'TR',mode:'valley',together:true},
  ]));
  const d=inspectModel(m),p=d.pose(0,.5).p;
  for(const u of [0,1]) {
    const id=d.fine.vertices.findIndex(v=>distance(v.uv,[u,1])<1e-9);
    assert.ok(p[id][1]>.3);
  }
  assert.throws(()=>buildModel(def([fold,{...fold,moving:'BL',together:true}])),e=>e instanceof FoldError&&e.code==='TOGETHER_CONFLICT');
});
test('between rejects missing and reversed stationary bounds',()=>{
  for(const stack of [{mode:'between',lower:'missing',upper:'other'},{mode:'unknown'}])
    assert.throws(()=>buildModel(def([{...fold,stack}])),FoldError);
});
test('layer collision validator rejects equal ranks on positive-area overlaps',()=>{
  const s=createSheet(paper);applyOp(s,fold,.004);
  s.triangles.forEach(t=>{t.rank=0;});
  assert.throws(()=>assertLayers(s),e=>e.code==='LAYER_COLLISION');
});
function seamFixture(ranks) {
  return {flat:true,vertices:[[0,0,0],[0,0,1],[1,0,0],[1,0,0]].map(p=>({p})),
    triangles:[{v:[0,1,2],rank:ranks[0]},{v:[1,0,3],rank:ranks[1]}]};
}
test('penetration validator rejects an unrelated layer straddling a folded edge',()=>{
  const s=seamFixture([0,2]);
  s.vertices.push(...[[-1,0,.25],[1,0,.25],[0,0,.9]].map(p=>({p})));
  s.triangles.push({v:[4,5,6],rank:1});
  assert.throws(()=>assertLayers(s),e=>e.code==='CREASE_PENETRATION');
});
test('penetration validator catches partial edge coverage away from its midpoint',()=>{
  const s=seamFixture([0,2]);
  s.vertices.push(...[[-.2,0,.05],[.2,0,.05],[0,0,.2]].map(p=>({p})));
  s.triangles.push({v:[4,5,6],rank:1});
  assert.throws(()=>assertLayers(s),e=>e.code==='CREASE_PENETRATION');
});
test('penetration validator rejects interleaved independent crease connections',()=>{
  const s=seamFixture([0,2]),other=seamFixture([1,3]);
  s.vertices.push(...other.vertices);s.triangles.push(...other.triangles.map(t=>({...t,v:t.v.map(v=>v+4)})));
  assert.throws(()=>assertLayers(s),e=>e.code==='CREASE_PENETRATION');
});
test('scribe segments crossing a later hinge bend on the paper and explode with its faces',()=>{
  const m=buildModel(def([{type:'scribe',segments:[['BL','TR']]},fold])),d=inspectModel(m);
  for(const t of [0,.25,.5,.75,1]) {
    const f=m.frame(0,t,{explode:24}),pose=d.pose(0,t),mapping=d.compiled[0].creaseMap;
    mapping.forEach(({triangle,endpoints},j)=>endpoints.forEach((_,k)=>{
      const p=Array.from(f.creaseSegments.slice(j*6+k*3,j*6+k*3+3)),tri=d.fine.triangles[triangle];
      const a=tri.v.map(v=>pose.p[v].map((x,c)=>x+pose.offsets[triangle][c]*24));
      assert.ok(Math.abs(dot(cross(sub(a[1],a[0]),sub(a[2],a[0])),sub(p,a[0])))<1e-7,'line endpoint lies in face plane');
    }));
  }
});
