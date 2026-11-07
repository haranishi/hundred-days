import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import tie,{tie as namedTie} from '../lib/models/tie.js';
import {MODELS} from '../lib/models/index.js';
import {outline,concave,symmetryError,topFace,verifyFlatMotion} from './flat-geometry.mjs';
import {signedArea} from '../lib/math.js';
import {projection} from '../lib/stack.js';
const model=buildModel(tie);
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function criteria(m) {
  const s=inspectModel(m).raw.at(-1).end,p=outline(s),notches=concave(p);
  assert.ok(s.flat&&s.vertices.every(v=>Math.abs(v.p[1])<1e-9));
  assert.ok(symmetryError(p)<1e-6,'mirror symmetry of the triangle union');
  const top=Math.min(...p.map(q=>q[1])),bottom=Math.max(...p.map(q=>q[1]));
  const width=Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0])),height=bottom-top;
  assert.ok(height/width>=1.6,'long blade');
  const upper=p.filter(q=>Math.abs(q[1]-top)<1e-7);
  const topWidth=Math.max(...upper.map(q=>q[0]))-Math.min(...upper.map(q=>q[0]));
  assert.ok(topWidth>0,'flat top of the knot');
  assert.ok(topWidth/width<=.45,'small knot at the top');
  // Slice the union at every vertex height; widths are linear between them.
  const widths=[...new Set(p.map(q=>q[1]))].map(z=>{
    const xs=[];
    p.forEach((a,i)=>{
      const b=p[(i+1)%p.length];
      if(Math.abs(a[1]-z)<1e-8) xs.push(a[0]);
      if((a[1]<z&&b[1]>z)||(a[1]>z&&b[1]<z)) xs.push(a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]));
    });
    return {z,width:Math.max(...xs)-Math.min(...xs)};
  });
  near(Math.max(...widths.map(q=>q.width)),width);
  for(const q of widths.filter(q=>Math.abs(q.width-width)<1e-7)) {
    const fraction=(q.z-top)/height;
    assert.ok(fraction>=.35&&fraction<=.65,'widest part in the middle of the tie');
  }
  const tips=p.filter(q=>Math.abs(q[1]-bottom)<1e-7);
  assert.equal(tips.length,1,'one lower tip');near(tips[0][0],0);
  for(const sign of [-1,1]) {
    const n=notches.filter(q=>q[0]*sign>1e-7);
    assert.ok(n.length>=1,'a waist under each side of the knot');
    assert.ok(n.every(q=>q[1]>top&&q[1]<widths.find(q=>Math.abs(q.width-width)<1e-7).z));
  }
  assert.equal(p.length,9);assert.equal(notches.length,2);
  near(width,.585786437626905);near(height,1.1071067811865474);
  near(topWidth,.1301515190165004);
  for(const [point,front] of [[[.013,-.37],true],[[-.013,-.37],true],[[.013,-.15],false],[[.1,.1],false],[[-.1,.1],false],[[.013,.4],false]]) {
    const face=topFace(s,point);assert.ok(face);
    assert.equal(signedArea(projection(s,face))<0,front,'ivory knot cap and charcoal blade');
  }
}
test('tie: symmetric flat union, small knot, two waist corners and one long blade',()=>criteria(model));
test('tie: every operation preserves edges, area, orientation, layers and continuity',()=>verifyFlatMotion(model));
test('tie: beginner metadata, square paper, six steps and named contrasting colours',()=>{
  assert.equal(tie,namedTie);assert.equal(tie.id,'tie');assert.equal(tie.name,'ネクタイ');
  assert.equal(tie.reading,'ねくたい');assert.equal(tie.level,1);assert.equal(tie.minutes,3);
  assert.equal(tie.paper.width,1);assert.equal(tie.paper.height,1);
  assert.equal(tie.steps.length,6);assert.equal(tie.steps[0].view,'flat');
  assert.ok(tie.steps.every(s=>s.title&&s.text&&s.ops.every(o=>['fold','crease','turn'].includes(o.type))));
  const lum=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
  const ratio=(x,y)=>(Math.max(lum(x),lum(y))+.05)/(Math.min(lum(x),lum(y))+.05);
  for(const side of ['front','back']) {
    assert.ok(tie.paper[`${side}Name`]);assert.ok(ratio(tie.paper[side],'#d6452d')>=2.5);
    for(const other of MODELS.filter(m=>m.id!==tie.id)) for(const key of ['front','back']) assert.notEqual(tie.paper[side],other.paper[key]);
  }
  assert.ok(ratio(tie.paper.front,tie.paper.back)>=10,'two paper faces are clearly distinct');
  assert.ok(ratio(tie.paper.back,'#f3eadb')>=9,'dark blade contrasts with the desk');
  assert.ok(ratio(tie.paper.front,'#f3eadb')>=1.03,'ivory also uses the existing outline stroke');
  assert.deepEqual(model.finalFrame().positions,buildModel(tie).finalFrame().positions);
});
for(const [name,change] of [
  ['missing knot return',d=>d.steps.pop()],
  ['missing upper taper',d=>d.steps.splice(2,1)],
  ['missing lower taper',d=>d.steps.splice(3,1)],
  ['asymmetric blade',d=>d.steps[3].ops[0].line.dir[0]*=.9],
  ['missing ivory cap',d=>d.steps.splice(1,1)],
  ['hidden ivory cap',d=>d.steps[1].ops[0].mode='valley'],
]) test(`tie: rejects ${name}`,()=>{
  const d=structuredClone(tie);change(d);let m;
  try {m=buildModel(d);} catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>criteria(m),assert.AssertionError);
});
