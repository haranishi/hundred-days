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
  assert.equal(pochi.paper.front,'#f2c14e');assert.equal(pochi.paper.back,'#745399');
  assert.equal(pochi.paper.frontName,'山吹色の面');assert.equal(pochi.paper.backName,'江戸紫の面');
  // The two faces must read apart on screen: with a mustard back (ratio about 2.3) the visual evaluation
  // could not tell front from back. WCAG relative luminance, same helper shape as kimono.test.mjs.
  const lum=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4)
    .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const [hi,lo]=[lum(pochi.paper.front),lum(pochi.paper.back)].sort((x,y)=>y-x);
  assert.ok((hi+.05)/(lo+.05)>=3,'front and back faces are clearly told apart');
  // The vermilion guide line must stay readable on both faces (same floor the newer models use).
  for(const face of [pochi.paper.front,pochi.paper.back]) {
    const [a,b]=[lum(face),lum('#d6452d')].sort((x,y)=>y-x);assert.ok((a+.05)/(b+.05)>=1.2,`guide on ${face}`);
  }
  assert.ok(pochi.steps[0].text.includes('山吹色の面'));assert.equal(pochi.steps[0].view,'flat');
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

// The step list says "差し込む" and its own text explains the tuck; a legend that said 中割り折り
// (the swan's and the crane's technique) was reported by the experience evaluation.
test('pochi: the lid tuck is drawn as a plain valley fold, so the legend does not say reverse fold',()=>{
  const tuck=model.steps.at(-1);
  assert.equal(tuck.id,'tuck');
  assert.deepEqual([...new Set(tuck.guides.map(g=>g.kind))],['valley']);
});
