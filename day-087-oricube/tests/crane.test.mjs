import test from 'node:test';
import assert from 'node:assert/strict';
import craneDefault,{crane} from '../lib/models/crane.js';
import {buildModel,inspectModel} from '../lib/model.js';
import {assertSheet} from '../lib/ops.js';
import {paperPoint} from '../lib/sheet.js';
import {sheetMechanismPose,trianglesPenetrate} from '../lib/mechanism-sheet.js';
import {distance,sub,mul,dot,cross,norm,unit,signedArea,barycentric,overlapArea} from '../lib/math.js';
import {craneBaseFixture,squareAssignments} from './mechanism-crane-fixtures.mjs';

const model=buildModel(crane),info=inspectModel(model),final=info.raw.at(-1).end;
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const vecNear=(a,b,eps=1e-8)=>assert.ok(distance(a,b)<=eps,`${a} != ${b}`);
const normal=ps=>unit(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])));
const q=[Math.SQRT1_2,0,-Math.SQRT1_2],r=[Math.SQRT1_2,0,Math.SQRT1_2];
const point=(s,key)=>paperPoint(s,s.marks[key]);
const project=(s,t)=>t.v.map(v=>[s.vertices[v].p[0],s.vertices[v].p[2]]);
const layersAt=(s,q,r)=>{
  const p=[(q+r)*Math.SQRT1_2,(r-q)*Math.SQRT1_2];
  return s.triangles.filter(t=>barycentric(p,...project(s,t))?.every(w=>w>1e-7));
};
function geometry(step,t) {
  const {fine,pose}=info,{p}=pose(step,t),frame=model.frame(step,t,{explode:0});let area=0;
  for(const [j,tri]of fine.triangles.entries()) {
    const uv=tri.v.map(v=>fine.vertices[v].uv),ps=tri.v.map(v=>p[v]);
    const materialArea=signedArea(uv);assert.ok(materialArea>0,'material winding');
    const worldArea=norm(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])))/2;
    near(worldArea,materialArea);area+=worldArea;
    for(let k=0;k<3;k++)near(distance(ps[k],ps[(k+1)%3]),distance(uv[k],uv[(k+1)%3]));
    near(dot(normal(ps),Array.from(frame.normals.slice(j*9,j*9+3))),1,1e-7);
  }
  near(area,1);
}
function finalCriteria(s) {
  // The sagittal plane contains the vertical direction and the old transverse r axis.
  for(const v of s.vertices) {
    const mirror=sub(v.p,mul(q,2*dot(v.p,q)));
    vecNear(mirror,paperPoint(s,[v.uv[1],v.uv[0]]),1e-6);
  }
  const body=s.triangles.filter(t=>!t.tags.some(tag=>['neck','tail','flapFront','flapRear'].includes(tag)));
  assert.ok(body.length);
  const bodyTop=Math.max(...body.flatMap(t=>t.v.map(v=>s.vertices[v].p[1])));
  const head=point(s,'TR'),tail=point(s,'BL');
  const jointUV=1-.1*Math.SQRT1_2,joint=paperPoint(s,[jointUV,jointUV]);
  assert.ok(joint[1]>bodyTop+.08,'neck joint above the body');
  assert.ok(head[1]>bodyTop+.08,'beak remains above the body');
  near(head[1],joint[1]);near(dot(sub(head,joint),r),.1);
  assert.ok(dot(head,r)>dot(joint,r),'head points farther forward');
  near(joint[1],(21/29)*.4-(Math.SQRT2-1)/2);
  near(tail[1],(21/29)*.5-(Math.SQRT2-1)/2);
  assert.ok(tail[1]>bodyTop+.15,'tail rises above the body');
  for(const tag of ['flapFront','flapRear']) {
    const wing=s.triangles.filter(t=>t.tags.includes(tag));assert.ok(wing.length);
    for(const t of wing)assert.ok(Math.abs(normal(t.v.map(v=>s.vertices[v].p))[1])>=.9);
  }
  near(dot(point(s,'BR'),q),1-Math.SQRT1_2);
  near(dot(point(s,'TL'),q),-(1-Math.SQRT1_2));
  near(point(s,'BR')[1],0);near(point(s,'TL')[1],0);
}

