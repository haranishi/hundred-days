import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {assertSheet} from '../lib/ops.js';
import {paperPoint} from '../lib/sheet.js';
import {trianglesPenetrate} from '../lib/mechanism-sheet.js';
import {distance,sub,cross,norm,dot,signedArea,barycentric} from '../lib/math.js';
import {craneBaseFixture,petalInset,squareAssignments} from './mechanism-crane-fixtures.mjs';
const model=buildModel(craneBaseFixture()),info=inspectModel(model);
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const motion=i=>info.raw[i].groups[0].records[0].mechanism;
test('C2: the complete four-petal pattern precedes an unchanged C1 assignment',()=>{
  assert.equal(info.raw[0].end.vertices.length,53);assert.equal(info.raw[0].end.triangles.length,80);
  const end=info.raw[1].end,corners=['BR','TR','BL','TL'].map(k=>paperPoint(end,end.marks[k]));
  corners.forEach(p=>near(distance(p,corners[0]),0));
  for(const axis of [0,2])near(Math.max(...end.vertices.map(v=>v.p[axis]))-Math.min(...end.vertices.map(v=>v.p[axis])),.5);
});
test('C2: every compiled pose preserves edges, face areas, winding and loop closure',()=>{
  for(const step of [1,2])for(let k=0;k<=256;k++) {
    const t=k/256,{p}=info.pose(step,t),frame=model.frame(step,t,{explode:0}),pose=motion(step).path.at(t);
    assert.ok(pose.closure<=1e-9&&pose.residual<=1e-9);
    for(const [j,tri]of info.fine.triangles.entries()) {
      const ps=tri.v.map(v=>p[v]),uv=tri.v.map(v=>info.fine.vertices[v].uv);
      for(let i=0;i<3;i++)near(distance(ps[i],ps[(i+1)%3]),distance(uv[i],uv[(i+1)%3]));
      const n=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0]));near(norm(n)/2,signedArea(uv));
      near(dot(n,Array.from(frame.normals.slice(j*9,j*9+3)))/norm(n),1,1e-7);
    }
    for(const transform of pose.poses) {near(dot(transform.r[0],cross(transform.r[1],transform.r[2])),1);}
  }
});
test('C2: the entire sampled petal path is monotone and has no internal triangle crossing',()=>{
  let last=null;const m=motion(2),s=info.raw[2].start;
  for(let k=0;k<=256;k++) {
    const pose=m.path.at(k/256),{p}=info.pose(2,k/256);
    if(last)pose.angles.forEach((a,i)=>assert.ok((a-last[i])*Math.sign(m.path.core.goals[i])>=-1e-8));last=pose.angles;
    for(let i=0;i<info.fine.triangles.length;i++)for(let j=i+1;j<info.fine.triangles.length;j++) {
      const a=info.fine.triangles[i],b=info.fine.triangles[j];
      if(a.v.filter(v=>b.v.includes(v)).length>=2)continue;
      assert.equal(trianglesPenetrate(a.v.map(v=>p[v]),b.v.map(v=>p[v])),false);
    }
  }
  assertSheet(s,model.paper);assertSheet(info.raw[2].end,model.paper);
});
test('C2: bird-base dimensions derive from the square and 22.5-degree bisectors',()=>{
  const end=info.raw[2].end,point=k=>paperPoint(end,end.marks[k]),d=petalInset/2,b=(Math.SQRT2-1)/2;
  for(const k of ['R','T','L','B'])near(distance(point(k),[d,0,-d]),0);
  for(const k of ['BR','TL'])near(distance(point(k),[-b,0,b]),0);
  for(const k of ['TR','BL'])near(distance(point(k),[.5,0,-.5]),0);
  near(distance(point('BR'),point('TR')),1);
  near(distance(point('R'),point('BR')),.5);near(distance(point('R'),point('TR')),.5);
  const along=end.vertices.map(v=>(v.p[0]-v.p[2])*Math.SQRT1_2),across=end.vertices.map(v=>(v.p[0]+v.p[2])*Math.SQRT1_2);
  near(Math.max(...along)-Math.min(...along),1);near(Math.max(...across)-Math.min(...across),Math.SQRT2-1);
});
test('C2: all layers of the pinned bundle retain ranks and display positions',()=>{
  const m=motion(2),r=info.raw[2].groups[0].records[0];
  r.before.triangles.forEach((t,i)=>{if(m.faces[i]===m.path.core.pin) {
    near(r.after.triangles[i].rank,t.rank);near(distance(r.after.triangles[i].offset,t.offset),0);
  }});
  for(const explode of [0,1,24]) {
    const a=model.frame(1,1,{explode}).positions.slice(),b=model.frame(2,0,{explode}).positions;
    a.forEach((x,i)=>near(x,b[i],1e-7));
  }
});
test('C2: arbitrary frame times are closed, deterministic and produce finite guides',()=>{
  const other=buildModel(craneBaseFixture());
  for(const t of [1,.000001,.3541666666666667,.731234,.999999,0,.512345]) {
    const pose=motion(2).path.at(t);assert.ok(pose.closure<=1e-9&&pose.residual<=1e-9);
    const a=model.frame(2,t,{explode:24}).positions.slice();model.frame(2,.8);
    assert.deepEqual(a,model.frame(2,t,{explode:24}).positions);assert.deepEqual(a,other.frame(2,t,{explode:24}).positions);
  }
  for(const guide of model.steps[2].guides) {
    assert.ok(guide.line.flat().every(Number.isFinite));assert.ok(guide.arrow.points.flat().every(Number.isFinite));
  }
  assert.notEqual(model.frame(1,1).topologyKey,model.frame(2,0).topologyKey);
});
test('C2: mirrored folding and zero display gap preserve material geometry and layer order',()=>{
  for(const def of [craneBaseFixture({sign:-1}),{...craneBaseFixture(),paper:{width:1,height:1,layerGap:0}}]) {
    const m=buildModel(def),i=inspectModel(m);assertSheet(i.raw[2].end,m.paper);
    near(distance(paperPoint(i.raw[2].end,[1,0]),paperPoint(i.raw[2].end,[1,1])),1);
  }
});
test('C2: changing a cap endpoint or omitting rear auxiliary hinges refuses the recipe',()=>{
  for(const mutate of [op=>{op.hinges[2].degrees=-90;},op=>{op.hinges.splice(5,2);}]) {
    const d=craneBaseFixture();mutate(d.steps[2].ops[0]);
    assert.throws(()=>buildModel(d),e=>e instanceof FoldError&&e.step===3&&e.op===1&&e.code.startsWith('MECHANISM_'));
  }
});
test('C2: both compatible diagonal pairs and their mirror assignments reach the bird base',()=>{
  for(const index of [4,9,10,11]) {
    const def=craneBaseFixture({assignment:squareAssignments[index]}),m=buildModel(def),d=inspectModel(m),end=d.raw[2].end;
    assertSheet(end,m.paper);assert.equal(end.flat,true);
    const spans=[-1,1].map(sign=>{const a=end.vertices.map(v=>(v.p[0]+sign*v.p[2])*Math.SQRT1_2);return Math.max(...a)-Math.min(...a);}).sort((a,b)=>a-b);
    near(spans[0],Math.SQRT2-1);near(spans[1],1);
  }
});
test('C2: projected overlapping layers follow the near-end order, including locked bundles',()=>{
  const s=info.raw[2].end,m=motion(2),nearPose=info.pose(2,1-1e-4);let compared=0;
  for(let x=0;x<25;x++)for(let z=0;z<25;z++) {
    const point=[-.2+(x+.271)/36,-.5+(z+.319)/36];
    const layers=s.triangles.flatMap((tri,i)=>{
      const w=barycentric(point,...tri.v.map(v=>[s.vertices[v].p[0],s.vertices[v].p[2]]));
      return w&&w.every(v=>v>1e-6)?[{i,tri,height:w.reduce((h,w,k)=>h+w*nearPose.p[tri.v[k]][1],0)}]:[];
    });
    for(let i=0;i<layers.length;i++)for(let j=i+1;j<layers.length;j++) {
      const a=layers[i],b=layers[j],same=m.faces[a.i]===m.faces[b.i];
      const delta=same?info.raw[2].start.triangles[a.i].rank-info.raw[2].start.triangles[b.i].rank:a.height-b.height;
      if(Math.abs(delta)<1e-10)continue;
      assert.ok(delta*(a.tri.rank-b.tri.rank)>0);compared++;
    }
  }
  assert.ok(compared>100);
});
