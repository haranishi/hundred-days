import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMechanism,prepareMechanism,mechanismPose,mechanismPoint,projectMechanism} from '../lib/mechanism.js';
import {distance,sub,cross,norm,dot,rotate} from '../lib/math.js';
import {FoldError} from '../lib/error.js';
import {vertexFixture,vertexAngles} from './mechanism-fixtures.mjs';
const input=vertexFixture(),path=buildMechanism(input);
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
function checkPose(p,core) {
  assert.ok(p.closure<=1e-9);assert.ok(p.residual<=1e-9);
  core.clusters.forEach((c,i)=>{
    for(let j=0;j<c.points.length;j++) for(let k=0;k<j;k++)
      close(distance(c.points[j],c.points[k]),distance(p.points[i][j],p.points[i][k]));
    const before=c.points,after=p.points[i];
    close(norm(cross(sub(before[1],before[0]),sub(before[2],before[0]))),
      norm(cross(sub(after[1],after[0]),sub(after[2],after[0]))));
    const r=p.poses[i].r;close(dot(cross(r[0],r[1]),r[2]),1);
    r.forEach((a,j)=>r.forEach((b,k)=>close(dot(a,b),j===k?1:0)));
    assert.deepEqual(after,c.points.map(q=>mechanismPoint(p.poses[i],q)));
  });
  p.points[core.pin].forEach((p,i)=>close(distance(p,core.clusters[core.pin].points[i]),0,1e-15));
}
test('mechanism: 257 solved angles match the degree-four half-angle theorem to 1e-9',()=>{
  assert.equal(path.table.length,257);
  for(let k=0;k<=256;k++) path.at(k/256).angles.forEach((a,i)=>close(a,vertexAngles(k/256)[i]));
});
test('mechanism: every sampled face stays rigid, properly oriented and closed',()=>{
  for(let k=0;k<=256;k++) checkPose(path.at(k/256),path.core);
});
test('mechanism: arbitrary shuffled progress is re-solved, including both singular ends',()=>{
  const progress=[1,.731234,.00013,.99997,.1,0,.371,.0047,.5];
  for(const t of progress) {
    const p=path.at(t);checkPose(p,path.core);p.angles.forEach((a,i)=>close(a,vertexAngles(t)[i]));
    assert.deepEqual(path.at(t),p);
  }
});
test('mechanism: builds are numerically identical and do not mutate the input',()=>{
  const copy=structuredClone(input),other=buildMechanism(input);
  assert.deepEqual(input,copy);assert.deepEqual(other.table,path.table);
  for(const t of [.0001,.14159,.92345,1]) assert.deepEqual(other.at(t),path.at(t));
});
test('mechanism: motion is monotone on the selected branch and reaches exact declared angles',()=>{
  for(let k=1;k<path.table.length;k++) path.table[k].forEach((a,i)=>{
    assert.ok((a-path.table[k-1][i])*Math.sign(path.core.goals[i])>=-1e-10);
  });
  assert.deepEqual(path.at(1).angles,path.core.goals);assert.deepEqual(path.at(0).angles,[0,0,0,0]);
});
test('mechanism: rigid translations, rotations and a different pin preserve loop closure',()=>{
  const v=vertexFixture(),move=p=>rotate(p,[0,0,0],[0,0,1],.71).map((x,i)=>x+[3,2,-1][i]);
  v.clusters.forEach(c=>{c.points=c.points.map(move);});v.hinges.forEach(h=>{h.edge=h.edge.map(move);});v.pin=2;
  const m=buildMechanism(v);
  for(let k=0;k<=256;k++) checkPose(m.at(k/256),m.core);
});
test('mechanism: reversing directed edges and swapping clusters preserves the same path',()=>{
  const v=vertexFixture();v.hinges.forEach(h=>{[h.a,h.b]=[h.b,h.a];h.degrees=-h.degrees;});
  const m=buildMechanism(v);
  for(const t of [.1,.45,.9,1]) {
    const a=path.at(t),b=m.at(t);a.points.forEach((c,i)=>c.forEach((p,j)=>close(distance(p,b.points[i][j]),0)));
  }
});
test('mechanism: non-tree angle must agree even when its endpoints already coincide',()=>{
  const core=prepareMechanism(input),angles=vertexAngles(.4),loop=core.loops[0];angles[loop]+=.1;
  const p=mechanismPose(core,angles);assert.ok(p.residual>.01);
});
test('mechanism mutation: impossible flat endpoint reports residual and progress',()=>{
  const v=vertexFixture();v.hinges[0].degrees=90;
  assert.throws(()=>buildMechanism(v),e=>e instanceof FoldError&&e.code==='MECHANISM_INFEASIBLE'&&e.t===1&&e.residual>.1);
});
test('mechanism mutation: a wrong mountain/valley branch is refused',()=>{
  const v=vertexFixture();v.hinges[1].degrees=180;
  assert.throws(()=>buildMechanism(v),e=>e instanceof FoldError&&['MECHANISM_BRANCH','MECHANISM_NO_CONVERGENCE'].includes(e.code));
});
test('mechanism: invalid graphs and numerical inputs fail explicitly',()=>{
  const mutations=[v=>{v.pin=4;},v=>{v.driver=9;},v=>{v.hinges[0].degrees=NaN;},v=>{v.hinges[0].edge[1]=[0,0,0];},
    v=>{v.clusters[1].points[1]=[NaN,0,0];},v=>{v.hinges.length=1;},v=>{v.hinges[0].b=v.hinges[0].a;},
    v=>{v.hinges[0].edge[1]=[99,0,0];},v=>{v.clusters[0].points=[[0,0,0],[1,0,0],[2,0,0]];},
    v=>{v.clusters[0]=null;},v=>{v.hinges[0]=null;}];
  for(const mutate of mutations) {
    const v=vertexFixture();mutate(v);assert.throws(()=>prepareMechanism(v),e=>e instanceof FoldError&&e.code==='INVALID_MECHANISM');
  }
  assert.throws(()=>buildMechanism(input,{samples:199}),FoldError);
  for(const t of [NaN,-1,1.1]) assert.throws(()=>path.at(t),RangeError);
  for(const angles of [[],[NaN,0,0,0]]) assert.throws(()=>mechanismPose(path.core,angles),FoldError);
});
test('mechanism: default target projection follows the analytic branch without choosing one driver',()=>{
  const input=vertexFixture();delete input.driver;const path=buildMechanism(input),core=path.core;
  assert.equal(core.driver,'projection');
  for(let k=0;k<=256;k++) {
    const t=k/256,p=path.at(t);checkPose(p,core);
    close(dot(p.angles,core.goals)/dot(core.goals,core.goals),t);
    p.angles.forEach((a,i)=>close(a,vertexAngles(p.angles[0]/Math.PI)[i]));
  }
});
test('mechanism: a branched tree follows target rotations and freezes zero-goal hinges',()=>{
  const v=vertexFixture();v.hinges.pop();v.hinges[1].degrees=0;
  const m=buildMechanism(v);assert.equal(m.core.loops.length,0);
  for(const t of [0,.25,.6,1])m.at(t).angles.forEach((a,i)=>close(a,t*m.core.goals[i]));
});
test('mechanism: standalone projection reports closure and rejects malformed seeds',()=>{
  const p=projectMechanism(path.core,.4,vertexAngles(.41));checkPose(p,path.core);
  p.angles.forEach((a,i)=>close(a,vertexAngles(.4)[i]));
  assert.throws(()=>projectMechanism(path.core,NaN),RangeError);
  assert.throws(()=>projectMechanism(path.core,.5,[]),FoldError);
});
