// Sheet adapter: crease segments are in material UV coordinates. All cuts must
// already exist (scribe split:true); undeclared edges belong to rigid clusters.
import {VERTEX_EPS,AREA_EPS,add,sub,mul,dot,cross,norm,unit,distance,cross2,barycentric,signedArea,lerp} from './math.js';
import {selected} from './sheet.js';
import {FoldError} from './error.js';
import {buildMechanism,mechanismPoint} from './mechanism.js';
import {assertLayers} from './stack.js';
const fail=(message,code='INVALID_MECHANISM')=>{throw new FoldError(message,{code});};
const centroid=ps=>ps.reduce((s,p)=>add(s,mul(p,1/ps.length)),ps[0].map(()=>0));
function clip(a,b) {
  let poly=a.map(p=>p.slice());const sign=Math.sign(signedArea(b));
  for(let i=0;i<3&&poly.length;i++) {
    const o=b[i],d=sub(b[(i+1)%3],o),out=[];
    for(let j=0;j<poly.length;j++) {
      const p=poly[j],q=poly[(j+1)%poly.length],sp=sign*cross2(d,sub(p,o)),sq=sign*cross2(d,sub(q,o));
      if(sp>=0) out.push(p);
      if(sp*sq<0) out.push(lerp(p,q,sp/(sp-sq)));
    }
    poly=out;
  }
  return poly;
}
export function trianglesPenetrate(a,b) {
  const normal=t=>unit(cross(sub(t[1],t[0]),sub(t[2],t[0]))),na=normal(a),nb=normal(b),line=cross(na,nb);
  if(norm(line)<1e-12) return false;
  const da=a.map(p=>dot(sub(p,b[0]),nb)),db=b.map(p=>dot(sub(p,a[0]),na));
  const straddles=d=>Math.min(...d)<-1e-10&&Math.max(...d)>1e-10;
  if(!straddles(da)||!straddles(db)) return false;
  const direction=unit(line),interval=(t,d)=>{
    const slice=[];
    t.forEach((p,i)=>{
      const j=(i+1)%3;
      if(Math.abs(d[i])<1e-10) slice.push(dot(p,direction));
      if(d[i]*d[j]<0) slice.push(dot(lerp(p,t[j],d[i]/(d[i]-d[j])),direction));
    });
    return [Math.min(...slice),Math.max(...slice)];
  };
  const x=interval(a,da),y=interval(b,db);
  return Math.min(x[1],y[1])-Math.max(x[0],y[0])>1e-9;
}
export function assertMechanismPath(s,motion) {
  let previous=null;
  for(let k=0;k<=motion.path.samples;k++) {
    const progress=k/motion.path.samples,pose=sheetMechanismPose(s,motion,progress);
    if(previous) pose.angles.forEach((a,i)=>{
      if((a-previous[i])*Math.sign(motion.path.core.goals[i])<-1e-8)
        fail('Mechanism reverses its declared branch','MECHANISM_BRANCH');
    });
    previous=pose.angles;
    if(pose.p.every(p=>Math.abs(p[1])<VERTEX_EPS)) assertLayers({...s,flat:true,
      vertices:s.vertices.map((v,i)=>({...v,p:pose.p[i]})),triangles:s.triangles.map((t,i)=>({...t,
        rank:motion.ranks?t.rank+(motion.ranks[i]-t.rank)*progress:t.rank}))});
    for(let i=0;i<s.triangles.length;i++) for(let j=i+1;j<s.triangles.length;j++) {
      if(motion.faces[i]===motion.faces[j]||s.triangles[i].v.filter(v=>s.triangles[j].v.includes(v)).length>=2) continue;
      if(trianglesPenetrate(s.triangles[i].v.map(v=>pose.p[v]),s.triangles[j].v.map(v=>pose.p[v])))
        fail('Mechanism path penetrates another face','MECHANISM_PENETRATION');
    }
  }
}
function endpointRanks(s,motion,end) {
  const near=sheetMechanismPose(s,motion,1-1e-4),edges=[],groups=motion.path.core.clusters.map((_,i)=>i);
  for(let i=0;i<s.triangles.length;i++) for(let j=i+1;j<s.triangles.length;j++) {
    const a=s.triangles[i],b=s.triangles[j],ci=motion.faces[i],cj=motion.faces[j];
    const pa=a.v.map(v=>[end.p[v][0],end.p[v][2]]),pb=b.v.map(v=>[end.p[v][0],end.p[v][2]]),poly=clip(pa,pb);
    if(poly.length<3||Math.abs(signedArea(poly))<=AREA_EPS) continue;
    if(ci===cj) fail('A rigid cluster contains overlapping layers','MECHANISM_LAYER_AMBIGUOUS');
    const uv=centroid(poly),wa=barycentric(uv,...pa),wb=barycentric(uv,...pb);
    const ha=wa.reduce((sum,w,k)=>sum+w*near.p[a.v[k]][1],0),hb=wb.reduce((sum,w,k)=>sum+w*near.p[b.v[k]][1],0);
    if(Math.abs(ha-hb)<1e-10) fail('Endpoint layer order is ambiguous','MECHANISM_LAYER_AMBIGUOUS');
    edges.push(ha<hb?[ci,cj]:[cj,ci]);
  }
  const order=[];
  while(order.length<groups.length) {
    const next=groups.find(i=>!order.includes(i)&&!edges.some(([a,b])=>b===i&&!order.includes(a)));
    if(next===undefined) fail('Endpoint layer order contains a cycle','MECHANISM_PENETRATION');
    order.push(next);
  }
  return motion.faces.map(c=>order.indexOf(c));
}
export function mechanismGraph(s,op) {
  if(!Array.isArray(op.hinges)||!op.hinges.length||!op.pin) fail('Mechanism needs hinges and a pin selection');
  if(op.relaxed) fail('Relaxed mechanisms are not implemented','MECHANISM_RELAXED');
  const declarations=op.hinges.map(h=>{
    const refs=h?.line?.through;
    if(!Array.isArray(refs)||refs.length!==2||!Number.isFinite(h.degrees)||Math.abs(h.degrees)>180)
      fail('Mechanism needs finite UV segments and signed endpoint degrees');
    const edge=refs.map(ref=>typeof ref==='string'?s.marks[ref]:ref);
    if(edge.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||distance(...edge)<VERTEX_EPS)
      fail('Invalid mechanism UV segment');
    return {...h,edge,found:0};
  });
  const parent=s.triangles.map((_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i])),edges=new Map(),joints=[];
  s.triangles.forEach((t,i)=>t.v.forEach((a,k)=>{
    const b=t.v[(k+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');
    if(!edges.has(key)) edges.set(key,[]);edges.get(key).push(i);
  }));
  for(const [key,faces] of edges) {
    if(faces.length!==2) continue;
    const ids=key.split(':').map(Number),uv=ids.map(v=>s.vertices[v].uv);
    const matching=declarations.filter(h=>{
      const d=sub(h.edge[1],h.edge[0]),length=norm(d);
      return faces.every(i=>selected(s.triangles[i],h.select))&&uv.every(p=>
        Math.abs(cross2(d,sub(p,h.edge[0])))/length<VERTEX_EPS&&dot(sub(p,h.edge[0]),d)>=-VERTEX_EPS&&
        dot(sub(p,h.edge[1]),d)<=VERTEX_EPS);
    });
    if(matching.length>1) fail('Mechanism hinge segments overlap');
    if(!matching.length) {parent[root(faces[1])]=root(faces[0]);continue;}
    const h=matching[0];h.found++;
    const side=i=>cross2(sub(h.edge[1],h.edge[0]),sub(centroid(s.triangles[i].v.map(v=>s.vertices[v].uv)),h.edge[0]));
    const [a,b]=side(faces[0])<0?faces:[faces[1],faces[0]];
    const v=dot(sub(uv[1],uv[0]),sub(h.edge[1],h.edge[0]))>0?ids:ids.slice().reverse();
    joints.push({a,b,v,h});
  }
  if(declarations.some(h=>!h.found)) fail('Scribe and split every mechanism hinge before use');
  const roots=[...new Set(parent.map((_,i)=>root(i)))],faces=parent.map((_,i)=>roots.indexOf(root(i)));
  const clusters=roots.map((r,i)=>({points:[...new Set(s.triangles.flatMap((t,j)=>faces[j]===i?t.v:[]))].map(v=>s.vertices[v].p)}));
  const pins=[...new Set(s.triangles.flatMap((t,i)=>selected(t,op.pin)?[faces[i]]:[]))];
  if(pins.length!==1) fail('Pin must select exactly one rigid cluster');
  const normal=i=>{
    const p=s.triangles[i].v.map(v=>s.vertices[v].p);return unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));
  };
  const merged=new Map();
  for(const joint of joints) {
    const {a,b,h}=joint,key=`${faces[a]}:${faces[b]}:${declarations.indexOf(h)}`;
    if(!merged.has(key)) merged.set(key,{...joint,v:[]});
    merged.get(key).v.push(...joint.v);
  }
  const hinges=[...merged.values()].map(({a,b,v,h})=>{
    if(faces[a]===faces[b]) fail('Declared hinge is locked inside a rigid cluster','MECHANISM_INFEASIBLE');
    const direction=sub(h.edge[1],h.edge[0]);
    v=[...new Set(v)].sort((a,b)=>dot(sub(s.vertices[a].uv,s.vertices[b].uv),direction));
    const edge=[v[0],v.at(-1)].map(v=>s.vertices[v].p),axis=unit(sub(edge[1],edge[0])),na=normal(a),nb=normal(b);
    let start=Math.atan2(dot(axis,cross(na,nb)),dot(na,nb))*180/Math.PI;
    if(Math.abs(Math.abs(start)-180)<1e-7) start=180*Math.sign((s.triangles[b].rank-s.triangles[a].rank)*na[1]);
    return {a:faces[a],b:faces[b],edge,degrees:h.degrees-start,assignment:h.degrees,uvEdge:[v[0],v.at(-1)].map(v=>s.vertices[v].uv)};
  });
  return {input:{clusters,hinges,pin:pins[0]},faces};
}
export function prepareMechanismOp(s,op,layerGap) {
  const {input,faces}=mechanismGraph(s,op),path=buildMechanism(input),motion={path,faces,layerGap};
  motion.clusterVertices=path.core.clusters.map((_,c)=>[...new Set(s.triangles.flatMap((t,i)=>faces[i]===c?t.v:[]))]);
  motion.vertices=s.vertices.map((_,v)=>faces[s.triangles.findIndex(t=>t.v.includes(v))]);
  const end=sheetMechanismPose(s,motion,1);
  motion.flat=end.p.every(p=>Math.abs(p[1])<VERTEX_EPS);
  if(motion.flat) {
    motion.ranks=endpointRanks(s,motion,end);
    const fixed=s.triangles.findIndex((_,i)=>motion.faces[i]===motion.path.core.pin);
    const shift=s.triangles[fixed].rank-motion.ranks[fixed];
    motion.ranks=motion.ranks.map(rank=>rank+shift);
    assertLayers({...s,flat:true,vertices:s.vertices.map((v,i)=>({...v,p:end.p[i]})),
      triangles:s.triangles.map((t,i)=>({...t,rank:motion.ranks[i]}))});
  }
  assertMechanismPath(s,motion);
  return motion;
}
export function sheetMechanismPose(s,motion,t) {
  const pose=motion.path.at(t,{points:false}),p=s.vertices.map((v,i)=>mechanismPoint(pose.poses[motion.vertices[i]],v.p));
  const offsets=s.triangles.map((tri,i)=>{
    const transform=pose.poses[motion.faces[i]],rotated=tri.offset.reduce((sum,x,k)=>add(sum,mul(transform.r[k],x)),[0,0,0]);
    return motion.ranks?lerp(rotated,[0,motion.ranks[i]*motion.layerGap,0],t):rotated;
  });
  return {...pose,p,offsets};
}
