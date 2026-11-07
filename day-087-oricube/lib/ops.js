// Shared hinge vertices stay exact. Offset vectors rotate with non-flat faces;
// flat folds interpolate rank offsets separately so opening frames stay continuous.
import {VERTEX_EPS,LENGTH_EPS,DEGENERATE_AREA_EPS,AREA_EPS,overlapArea,add,sub,mul,dot,cross,unit,norm,distance,rotate,axisDistance,cross2,boundsOf,signedArea} from './math.js';
import {cloneSheet,point,splitLine,selected,simplifyFlat} from './sheet.js';
import {orderStack,assertLayers} from './stack.js';
import {FoldError} from './error.js';
import {prepareDrive,drivePose,rotateFaceVector} from './drive.js';
import {prepareMechanismOp,sheetMechanismPose} from './mechanism-sheet.js';
const fail=(message,code)=>{throw new FoldError(message,{code});};
export function resolveLine(s,line) {
  let o,d;
  if(line?.through) {
    const a=point(s,line.through[0]),b=point(s,line.through[1]); o=[a[0],a[2]]; d=[b[0]-a[0],b[2]-a[2]];
  } else if(line?.perpBisector) {
    const a=point(s,line.perpBisector[0]),b=point(s,line.perpBisector[1]); o=[(a[0]+b[0])/2,(a[2]+b[2])/2];d=[b[2]-a[2],a[0]-b[0]];
  } else if(line?.point && line?.dir) { o=line.point.slice();d=line.dir.slice(); }
  else if(line?.angleBisector) {
    const [a,b]=line.angleBisector.map(l=>resolveLine(s,l)),den=cross2(a.d,b.d);
    if(Math.abs(den)<VERTEX_EPS) fail('Parallel angle bisectors','INVALID_LINE');
    o=add(a.o,mul(a.d,cross2(sub(b.o,a.o),b.d)/den));
    const p=point(s,line.containing),v=sub([p[0],p[2]],o);
    const choices=[add(a.d,b.d),sub(a.d,b.d)].filter(v=>norm(v)>VERTEX_EPS).map(unit);
    d=choices.sort((a,b)=>Math.abs(dot(b,v))-Math.abs(dot(a,v)))[0];
  } else fail('Unknown line specification','INVALID_LINE');
  if(!o||!d||![...o,...d].every(Number.isFinite)||norm(d)<VERTEX_EPS) fail('Degenerate fold axis','INVALID_LINE');
  return {o,d:unit(d)};
}
function rememberLine(s,line,select) {
  for(const t of s.triangles) {
    if(!selected(t,select)) continue;
    for(let k=0;k<3;k++) {
      const a=s.vertices[t.v[k]],b=s.vertices[t.v[(k+1)%3]];
      if([a,b].every(v=>Math.abs(cross2(line.d,sub([v.p[0],v.p[2]],line.o)))<VERTEX_EPS)) {
        const e=[a.uv.slice(),b.uv.slice()];
        if(!s.creases.some(f=>(distance(e[0],f[0])<VERTEX_EPS&&distance(e[1],f[1])<VERTEX_EPS)||
          (distance(e[0],f[1])<VERTEX_EPS&&distance(e[1],f[0])<VERTEX_EPS))) s.creases.push(e);
      }
    }
  }
}
export function assertHinge(s,moving,origin,axis) {
  const used=new Set(),fixed=new Set();
  s.triangles.forEach((t,i)=>t.v.forEach(v=>(moving.has(i)?used:fixed).add(v)));
  for(const v of used) if(fixed.has(v)&&axisDistance(s.vertices[v].p,origin,axis)>VERTEX_EPS)
    fail('Moving and stationary paper share a vertex away from the hinge','HINGE_TEAR');
  return new Set([...used].filter(v=>axisDistance(s.vertices[v].p,origin,axis)>VERTEX_EPS));
}
function assertGeometry(s,expectedArea) {
  let total=0;
  for(const t of s.triangles) {
    const uv=t.v.map(i=>s.vertices[i].uv),p=t.v.map(i=>s.vertices[i].p),area=signedArea(uv);
    if(area<=0) fail('Paper winding reversed','ORIENTATION');
    total+=norm(cross(sub(p[1],p[0]),sub(p[2],p[0])))/2;
    for(let k=0;k<3;k++) if(Math.abs(distance(uv[k],uv[(k+1)%3])-distance(p[k],p[(k+1)%3]))>LENGTH_EPS)
      fail('Paper edge stretched','EDGE_LENGTH');
  }
  if(Math.abs(total-expectedArea)>LENGTH_EPS) fail('Paper area changed','AREA');
}
export function assertSheet(s,paper) {
  assertGeometry(s,paper.width*paper.height);
  assertLayers(s);
}
function outsideClearance(s,moving,layerGap) {
  const clearance=s.triangles.map(()=>[0,0,0]),contacts=[],placed=[];
  for(const i of moving) {
    const points=s.triangles[i].v.map(v=>s.vertices[v].p);
    for(let j=0;j<s.triangles.length;j++) {
      if(moving.has(j)) continue;
      const wall=s.triangles[j],ps=wall.v.map(v=>s.vertices[v].p),normal=unit(cross(sub(ps[1],ps[0]),sub(ps[2],ps[0])));
      if(!points.every(p=>Math.abs(dot(sub(p,ps[0]),normal))<VERTEX_EPS)) continue;
      const drop=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),project=p=>p.filter((_,c)=>c!==drop);
      if(overlapArea(points.map(project),ps.map(project))<=AREA_EPS) continue;
      const facing=dot(unit(cross(sub(points[1],points[0]),sub(points[2],points[0]))),normal);
      contacts.push({i,wall,normal,points,project,facing});break;
    }
  }
  // The outermost face presents its back outward, like the wall. Sorting by
  // facing keeps the packet order independent of incidental triangulation order.
  contacts.sort((a,b)=>a.facing-b.facing||a.i-b.i);
  for(const contact of contacts) {
    const {i,wall,normal,points,project}=contact;
    const gaps=placed.filter(c=>dot(c.normal,normal)>1-VERTEX_EPS&&
      Math.abs(dot(sub(c.points[0],points[0]),normal))<VERTEX_EPS&&
      overlapArea(c.points.map(project),points.map(project))>AREA_EPS)
      .map(c=>-dot(sub(s.triangles[c.i].offset,wall.offset),normal));
    const target=add(wall.offset,mul(normal,-(Math.max(0,...gaps)+layerGap)));
    clearance[i]=sub(target,s.triangles[i].offset);s.triangles[i].offset=target;placed.push(contact);
  }
  return clearance;
}
export function applyOp(s,op,layerGap) {
  const type=op.type??op.op;
  // Unit-gap layer positions retain fold sidedness even when layerGap is zero.
  for(const t of s.triangles) t.layerOrder??=[0,t.rank,0];
  let origin,axis,angle=0,moving=new Set(),movingVertices=new Set(),line;
  if(type==='mechanism') {
    const before=cloneSheet(s),mechanism=prepareMechanismOp(before,op,layerGap);
    for(const f of [.25,.5,.75,1]) {
      const pose=sheetMechanismPose(before,mechanism,f);
      pose.p.forEach((p,i)=>{if(distance(p,before.vertices[i].p)>VERTEX_EPS) movingVertices.add(i);});
      if(f===1) {
        s.vertices.forEach((v,i)=>{v.p=pose.p[i];});
        s.triangles.forEach((t,i)=>{t.offset=pose.offsets[i];if(mechanism.ranks)t.rank=mechanism.ranks[i];
          t.layerOrder=mechanism.ranks?[0,t.rank,0]:t.layerOrder.reduce((sum,x,k)=>add(sum,mul(pose.poses[mechanism.faces[i]].r[k],x)),[0,0,0]);});
      }
    }
    moving=new Set(s.triangles.flatMap((_,i)=>mechanism.faces[i]===mechanism.path.core.pin?[]:[i]));
    s.flat=mechanism.flat;
    return {type,op,before,after:cloneSheet(s),mechanism,moving,movingVertices,angle:0};
  }
  if(type==='drive') {
    const before=cloneSheet(s),drive=prepareDrive(before,op);
    const materialArea=before.triangles.reduce((a,t)=>a+signedArea(t.v.map(v=>before.vertices[v].uv)),0);
    movingVertices=new Set();
    for(const f of [.25,.5,.75,1]) {
      const pose=drivePose(before,drive,f);
      pose.p.forEach((p,i)=>{if(distance(p,before.vertices[i].p)>VERTEX_EPS) movingVertices.add(i);});
      assertGeometry({...before,vertices:before.vertices.map((v,i)=>({...v,p:pose.p[i]}))},materialArea);
      if(f===1) {
        s.vertices.forEach((v,i)=>{v.p=pose.p[i];});
        s.triangles.forEach((t,i)=>{
          t.offset=pose.offsets[i];
          t.layerOrder=rotateFaceVector(before.triangles[i].layerOrder,
            t.v.map(v=>before.vertices[v].p),t.v.map(v=>pose.p[v]));
        });
      }
    }
    s.flat=false;
    s.triangles.forEach((t,i)=>{
      if(!drive.fixed.has(i)&&op.tagMoved) for(const tag of Array.isArray(op.tagMoved)?op.tagMoved:[op.tagMoved])
        if(!t.tags.includes(tag)) t.tags.push(tag);
    });
    moving=new Set(s.triangles.flatMap((_,i)=>drive.fixed.has(i)?[]:[i]));
    return {type,op,before,after:cloneSheet(s),drive,moving,movingVertices,angle:0};
  }
  if(type==='fold'||type==='crease') {
    if(!s.flat) fail('Flat fold after a non-flat hinge','NOT_FLAT');
    if(op.mode!=='valley'&&op.mode!=='mountain') fail('Fold needs valley or mountain mode','INVALID_MODE');
    line=resolveLine(s,op.line);
    const p=point(s,op.moving),side=cross2(line.d,sub([p[0],p[2]],line.o));
    if(Math.abs(side)<VERTEX_EPS) fail('Moving point lies on the fold axis','MOVING_ON_AXIS');
    splitLine(s,line.o,line.d);
    s.triangles.forEach((t,i)=>{
      const center=t.v.map(v=>s.vertices[v].p).reduce((a,b)=>add(a,b),[0,0,0]).map(v=>v/3);
      if(selected(t,op.select)&&side*cross2(line.d,sub([center[0],center[2]],line.o))>VERTEX_EPS**2) moving.add(i);
    });
    origin=[line.o[0],0,line.o[1]];axis=[line.d[0],0,line.d[1]];
    // Positive Rodrigues rotation raises the side with negative 2D cross product.
    angle=(op.mode==='valley'?-Math.sign(side):Math.sign(side))*Math.PI;
    rememberLine(s,line,op.select);
  } else if(type==='hinge') {
    if(!Number.isFinite(op.degrees)) fail('Hinge needs finite degrees','INVALID_ANGLE');
    const a=point(s,op.axis?.through?.[0]),b=point(s,op.axis?.through?.[1]);
    if(distance(a,b)<VERTEX_EPS) fail('Degenerate hinge axis','INVALID_LINE');
    origin=a;axis=unit(sub(b,a));angle=op.degrees*Math.PI/180;
    s.triangles.forEach((t,i)=>{if(selected(t,op.select)) moving.add(i);});
  } else if(type==='turn') {
    if(!s.flat) fail('Turn requires a flat pose','NOT_FLAT');
    if(!['vertical','horizontal'].includes(op.axis)) fail('Unknown turn axis','INVALID_LINE');
    origin=boundsOf(s.vertices.map(v=>v.p)).center;
    axis=op.axis==='vertical'?[0,0,1]:[1,0,0];angle=Math.PI;
    s.triangles.forEach((_,i)=>moving.add(i));
  } else if(type==='tag') {
    const rect=op.rect;
    if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite)||rect[0]>rect[2]||rect[1]>rect[3]||
      !Array.isArray(op.add)||!op.add.every(t=>typeof t==='string')) fail('Invalid tag rectangle or tags','INVALID_TAG');
    for(const t of s.triangles) {
      const uv=t.v.map(i=>s.vertices[i].uv).reduce((a,b)=>add(a,b),[0,0]).map(v=>v/3);
      if(uv[0]>=rect[0]-VERTEX_EPS&&uv[0]<=rect[2]+VERTEX_EPS&&uv[1]>=rect[1]-VERTEX_EPS&&uv[1]<=rect[3]+VERTEX_EPS)
        for(const tag of op.add) if(!t.tags.includes(tag)) t.tags.push(tag);
    }
    return {type,op,before:cloneSheet(s),after:cloneSheet(s),moving,movingVertices,angle:0};
  } else if(type==='scribe') {
    if(op.split && !s.flat) fail('Scribe splitting requires a flat pose','NOT_FLAT');
    const cuts=[];
    for(const segment of op.segments??[]) {
      if(op.split) {
        const line=resolveLine(s,{through:segment});
        splitLine(s,line.o,line.d);
        cuts.push(line);
      }
      const refs=segment.map(ref=>{
        if(typeof ref==='string') { point(s,ref); return s.marks[ref].slice(); }
        const p=point(s,ref);
        for(const t of s.triangles) {
          const ps=t.v.map(i=>s.vertices[i].p);
          // Scribe is planar; barycentric lookup is in world x,z.
          const den=cross2(sub([ps[1][0],ps[1][2]],[ps[0][0],ps[0][2]]),sub([ps[2][0],ps[2][2]],[ps[0][0],ps[0][2]]));
          if(Math.abs(den)<DEGENERATE_AREA_EPS) continue;
          const v=cross2(sub([p[0],p[2]],[ps[0][0],ps[0][2]]),sub([ps[2][0],ps[2][2]],[ps[0][0],ps[0][2]]))/den;
          const w=cross2(sub([ps[1][0],ps[1][2]],[ps[0][0],ps[0][2]]),sub([p[0],p[2]],[ps[0][0],ps[0][2]]))/den;
          if(Math.min(1-v-w,v,w)>=-VERTEX_EPS) return t.v.map(i=>s.vertices[i].uv).reduce((a,b,j)=>add(a,mul(b,[1-v-w,v,w][j])),[0,0]);
        }
        fail('Scribe point outside paper','INVALID_POINT');
      });
      s.creases.push(refs);
    }
    if(op.split) simplifyFlat(s,cuts);
    return {type,before:cloneSheet(s),after:cloneSheet(s),moving,movingVertices,angle:0};
  } else fail(`Unknown operation: ${type}`,'INVALID_OP');
  if(!moving.size) fail('No faces selected on the moving side','EMPTY_SELECTION');
  movingVertices=assertHinge(s,moving,origin,axis);
  const before=cloneSheet(s);
  for(const i of movingVertices) s.vertices[i].p=rotate(s.vertices[i].p,origin,axis,angle);
  if(type==='fold'||type==='crease') {
    orderStack(s,moving,op.stack??'auto',op.mode);
    s.triangles.forEach(t=>{t.offset=[0,t.rank*layerGap,0];t.layerOrder=[0,t.rank,0];});
  } else {
    for(const i of moving) {
      s.triangles[i].offset=rotate(s.triangles[i].offset,[0,0,0],axis,angle);
      s.triangles[i].layerOrder=rotate(s.triangles[i].layerOrder,[0,0,0],axis,angle);
    }
    if(type==='turn') s.triangles.forEach(t=>{t.rank=-t.rank;});
    if(type==='hinge') s.flat=false;
  }
  // Opt-in display stacking for a flap contacting the outside (back) of a wall.
  // Material vertices remain exact; only face offsets acquire layer clearance.
  const clearance=type==='hinge'&&op.stack==='outside'?outsideClearance(s,moving,layerGap):null;
  const folded=cloneSheet(s);
  if(type==='crease') {
    s.vertices.forEach((v,i)=>{v.p=before.vertices[i].p.slice();});
    s.triangles.forEach((t,i)=>{t.rank=before.triangles[i].rank;t.offset=before.triangles[i].offset.slice();t.layerOrder=before.triangles[i].layerOrder.slice();});
  }
  s.triangles.forEach((t,i)=>{
    const tag=moving.has(i)?op.tagMoved:op.tagStationary;
    if(tag) for(const v of Array.isArray(tag)?tag:[tag]) if(!t.tags.includes(v)) t.tags.push(v);
  });
  return {type,op,before,after:cloneSheet(s),folded,moving,movingVertices,origin,axis,angle,line,clearance};
}
