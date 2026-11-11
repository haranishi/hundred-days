import {spline} from '../../../src/world/surface-math.js';
import {smooth} from './valley-layout.js';
const controls=[[480,1020],[275,1020],[70,1120],[205,1255]];
export const FOREST_TRAIL={width:14,blend:70,profileGrade:.11,controls};
export function forestSamples(){
 const a=controls,out=[];let length=0;for(let i=0;i<=160;i++){const t=i/160,u=1-t,x=u**3*a[0][0]+3*u*u*t*a[1][0]+3*u*t*t*a[2][0]+t**3*a[3][0],z=u**3*a[0][1]+3*u*u*t*a[1][1]+3*u*t*t*a[2][1]+t**3*a[3][1];if(i)length+=Math.hypot(x-out.at(-1).x,z-out.at(-1).z);out.push({x,z,s:length});}const first=out[0],next=out[1],l=Math.hypot(next.x-first.x,next.z-first.z);for(const p of out)p.s+=40;out.unshift({x:first.x-(next.x-first.x)/l*40,z:first.z-(next.z-first.z)/l*40,s:0});return out;
}
export function forestNearest(x,z,samples=forestSamples()){
 if(x<60||x>560||z<940||z>1340)return {distance:Infinity};
 let best=null,d=Infinity;for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(l*l))),xx=a.x+dx*u,zz=a.z+dz*u,dd=Math.hypot(x-xx,z-zz);if(dd<d){d=dd;best={x:xx,z:zz,s:a.s+u*l,t:((x-xx)*dz-(z-zz)*dx)/l,heading:Math.atan2(dx,-dz),distance:dd};}}return best;
}
export function groomForestTrail(height,c){
 const samples=forestSamples(),end=samples.at(-1),read=(x,z)=>spline(height,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5),bottom=read(end.x,end.z),reach=77;
 for(let j=Math.floor((1000-reach+c.size/2)/c.cell);j<=Math.ceil((1255+reach+c.size/2)/c.cell);j++)for(let i=Math.floor((140-reach+c.size/2)/c.cell);i<=Math.ceil((480+reach+c.size/2)/c.cell);i++){
  const x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2,q=forestNearest(x,z,samples);if(q.distance>=reach)continue;
  const w=1-smooth((q.distance-7)/70),target=bottom+(end.s-q.s)*FOREST_TRAIL.profileGrade+.028*144*(1-Math.exp(-q.t*q.t/144)),k=j*c.grid+i;
  height[k]=height[k]*(1-w)+target*w;
 }
 const trees=[];for(let s=12;s<end.s-35;s+=5){const i=samples.findIndex(p=>p.s>=s),a=samples[i-1],b=samples[i],l=Math.hypot(b.x-a.x,b.z-a.z),u=(s-a.s)/(b.s-a.s);for(const side of [-1,1]){const d=14+2*(.5+.5*Math.sin(s*.19+side));trees.push({x:a.x+(b.x-a.x)*u+(b.z-a.z)/l*d*side,z:a.z+(b.z-a.z)*u-(b.x-a.x)/l*d*side,height:12+4*(.5+.5*Math.sin(s*.13))});}}
 return {...FOREST_TRAIL,samples,length:end.s,bottom,trees};
}
