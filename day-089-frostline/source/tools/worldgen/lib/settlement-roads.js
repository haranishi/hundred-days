import {spline} from '../../../src/world/surface-math.js';
import {smooth} from './valley-layout.js';
/** Raised benches: a road never excavates a trench across a steep hillside. */
export function groomSettlementRoads(height,c,roads){
 const before=height.slice(),read=(x,z)=>spline(before,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5);
 const samples=[];for(const line of roads)for(let k=1;k<line.length;k++){const a=line[k-1],b=line[k],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);for(let s=0;s<=l;s+=2){const x=a[0]+dx*s/l,z=a[1]+dz*s/l,y=Math.max(...[-6,-3,0,3,6].map(t=>read(x+dz/l*t,z-dx/l*t)));samples.push({x,z,y,dx:dx/l,dz:dz/l});}}
 for(let j=Math.floor((1080+c.size/2)/c.cell);j<=Math.ceil((1365+c.size/2)/c.cell);j++)for(let i=Math.floor((150+c.size/2)/c.cell);i<=Math.ceil((420+c.size/2)/c.cell);i++){
  const x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2;let best=Infinity;for(const p of samples)best=Math.min(best,(p.x-x)**2+(p.z-z)**2);const d=Math.sqrt(best);if(d>=16)continue;
  let sum=0,sw=0;for(const p of samples){const dx=x-p.x,dz=z-p.z,along=dx*p.dx+dz*p.dz,w=Math.exp(-along*along/24-Math.max(0,dx*dx+dz*dz-best)/16);sum+=w*(p.y+(read(p.x+p.dx*2,p.z+p.dz*2)-read(p.x-p.dx*2,p.z-p.dz*2))/4*along);sw+=w;}
  const k=j*c.grid+i,target=Math.max(before[k]-.5,sum/sw),w=1-smooth((d-3)/13);height[k]=before[k]*(1-w)+target*w;
 }
}
