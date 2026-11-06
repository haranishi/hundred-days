import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,inspectModel,FoldError} from '../lib/model.js';
import {tray} from '../lib/models/tray.js';
import {MODELS,modelDef} from '../lib/models/index.js';
import {createSheet,cloneSheet,paperPoint} from '../lib/sheet.js';
import {applyOp,assertSheet} from '../lib/ops.js';
import {drivePose} from '../lib/drive.js';
import {add,sub,mul,dot,cross,unit,norm,distance,rotate,signedArea,segmentTriangleInterval} from '../lib/math.js';
const g=1/3,model=buildModel(tray),info=inspectModel(model),samples=[0,.25,.5,.75,1];
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const vecNear=(a,b,eps=1e-7)=>assert.ok(distance(a,b)<eps,`${a} != ${b}`);
const normal=ps=>unit(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])));
const corners=[['SW','BL','bSW',[-1,0,0],[0,0,1]],['SE','BR','bSE',[1,0,0],[0,0,1]],
  ['NE','TR','bNE',[1,0,0],[0,0,-1]],['NW','TL','bNW',[-1,0,0],[0,0,-1]]];
// Independent closed form for a symmetric corner: a along each outward
// horizontal direction and b upward, satisfying 2a²+b²=2g², ac+bs=g.
function expectedCorner(s,base,u,v,f) {
  const theta=f*Math.PI/2,c=Math.cos(theta),sin=Math.sin(theta);
  const a=g*(c+Math.SQRT2*sin*sin)/(1+sin*sin),b=g*sin*(2-Math.SQRT2*c)/(1+sin*sin);
  return add(paperPoint(s,s.marks[base]),add(mul(add(u,v),a),[0,b,0]));
}
function checkGeometry(m) {
  const {fine,pose}=inspectModel(m);
  for(let i=0;i<m.steps.length;i++) for(const f of samples) {
    const {p}=pose(i,f),frame=m.frame(i,f,{explode:0});let area=0;
    fine.triangles.forEach((t,j)=>{
      const uv=t.v.map(v=>fine.vertices[v].uv),ps=t.v.map(v=>p[v]);
      assert.ok(signedArea(uv)>0,'positive material winding');
      const a=norm(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])))/2;
      near(a,signedArea(uv));area+=a;
      for(let k=0;k<3;k++) {
        near(distance(ps[k],ps[(k+1)%3]),distance(uv[k],uv[(k+1)%3]));
        const rendered=n=>Array.from(frame.positions.slice(j*9+n*3,j*9+n*3+3));
        near(distance(rendered(k),rendered((k+1)%3)),distance(uv[k],uv[(k+1)%3]));
      }
      const renderedNormal=Array.from(frame.normals.slice(j*9,j*9+3));
      near(dot(normal(ps),renderedNormal),1);
    });
    near(area,1);
  }
}
function checkFinal(m) {
  const {fine,pose}=inspectModel(m),{p,offsets}=pose(4,1);
  const wallNormals={wallS:[0,0,-1],wallE:[-1,0,0],wallN:[0,0,1],wallW:[1,0,0]};
  for(const t of fine.triangles.filter(t=>t.tags.includes('base'))) {
    for(const v of t.v) near(p[v][1],0,1e-6);
    vecNear(normal(t.v.map(v=>p[v])),[0,1,0]);
  }
  const base=fine.triangles.filter(t=>t.tags.includes('base')).flatMap(t=>t.v.map(v=>p[v]));
  for(const c of [0,2]) near(Math.max(...base.map(p=>p[c]))-Math.min(...base.map(p=>p[c])),g);
  for(const [tag,n] of Object.entries(wallNormals)) {
    const walls=fine.triangles.filter(t=>t.tags.includes(tag));assert.ok(walls.length);
    const ps=walls.flatMap(t=>t.v.map(v=>p[v]));
    near(Math.min(...ps.map(p=>p[1])),0,1e-6);near(Math.max(...ps.map(p=>p[1])),g,1e-6);
    for(const t of walls) {
      const actual=normal(t.v.map(v=>p[v]));
      assert.ok(Math.hypot(actual[0],actual[2])>=1-1e-6);
      vecNear(actual,n); // Front (green) points inward; the back points outward.
    }
  }
  for(const [fin,wall] of [['finSW','wallS'],['finSE','wallE'],['finNE','wallN'],['finNW','wallW']]) {
    const n=wallNormals[wall],w=fine.triangles.find(t=>t.tags.includes(wall));
    const fins=fine.triangles.flatMap((t,i)=>t.tags.includes(fin)?[i]:[]);
    assert.equal(fins.length,2,'each corner is two triangles');
    const gaps=[];
    for(const i of fins) {
      const t=fine.triangles[i];near(Math.abs(dot(normal(t.v.map(v=>p[v])),n)),1);
      for(const v of t.v) near(dot(sub(p[v],p[w.v[0]]),n),0);
      const gap=-dot(offsets[i],n);gaps.push(gap);
      assert.ok(gap>=m.paper.layerGap-1e-9&&gap<=2*m.paper.layerGap+1e-9,'outside the wall');
    }
    near(Math.abs(gaps[0]-gaps[1]),m.paper.layerGap);
    const outer=fins[gaps.indexOf(Math.max(...gaps))];
    near(dot(normal(fine.triangles[outer].v.map(v=>p[v])),n),1); // Back faces outward.
  }
}
test('tray is registered last with the requested paper, name and timing',()=>{
  assert.equal(MODELS.at(-1),tray);assert.equal(modelDef('tray'),tray);
  assert.deepEqual([tray.name,tray.reading,tray.level,tray.minutes],['立方体の箱','りっぽうたいのはこ',2,5]);
  assert.deepEqual([model.paper.front,model.paper.back],['#2fa37a','#f6f1e3']);
  assert.equal(model.steps[3].durationMs,2800);assert.equal(info.compiled[3].groups.length,1);
  assert.equal(info.compiled[2].groups.length,1,'static tags do not add animation time');
});
test('tray: edges, individual areas, total area and rendered winding at all five samples',()=>checkGeometry(model));
test('tray: cube base, vertical inward-facing walls, height and exterior fin clearances',()=>checkFinal(model));
test('tray: drive angles are f times 90 degrees, all walls rise toward +y',()=>{
  const r=info.raw[3].groups[0].records[0];
  for(const f of samples) {
    const {p}=info.pose(3,f);
    for(const group of r.drive.groups) {
      const tag=group.op.select.tags[0];
      info.fine.triangles.forEach(t=>{
        if(!t.tags.includes(tag)) return;
        const n=normal(t.v.map(v=>p[v]));
        near(Math.acos(Math.min(1,Math.max(-1,n[1]))),f*Math.PI/2,1e-6);
        for(const v of t.v) assert.ok(p[v][1]>=-1e-9);
      });
    }
  }
});
test('tray: follower branch matches independent analytic corners including the degenerate endpoint',()=>{
  const start=info.raw[3].start;
  for(const f of [0,1e-10,1e-8,.1,.25,.5,.75,.99999,.99999999,1]) {
    const {p}=info.pose(3,f);
    for(const [,mark,base,u,v] of corners) {
      const i=info.fine.vertices.findIndex(v=>distance(v.uv,start.marks[mark])<1e-9);
      vecNear(p[i],expectedCorner(start,base,u,v,f));
    }
  }
});
test('tray: every face orientation follows a proper rotation, including follower faces and fin hinges',()=>{
  const r=info.raw[3].groups[0].records[0],s=r.before;
  for(const f of samples) {
    const {p}=info.pose(3,f),expected=s.vertices.map(v=>v.p.slice());
    for(const group of r.drive.groups) for(const v of group.vertices)
      expected[v]=rotate(s.vertices[v].p,group.origin,group.axis,group.angle*f);
    for(const [,mark,base,u,v] of corners) {
      const i=s.vertices.findIndex(v=>distance(v.uv,s.marks[mark])<1e-9);
      expected[i]=expectedCorner(s,base,u,v,f);
    }
    // The final mesh is the scribe mesh, so material vertices can be matched by UV.
    info.fine.triangles.forEach(t=>{
      const ps=t.v.map(v=>expected[s.vertices.findIndex(w=>distance(w.uv,info.fine.vertices[v].uv)<1e-9)]);
      near(dot(normal(ps),normal(t.v.map(v=>p[v]))),1);
    });
    const endPose=info.pose(4,f);
    for(const record of info.raw[4].groups[0].records) {
      info.fine.triangles.forEach(t=>{
        if(!t.tags.includes(record.op.select.tags[0])) return;
        // Hinge starts at drive's endpoint, independent of f above.
        const begin=t.v.map(v=>info.pose(3,1).p[v]);
        const n=rotate(normal(begin),[0,0,0],record.axis,record.angle*f);
        near(dot(n,normal(t.v.map(v=>endPose.p[v]))),1);
      });
    }
  }
});
test('tray: all boundaries are continuous and frames remain pure under shuffled calls',()=>{
  for(let i=0;i<model.steps.length;i++) {
    const begin=model.frame(i,0).positions.slice();
    if(i) {
      const end=model.frame(i-1,1).positions;
      begin.forEach((v,k)=>near(v,end[k]));
    }
    const first=model.frame(i,.37,{explode:24}),saved={p:first.positions.slice(),n:first.normals.slice(),c:first.creaseSegments.slice(),b:structuredClone(first.bounds)};
    for(const f of [1,0,.75,.25,.5]) model.frame(i,f,{explode:0});
    const again=model.frame(i,.37,{explode:24});
    assert.deepEqual(again.positions,saved.p);assert.deepEqual(again.normals,saved.n);
    assert.deepEqual(again.creaseSegments,saved.c);assert.deepEqual(again.bounds,saved.b);
  }
  assert.deepEqual(model.finalFrame().positions,model.frame(4,1).positions);
});
test('tray: four hinge-shaped drive guides and four simultaneous fin guides',()=>{
  assert.equal(model.steps[2].guides.length,0);
  for(const i of [3,4]) {
    assert.equal(model.steps[i].guides.length,4);
    for(const guide of model.steps[i].guides) {
      assert.equal(guide.kind,'hinge');assert.equal(guide.line.length,2);
      assert.ok(guide.line.flat().every(Number.isFinite));assert.ok(distance(...guide.line)>1e-9);
      assert.equal(guide.arrow.points.length,25);near(norm(guide.arrow.head.direction),1,1e-9);
      assert.deepEqual(guide.arrow.head.position,guide.arrow.points.at(-1));
    }
  }
  assert.equal(info.compiled[4].groups.length,1);
});
test('tray: model bounds contain dense samples, crease segments and rotating offsets up to explode 24',()=>{
  for(let i=0;i<model.steps.length;i++) for(let k=0;k<=32;k++) for(const explode of [0,1,24]) {
    const frame=model.frame(i,k/32,{explode});
    for(const buffer of [frame.positions,frame.creaseSegments]) buffer.forEach((v,j)=>{
      assert.ok(v>=model.bounds.min[j%3]-1e-7&&v<=model.bounds.max[j%3]+1e-7);
    });
  }
});
test('tag selects by UV centroid, adds unique tags and leaves topology, pose and creases alone',()=>{
  const s=createSheet(tray.paper),before=cloneSheet(s);
  applyOp(s,{type:'tag',rect:[.5,0,1,.5],add:['chosen','chosen']},.004);
  assert.deepEqual(s.vertices,before.vertices);assert.deepEqual(s.creases,before.creases);
  assert.deepEqual(s.triangles.map(t=>t.v),before.triangles.map(t=>t.v));
  assert.deepEqual(s.triangles.map(t=>t.tags),[['chosen'],[]]);
  assert.deepEqual(s.triangles.map(t=>t.offset),before.triangles.map(t=>t.offset));
});
test('scribe split cuts the infinite line, marks only its finite segment and preserves default behavior',()=>{
  for(const split of [false,true]) {
    const s=createSheet(tray.paper,{a:[.3,.2],b:[.3,.4]}),before=cloneSheet(s);
    applyOp(s,{type:'scribe',segments:[['a','b']],...(split?{split:true}:{})},.004);
    if(!split) assert.deepEqual(s.vertices,before.vertices);
    else {
      assert.ok(s.vertices.some(v=>distance(v.uv,[.3,0])<1e-9));
      assert.ok(s.vertices.some(v=>distance(v.uv,[.3,1])<1e-9));
      for(const t of s.triangles) {
        const xs=t.v.map(v=>s.vertices[v].uv[0]);assert.ok(Math.min(...xs)>=.3-1e-9||Math.max(...xs)<=.3+1e-9);
      }
    }
    assertSheet(s,tray.paper);assert.deepEqual(s.creases,[[[.3,.2],[.3,.4]]]);
    for(const t of s.triangles) {
      const interval=segmentTriangleInterval(...s.creases[0],t.v.map(v=>s.vertices[v].uv));
      if(interval) for(const f of interval) assert.ok(.2+f*.2>=.2-1e-9&&.2+f*.2<=.4+1e-9);
    }
  }
});
test('scribe split rejects a non-flat pose and malformed tag input is rejected',()=>{
  const s=createSheet(tray.paper);applyOp(s,{type:'hinge',axis:{through:['B','T']},degrees:20},.004);
  assert.throws(()=>applyOp(s,{type:'scribe',segments:[['BL','TR']],split:true},.004),e=>e.code==='NOT_FLAT');
  assert.throws(()=>applyOp(s,{type:'tag',rect:[0,0,1,1],add:'bad'},.004),e=>e.code==='INVALID_TAG');
});
test('drive rotates follower offset vectors with their proper face rotation, and honors tagMoved',()=>{
  const s=cloneSheet(info.raw[3].start);s.triangles.forEach(t=>{t.offset=[0,.012,0];});
  const op={...tray.steps[3].ops[0],tagMoved:'driven'},r=applyOp(s,op,.004);
  for(const f of [.25,.5,.75,1]) {
    const pose=drivePose(r.before,r.drive,f);
    s.triangles.forEach((t,i)=>{
      vecNear(pose.offsets[i],mul(normal(t.v.map(v=>pose.p[v])),.012));
      near(norm(pose.offsets[i]),.012);
    });
  }
  for(const t of s.triangles) assert.equal(t.tags.includes('driven'),!t.tags.includes('base'));
  assert.equal(s.flat,false);
});
test('drive rejects empty, overlapping and incompatible groups, and invalid angles',()=>{
  for(const mutate of [
    op=>{op.groups[0].select={tags:['missing']};},
    op=>{op.groups.push(structuredClone(op.groups[0]));},
    op=>{op.groups[0].degrees=NaN;},
    op=>{op.fixed={tags:['missing']};},
  ]) {
    const d=structuredClone(tray);mutate(d.steps[3].ops[0]);
    assert.throws(()=>buildModel(d),e=>e instanceof FoldError&&e.step===4);
  }
});
test('drive participates in together conflict checks and leaves subsequent flat folds forbidden',()=>{
  const d=structuredClone(tray);d.steps[3].ops.push({...d.steps[4].ops[0],together:true});
  assert.throws(()=>buildModel(d),e=>e.code==='TOGETHER_CONFLICT');
  const s=cloneSheet(info.raw[3].end);
  assert.throws(()=>applyOp(s,tray.steps[0].ops[0],.004),e=>e.code==='NOT_FLAT');
});
test('disjoint drives in together animate concurrently without overwriting each other or their fixed faces',()=>{
  const m=buildModel({id:'two-drives',paper:tray.paper,marks:tray.marks,steps:[
    {ops:[{type:'scribe',segments:[['a1','a2'],['b1','b2']],split:true},
      {type:'tag',rect:[0,0,g,1],add:['left']},{type:'tag',rect:[2*g,0,1,1],add:['right']}]},
    {durationMs:900,ops:[
      {type:'drive',fixed:{notTags:['left']},groups:[{select:{tags:['left']},axis:{through:['a1','a2']},degrees:90}]},
      {type:'drive',fixed:{notTags:['right']},groups:[{select:{tags:['right']},axis:{through:['b1','b2']},degrees:-90}],together:true}]},
  ]});
  const d=inspectModel(m);assert.equal(m.steps[1].durationMs,900);assert.equal(d.compiled[1].groups.length,1);
  for(const f of samples) {
    const {p}=d.pose(1,f);
    d.fine.vertices.forEach((v,i)=>{
      const group=v.uv[0]<g-1e-9?d.raw[1].groups[0].records[0].drive.groups[0]:
        v.uv[0]>2*g+1e-9?d.raw[1].groups[0].records[1].drive.groups[0]:null;
      const start=paperPoint(d.raw[1].start,v.uv);
      vecNear(p[i],group?rotate(start,group.origin,group.axis,group.angle*f):start);
    });
  }
});
for(const [name,mutate] of [
  ['remove follower motion',d=>{d.steps[3].ops[0].fixed={notTags:['wallS','wallE','wallN','wallW']};}],
  ['reverse one wall',d=>{d.steps[3].ops[0].groups[0].degrees=90;}],
  ['shift a hinge mark',d=>{d.marks.bSW[0]+=.01;}],
  ['rotate one fin inward',d=>{d.steps[4].ops[0].degrees=-45;}],
]) test(`tray mutation: ${name} fails construction or numerical criteria`,()=>{
  const d=structuredClone(tray);mutate(d);let m;
  try {m=buildModel(d);}catch(e) {assert.ok(e instanceof FoldError);return;}
  assert.throws(()=>{checkGeometry(m);checkFinal(m);},assert.AssertionError);
});
