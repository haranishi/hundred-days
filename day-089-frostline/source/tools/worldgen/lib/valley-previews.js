import {writeFileSync} from 'node:fs';
import {encodePNG} from './png.js';
import {mapColor} from './map.js';
import {clamp} from '../../../src/world/surface-math.js';
const norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
/** Small CPU z-buffer renderer using the delivered surface, cameras and morning light. */
export function writeValleyPreviews(world,dir){
 const n=512,field=[],s={};
 for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const x=i*world.size/n-world.half,z=j*world.size/n-world.half;world.sampleSurface(x,z,s);field.push({p:[x,s.h,z],c:mapColor(world,x,z,s,false)});}
 const treeMap=new Map();
 for(let z=-world.half+24;z<world.half;z+=48)for(let x=-world.half+24;x<world.half;x+=48){if(world.heightAt(x,z)>1840)continue;for(const o of world.obstaclesNear(x,z,34,[]))if(o.type==='tree')treeMap.set(o.id,o);}
 const previewTrees=[...treeMap.values()];
 for(const view of world.meta.views.slice(2,6)){
  const W=960,H=640,pixels=new Uint8Array(W*H*4),depth=new Float64Array(W*H).fill(Infinity),f=norm(view.target.map((v,i)=>v-view.pos[i])),right=norm(cross(f,[0,1,0])),up=cross(right,f),scale=W/(2*Math.tan(view.fov*Math.PI/360));
  for(let k=0;k<W*H;k++)pixels.set([199,222,239,255],k*4);
  const project=v=>{const d=v.p.map((x,i)=>x-view.pos[i]),z=dot(d,f);return {x:W/2+scale*dot(d,right)/z,y:H/2-scale*dot(d,up)/z,z,c:v.c};};
  const points=field.map(project);
  function triangle(a,b,c){if(Math.min(a.z,b.z,c.z)<3)return;const area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(area)<.01)return;
   const x0=clamp(Math.floor(Math.min(a.x,b.x,c.x)),0,W-1),x1=clamp(Math.ceil(Math.max(a.x,b.x,c.x)),0,W-1),y0=clamp(Math.floor(Math.min(a.y,b.y,c.y)),0,H-1),y1=clamp(Math.ceil(Math.max(a.y,b.y,c.y)),0,H-1),color=a.c.map((v,i)=>(v+b.c[i]+c.c[i])/3);
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=((b.x-x)*(c.y-y)-(b.y-y)*(c.x-x))/area,v=((c.x-x)*(a.y-y)-(c.y-y)*(a.x-x))/area,w=1-u-v;if(u<0||v<0||w<0)continue;const z=1/(u/a.z+v/b.z+w/c.z),k=y*W+x;if(z<depth[k]){depth[k]=z;pixels.set([...color,255],k*4);}}
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=j*(n+1)+i;triangle(points[k],points[k+1],points[k+n+1]);triangle(points[k+1],points[k+n+2],points[k+n+1]);}
  // Preview geometry uses delivered object sizes; no browser or production renderer.
  const face=(pts,color)=>{const p=pts.map(p=>project({p,c:color}));for(let i=1;i<p.length-1;i++)triangle(p[0],p[i],p[i+1]);};
  for(const b of [world.meta.structures.lodge,...world.meta.structures.chalets]){
   const h=b===world.meta.structures.lodge?14:7,sy=Math.sin(Math.PI/2-b.yaw),cy=Math.cos(Math.PI/2-b.yaw),at=(u,v,y)=>[b.x+u*cy+v*sy,b.y+y,b.z-u*sy+v*cy];
   const a=at(-b.length/2,-b.width/2,0),bb=at(b.length/2,-b.width/2,0),cc=at(b.length/2,b.width/2,0),d=at(-b.length/2,b.width/2,0),tops=[a,bb,cc,d].map(p=>[p[0],p[1]+h*.65,p[2]]);
   for(let i=0;i<4;i++)face([[a,bb,cc,d][i],[a,bb,cc,d][(i+1)%4],tops[(i+1)%4],tops[i]],[103,79,61]);
   const roof1=at(-b.length/2,0,h),roof2=at(b.length/2,0,h);face([tops[0],tops[1],roof2,roof1],[234,241,247]);face([tops[3],tops[2],roof2,roof1],[198,216,232]);
  }
  const bridge=world.meta.structures.bridge;
  for(let u=-bridge.length/2;u<bridge.length/2;u+=1){const p=[];for(const [du,v] of [[0,-2],[1,-2],[1,2],[0,2]]){const along=u+du;p.push([bridge.x+along,bridge.y+bridge.rise*(1-(2*along/bridge.length)**2),bridge.z+v]);}face(p,[163,126,79]);}
  for(const o of previewTrees){const {x,y,z}=o,h=o.height,radius=2.5;face([[x-right[0]*radius,y,z-right[2]*radius],[x+right[0]*radius,y,z+right[2]*radius],[x,y+h,z]],[34,70,68]);}
  writeFileSync(`${dir}/valley-${view.ref}`,encodePNG(W,H,pixels));
 }
}
