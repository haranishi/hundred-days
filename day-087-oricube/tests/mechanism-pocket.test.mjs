import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {assertSheet} from '../lib/ops.js';
import {paperPoint,locate} from '../lib/sheet.js';
import {trianglesPenetrate} from '../lib/mechanism-sheet.js';
import {distance,sub,cross,norm,dot,signedArea} from '../lib/math.js';
import {hatPocketFixture,cupFlatFixture} from './mechanism-pocket-fixtures.mjs';
import {mechanismDimensions} from './mechanism-diagnostics.mjs';
const model=buildModel(hatPocketFixture()),info=inspectModel(model),record=info.raw[6].groups[0].records[0],motion=record.mechanism;
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const normal=(p,tri)=>{const q=tri.v.map(v=>p[v]);return cross(sub(q[1],q[0]),sub(q[2],q[0])).map(x=>x/norm(cross(sub(q[1],q[0]),sub(q[2],q[0]))));};
test('C3b: ordinary hat folds lead to a four-bundle six-hinge opening mechanism',()=>{
  assert.equal(info.raw[5].end.flat,true);assert.equal(info.raw[6].end.flat,false);
  assert.deepEqual(mechanismDimensions(motion.path.core,motion.path.at(.5).angles),{clusters:4,hinges:6,loops:3,rank:3,freedom:3});
});
test('C3b: all 257 poses preserve rigid faces, closure, winding and monotone angles',()=>{
  let last=null;
  for(let k=0;k<=256;k++) {
    const t=k/256,pose=motion.path.at(t),{p}=info.pose(6,t),frame=model.frame(6,t,{explode:0});
    assert.ok(pose.closure<=1e-9&&pose.residual<=1e-9);
    if(last)pose.angles.forEach((a,i)=>assert.ok((a-last[i])*Math.sign(motion.path.core.goals[i])>=-1e-8));last=pose.angles;
    for(const [j,tri]of info.fine.triangles.entries()) {
      const q=tri.v.map(v=>p[v]),uv=tri.v.map(v=>info.fine.vertices[v].uv),n=cross(sub(q[1],q[0]),sub(q[2],q[0]));
      for(let i=0;i<3;i++)near(distance(q[i],q[(i+1)%3]),distance(uv[i],uv[(i+1)%3]));
      near(norm(n)/2,signedArea(uv));near(dot(n,Array.from(frame.normals.slice(j*9,j*9+3)))/norm(n),1,1e-7);
    }
    for(let i=0;i<info.fine.triangles.length;i++)for(let j=i+1;j<info.fine.triangles.length;j++) {
      const a=info.fine.triangles[i],b=info.fine.triangles[j];
      if(a.v.filter(v=>b.v.includes(v)).length>=2)continue;
      assert.equal(trianglesPenetrate(a.v.map(v=>p[v]),b.v.map(v=>p[v])),false);
    }
  }
});
test('C3b: both corresponding front/back face pairs open monotonically to 90 degrees',()=>{
  // These are the material faces on either side of each folded side seam.
  const s=record.before;let previous=[0,0];
  for(let k=0;k<=256;k++) {
    const t=k/256,pose=motion.path.at(t),p=s.vertices.map((v,i)=>{
      const transform=pose.poses[motion.vertices[i]];
      return transform.o.map((x,j)=>x+dot(v.p,transform.r.map(r=>r[j])));
    });
    [[5,9],[4,14]].forEach(([a,b],i)=>{
      const cos=-dot(normal(p,s.triangles[a]),normal(p,s.triangles[b])),angle=Math.acos(Math.max(-1,Math.min(1,cos)));
      assert.ok(angle>=previous[i]-1e-7);previous[i]=angle;near(angle,t*Math.PI/2,5e-8);
    });
  }
});
test('C3b: the mouth is square with area one half and depth one half',()=>{
  const s=info.raw[6].end,h=Math.SQRT2/2;
  const q=[[1,h-.5],[0,h-.5],[0,h+.5],[1,h+.5]].map(uv=>paperPoint(s,uv));
  q.forEach((p,i)=>{near(p[2],.5);near(distance(p,q[(i+1)%4]),Math.SQRT1_2);});
  near(Math.abs(signedArea(q.map(p=>[p[0],p[1]]))),.5);
  near(distance(paperPoint(s,s.marks.C),q.reduce((p,v)=>p.map((x,i)=>x+v[i]/4),[0,0,0])),.5);
});
test('C3b: locked brims remain outside their walls and pinned offsets stay fixed',()=>{
  for(let k=0;k<=32;k++) {
    const pose=info.pose(6,k/32),p=pose.p;
    for(const [brim,wall]of [[0,4],[7,9]]) {
      near(dot(normal(p,info.fine.triangles[brim]),normal(p,info.fine.triangles[wall])),-1);
      assert.ok(dot(sub(pose.offsets[brim],pose.offsets[wall]),normal(p,info.fine.triangles[wall]))<0);
    }
  }
  record.before.triangles.forEach((t,i)=>{if(motion.faces[i]===motion.path.core.pin) {
    near(distance(t.offset,record.after.triangles[i].offset),0);near(t.rank,record.after.triangles[i].rank);
  }});
});
test('C3b: boundary frames, guides, topology and arbitrary evaluation are deterministic',()=>{
  const other=buildModel(hatPocketFixture());
  for(const explode of [0,1,24]) {
    const a=model.frame(5,1,{explode}).positions.slice(),b=model.frame(6,0,{explode}).positions;
    a.forEach((x,i)=>near(x,b[i],1e-7));
  }
  for(const t of [1,.000001,.731234,0,.999999,.41231]) {
    const a=model.frame(6,t,{explode:24}).positions.slice();model.frame(6,.8);
    assert.deepEqual(a,model.frame(6,t,{explode:24}).positions);assert.deepEqual(a,other.frame(6,t,{explode:24}).positions);
    const p=motion.path.at(t);assert.ok(p.residual<=1e-9&&p.closure<=1e-9);
  }
  assert.equal(model.steps[6].guides.length,6);assert.notEqual(model.frame(5,1).topologyKey,model.frame(6,0).topologyKey);
  for(const g of model.steps[6].guides)assert.ok(g.line.flat().concat(g.arrow.points.flat()).every(Number.isFinite));
});
test('C3b: a single angle across a reversed brim axis is refused instead of silently dropping a constraint',()=>{
  const def=hatPocketFixture(),op=def.steps[6].ops[0];
  op.hinges=[{line:{through:['C','B']},degrees:90},{line:{through:['C','T']},degrees:90},...op.hinges.slice(4)];
  assert.throws(()=>buildModel(def),e=>e instanceof FoldError&&e.step===7&&e.op===1&&e.code.startsWith('MECHANISM_'));
});
test('C3a: the cup preparation is flat and preserves material; opening is not claimed',()=>{
  const m=buildModel(cupFlatFixture()),d=inspectModel(m);
  assert.equal(d.raw.at(-1).end.flat,true);assert.equal(d.raw.at(-1).end.triangles.length,28);
  for(const r of d.raw)for(const s of [r.start,r.end])assertSheet(s,m.paper);
  const tucked=locate(d.raw.at(-1).end,[.05,.05]).tri;assert.ok(tucked.rank>1&&tucked.rank<2);
});
