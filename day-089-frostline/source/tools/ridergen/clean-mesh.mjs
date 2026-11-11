// Collapse tiny marching-tetrahedron edges before Float32 export. The link
// condition prevents changing the topology of the welded garment surface.
export function cleanMesh(mesh,forced=new Set()){
 const parent=mesh.p.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;};
 for(let pass=0;pass<2;pass++){
  const neighbors=mesh.p.map(()=>new Set()),edges=new Set();
  for(const t of mesh.tri){const v=t.map(root);if(new Set(v).size<3)continue;for(let k=0;k<3;k++){const a=v[k],b=v[(k+1)%3];neighbors[a].add(b);neighbors[b].add(a);edges.add(Math.min(a,b)+':'+Math.max(a,b));}}
  for(const key of edges){const [a,b]=key.split(':').map(Number);if(root(a)!==a||root(b)!==b)continue;
   if(Math.hypot(...mesh.p[a].map((v,k)=>v-mesh.p[b][k]))>0.0025&&!forced.has(key))continue;
   const common=[...neighbors[a]].filter(i=>neighbors[b].has(i));if(common.length!==2)continue;
   parent[b]=a;
  }
 }
 const ids=new Map(),points=[],normals=[],attrs=[];
 for(let i=0;i<parent.length;i++)if(root(i)===i){ids.set(i,points.length);points.push(mesh.p[i]);normals.push(mesh.n[i]);attrs.push(mesh.a[i]);}
 mesh.tri=mesh.tri.map(t=>t.map(i=>ids.get(root(i)))).filter(t=>new Set(t).size===3);
 mesh.p=points;mesh.n=normals;mesh.a=attrs;
}
export function improveTriangles(mesh){
 const sub=(a,b)=>a.map((x,k)=>x-b[k]),dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const normal=t=>cross(sub(mesh.p[t[1]],mesh.p[t[0]]),sub(mesh.p[t[2]],mesh.p[t[0]]));
 const quality=t=>{const p=t.map(i=>mesh.p[i]),a=sub(p[1],p[0]),b=sub(p[2],p[1]),c=sub(p[0],p[2]);return Math.hypot(...cross(a,b))/(dot(a,a)+dot(b,b)+dot(c,c));};
 for(let pass=0;pass<4;pass++){
  const edges=new Map();mesh.tri.forEach((t,i)=>{for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push([i,a,b,t[(k+2)%3]]);}});
  const used=new Set();
  for(const list of edges.values())if(list.length===2){
   const [[i,a,b,c],[j,,,d]]=list;if(used.has(i)||used.has(j)||c===d||edges.has(Math.min(c,d)+':'+Math.max(c,d)))continue;
   const n=normal(mesh.tri[i]),m=normal(mesh.tri[j]);if(dot(n,m)<.95*Math.hypot(...n)*Math.hypot(...m))continue;
   const t0=[c,d,b],t1=[d,c,a];if(dot(normal(t0),n)<=0||dot(normal(t1),n)<=0)continue;
   if(Math.min(quality(t0),quality(t1))>Math.min(quality(mesh.tri[i]),quality(mesh.tri[j]))+.015){mesh.tri[i]=t0;mesh.tri[j]=t1;used.add(i);used.add(j);}
  }
 }
}
export function smoothNormals(mesh,passes=4){
 const adjacent=mesh.p.map(()=>new Set());for(const t of mesh.tri)for(const a of t)for(const b of t)if(a!==b)adjacent[a].add(b);
 for(let pass=0;pass<passes;pass++)mesh.n=mesh.n.map((normal,i)=>{
  const n=normal.slice();for(const j of adjacent[i])for(let k=0;k<3;k++)n[k]+=mesh.n[j][k]/adjacent[i].size;
  const length=Math.hypot(...n);return n.map(v=>v/length);
 });
}
