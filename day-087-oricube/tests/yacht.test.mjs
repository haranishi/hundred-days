import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {yacht} from '../lib/models/yacht.js';
import {outline,concave,symmetryError,topFace,verifyFlatMotion} from './flat-geometry.mjs';
import {signedArea} from '../lib/math.js';
import {projection} from '../lib/stack.js';
const model=buildModel(yacht),a=Math.SQRT1_2;
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function criteria(m) {
  const s=inspectModel(m).raw.at(-1).end,p=outline(s);
  assert.ok(s.flat&&s.vertices.every(v=>Math.abs(v.p[1])<1e-9));
  assert.equal(p.length,7);assert.equal(concave(p).length,2);
  assert.ok(symmetryError(p)<1e-6);
  near(Math.max(...p.map(p=>p[0]))-Math.min(...p.map(p=>p[0])),2*a);
  near(Math.max(...p.map(p=>p[1]))-Math.min(...p.map(p=>p[1])),3*a/4);
  near(signedArea(p),11/32);
  const top=p.filter(q=>Math.abs(q[1]+a)<1e-7);
  assert.equal(top.length,1);near(top[0][0],0);
  const hull=outline({...s,triangles:s.triangles.filter(t=>t.tags.includes('hull'))});
  assert.equal(hull.length,4);assert.ok(symmetryError(hull)<1e-6);
  for(const [z,width] of [[-a/2,2*a],[-a/4,1.5*a]]) {
    const edge=hull.filter(q=>Math.abs(q[1]-z)<1e-7);assert.equal(edge.length,2);
    near(Math.abs(edge[0][0]-edge[1][0]),width);
  }
  const sail=topFace(s,[0,-.55]);assert.ok(sail&&!sail.tags.includes('hull'));
  assert.ok(signedArea(projection(s,sail))<0,'silver-white front sail is visible');
  for(const q of [[0,-.25],[-.55,-.3],[.55,-.3]]) {
    const t=topFace(s,q);assert.ok(t?.tags.includes('hull'));
    assert.ok(signedArea(projection(s,t))>0,'charcoal back hull is visible');
  }
}
test('yacht: one white triangular sail above a symmetric charcoal trapezoid',()=>criteria(model));
test('yacht: every operation preserves edges, area, orientation, layers and continuity',()=>verifyFlatMotion(model));
test('yacht: named colours contrast with guides and the desk; five beginner steps',()=>{
  assert.equal(yacht.id,'yacht');assert.equal(yacht.name,'ヨット');assert.equal(yacht.reading,'よっと');
  assert.equal(yacht.level,1);assert.equal(yacht.minutes,3);assert.equal(yacht.steps.length,5);
  assert.equal(yacht.paper.width,1);assert.equal(yacht.paper.height,1);assert.equal(yacht.steps[0].view,'flat');
  const lum=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
  const ratio=(x,y)=>(Math.max(lum(x),lum(y))+.05)/(Math.min(lum(x),lum(y))+.05);
  for(const side of ['front','back']) {
    assert.ok(yacht.paper[`${side}Name`]);assert.ok(ratio(yacht.paper[side],'#d6452d')>=1.2);
    assert.ok(ratio(yacht.paper[side],'#f3eadb')>=1.45);
  }
  assert.ok(ratio(yacht.paper.front,yacht.paper.back)>7);
  assert.ok(yacht.steps.every(s=>s.ops.every(o=>['fold','crease','turn'].includes(o.type))));
  assert.deepEqual(model.finalFrame().positions,buildModel(yacht).finalFrame().positions);
});
for(const [name,change] of [
  ['missing colour preparation',d=>d.steps.splice(1,1)],
  ['missing hull',d=>d.steps.pop()],
  ['asymmetric hull',d=>d.steps.at(-1).ops[0].line.dir=[1,.1]],
]) test(`yacht: rejects ${name}`,()=>{
  const d=structuredClone(yacht);change(d);let m;
  try {m=buildModel(d);} catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>criteria(m),assert.AssertionError);
});
