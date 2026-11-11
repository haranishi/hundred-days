import {clamp} from '../../../src/world/surface-math.js';
import {periodicNoise as noise} from './noise.js';
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const VALLEY=[[-1800,40,2700],[-1300,60,2150],[-1000,40,1950],[-300,-30,1640],[100,-80,1520],[450,-20,1420],[800,60,1320],[1050,120,1240],[1300,140,1190],[1545,-120,1180]];
export const WEST=[[-1700,-1500,2550],[-700,-1350,2350],[0,-1250,2150],[900,-1150,1900]];
export function profile(points,z,ch){let i=0;while(i<points.length-2&&z>points[i+1][0])i++;const a=points[i],b=points[i+1],t=clamp((z-a[0])/(b[0]-a[0]),0,1);return a[ch]+t*(b[ch]-a[ch]);}
// 湖の形は、山の形を作る側（alpine.js）と同じものを使う（2 か所で決めると、岸と水面がずれる）
import {lakeRadius,lakeInside} from './alpine.js';
export {lakeRadius,lakeInside};
export const GLACIER_LINE=[[-1150,-1450,2420],[-980,-1250,2290],[-780,-1100,2170],[-600,-950,2060],[-430,-820,1950]];
const lengths=[0];for(let i=1;i<GLACIER_LINE.length;i++)lengths.push(lengths[i-1]+Math.hypot(GLACIER_LINE[i][0]-GLACIER_LINE[i-1][0],GLACIER_LINE[i][1]-GLACIER_LINE[i-1][1]));
export const GLACIER_LENGTH=lengths.at(-1);
export function glacierPoint(s,t=0){let i=0;while(i<3&&s>lengths[i+1])i++;const a=GLACIER_LINE[i],b=GLACIER_LINE[i+1],l=lengths[i+1]-lengths[i],u=(s-lengths[i])/l,dx=(b[0]-a[0])/l,dz=(b[1]-a[1])/l;return {x:a[0]+u*(b[0]-a[0])-dz*t,z:a[1]+u*(b[1]-a[1])+dx*t};}
export function glacierCoord(x,z){let best={s:0,t:0,L:GLACIER_LENGTH},d=Infinity;for(let i=0;i<4;i++){const a=GLACIER_LINE[i],b=GLACIER_LINE[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=lengths[i+1]-lengths[i],u=clamp(((x-a[0])*dx+(z-a[1])*dz)/(l*l),i===0?-.2:0,i===3?1.3:1),xx=a[0]+u*dx,zz=a[1]+u*dz,dd=Math.hypot(x-xx,z-zz);if(dd<d){d=dd;best={s:lengths[i]+u*l,t:((z-a[1])*dx-(x-a[0])*dz)/l,L:GLACIER_LENGTH};}}return best;}
export const glacierWidth=s=>340+65*noise(s/240,0,65536,137);
export const GLACIER_STEPS=[85,218,354,513,665,824];
export const glacierStep=(s,t=0)=>s-35*(t/(glacierWidth(s)/2))**2-8*noise(t/75,s/190,65536,187);
export function glacierHeight(s,t=0){const u=clamp(s/GLACIER_LENGTH,0,1);let h=2420-374*u+12*(1-(2*t/glacierWidth(s))**2)*Math.sin(Math.PI*u),arc=glacierStep(s,t);for(const at of GLACIER_STEPS)h-=16*smooth((arc-at)/11);return h;}
export function glacierWeight(g){return (1-smooth((Math.abs(g.t)-glacierWidth(g.s)/2+20)/25))*smooth((g.s+20)/70)*(1-smooth((g.s-g.L+100)/100));}
// Runtime paths are populated by downhill tracing, never by periodic stripes.
let pistes=[],pisteBins=new Map();
export function setPistes(lines){pistes=lines;pisteBins=new Map();for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];for(let z=Math.floor((Math.min(a[1],b[1])-80)/96);z<=Math.floor((Math.max(a[1],b[1])+80)/96);z++)for(let x=Math.floor((Math.min(a[0],b[0])-80)/96);x<=Math.floor((Math.max(a[0],b[0])+80)/96);x++){const key=x+":"+z;if(!pisteBins.has(key))pisteBins.set(key,[]);pisteBins.get(key).push([a,b]);}}}
export function pathDistance(x,z,line){let best=Infinity;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));}return best;}
export function trailDistance(x,z){let d=Infinity;for(const p of pisteBins.get(Math.floor(x/96)+":"+Math.floor(z/96))??[])d=Math.min(d,pathDistance(x,z,p));return d;}
export function trailAxis(i,z){const p=pistes[i]??[];let best=Infinity,x=0;for(const q of p)if(Math.abs(q[1]-z)<best){best=Math.abs(q[1]-z);x=q[0];}return x;}
export const RESERVED={id:'east-park',x:1100,z:100,heading:-2.5,length:400,width:60,angle:22};
export function reservedDistance(x,z){const dx=x-RESERVED.x,dz=z-RESERVED.z,s=Math.sin(RESERVED.heading),c=-Math.cos(RESERVED.heading);return {along:dx*s+dz*c,across:dx*c-dz*s};}
export const streamX=z=>160-(z-1345)*30/45;
export const protectValley=(x,z)=>lakeInside(x,z)?1:0;
export function zoneId(x,z,h){const g=glacierCoord(x,z);return lakeInside(x,z)?7:g.s>0&&g.s<g.L&&Math.abs(g.t)<glacierWidth(g.s)/2?4:x< -900?5:h<1750?6:x>350?2:z< -1000?3:1;}
export const ZONES=[{id:1,name:'中央の谷'},{id:2,name:'東のゲレンデ'},{id:3,name:'上の雪原'},{id:4,name:'西の氷河'},{id:5,name:'西の岩稜'},{id:6,name:'針葉樹の森と集落'},{id:7,name:'凍った湖'}];
