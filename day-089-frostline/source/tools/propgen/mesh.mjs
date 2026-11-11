// Closed convex pieces. Expected outward directions are independent of shading normals.
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
export const MATERIALS=['wood','stone','snow','steel','glass','foliage','trunk'].map((name,id)=>({id,name}));
const palette=[[117,76,46],[111,115,119],[235,244,250],[73,89,100],[23,46,58],[32,65,54],[83,60,43]];
export function mesh(name,lod='near',limit=1000){return {name,lod,limit,p:[],n:[],color:[],material:[],ao:[],tri:[],shells:[],roofs:[]};}
export function face(m,points,mat,expected,tone=1,ao=.1){
 for(let j=1;j<points.length-1;j++){
  let q=[points[0],points[j],points[j+1]],n=cross(sub(q[1],q[0]),sub(q[2],q[0]));
  if(dot(n,expected)<0){q=[q[0],q[2],q[1]];n=cross(sub(q[1],q[0]),sub(q[2],q[0]));}
  if(Math.hypot(...n)<1e-10)throw Error(m.name+' degenerate source face');
  n=unit(n);const first=m.p.length;
  for(const p of q){m.p.push(p);m.n.push(n);m.color.push(palette[mat].map(v=>Math.round(Math.min(255,v*tone))));m.material.push(mat);m.ao.push(ao);}
  m.tri.push([first,first+1,first+2]);
 }
}
export function poly(m,points,faces,mat,tone=1,ao=.1){
 const center=[0,1,2].map(k=>points.reduce((s,p)=>s+p[k],0)/points.length),start=m.tri.length;
 for(const ids of faces){const q=ids.map(i=>points[i]),c=[0,1,2].map(k=>q.reduce((s,p)=>s+p[k],0)/q.length);face(m,q,mat,sub(c,center),tone,ao);}
 m.shells.push({start,count:m.tri.length-start,center});
}
export const BOX_FACES=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
export function box(m,c,size,mat,tone=1,ao=.1){const p=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])p.push([c[0]+x*size[0]/2,c[1]+y*size[1]/2,c[2]+z*size[2]/2]);poly(m,p,BOX_FACES,mat,tone,ao);}
export function beam(m,a,b,width,depth,mat,tone=1){
 const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[0,0,1])),v=cross(axis,u),p=[];
 for(const c of [a,b])for(const s of [-1,1])for(const t of [-1,1])p.push(c.map((x,k)=>x+u[k]*width*s/2+v[k]*depth*t/2));
 poly(m,p,BOX_FACES,mat,tone);
}
export function ringSolid(m,rings,mat,tone=1,ao=.1){
 const n=rings[0].length,p=rings.flat(),faces=[];
 for(const r of [0,rings.length-1]){
  if(n===3){faces.push([r*n,r*n+1,r*n+2]);continue;}
  const c=[0,1,2].map(k=>rings[r].reduce((s,p)=>s+p[k],0)/n),id=p.length;p.push(c);
  for(let i=0;i<n;i++)faces.push([id,r*n+i,r*n+(i+1)%n]);
 }
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++)faces.push([j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i]);
 poly(m,p,faces,mat,tone,ao);
}
export function cylinder(m,a,b,r,mat,n=8,tone=1){
 const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[0,0,1])),v=cross(axis,u);
 ringSolid(m,[a,b].map(c=>Array.from({length:n},(_,i)=>c.map((x,k)=>x+r*(u[k]*Math.cos(i/n*Math.PI*2)+v[k]*Math.sin(i/n*Math.PI*2))))),mat,tone);
}
export function finish(m,collision,stretchAxes=[]){
 const min=[0,1,2].map(k=>Math.min(...m.p.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...m.p.map(p=>p[k])));
 m.bounds={min,max,size:max.map((v,k)=>v-min[k])};m.collision={...collision,height:max[1]};m.stretchAxes=stretchAxes;return m;
}
