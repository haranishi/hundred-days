import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {tree} from '../lib/models/tree.js';
import {outline,concave,symmetryError,topFace,verifyFlatMotion} from './flat-geometry.mjs';
import {signedArea} from '../lib/math.js';
import {projection} from '../lib/stack.js';
const model=buildModel(tree),a=Math.SQRT1_2,b=1-a;
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function criteria(m) {
  const s=inspectModel(m).raw.at(-1).end,p=outline(s),n=concave(p);
  assert.ok(s.flat&&s.vertices.every(v=>Math.abs(v.p[1])<1e-9));
  assert.equal(p.length,13);assert.ok(symmetryError(p)<1e-6);
  near(Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0])),2*(Math.SQRT2-1));
  near(Math.max(...p.map(q=>q[1]))-Math.min(...p.map(q=>q[1])),a+.34);
  near(signedArea(p),.48545249685703085);
  const leaf=n;
  assert.equal(n.length,4);
  for(const sign of [-1,1]) {
    const side=leaf.filter(q=>q[0]*sign>0).sort((p,q)=>p[1]-q[1]);
    assert.equal(side.length,2);near(side[0][1],-.35);near(side[1][1],-.1);
    const branch=p.filter(q=>q[0]*sign>1e-6&&!n.includes(q)&&q[1]<b+1e-6);
    assert.equal(branch.length,3,'three outer branch tips on each side');
  }
  const bottom=p.filter(q=>Math.abs(q[1]-.5)<1e-7);
  assert.equal(bottom.length,2);near(bottom[0][0]+bottom[1][0],0);
  for(const q of [[0,-.5],[0,-.2],[0,.1],[.3,.2]]) {
    const t=topFace(s,q);assert.ok(t);
    assert.ok(signedArea(projection(s,t))>0,'green back is visible on the leafy crown');
  }
  const trunk=topFace(s,[0,.4]);assert.ok(trunk);
  assert.ok(signedArea(projection(s,trunk))<0,'brown front is visible on the lowest trunk');
}
test('tree: three symmetric leaf tiers, exactly four concave corners and a brown trunk',()=>criteria(model));
test('tree: every operation preserves edges, area, orientation, layers and continuity',()=>verifyFlatMotion(model));
test('tree: named green/brown colours contrast with the guide and desk; six beginner steps',()=>{
  assert.equal(tree.id,'tree');assert.equal(tree.name,'もみの木');assert.equal(tree.reading,'もみのき');
  assert.equal(tree.level,1);assert.equal(tree.minutes,3);assert.equal(tree.steps.length,6);
  assert.equal(tree.paper.width,1);assert.equal(tree.paper.height,1);assert.equal(tree.steps[0].view,'flat');
  const lum=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
  const ratio=(x,y)=>(Math.max(lum(x),lum(y))+.05)/(Math.min(lum(x),lum(y))+.05);
  for(const side of ['front','back']) {
    assert.ok(tree.paper[`${side}Name`]);assert.ok(ratio(tree.paper[side],'#d6452d')>=1.2);
    assert.ok(ratio(tree.paper[side],'#f3eadb')>=8);
  }
  assert.ok(ratio(tree.paper.front,tree.paper.back)>=1.45);
  assert.ok(tree.steps.every(s=>s.ops.every(o=>['fold','crease','turn'].includes(o.type))));
  assert.deepEqual(model.finalFrame().positions,buildModel(tree).finalFrame().positions);
});
for(const [name,change] of [
  ['missing upper tier',d=>d.steps.pop()],
  ['missing lower tier',d=>d.steps.splice(4,1)],
  ['missing trunk',d=>d.steps.splice(3,1)],
  ['asymmetric trunk',d=>d.steps[3].ops[0].line.dir=[1,.1]],
  ['asymmetric crown',d=>d.steps[1].ops[0].line.dir[0]*=.9],
]) test(`tree: rejects ${name}`,()=>{
  const d=structuredClone(tree);change(d);let m;
  try {m=buildModel(d);} catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>criteria(m),assert.AssertionError);
});
