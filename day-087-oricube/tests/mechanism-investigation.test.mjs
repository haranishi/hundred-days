import test from 'node:test';
import assert from 'node:assert/strict';
import {cupProbe,boatProbe,evidence} from './mechanism-investigation.mjs';
import {prepareMechanism,mechanismPose,mechanismPoint,buildMechanism} from '../lib/mechanism.js';
import {mechanismDimensions} from './mechanism-diagnostics.mjs';
import {trianglesPenetrate} from '../lib/mechanism-sheet.js';
import {vertexFixture,vertexAngles} from './mechanism-fixtures.mjs';
import {sub,cross,unit,dot,distance} from '../lib/math.js';
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const vector=(pose,p)=>p.map((_,i)=>dot(p,pose.r.map(v=>v[i])));
function hull(points) {
  const snapped=points.map(p=>p.map(x=>Math.round(x*1e9)/1e9));
  const ps=[...new Map(snapped.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const area=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const side=ps=>{const out=[];for(const p of ps){while(out.length>1&&area(out.at(-2),out.at(-1),p)<1e-8)out.pop();out.push(p);}return out;};
  return [...side(ps).slice(0,-1),...side(ps.slice().reverse()).slice(0,-1)];
}
test('C3a evidence: four distinct crease/stage designs reconstruct the saved topology',()=>{
  assert.equal(evidence.cup.designs.length,4);
  for(let i=0;i<4;i++) {
    const {input,trial}=cupProbe(i),core=prepareMechanism(input);
    assert.equal(core.clusters.length,trial.clusters);assert.equal(core.hinges.length,trial.hinges);assert.equal(core.loops.length,trial.loops);
    assert.equal(trial.attempts.length,4);assert.ok(trial.attempts.every(a=>Number.isFinite(a.residual)));
  }
});
test('C3a evidence: a closed 90-degree auxiliary-mesh endpoint is not treated as a valid path',()=>{
  let checked=0;
  for(let i=0;i<4;i++) {
    const {input,trial,s,pair,faces}=cupProbe(i),core=prepareMechanism(input);
    const normals=pair.map(i=>{const p=s.triangles[i].v.map(v=>s.vertices[v].p);return unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));});
    for(const attempt of trial.attempts.filter(a=>a.closed)) {
      const pose=mechanismPose(core,attempt.angles);assert.ok(pose.residual<=1e-9&&pose.closure<=1e-9);
      const ns=pair.map((face,i)=>vector(pose.poses[faces[face]],normals[i]));near(dot(ns[0],ns[1]),0);checked++;
    }
  }
  assert.ok(checked>0);
});
test('C4 evidence: closed square endpoints do not certify the moving brims',()=>{
  for(let i=0;i<4;i++) {
    const {s,input,faces}=boatProbe(i),core=prepareMechanism(input),pose=mechanismPose(core,core.goals);
    assert.ok(pose.residual<=1e-9&&pose.closure<=1e-9);
    const points=s.vertices.map((v,j)=>mechanismPoint(pose.poses[faces[s.triangles.findIndex(t=>t.v.includes(j))]],v.p));
    points.forEach(p=>near(p[1],0));
    const h=Math.SQRT2/2,body=hull(points.flatMap((p,j)=>Math.abs(s.vertices[j].uv[1]-h)<=.5+1e-8?[[p[0],p[2]]]:[]));
    assert.equal(body.length,4);body.forEach((p,j)=>near(distance(p,body[(j+1)%4]),.5));
    const outline=hull(points.map(p=>[p[0],p[2]]));
    const lengths=outline.map((p,j)=>distance(p,outline[(j+1)%outline.length]));
    if(i===0)assert.equal(outline.length,4);
    else assert.ok(outline.length!==4||Math.max(...lengths)-Math.min(...lengths)>1e-6);
    if(i===0) {
      const path=buildMechanism(input);assert.deepEqual(mechanismDimensions(path.core,path.at(.5).angles),{clusters:12,hinges:14,loops:3,rank:9,freedom:5});
      for(let k=0;k<=256;k++)assert.ok(path.at(k/256).closure<=1e-9);
      const early=path.at(1/256),p=s.vertices.map((v,j)=>mechanismPoint(early.poses[faces[s.triangles.findIndex(t=>t.v.includes(j))]],v.p));
      assert.equal(trianglesPenetrate(s.triangles[0].v.map(v=>p[v]),s.triangles[12].v.map(v=>p[v])),true);
    }
  }
});
test('continuation: a table sample coinciding with the singularity seed keeps a finite predictor',()=>{
  for(const samples of [1000,1001,2000]) {
    const path=buildMechanism(vertexFixture(),{samples});
    assert.equal(path.table.length,samples+1);
    for(const t of [.0005,.001,.0015,.314159,1]) {
      const pose=path.at(t);assert.ok(pose.angles.every(Number.isFinite));assert.ok(pose.closure<=1e-9);
      vertexAngles(t).forEach((a,i)=>near(a,pose.angles[i]));
    }
  }
});
