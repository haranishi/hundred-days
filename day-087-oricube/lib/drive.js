// Kinematic followers use material edge lengths, never previous frame state.
import {VERTEX_EPS,LENGTH_EPS,add,sub,mul,dot,cross,unit,norm,distance,rotate} from './math.js';
import {point,selected,cloneSheet} from './sheet.js';
import {FoldError} from './error.js';
const fail=(message,code='DRIVE_CONSTRAINT')=>{throw new FoldError(message,{code});};
const used=(s,faces)=>new Set([...faces].flatMap(i=>s.triangles[i].v));
export function prepareDrive(s,op) {
  if(!op.fixed||!Array.isArray(op.groups)||!op.groups.length) fail('Drive needs fixed faces and groups','INVALID_DRIVE');
  const fixed=new Set(s.triangles.flatMap((t,i)=>selected(t,op.fixed)?[i]:[]));
  if(!fixed.size) fail('Drive has no fixed faces','EMPTY_SELECTION');
  const fixedVertices=used(s,fixed),claimed=new Set(fixed);
  const groups=op.groups.map(group=>{
    if(!group.select||!Number.isFinite(group.degrees)) fail('Invalid drive group','INVALID_DRIVE');
    const origin=point(s,group.axis?.through?.[0]),end=point(s,group.axis?.through?.[1]);
    if(distance(origin,end)<VERTEX_EPS) fail('Degenerate drive axis','INVALID_LINE');
    const axis=unit(sub(end,origin)),moving=new Set();
    s.triangles.forEach((t,i)=>{
      if(!selected(t,group.select)) return;
      if(claimed.has(i)) fail('Drive selections overlap','DRIVE_SELECTION');
      moving.add(i);claimed.add(i);
    });
    if(!moving.size) fail('Drive group has no faces','EMPTY_SELECTION');
    const vertices=used(s,moving);
    for(const v of vertices) if(fixedVertices.has(v)&&norm(cross(sub(s.vertices[v].p,origin),axis))>VERTEX_EPS)
      fail('Drive group tears fixed paper away from its axis','HINGE_TEAR');
    return {type:'hinge',op:group,before:cloneSheet(s),origin,axis,angle:group.degrees*Math.PI/180,
      moving,movingVertices:new Set([...vertices].filter(v=>norm(cross(sub(s.vertices[v].p,origin),axis))>VERTEX_EPS)),vertices};
  });
  const neighbors=s.vertices.map(()=>new Set());
  for(const t of s.triangles) for(let k=0;k<3;k++) {
    const a=t.v[k],b=t.v[(k+1)%3];neighbors[a].add(b);neighbors[b].add(a);
  }
  return {fixed,fixedVertices,groups,neighbors,followers:new Set(s.triangles.flatMap((_,i)=>claimed.has(i)?[]:[i]))};
}
function trilaterate(start,centers,radii) {
  // Subtract the first sphere equation to obtain up to three linear planes.
  // Orthonormal elimination also handles the rank-one endpoint: coincident wall
  // tops leave a horizontal circle. The nearest point to start is its outward
  // diagonal point, the analytic limit of the starting-side branch.
  const a=centers[0],basis=[],values=[];
  const order=centers.map((p,i)=>i).slice(1).sort((i,j)=>distance(centers[j],a)-distance(centers[i],a));
  for(const i of order) {
    const delta=sub(centers[i],a);
    let v=delta.slice(),value=(radii[0]**2-radii[i]**2+dot(delta,delta))/2;
    for(let k=0;k<basis.length;k++) {
      const q=dot(v,basis[k]);v=sub(v,mul(basis[k],q));value-=q*values[k];
    }
    const length=norm(v);
    if(length<VERTEX_EPS) continue;
    basis.push(mul(v,1/length));values.push(value/length);
  }
  const center=basis.reduce((p,b,i)=>add(p,mul(b,values[i])),a.slice());
  const radius2=radii[0]**2-distance(center,a)**2;
  if(radius2 < -LENGTH_EPS) fail('Drive spheres do not intersect');
  let radial=sub(start,center);
  for(const b of basis) radial=sub(radial,mul(b,dot(radial,b)));
  // Tangency at the flat start can leave a tiny positive roundoff residual.
  const radius=radius2<1e-15?0:Math.sqrt(radius2);
  if(radius>VERTEX_EPS&&norm(radial)<VERTEX_EPS) fail('Drive branch is ambiguous');
  const p=radius>VERTEX_EPS?add(center,mul(unit(radial),radius)):center;
  if(centers.some((c,i)=>Math.abs(distance(p,c)-radii[i])>LENGTH_EPS)) fail('Drive edge distances disagree');
  return p;
}
export function rotateFaceVector(vector,before,after) {
  const basis=points=>{
    const x=unit(sub(points[1],points[0])),z=unit(cross(x,sub(points[2],points[0])));
    return [x,cross(z,x),z];
  };
  const a=basis(before),b=basis(after);
  return b.reduce((v,axis,i)=>add(v,mul(axis,dot(vector,a[i]))),[0,0,0]);
}
export function drivePose(s,drive,f) {
  const p=s.vertices.map(v=>v.p.slice()),offsets=s.triangles.map(t=>t.offset.slice());
  if(f===0) return {p,offsets};
  const known=new Set(drive.fixedVertices);
  for(const g of drive.groups) {
    for(const v of g.vertices) {
      const next=rotate(s.vertices[v].p,g.origin,g.axis,g.angle*f);
      if(known.has(v)&&distance(next,p[v])>VERTEX_EPS) fail('Drive groups disagree on a shared vertex','HINGE_TEAR');
      p[v]=next;known.add(v);
    }
    for(const i of g.moving) offsets[i]=rotate(s.triangles[i].offset,[0,0,0],g.axis,g.angle*f);
  }
  const pending=new Set(s.vertices.flatMap((_,i)=>known.has(i)?[]:[i]));
  while(pending.size) {
    let progress=false;
    for(const i of pending) {
      const adjacent=[...drive.neighbors[i]].filter(v=>known.has(v));
      if(adjacent.length<3) continue;
      p[i]=trilaterate(s.vertices[i].p,adjacent.map(v=>p[v]),adjacent.map(v=>distance(s.vertices[i].uv,s.vertices[v].uv)));
      known.add(i);pending.delete(i);progress=true;
    }
    if(!progress) fail('Follower needs at least three determined edge neighbors');
  }
  for(const i of drive.followers) {
    const t=s.triangles[i];
    offsets[i]=rotateFaceVector(t.offset,t.v.map(v=>s.vertices[v].p),t.v.map(v=>p[v]));
  }
  return {p,offsets};
}