test('crane: standalone metadata, contrasting named paper and ten authored steps',()=>{
  assert.equal(craneDefault,crane);
  assert.deepEqual([crane.id,crane.name,crane.reading,crane.level,crane.minutes],['crane','鶴','つる',3,10]);
  assert.deepEqual([crane.paper.width,crane.paper.height],[1,1]);
  assert.deepEqual([crane.paper.front,crane.paper.back],['#faf9f3','#3f9c92']);
  assert.ok(crane.paper.frontName&&crane.paper.backName);
  for(const c of [crane.paper.front,crane.paper.back])assert.notEqual(c,'#d6452d');
  assert.equal(crane.steps.length,10);assert.equal(crane.steps.at(-1).view,'iso');
  for(const step of crane.steps)for(const field of ['id','title','text','tip'])assert.ok(step[field]);
  assert.match(crane.steps[1].text,/あとで使う折り目を先につけておきます/);
});
test('crane: production petal recipe and C1 assignment equal the validated fixed data',()=>{
  const fixture=craneBaseFixture({assignment:squareAssignments[4],sign:1});
  assert.deepEqual(crane.steps[1].ops[0],fixture.steps[0].ops[0]);
  assert.deepEqual(crane.steps[2].ops[0],fixture.steps[1].ops[0]);
  assert.deepEqual(crane.steps[3].ops[0],fixture.steps[2].ops[0]);
  assert.equal(info.raw[1].end.vertices.length,53);assert.equal(info.raw[1].end.triangles.length,80);
});
test('crane: the square base has four layers, half-size edges and coincident free corners',()=>{
  const s=info.raw[2].end,points=['BR','TR','BL','TL'].map(k=>point(s,k));
  for(const p of points)vecNear(p,points[0]);
  for(const axis of [0,2])near(Math.max(...s.vertices.map(v=>v.p[axis]))-Math.min(...s.vertices.map(v=>v.p[axis])),.5);
  near(distance(point(s,'C'),points[0]),Math.SQRT1_2);
  const ts=layersAt(s,.31,.073);assert.equal(ts.length,4);
  assert.equal(new Set(ts.map(t=>t.rank)).size,4);
});
test('crane: bird base has unit long axis, width sqrt(2)-1 and four layers in each leg',()=>{
  const s=info.raw[3].end;
  for(const [axis,width]of [[q,1],[r,Math.SQRT2-1]]) {
    const values=s.vertices.map(v=>dot(v.p,axis));near(Math.max(...values)-Math.min(...values),width);
  }
  vecNear(point(s,'BR'),point(s,'TL'));vecNear(point(s,'TR'),point(s,'BL'));
  near(distance(point(s,'BR'),point(s,'TR')),1);
  for(const k of ['BR','TL','TR','BL'])near(distance(point(s,k),point(s,'R')),.5);
  assert.equal(layersAt(s,.5,.015).length,4);assert.equal(layersAt(s,.5,-.015).length,4);
  assert.equal(layersAt(s,.1,.025).length,8,'central overlap contains both four-layer packets');
});
test('crane: edges, areas and rendered orientation at boundaries and several points within every operation',()=>{
  for(let step=0;step<model.steps.length;step++) {
    const count=info.raw[step].groups.length,samples=new Set([0,.125,.25,.5,.75,.875,1]);
    for(let g=0;g<count;g++)for(const f of [0,.25,.5,.75,1])samples.add((g+f)/count);
    for(const t of samples)geometry(step,t);
  }
});
test('crane: both mechanisms close and preserve refined geometry at all 257 frames',()=>{
  for(const step of [2,3]) {
    const motion=info.raw[step].groups[0].records[0].mechanism;
    for(let k=0;k<=256;k++) {
      const t=k/256,pose=motion.path.at(t);
      assert.ok(pose.closure<=1e-9&&pose.residual<=1e-9);
      for(const transform of pose.poses)near(dot(transform.r[0],cross(transform.r[1],transform.r[2])),1,1e-9);
      geometry(step,t);
    }
  }
});
test('crane: both mechanism paths have no internal triangle crossings at all 257 frames',()=>{
  for(const step of [2,3]) {
    const rec=info.raw[step].groups[0].records[0],s=rec.before,m=rec.mechanism;
    for(let k=0;k<=256;k++) {
      const {p}=sheetMechanismPose(s,m,k/256);
      for(let a=0;a<s.triangles.length;a++)for(let b=a+1;b<s.triangles.length;b++) {
        const ta=s.triangles[a],tb=s.triangles[b];
        if(m.faces[a]===m.faces[b]||ta.v.filter(v=>tb.v.includes(v)).length>=2)continue;
        assert.equal(trianglesPenetrate(ta.v.map(v=>p[v]),tb.v.map(v=>p[v])),false);
      }
    }
  }
});
test('crane: all operation boundaries retain valid layers and no crease penetration',()=>{
  for(const step of info.raw)for(const group of step.groups)for(const rec of group.records) {
    assertSheet(rec.before,model.paper);assertSheet(rec.after,model.paper);
    if(rec.folded)assertSheet(rec.folded,model.paper);
  }
});
test('crane: neck, tail and head are nested between stationary bounding layers',()=>{
  for(const step of [6,7])for(const group of info.raw[step].groups)for(const rec of group.records) {
    assert.equal(rec.op.stack.mode,'between');let compared=0;
    const s=rec.after;
    for(const id of rec.moving) {
      const moved=s.triangles[id];
      for(const [j,fixed]of s.triangles.entries()) {
        if(rec.moving.has(j)||overlapArea(project(s,moved),project(s,fixed))<=1e-6)continue;
        if(fixed.tags.includes(rec.op.stack.upper)){assert.ok(moved.rank<fixed.rank);compared++;}
        if(fixed.tags.includes(rec.op.stack.lower)){assert.ok(moved.rank>fixed.rank);compared++;}
      }
    }
    assert.ok(compared>0);
  }
});
test('crane: turning to narrow the rear preserves the existing front folds and mirror geometry',()=>{
  const s=info.raw[5].end;
  for(const v of s.vertices)vecNear(v.p,paperPoint(s,[v.uv[1],v.uv[0]]));
  assert.equal(info.raw[5].groups.filter(g=>g.records.some(r=>r.type==='turn')).length,2);
  for(const k of ['BR','TL','TR','BL'])vecNear(point(s,k),point(info.raw[3].end,k));
});
test('crane: final mirror symmetry, raised neck and tail, forward head and horizontal wings',()=>finalCriteria(final));
test('crane: visible upper wing surfaces present the coloured back on both sides',()=>{
  const {p,offsets}=info.pose(9,1);
  const faces=info.fine.triangles.map((tri,j)=>tri.v.map(v=>p[v].map((x,k)=>x+offsets[j][k])));
  for(const tag of ['flapFront','flapRear']) {
    const wings=info.fine.triangles.filter(t=>t.tags.includes(tag));assert.ok(wings.length);
    for(const tri of wings) {
      const center=tri.v.reduce((sum,v)=>sum.map((x,k)=>x+p[v][k]/3),[0,0,0]);
      const hits=faces.flatMap(ps=>{
        const w=barycentric([center[0],center[2]],...ps.map(p=>[p[0],p[2]]));
        return w?.every(x=>x>=-1e-8)?[{ps,y:w.reduce((y,x,k)=>y+x*ps[k][1],0)}]:[];
      }).sort((a,b)=>b.y-a.y);
      assert.ok(hits.length);assert.ok(normal(hits[0].ps)[1]<-.9,'visible back faces upward');
    }
  }
});
test('crane: step boundaries are continuous and arbitrary shuffled frames are deterministic',()=>{
  for(let step=0;step<model.steps.length;step++) {
    if(step) {
      const prev=model.frame(step-1,1).positions.slice(),next=model.frame(step,0).positions;
      prev.forEach((v,i)=>near(v,next[i],1e-7));
    }
    const a=model.frame(step,.371234,{explode:24}),saved={p:a.positions.slice(),n:a.normals.slice(),c:a.creaseSegments.slice()};
    for(const t of [1,0,.75,.25,.5])model.frame(step,t,{explode:0});
    const b=model.frame(step,.371234,{explode:24});
    assert.deepEqual(b.positions,saved.p);assert.deepEqual(b.normals,saved.n);assert.deepEqual(b.creaseSegments,saved.c);
  }
  assert.deepEqual(model.finalFrame().positions,model.frame(9,1).positions);
});
test('crane: reverse guides, finite arrows and simultaneous final wing hinges',()=>{
  assert.deepEqual(model.steps[6].guides.map(g=>g.kind),['reverse','reverse']);
  assert.deepEqual(model.steps[7].guides.map(g=>g.kind),['reverse']);
  assert.equal(info.compiled[9].groups.length,2);
  assert.equal(info.compiled[9].groups[1].records.length,2);
  for(const step of model.steps)for(const guide of step.guides) {
    assert.ok(guide.line.flat().every(Number.isFinite));assert.ok(guide.arrow.points.flat().every(Number.isFinite));
    near(norm(guide.arrow.head.direction),1);
  }
});
test('crane: model bounds contain sampled material, offsets and crease lines up to explode 24',()=>{
  for(let step=0;step<model.steps.length;step++)for(let k=0;k<=16;k++)for(const explode of [0,1,24]) {
    const f=model.frame(step,k/16,{explode});
    for(const buffer of [f.positions,f.creaseSegments])for(const [j,v]of buffer.entries())
      assert.ok(v>=model.bounds.min[j%3]-1e-7&&v<=model.bounds.max[j%3]+1e-7);
  }
});
for(const [name,change]of [
  ['tilted wing',s=>{s.vertices.find(v=>distance(v.uv,[1,0])<1e-8).p[1]+=.05;}],
  ['low head',s=>{s.vertices.find(v=>distance(v.uv,[1,1])<1e-8).p[1]=-.1;}],
  ['low tail',s=>{s.vertices.find(v=>distance(v.uv,[0,0])<1e-8).p[1]=-.1;}],
])test(`crane: numerical final criteria reject a ${name}`,()=>{
  const s=structuredClone(final);change(s);assert.throws(()=>finalCriteria(s),assert.AssertionError);
});
