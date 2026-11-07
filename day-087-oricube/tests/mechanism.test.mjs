import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {trianglesPenetrate} from '../lib/mechanism-sheet.js';
import {assertSheet} from '../lib/ops.js';
import {paperPoint} from '../lib/sheet.js';
import {distance,sub,cross,norm,dot,barycentric,inTriangle,signedArea} from '../lib/math.js';
import {squareBaseFixture} from './mechanism-fixtures.mjs';
const model=buildModel(squareBaseFixture()),info=inspectModel(model),record=info.raw[1].groups[0].records[0];
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
test('C1: 257 compiled poses preserve all material edges, areas, winding and loop closure',()=>{
  for(let k=0;k<=256;k++) {
    const t=k/256,{p}=info.pose(1,t),frame=model.frame(1,t,{explode:0}),core=record.mechanism.path.at(t);
    assert.ok(core.closure<=1e-9);assert.ok(core.residual<=1e-9);
    for(const [j,tri]of info.fine.triangles.entries()) {
      const ps=tri.v.map(v=>p[v]),uv=tri.v.map(v=>info.fine.vertices[v].uv);
      for(let i=0;i<3;i++)near(distance(ps[i],ps[(i+1)%3]),distance(uv[i],uv[(i+1)%3]));
      const normal=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0]));near(norm(normal)/2,signedArea(uv));
      near(dot(normal,Array.from(frame.normals.slice(j*9,j*9+3)))/norm(normal),1,1e-7);
    }
  }
});
test('C1: endpoint is a four-layer half-size square with all corners opposite the center',()=>{
  const end=info.raw[1].end;assert.equal(end.flat,true);assertSheet(end,model.paper);
  const corners=['TL','TR','BL','BR'].map(mark=>paperPoint(end,end.marks[mark]));
  corners.forEach(p=>near(distance(p,corners[0]),0,1e-7));
  near(distance(paperPoint(end,end.marks.C),corners[0]),Math.SQRT1_2,1e-7);
  for(const c of [0,2])near(Math.max(...end.vertices.map(v=>v.p[c]))-Math.min(...end.vertices.map(v=>v.p[c])),.5,1e-7);
  for(const p of [[.1,-.2],[.2,-.1]]) {
    const layers=end.triangles.filter(t=>inTriangle(barycentric(p,...t.v.map(v=>[end.vertices[v].p[0],end.vertices[v].p[2]]))));
    assert.equal(layers.length,4);assert.equal(new Set(layers.map(t=>t.rank)).size,4);
  }
});
test('C1: rank follows the near-end height order and pinned display offsets stay continuous',()=>{
  for(const sign of [1,-1]) {
    const m=buildModel(squareBaseFixture(sign)),d=inspectModel(m),r=d.raw[1].groups[0].records[0];
    for(const explode of [0,1,24])for(const i of [1,2]) {
      const a=m.frame(i-1,1,{explode}).positions.slice(),b=m.frame(i,0,{explode}).positions;
      a.forEach((x,k)=>near(x,b[k],1e-7));
    }
    const pin=r.mechanism.path.core.pin;
    r.before.triangles.forEach((t,i)=>{if(r.mechanism.faces[i]===pin)near(r.after.triangles[i].rank,t.rank);});
  }
});
test('C1: arbitrary progress is deterministic, monotone and stays inside model bounds',()=>{
  const other=buildModel(squareBaseFixture());let previous=null;
  for(let k=0;k<=256;k++) {
    const a=record.mechanism.path.at(k/256).angles;
    if(previous)a.forEach((x,i)=>assert.ok((x-previous[i])*Math.sign(record.mechanism.path.core.goals[i])>=-1e-8));previous=a;
  }
  for(const t of [1,.00001,.731234,0,.999999,.19912,.5]) {
    const a=model.frame(1,t,{explode:24}).positions.slice();model.frame(1,.8);
    assert.deepEqual(a,model.frame(1,t,{explode:24}).positions);assert.deepEqual(a,other.frame(1,t,{explode:24}).positions);
    for(let j=0;j<a.length;j++)assert.ok(a[j]>=model.bounds.min[j%3]-1e-7&&a[j]<=model.bounds.max[j%3]+1e-7);
  }
  assert.notEqual(model.frame(0,1).topologyKey,model.frame(1,0).topologyKey);
});
test('C1: all six moving creases have finite valley/mountain guides at the step start',()=>{
  const guides=model.steps[1].guides;assert.equal(guides.length,6);
  assert.equal(guides.filter(g=>g.kind==='valley').length,4);assert.equal(guides.filter(g=>g.kind==='mountain').length,2);
  for(const g of guides) {
    assert.ok(g.line.flat().every(Number.isFinite));assert.ok(g.line.every(p=>Math.abs(p[1])<1e-9));
    assert.ok(g.arrow.points.flat().every(Number.isFinite));near(norm(g.arrow.head.direction),1);
  }
});
test('mechanism mutations: wrong sign and impossible endpoint fail with model and step context',()=>{
  for(const mutate of [op=>{op.hinges[1].degrees=180;},op=>{op.hinges[0].degrees=90;}]) {
    const d=squareBaseFixture();mutate(d.steps[1].ops[0]);
    assert.throws(()=>buildModel(d),e=>e instanceof FoldError&&e.step===2&&e.op===1&&e.message.includes(d.id)&&e.code.startsWith('MECHANISM_'));
  }
});
test('mechanism mutation: a rigid strip whose last panel crosses its first is refused',()=>{
  const cuts=[.4,.6,.7],segments=cuts.map(u=>[[u-.5,.5],[u-.5,-.5]]);
  const d={id:'crossing-strip',paper:{width:1,height:1},steps:[{ops:[{type:'scribe',split:true,segments},
    {type:'tag',rect:[0,0,.4,1],add:['pin']}]},{ops:[{type:'mechanism',pin:{tags:['pin']},
      hinges:cuts.map(u=>({line:{through:[[u,0],[u,1]]},degrees:90}))}]}]};
  assert.throws(()=>buildModel(d),e=>e instanceof FoldError&&e.code==='MECHANISM_PENETRATION'&&e.step===2);
});
test('triangle crossings distinguish coplanar stacks and edge contacts from piercing interiors',()=>{
  const a=[[-1,0,0],[1,0,0],[0,1,0]],b=[[0,0,-1],[0,0,1],[0,1,0]];
  assert.equal(trianglesPenetrate(a,b),true);assert.equal(trianglesPenetrate(b,a),true);
  assert.equal(trianglesPenetrate(a,a),false);
  assert.equal(trianglesPenetrate(a,[[0,1,-1],[0,1,1],[0,2,0]]),false);
});
test('mechanism: a folded +180 start opens to the declared +90 endpoint and keeps a valley guide',()=>{
  const d={id:'opening-fixture',paper:{width:1,height:1},steps:[{ops:[
    {type:'fold',line:{through:['B','T']},moving:'BR',mode:'valley'},
    {type:'tag',rect:[0,0,.5,1],add:['pin']},
  ]},{ops:[{type:'mechanism',pin:{tags:['pin']},hinges:[{line:{through:['B','T']},degrees:90}]}]}]};
  const m=buildModel(d),i=inspectModel(m),r=i.raw[1].groups[0].records[0];
  assert.equal(r.mechanism.flat,false);near(r.mechanism.path.core.hinges[0].degrees,-90);
  assert.equal(m.steps[1].guides[0].kind,'valley');
  const p=paperPoint(i.raw[1].end,[1,0]);near(p[0],0);near(p[1],.5);near(p[2],.5);
  for(const explode of [0,1,24]) {
    const a=m.frame(0,1,{explode}).positions.slice(),b=m.frame(1,0,{explode}).positions;
    a.forEach((x,k)=>near(x,b[k],1e-7));
  }
});
test('mechanism: guides after a preceding turn are transported back to the step initial pose',()=>{
  const d=squareBaseFixture();d.steps[1].ops.unshift({type:'turn',axis:'vertical'});
  const m=buildModel(d),i=inspectModel(m),r=i.raw[1].groups[1].records[0],guides=m.steps[1].guides.slice(1);
  assert.equal(guides.length,6);
  guides.forEach((g,k)=>g.line.forEach((p,j)=>near(distance(p,paperPoint(i.raw[1].start,r.mechanism.path.core.hinges[k].uvEdge[j])),0)));
});
