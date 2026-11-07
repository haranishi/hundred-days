import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,FoldError,inspectModel} from '../lib/model.js';
import {MODELS,modelDef} from '../lib/models/index.js';
import {distance,cross,sub,unit,norm,signedArea,dot,rotate,boundsOf,overlapArea,AREA_EPS,LENGTH_EPS} from '../lib/math.js';
import {assertSheet} from '../lib/ops.js';
import {paperPoint} from '../lib/sheet.js';
import {projection} from '../lib/stack.js';
// The linked, non-rigid drive has its own independent analytic checks in tray.test.
// Models with a mechanism step (several hinges moving together) are checked by mechanism*.test and
// their own tests (kabuto, crane): the single-axis rotation model used below does not describe them.
const models=MODELS.filter(d=>!d.steps.some(s=>s.ops.some(o=>o.type==='drive'||o.type==='mechanism'))).map(buildModel);
const samples=[0,.25,.5,.75,1];
const triangleNormal=points=>unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
for(const model of models) {
  const {fine,raw,compiled,pose}=inspectModel(model);
  test(`${model.id}: all steps preserve edges, area and front orientation at five samples`,()=>{
    for(let i=0;i<model.steps.length;i++) for(const t of samples) {
      const {p}=pose(i,t),frame=model.frame(i,t,{explode:0});
      let area=0;
      const gpos=t*compiled[i].groups.length,gi=Math.min(Math.floor(gpos),compiled[i].groups.length-1),q=t===1?1:gpos-gi;
      const group=compiled[i].groups[gi];
      fine.triangles.forEach((tri,j)=>{
        const uv=tri.v.map(v=>fine.vertices[v].uv),points=tri.v.map(v=>p[v]);
        assert.ok(signedArea(uv)>0);
        area+=norm(cross(sub(points[1],points[0]),sub(points[2],points[0])))/2;
        for(let k=0;k<3;k++) {
          const expected=distance(uv[k],uv[(k+1)%3]);
          assert.ok(Math.abs(distance(points[k],points[(k+1)%3])-expected)<LENGTH_EPS,`${i} ${t}: double edge`);
          const a=Array.from(frame.positions.slice(j*9+k*3,j*9+k*3+3));
          const n=(k+1)%3,b=Array.from(frame.positions.slice(j*9+n*3,j*9+n*3+3));
          assert.ok(Math.abs(distance(a,b)-expected)<LENGTH_EPS,`${i} ${t}: float edge`);
        }
        let expected=triangleNormal(tri.v.map(v=>group.base.p[v]));
        for(const r of group.records) if(r.mt[j]) {
          expected=triangleNormal(tri.v.map(v=>r.base.p[v]));
          expected=rotate(expected,[0,0,0],r.axis,r.angle*(r.type==='crease'?(q<=.5?q*2:2-2*q):q));
        }
        assert.ok(dot(expected,triangleNormal(points))>1-1e-7,`${i} ${t}: orientation`);
        const rendered=Array.from(frame.normals.slice(j*9,j*9+3));
        assert.ok(dot(rendered,expected)>1-1e-7);
      });
      assert.ok(Math.abs(area-model.paper.width*model.paper.height)<1e-7,`${i} ${t}: area`);
    }
  });
  test(`${model.id}: every flat endpoint has unique overlap ranks and no crease penetration`,()=>{
    for(const {start,end} of raw) for(const s of [start,end]) {
      assertSheet(s,model.paper);
      if(!s.flat) continue;
      for(let i=0;i<s.triangles.length;i++) for(let j=i+1;j<s.triangles.length;j++)
        if(overlapArea(projection(s,s.triangles[i]),projection(s,s.triangles[j]))>AREA_EPS)
          assert.notEqual(s.triangles[i].rank,s.triangles[j].rank);
    }
  });
  test(`${model.id}: frame boundaries are continuous, guides are world-space and buffers reusable`,()=>{
    for(let i=0;i<model.steps.length;i++) {
      const a=model.frame(i,0),buffer=a.positions;
      const copy=a.positions.slice();
      assert.equal(model.frame(i,.5).positions,buffer);
      if(i) {
        const b=model.frame(i-1,1);
        assert.notEqual(a.topologyKey,b.topologyKey);
        assert.equal(copy.length,b.positions.length);
        for(let j=0;j<copy.length;j++) assert.ok(Math.abs(copy[j]-b.positions[j])<1e-7,`step ${i} coordinate ${j}`);
      }
      const guides=model.steps[i].guides;
      assert.equal(guides.length,raw[i].data.ops.filter(o=>o.type!=='scribe').length);
      for(const g of guides) {
        assert.ok(['valley','mountain','turn','hinge','reverse'].includes(g.kind));
        assert.equal(g.line.length,2);
        assert.ok(g.line.flat().every(Number.isFinite));
        assert.ok(distance(...g.line)>1e-9);
        assert.ok(g.arrow.points.length>=3);
        assert.ok(Math.abs(norm(g.arrow.head.direction)-1)<1e-9);
        assert.deepEqual(g.arrow.head.position,g.arrow.points.at(-1));
      }
      assert.ok(a.creaseSegments.every(Number.isFinite));
    }
  });
  test(`${model.id}: explode changes offsets only, finalFrame and deterministic builds agree`,()=>{
    const other=buildModel(modelDef(model.id));
    for(let i=0;i<model.steps.length;i++) {
      const flat=model.frame(i,.5,{explode:0}).positions.slice();
      const expanded=model.frame(i,.5,{explode:24}).positions.slice();
      const {offsets}=pose(i,.5);
      for(let j=0;j<fine.triangles.length;j++) for(let k=0;k<3;k++) for(let c=0;c<3;c++)
        assert.ok(Math.abs(expanded[j*9+k*3+c]-flat[j*9+k*3+c]-offsets[j][c]*24)<2e-7);
      assert.deepEqual(model.frame(i,.375).positions,other.frame(i,.375).positions);
    }
    assert.deepEqual(model.finalFrame().positions,model.frame(model.steps.length-1,1).positions);
    assert.throws(()=>model.frame(-1,0),RangeError);
    assert.throws(()=>model.frame(0,NaN),RangeError);
  });
}
export function planeCriteria(model) {
  const s=inspectModel(model).raw.at(-1).end,p=s.vertices.map(v=>v.p),b=boundsOf(p);
  const spine=paperPoint(s,s.marks.T)[0];
  // Triangulation diagonals need not be symmetric; corresponding material points do.
  for(const v of s.vertices) assert.ok(distance(paperPoint(s,[model.paper.width-v.uv[0],v.uv[1]]),
    [2*spine-v.p[0],v.p[1],v.p[2]])<1e-6,'mirror symmetry');
  for(const t of s.triangles.filter(t=>t.tags.includes('wingL')||t.tags.includes('wingR')))
    assert.ok(Math.abs(triangleNormal(t.v.map(v=>p[v]))[1])>=Math.cos(12*Math.PI/180),'wing within 12 degrees of level');
  assert.ok(Math.abs(paperPoint(s,s.marks.T)[1])<1e-6);
  assert.ok(Math.abs(paperPoint(s,s.marks.B)[1])<1e-6);
  assert.ok(b.min[1]>-1e-6,'above desk');
  assert.ok(b.max[0]-b.min[0]>=.45 && b.max[0]-b.min[0]<=.65,'wingspan');
  assert.ok(b.max[2]-b.min[2]>=1.3 && b.max[2]-b.min[2]<=1.5,'length');
}
export function swanCriteria(model) {
  const s=inspectModel(model).raw.at(-1).end;
  const body=boundsOf(s.triangles.filter(t=>!t.tags.includes('neck')).flatMap(t=>t.v.map(v=>s.vertices[v].p)));
  const tip=paperPoint(s,s.marks.BL);
  assert.ok(tip[1]>body.max[1],'head above body');
  assert.ok(tip[2]>body.max[2],'head ahead of body');
  assert.ok(Math.abs(body.min[1])<1e-6,'spine on desk');
  assert.ok(s.vertices.every(v=>v.p[1]>-1e-6),'above desk');
  for(const index of [3,4]) {
    const r=inspectModel(model).raw[index].groups[0].records[0];
    const stack=index===3?{upper:'halfL',lower:'halfR'}:{upper:'halfR',lower:'halfL'};
    const stationary=r.after.triangles.filter((_,i)=>!r.moving.has(i));
    const touched=stationary.filter(t=>r.after.triangles.some((m,i)=>r.moving.has(i)&&overlapArea(projection(r.after,t),projection(r.after,m))>AREA_EPS));
    const lower=Math.max(...touched.filter(t=>t.tags.includes(stack.lower)).map(t=>t.rank));
    const upper=Math.min(...touched.filter(t=>t.tags.includes(stack.upper)).map(t=>t.rank));
    assert.ok(lower<upper);
    for(const i of r.moving) assert.ok(r.after.triangles[i].rank>lower&&r.after.triangles[i].rank<upper,'inside bounding layers');
  }
}
test('plane final symmetry, horizontal wings, table contact, wingspan and length',()=>planeCriteria(models.find(m=>m.id==='plane')));
test('swan final head height, forward beak, table contact and reverse-fold nesting',()=>swanCriteria(models.find(m=>m.id==='swan')));
test('registry is unique, follows difficulty order, and resolves ids',()=>{
  const order=['plane','heart','pochi','cup','kabuto','boat','kimono','swan','tray','crane'];
  const ids=MODELS.map(d=>d.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(ids,order.filter(id=>ids.includes(id)));
  for(const def of MODELS) assert.equal(modelDef(def.id),def);
  assert.equal(modelDef('unknown'),undefined);
});
test('FoldError reports one-based step, op and stable code',()=>{
  const d=structuredClone(modelDef('plane'));d.steps[2].ops[1].line={through:['T','T']};
  assert.throws(()=>buildModel(d),e=>e instanceof FoldError && e.step===3&&e.op===2&&e.code==='INVALID_LINE');
});
