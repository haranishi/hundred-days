// Signed implicit fields and conforming marching tetrahedra. Edges are shared by
// lattice endpoint IDs, including the consistent face diagonals of adjacent cubes.
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/(n||1));};
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function ellipsoid(p,c,r) {const q=p.map((v,i)=>(v-c[i])/r[i]);return (Math.hypot(...q)-1)*Math.min(...r);}
export function capsule(p,a,b,r0,r1=r0) {
 const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/dot(d,d))),q=mix(a,b,t);
 return Math.hypot(...sub(p,q))-(r0+(r1-r0)*t);
}
export function smooth(a,b,k=.045){const h=Math.max(0,Math.min(1,.5+.5*(b-a)/k));return b+(a-b)*h-k*h*(1-h);}
export function gradient(field,p){const e=.00015;return unit([0,1,2].map(i=>{const a=p.slice(),b=p.slice();a[i]+=e;b[i]-=e;return field(a)-field(b);}));}
export function march(field,bounds,step,mesh,attribute) {
 const lo=bounds[0],hi=bounds[1],n=lo.map((x,i)=>Math.ceil((hi[i]-x)/step)+1),ny=n[1],nz=n[2];
 const pos=[],val=new Float64Array(n[0]*ny*nz);
 for(let x=0;x<n[0];x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++){
   const id=(x*ny+y)*nz+z,p=lo.map((v,i)=>v+[x,y,z][i]*step);pos[id]=p;val[id]=field(p);
 }
 const cache=new Map(),tet=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
 function vertex(a,b){const key=Math.min(a,b)+':'+Math.max(a,b);if(cache.has(key))return cache.get(key);
   const p=mix(pos[a],pos[b],val[a]/(val[a]-val[b])),id=mesh.p.length;mesh.p.push(p);mesh.n.push(gradient(field,p));mesh.a.push(attribute(p));cache.set(key,id);return id;}
 function face(a,b,c,direction){const p=mesh.p,n=cross(sub(p[b],p[a]),sub(p[c],p[a]));if(Math.hypot(...n)<1e-12)throw Error('degenerate SDF triangle');
   mesh.tri.push(dot(n,direction)>0?[a,b,c]:[a,c,b]);}
 for(let x=0;x<n[0]-1;x++)for(let y=0;y<ny-1;y++)for(let z=0;z<nz-1;z++){
  const c=[];for(let dx=0;dx<2;dx++)for(let dy=0;dy<2;dy++)for(let dz=0;dz<2;dz++)c.push(((x+dx)*ny+y+dy)*nz+z+dz);
  for(const t of tet){const a=t.map(i=>c[i]),inside=a.filter(i=>val[i]<0),outside=a.filter(i=>val[i]>=0);
   if(!inside.length||!outside.length)continue;
   const average=ids=>[0,1,2].map(k=>ids.reduce((sum,i)=>sum+pos[i][k],0)/ids.length),direction=sub(average(outside),average(inside));
   if(inside.length===1||outside.length===1){const one=inside.length===1?inside:outside,many=inside.length===1?outside:inside;face(...many.map(i=>vertex(one[0],i)),direction);}
   else {const [a,b]=inside,[c,d]=outside,v0=vertex(a,c),v1=vertex(a,d),v2=vertex(b,c),v3=vertex(b,d);face(v0,v1,v2,direction);face(v1,v3,v2,direction);}
  }
 }
}
// A rounded solid sampled on a welded cube sphere: watertight even at the poles.
// The zero set is an Lp distance field; normals use its numerical gradient.
export function solid(mesh,center,radii,power,attribute,warp=p=>p,segments=6) {
 const cache=new Map(),field=p=>Math.pow(p.reduce((s,v,i)=>s+Math.abs(v/radii[i])**power,0),1/power)-1;
 function v(q){const key=q.join(',');if(cache.has(key))return cache.get(key);
  const d=Math.pow(q.reduce((s,x)=>s+Math.abs(x)**power,0),1/power),local=q.map((x,i)=>x/d*radii[i]),p=warp(local.slice()).map((x,i)=>x+center[i]);
  const id=mesh.p.length;mesh.p.push(p);const normal=gradient(field,local),ref=Math.abs(normal[0])<.8?[1,0,0]:[0,1,0],t=unit(cross(normal,ref)),b=cross(normal,t),e=.0001;
  const derivative=a=>sub(warp(local.map((v,i)=>v+a[i]*e)),warp(local.map((v,i)=>v-a[i]*e)));
  mesh.n.push(unit(cross(derivative(t),derivative(b))));mesh.a.push(attribute(p));cache.set(key,id);return id;}
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1])for(let a=0;a<segments;a++)for(let b=0;b<segments;b++){
  const ids=[[a,b],[a+1,b],[a+1,b+1],[a,b+1]].map(([u,w])=>{const q=[0,0,0];q[axis]=sign*segments;q[(axis+1)%3]=2*u-segments;q[(axis+2)%3]=2*w-segments;return v(q);});
  for(const t of [[ids[0],ids[1],ids[2]],[ids[0],ids[2],ids[3]]]){
   const n=cross(sub(mesh.p[t[1]],mesh.p[t[0]]),sub(mesh.p[t[2]],mesh.p[t[0]]));mesh.tri.push(sign>0?t:[t[0],t[2],t[1]]);
  }
 }
}
