import {writeFileSync} from 'node:fs';
import {encodePNG} from './png.js';
import {clamp} from '../../../src/world/surface-math.js';
export function mapColor(world,x,z,s,contours=true){
 const snow=world.snowAt(x,z,{}),trees=world.treeDensityAt(x,z),sun=world.meta.sun;
 const shade=clamp(.38+.62*(s.nx*sun.x+s.ny*sun.y+s.nz*sun.z),.22,1)*(.55+.45*world.sunVisibilityAt(x,z)),line=contours&&Math.abs(s.h/100-Math.round(s.h/100))*100<1.5;
 let base=[239-105*snow.rock-153*trees,246-118*snow.rock-117*trees,252-120*snow.rock-142*trees];
 if(snow.ice>.1&&snow.depth>0)base=snow.ice>.75?[135,207,232]:[215,237,246];
 const l=world.meta.lake;if(l&&x>=l.x0&&z>=l.z0&&x<l.x0+l.size&&z<l.z0+l.size){const i=Math.floor((x-l.x0)*l.grid/l.size),j=Math.floor((z-l.z0)*l.grid/l.size),v=world.buffers.lake[j*l.grid+i];if(v)base=v>=200?[37,119,126]:[162+v*.22,205+v*.13,219+v*.14];}
 return base.map(v=>v*shade*(line?.70:1));
}
export function writeMap(world,path){
 const n=1024,pixels=new Uint8Array(n*n*4),s={};
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=(i+.5)*world.size/n-world.half,z=(j+.5)*world.size/n-world.half,k=(j*n+i)*4;world.sampleSurface(x,z,s);pixels.set([...mapColor(world,x,z,s),255],k);}
 const dot=(x,z,c,r=1)=>{const ix=Math.round((x+world.half)*n/world.size),iz=Math.round((z+world.half)*n/world.size);for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++)if(ix+di>=0&&ix+di<n&&iz+dj>=0&&iz+dj<n)pixels.set([...c,255],((iz+dj)*n+ix+di)*4);};
 function line(a,b,color,r){const d=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let t=0;t<=d;t+=3)dot(a[0]+(b[0]-a[0])*t/d,a[1]+(b[1]-a[1])*t/d,color,r);}
 for(const road of world.meta.structures.roads)for(let q=1;q<road.length;q++)line(road[q-1],road[q],[180,163,135],1);
 for(const p of world.meta.reserved??[]){if(!p.id?.startsWith('east-park'))continue;for(const side of [-1,1]){const x=p.x+Math.cos(p.heading)*75*side,z=p.z+Math.sin(p.heading)*75*side;line([x,z],[x+Math.sin(p.heading)*p.length,z-Math.cos(p.heading)*p.length],[99,153,193],0);}}
 const st=world.meta.structures;line([st.lift.base.x,st.lift.base.z],[st.lift.top.x,st.lift.top.z],[96,111,125],0);
 for(const b of [st.lodge,...st.chalets])dot(b.x,b.z,[133,100,73],b===st.lodge?3:1);
 // Feature markers are baked for the offline map; spawn/station symbols remain UI-owned.
 for(const f of world.meta.features??[]){const color=f.kind==='cliff'?[226,96,53]:f.kind==='kicker'?[184,65,168]:[43,155,197];dot(f.x,f.z,[255,255,255],4);dot(f.x,f.z,color,2);line([f.x,f.z],[f.x+Math.sin(f.heading)*28,f.z-Math.cos(f.heading)*28],color,0); }
 writeFileSync(path,encodePNG(n,n,pixels));
}
