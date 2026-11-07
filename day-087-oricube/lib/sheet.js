// UV identity survives every fold. Welding in world space would join unrelated
// overlapping layers; elevation belongs to triangle offsets, never shared vertices.
import {VERTEX_EPS,DEGENERATE_AREA_EPS,barycentric,inTriangle,weighted,lerp,cross2,sub,signedArea} from './math.js';
export function createSheet(paper,marks={}) {
  const {width:w,height:h}=paper;
  if(!(w>0 && h>0 && Number.isFinite(w+h))) throw new Error('Invalid paper dimensions');
  if(!Number.isFinite(paper.rotationDeg??0)) throw new Error('Invalid paper rotation');
  const angle=(paper.rotationDeg??0)*Math.PI/180, c=Math.cos(angle), s=Math.sin(angle);
  const vertices=[[0,0],[w,0],[w,h],[0,h]].map(uv=>{
    const x=uv[0]-w/2,z=h/2-uv[1];
    return {uv,p:[c*x+s*z,0,-s*x+c*z]};
  });
  return {vertices,triangles:[[0,1,2],[0,2,3]].map(v=>({v,rank:0,tags:[],offset:[0,0,0]})),
    creases:[], flat:true, marks:{TL:[0,h],TR:[w,h],BL:[0,0],BR:[w,0],T:[w/2,h],B:[w/2,0],L:[0,h/2],R:[w,h/2],C:[w/2,h/2],...marks}};
}
export function cloneSheet(s) {
  return {...s,vertices:s.vertices.map(v=>({uv:v.uv.slice(),p:v.p.slice()})),
    triangles:s.triangles.map(t=>({...t,v:t.v.slice(),tags:t.tags.slice(),offset:t.offset.slice()})),
    creases:s.creases.map(e=>e.map(p=>p.slice()))};
}
export function locate(s,uv) {
  for(const tri of s.triangles) {
    const w=barycentric(uv,...tri.v.map(i=>s.vertices[i].uv));
    if(inTriangle(w)) return {tri,w};
  }
  throw new Error('Point outside paper');
}
// Build only for snapshots whose UV mesh will not be mutated. Cell lists retain
// source order, including edge ties and the barycentric weld tolerance.
export function makeLocator(s) {
  const size=Math.max(1,Math.min(32,Math.ceil(Math.sqrt(s.triangles.length))));
  const points=s.vertices.map(v=>v.uv),min=[0,1].map(c=>Math.min(...points.map(p=>p[c])));
  const span=[0,1].map(c=>Math.max(...points.map(p=>p[c]))-min[c]);
  const cell=(v,c)=>Math.max(0,Math.min(size-1,Math.floor((v-min[c])/span[c]*size)||0));
  const cells=Array.from({length:size*size},()=>[]);
  for(const tri of s.triangles) {
    const uv=tri.v.map(i=>s.vertices[i].uv);
    const low=[],high=[];
    for(let c=0;c<2;c++) {
      const pad=VERTEX_EPS*(Math.abs(uv[1][c]-uv[0][c])+Math.abs(uv[2][c]-uv[0][c]))+
        32*Number.EPSILON*Math.max(1,...uv.map(p=>Math.abs(p[c])));
      low[c]=cell(Math.min(...uv.map(p=>p[c]))-pad,c);
      high[c]=cell(Math.max(...uv.map(p=>p[c]))+pad,c);
    }
    const entry={tri,uv};
    for(let y=low[1];y<=high[1];y++) for(let x=low[0];x<=high[0];x++) cells[y*size+x].push(entry);
  }
  return uv=>{
    for(const {tri,uv:points} of cells[cell(uv[1],1)*size+cell(uv[0],0)]) {
      const w=barycentric(uv,...points);
      if(inTriangle(w)) return {tri,w};
    }
    throw new Error('Point outside paper');
  };
}
export function paperPoint(s,uv) {
  const {tri,w}=locate(s,uv);
  return weighted(tri.v.map(i=>s.vertices[i].p),w);
}
export function point(s,ref) {
  if(typeof ref==='string') {
    if(!s.marks[ref]) throw new Error(`Unknown mark: ${ref}`);
    return paperPoint(s,s.marks[ref]);
  }
  if(!Array.isArray(ref) || ref.length!==2 || !ref.every(Number.isFinite)) throw new Error('Expected mark or [x,z]');
  return [ref[0],0,ref[1]];
}
export const selected = (t,select) => !select ||
  ((select.tags??[]).every(tag=>t.tags.includes(tag)) && (select.notTags??[]).every(tag=>!t.tags.includes(tag)));
export function splitLine(s,o,d) {
  const side=p=>cross2(d,sub([p[0],p[2]],o));
  const vertex=(a,b,t)=>{
    const uv=lerp(s.vertices[a].uv,s.vertices[b].uv,t);
    let i=s.vertices.findIndex(v=>Math.hypot(...sub(v.uv,uv))<=VERTEX_EPS);
    if(i<0) { i=s.vertices.length; s.vertices.push({uv,p:lerp(s.vertices[a].p,s.vertices[b].p,t)}); }
    return i;
  };
  const triangles=[];
  for(const tri of s.triangles) {
    const values=tri.v.map(i=>side(s.vertices[i].p));
    if(!values.some(v=>v>VERTEX_EPS)||!values.some(v=>v<-VERTEX_EPS)) { triangles.push(tri); continue; }
    for(const sign of [1,-1]) {
      const poly=[];
      for(let k=0;k<3;k++) {
        const a=tri.v[k],b=tri.v[(k+1)%3],sa=values[k],sb=values[(k+1)%3];
        if(sign*sa>=-VERTEX_EPS) poly.push(a);
        if((sa>VERTEX_EPS && sb<-VERTEX_EPS)||(sa<-VERTEX_EPS && sb>VERTEX_EPS)) poly.push(vertex(a,b,sa/(sa-sb)));
      }
      const clean=poly.filter((v,i)=>i===0||v!==poly[i-1]);
      if(clean[0]===clean.at(-1)) clean.pop();
      for(let k=1;k<clean.length-1;k++) {
        const v=[clean[0],clean[k],clean[k+1]];
        if(Math.abs(signedArea(v.map(i=>s.vertices[i].uv)))>DEGENERATE_AREA_EPS) triangles.push({...tri,v,tags:tri.tags.slice(),offset:tri.offset.slice()});
      }
    }
  }
  s.triangles=triangles;
}

