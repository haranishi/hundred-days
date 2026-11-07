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
  // Topological exclusions do not depend on the sampled pose.
  const pairs=[];
  for(let i=0;i<s.triangles.length;i++) for(let j=i+1;j<s.triangles.length;j++) {
    if(motion.faces[i]===motion.faces[j]||s.triangles[i].v.filter(v=>s.triangles[j].v.includes(v)).length>=2) continue;
    pairs.push([i,j]);
  }
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
    const triangles=s.triangles.map(tri=>tri.v.map(v=>pose.p[v]));
    const boxes=triangles.map(points=>({min:[0,1,2].map(c=>Math.min(...points.map(p=>p[c]))),
      max:[0,1,2].map(c=>Math.max(...points.map(p=>p[c])))}));
    for(const [i,j] of pairs) {
      // A proper interior crossing must overlap on every world axis. Padding
      // keeps boundary roundoff in the existing narrow-phase predicate.
      if([0,1,2].some(c=>boxes[i].max[c]<boxes[j].min[c]-VERTEX_EPS||boxes[j].max[c]<boxes[i].min[c]-VERTEX_EPS)) continue;
      if(trianglesPenetrate(triangles[i],triangles[j]))
        fail('Mechanism path penetrates another face','MECHANISM_PENETRATION');
    }
  }
}
function endpointRanks(s,motion,end) {
  const near=sheetMechanismPose(s,motion,1-1e-4),edges=[],groups=[];
  // A locked fold may bind several existing layers into one rigid bundle.
  // Keep those layers separate in the order graph, even though they share a pose.
  const faces=s.triangles.map((t,i)=>{
    const cluster=motion.faces[i];let id=groups.findIndex(g=>g.cluster===cluster&&g.rank===t.rank);
    if(id<0) {id=groups.length;groups.push({cluster,rank:t.rank});}return id;
  });
  for(let i=0;i<s.triangles.length;i++) for(let j=i+1;j<s.triangles.length;j++) {
    const a=s.triangles[i],b=s.triangles[j],ci=motion.faces[i],cj=motion.faces[j];
    const pa=a.v.map(v=>[end.p[v][0],end.p[v][2]]),pb=b.v.map(v=>[end.p[v][0],end.p[v][2]]),poly=clip(pa,pb);
    if(poly.length<3||Math.abs(signedArea(poly))<=AREA_EPS) continue;
    const uv=centroid(poly),wa=barycentric(uv,...pa),wb=barycentric(uv,...pb);
    const ha=wa.reduce((sum,w,k)=>sum+w*near.p[a.v[k]][1],0),hb=wb.reduce((sum,w,k)=>sum+w*near.p[b.v[k]][1],0);
    let height=ha-hb;
    if(ci===cj) height=motion.layerGap>0?(near.offsets[i][1]-near.offsets[j][1])/motion.layerGap:
      (a.rank-b.rank)*near.poses[ci].r[1][1];
    if(faces[i]===faces[j]||Math.abs(height)<1e-10) fail('Endpoint layer order is ambiguous','MECHANISM_LAYER_AMBIGUOUS');
    edges.push(height<0?[faces[i],faces[j]]:[faces[j],faces[i]]);
  }
  const fixed=groups.flatMap((g,i)=>g.cluster===motion.path.core.pin?[i]:[]).sort((a,b)=>groups[a].rank-groups[b].rank);
  for(let i=1;i<fixed.length;i++) edges.push([fixed[i-1],fixed[i]]);
  const order=[];
  while(order.length<groups.length) {
    const next=groups.findIndex((_,i)=>!order.includes(i)&&!edges.some(([a,b])=>b===i&&!order.includes(a)));
    if(next<0) fail('Endpoint layer order contains a cycle','MECHANISM_PENETRATION');
    order.push(next);
  }
  const anchors=fixed.map(id=>({index:order.indexOf(id),rank:groups[id].rank}));
  const ranks=order.map((_,i)=>{
    const lower=anchors.filter(a=>a.index<=i).at(-1),upper=anchors.find(a=>a.index>=i);
    if(lower&&upper) return lower===upper?lower.rank:lower.rank+(upper.rank-lower.rank)*(i-lower.index)/(upper.index-lower.index);
    const anchor=lower??upper;return anchor.rank+i-anchor.index;
  });
  return faces.map(id=>ranks[order.indexOf(id)]);
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
    const edge=joint.v.map(v=>s.vertices[v].p),axis=unit(sub(edge[1],edge[0]));
    if(!merged.has(key)) merged.set(key,[]);
    const groups=merged.get(key);
    // A material line can reverse at a locked 180-degree fold (e.g. a brim).
    // Such pieces need separate angular constraints, even on the same axis.
    let group=groups.find(g=>dot(g.axis,axis)>1-1e-10&&norm(cross(sub(edge[0],g.origin),axis))<VERTEX_EPS);
    if(!group) {group={...joint,v:[],axis,origin:edge[0]};groups.push(group);}
    group.v.push(...joint.v);
  }
  const hinges=[...merged.values()].flat().map(({a,b,v,h})=>{
    if(faces[a]===faces[b]) fail('Declared hinge is locked inside a rigid cluster','MECHANISM_INFEASIBLE');
    const direction=sub(h.edge[1],h.edge[0]);
    v=[...new Set(v)].sort((a,b)=>dot(sub(s.vertices[a].uv,s.vertices[b].uv),direction));
    const edge=[v[0],v.at(-1)].map(v=>s.vertices[v].p),axis=unit(sub(edge[1],edge[0])),na=normal(a),nb=normal(b);
    let start=Math.atan2(dot(axis,cross(na,nb)),dot(na,nb))*180/Math.PI;
    // At the antipodal singularity, material layer order chooses +pi or -pi.
    // Both vectors follow the face rotations; display thickness is irrelevant.
    if(Math.abs(Math.abs(start)-180)<1e-7) start=180*Math.sign(dot(sub(s.triangles[b].layerOrder,s.triangles[a].layerOrder),na));
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
