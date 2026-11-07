import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {kimono} from '../lib/models/kimono.js';
import {modelDef,MODELS} from '../lib/models/index.js';
import {outline,symmetryError,topFace} from './flat-geometry.mjs';
import {signedArea,overlapArea,AREA_EPS,cross2,sub} from '../lib/math.js';
import {projection} from '../lib/stack.js';
const model=buildModel(kimono);
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function criteria(m) {
  const s=inspectModel(m).raw.at(-1).end,poly=outline(s);
  assert.ok(s.flat);assert.ok(s.vertices.every(v=>Math.abs(v.p[1])<1e-9));
  assert.equal(poly.length,4);assert.ok(symmetryError(poly)<1e-6);
  near(Math.max(...poly.map(p=>p[0]))-Math.min(...poly.map(p=>p[0])),.46);
  near(Math.max(...poly.map(p=>p[1]))-Math.min(...poly.map(p=>p[1])),.8);
  near(signedArea(poly),.368);
  const width=Math.max(...poly.map(p=>p[0]))-Math.min(...poly.map(p=>p[0]));
  const height=Math.max(...poly.map(p=>p[1]))-Math.min(...poly.map(p=>p[1]));
  assert.ok(width/height>=.55,'body is wide enough');
  const collars=['collarL','collarR'].map(tag=>s.triangles.filter(t=>t.tags.includes(tag)));
  // Derive the two slanted collar boundaries from material triangles, then intersect them.
  const lines=collars.map(ts=>{
    assert.ok(ts.length>0,'both collars exist');
    const p=outline({...s,triangles:ts});assert.equal(p.length,3);
    return p.map((a,i)=>[a,p[(i+1)%p.length]]).find(([a,b])=>Math.abs(a[0]-b[0])>1e-7&&Math.abs(a[1]-b[1])>1e-7);
  });
  const [[a,b],[c,d]]=lines,u=sub(b,a),v=sub(d,c),t=cross2(sub(c,a),v)/cross2(u,v);
  const tip=a.map((x,i)=>x+t*u[i]);near(tip[0],0);near(tip[1],-.27);
  const collarPoints=collars.flat().flatMap(t=>projection(s,t));
  const collarHeight=Math.max(...collarPoints.map(p=>p[1]))-Math.min(...collarPoints.map(p=>p[1]));
  near(collarHeight,.27);assert.ok(collarHeight/height<=.4,'collar stays in the upper 40%');
  const depth=tip[1]-Math.min(...poly.map(p=>p[1]));
  near(depth,.23);assert.ok(depth/height>=.2,'V opening has enough depth');
  let area=0;
  for(const left of collars[0]) for(const right of collars[1]) {
    const overlap=overlapArea(projection(s,left),projection(s,right));area+=overlap;
    if(overlap>AREA_EPS) assert.ok(left.rank<right.rank,'left collar below right');
  }
  near(area,.0016);
  for(const [p,tag] of [[[0,-.28],null],[[-.15,-.3],'collarL'],[[.15,-.3],'collarR'],[[0,-.26],'collarR']]) {
    const face=topFace(s,p);assert.ok(face);
    if(tag) assert.ok(face.tags.includes(tag),`${tag} is visible`);
    else assert.ok(!face.tags.some(t=>t.startsWith('collar')),'V opening exposes the base');
    assert.ok(signedArea(projection(s,face))<0,'ivory front of collar faces upward');
  }
  assert.ok(signedArea(projection(s,topFace(s,[0,0])))>0,'indigo body faces upward');
  const hem=topFace(s,[0,.25]);assert.ok(hem.tags.includes('hem'));
  assert.ok(signedArea(projection(s,hem))>0,'indigo back of the base is exposed by the hem');
}
test('kimono: flat symmetric union, visible centred V, right-front overlap and hem',()=>criteria(model));
test('kimono: free-corner folds move only their own gate and preserve the opposite collar',()=>{
  const raw=inspectModel(model).raw;
  for(const [i,tag] of [[3,'left'],[4,'right']]) {
    const r=raw[i].groups[0].records[0];
    assert.ok(r.moving.size>0);
    for(const j of r.moving) assert.ok(r.before.triangles[j].tags.includes(tag));
  }
});
test('kimono: registry, named contrasting colours and six steps without squash folds',()=>{
  assert.equal(modelDef('kimono'),kimono);assert.equal(kimono.steps.length,6);
  assert.equal(kimono.paper.front,'#f5efe2');assert.equal(kimono.paper.back,'#2d4a7e');
  assert.equal(kimono.paper.frontName,'生成りの面');assert.equal(kimono.paper.backName,'藍色の面');
  assert.equal(kimono.steps[0].view,'flat');
  assert.ok(kimono.steps[0].text.includes('生成りの面'));
  assert.ok(kimono.steps[3].text.includes('白い襟'));
  // WCAG relative luminance also checks the vermilion guide on ivory paper.
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
    .reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
  assert.ok((luminance(kimono.paper.front)+.05)/(luminance('#d6452d')+.05)>=3);
  for(const side of ['front','back']) {
    assert.ok(kimono.paper[`${side}Name`]);assert.notEqual(kimono.paper[side],'#d6452d');
    for(const d of MODELS.filter(d=>d!==kimono)) for(const key of ['front','back']) assert.notEqual(kimono.paper[side],d.paper[key]);
  }
  assert.ok(kimono.steps.every(s=>s.ops.every(o=>['crease','fold'].includes(o.type))));
});
for(const [name,change] of [
  ['left-front stacking',d=>[d.steps[3],d.steps[4]]=[d.steps[4],d.steps[3]]],
  ['missing collar',d=>d.steps.splice(4,1)],
  ['missing hem',d=>d.steps.splice(5,1)],
  ['attached outer corner',d=>{d.steps[3].ops[0].line={point:[0,-.2],dir:[1,-1]};d.steps[3].ops[0].moving=[-.2,-.5];}],
]) test(`kimono: rejects ${name}`,()=>{
  const def=structuredClone(kimono);change(def);
  let m;try {m=buildModel(def);} catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>criteria(m),assert.AssertionError);
});
