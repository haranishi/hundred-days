import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {pochi} from '../lib/models/pochi.js';
import {MODELS,modelDef} from '../lib/models/index.js';
import {outline,symmetryError,topFace} from './flat-geometry.mjs';
import {signedArea,overlapArea,AREA_EPS} from '../lib/math.js';
import {projection} from '../lib/stack.js';
const model=buildModel(pochi),a=Math.SQRT1_2;
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function criteria(m) {
  const s=inspectModel(m).raw.at(-1).end,poly=outline(s);
  assert.ok(s.flat);assert.ok(s.vertices.every(v=>Math.abs(v.p[1])<1e-9));
  assert.equal(poly.length,4);assert.ok(symmetryError(poly)<1e-6);
  near(Math.max(...poly.map(p=>p[0]))-Math.min(...poly.map(p=>p[0])),a);
  near(Math.max(...poly.map(p=>p[1]))-Math.min(...poly.map(p=>p[1])),7*a/8);
  near(signedArea(poly),7/16);
  const r=inspectModel(m).raw.at(-1).groups[0].records[0];
  assert.equal(r.op.stack?.mode,'between');
  const moving=r.after.triangles.filter((_,i)=>r.moving.has(i));
  const fixed=r.after.triangles.filter((_,i)=>!r.moving.has(i));
  let low=-Infinity,high=Infinity;
  for(const [tag,isUpper] of [['body',false],['bottom',true]]) {
    const bounds=fixed.filter(t=>t.tags.includes(tag));
    const touched=bounds.filter(t=>moving.some(u=>overlapArea(projection(r.after,t),projection(r.after,u))>AREA_EPS));
    assert.ok(touched.length,'both bounds overlap the moving lid by area');
    if(isUpper) high=Math.min(...touched.map(t=>t.rank));
    else low=Math.max(...touched.map(t=>t.rank));
    const area=moving.reduce((sum,t)=>sum+bounds.reduce((n,u)=>n+overlapArea(projection(r.after,t),projection(r.after,u)),0),0);
    near(area,isUpper?1/64:1/8);
  }
  near(low,0);near(high,3);
  for(const t of moving) {assert.ok(low<t.rank&&t.rank<high);near(t.rank,1.5);}
}
test('pochi: final union is a flat symmetric rectangle and the lid nests by positive area',()=>criteria(model));
test('pochi: four visible flaps present the back colour in the expected order',()=>{
  const s=inspectModel(model).raw.at(-1).end;
  for(const [p,tag] of [[[-.25,0],'sideL'],[[.25,0],'sideR'],[[0,-.25],'lid'],[[0,.1],'bottom']]) {
    const t=topFace(s,p);assert.ok(t.tags.includes(tag),`${tag} is visible`);
    assert.ok(signedArea(projection(s,t))>0,'back faces upward');
  }
});
test('pochi: registry, named contrasting colours and six short steps',()=>{
  assert.equal(modelDef('pochi'),pochi);assert.equal(pochi.steps.length,6);
  assert.equal(pochi.level,1);assert.equal(pochi.minutes,3);
  assert.notEqual(pochi.paper.front,pochi.paper.back);
  for(const side of ['front','back']) {
    assert.ok(pochi.paper[`${side}Name`]);assert.notEqual(pochi.paper[side],'#d6452d');
    for(const d of MODELS.filter(d=>d!==pochi)) for(const key of ['front','back']) assert.notEqual(pochi.paper[side],d.paper[key]);
  }
});
for(const [name,change] of [
  ['bottom stops at centre',d=>d.steps[3].ops[0].line.point[1]=a/2],
  ['side flap used as lower bound',d=>d.steps[5].ops[0].stack.lower='sideL'],
  ['lid rests on top',d=>delete d.steps[5].ops[0].stack],
  ['asymmetric side fold',d=>d.steps[1].ops[0].line.point[0]=-.4*a],
]) test(`pochi: rejects ${name}`,()=>{
  const def=structuredClone(pochi);change(def);
  let m;try {m=buildModel(def);} catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>criteria(m),assert.AssertionError);
});