// Dissolve incidental triangulation diagonals, retaining every crease and cut.
// Keep junctions on both sides of an edge so the mesh remains shared, with no
// hanging vertices along a hinge.
export function simplifyFlat(s,cuts) {
  const edges=new Map(),parent=s.triangles.map((_,i)=>i);
  const root=i=>{while(parent[i]!==i)i=parent[i];return i;};
  s.triangles.forEach((t,i)=>t.v.forEach((a,k)=>{
    const b=t.v[(k+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');
    if(!edges.has(key)) edges.set(key,[]);
    edges.get(key).push(i);
  }));
  const lines=s.creases;
  for(const [key,faces] of edges) {
    if(faces.length!==2) continue;
    const uv=key.split(':').map(i=>s.vertices[i].uv);
    const protectedEdge=lines.some(([a,b])=>uv.every(p=>Math.abs(cross2(sub(b,a),sub(p,a)))<VERTEX_EPS))||
      cuts.some(({o,d})=>key.split(':').every(i=>{
        const p=s.vertices[i].p;return Math.abs(cross2(d,sub([p[0],p[2]],o)))<VERTEX_EPS;
      }));
    const [a,b]=faces.map(i=>s.triangles[i]);
    if(!protectedEdge&&a.rank===b.rank&&JSON.stringify(a.tags)===JSON.stringify(b.tags)&&
      a.offset.every((v,i)=>v===b.offset[i])) parent[root(faces[1])]=root(faces[0]);
  }
  const regions=new Map();
  s.triangles.forEach((t,i)=>{
    const id=root(i);
    if(!regions.has(id)) regions.set(id,{tri:t,boundary:[],original:[]});
    regions.get(id).original.push(t);
    t.v.forEach((a,k)=>{
      const b=t.v[(k+1)%3],faces=edges.get([a,b].sort((x,y)=>x-y).join(':'));
      if(faces.length===1||faces.some(j=>root(j)!==id)) regions.get(id).boundary.push([a,b]);
    });
  });
  const polygons=[...regions.values()].map(({tri,boundary,original})=>{
    const next=new Map(boundary),poly=[boundary[0][0]];
    if(next.size!==boundary.length) return {tri,poly:boundary.flat(),original};
    while(next.get(poly.at(-1))!==poly[0]) {
      poly.push(next.get(poly.at(-1)));
      if(poly.length>boundary.length) throw new Error('Non-convex scribe arrangement');
    }
    return poly.length===boundary.length?{tri,poly,original:null}:{tri,poly:boundary.flat(),original};
  });
  const corner=(poly,k)=>Math.abs(cross2(sub(s.vertices[poly[k]].uv,s.vertices[poly[(k+poly.length-1)%poly.length]].uv),
    sub(s.vertices[poly[(k+1)%poly.length]].uv,s.vertices[poly[k]].uv)))>VERTEX_EPS;
  const junctions=new Set(polygons.flatMap(({poly,original})=>original?poly:poly.filter((_,k)=>corner(poly,k))));
  s.triangles=[];
  for(const {tri,poly,original} of polygons) {
    if(original) { s.triangles.push(...original);continue; }
    const remaining=poly.filter(v=>junctions.has(v));
    // Ear clipping also retains collinear boundary junctions, unlike a fan.
    while(remaining.length>3) {
      const k=remaining.findIndex((id,k)=>{
        const a=remaining[(k+remaining.length-1)%remaining.length],c=remaining[(k+1)%remaining.length];
        const uv=[a,id,c].map(i=>s.vertices[i].uv);
        return signedArea(uv)>DEGENERATE_AREA_EPS&&!remaining.some(v=>v!==a&&v!==id&&v!==c&&
          inTriangle(barycentric(s.vertices[v].uv,...uv)));
      });
      if(k<0) throw new Error('Cannot triangulate scribe arrangement');
      const a=remaining[(k+remaining.length-1)%remaining.length],b=remaining[k],c=remaining[(k+1)%remaining.length];
      s.triangles.push({...tri,v:[a,b,c],tags:tri.tags.slice(),offset:tri.offset.slice()});
      remaining.splice(k,1);
    }
    if(Math.abs(signedArea(remaining.map(v=>s.vertices[v].uv)))>DEGENERATE_AREA_EPS)
      s.triangles.push({...tri,v:remaining,tags:tri.tags.slice(),offset:tri.offset.slice()});
  }
  const used=[...new Set(s.triangles.flatMap(t=>t.v))].sort((a,b)=>a-b),ids=new Map(used.map((id,i)=>[id,i]));
  s.vertices=used.map(i=>s.vertices[i]);
  s.triangles.forEach(t=>{t.v=t.v.map(v=>ids.get(v));});
}
