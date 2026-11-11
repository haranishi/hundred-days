import {periodicNoise as noise} from './noise.js';
import {hashString} from './rng.js';
import {clamp} from '../../../src/world/surface-math.js';
import {lakeInside} from './valley-layout.js';
// Targets control uplift, never the delivered height field.
export const TARGETS=[['summit',40,-1800,2700],['bowl',60,-1300,2150],
 ...[[-1000,40,1950],[-300,-30,1640],[100,-80,1520],[450,-20,1420],[800,60,1320],[1050,120,1240],[1300,140,1190]].map(([z,x,h],i)=>['valley-'+i,x,z,h]),
 ...[[-1500,-1700,2550],[-1350,-700,2350],[-1250,0,2150],[-1150,900,1900]].map(([x,z,h],i)=>['west-'+i,x,z,h]),
 ...[[-1700,2480],[-900,2480],[-350,2590],[650,2480],[1300,2470]].map(([x,h],i)=>['north-'+i,x,-1800,h]),
 ...[[-1500,2250],[-700,2050],[0,1880],[600,1750]].map(([z,h],i)=>['east-'+i,1820,z,h]),
 ['glacier-head',-1150,-1450,2400],['glacier-toe',-430,-820,1940],['lift-top',1480,-420,1880],['lift-base',400,1180,1200],['lodge',265,1290,1188],['village-north',265,1250,1190],['stream-upper',185,1308,1188],
 ['piste-1',650,800,1380],['piste-2',1000,350,1590],['piste-3',1250,-100,1770],['piste-4',650,-500,1820]];
export function boundaryHeight(x,z){
 const t=(x+2048)/4096,u=(z+2048)/4096;
 const north=1900+35*noise(x/850,0,65536,71),south=1175+20*noise(x/950,0,65536,83);
 const west=1750+30*noise(0,z/900,65536,91),east=1650+30*noise(0,z/950,65536,97);
 const d=[u,1-u,t,1-t],v=[north,south,west,east];let sum=0,w=0;
 for(let i=0;i<4;i++){const a=1/Math.max(.00001,d[i])**3;sum+=a*v[i];w+=a;}return sum/w;
}
export function makeLandscapeInputs(c,seed,options={}){
 const n=c.grid,s=hashString(seed+':lithology'),uplift=new Float32Array(n*n),hard=new Float32Array(n*n),creep=new Float32Array(n*n),fixed=new Uint8Array(n*n),base=new Float32Array(n*n);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const k=j*n+i,x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048;
  let sum=0,weight=0;for(const [,ax,az,h]of TARGETS){const d=Math.hypot(x-ax,z-az),w=Math.exp(-d*d/(2*500**2))/(d*d+150**2);sum+=w*(h-1180);weight+=w;}
  const excess=sum/Math.max(weight,.00001),wave=noise(x/410,z/470,65536,s+5);
  uplift[k]=Math.max(.01,excess/400*(options.upliftScale??1.6)*(1+.42*wave));
  const warp=70*noise(x/600,z/600,65536,s+7),layer=noise((x*.6-z*.8+warp)/165,(x*.8+z*.6)/1400,65536,s+9);
  hard[k]=clamp((x<0?.66:.14)+.14*layer+.15*clamp((-z-900)/800,0,1),0,1);
  const bowl=Math.exp(-((x-60)**2+(z+1300)**2)/450**2);
  creep[k]=Math.min(.16,(options.creep??.12)*(1-.85*hard[k])+.10*bowl+(x>350?.035:0));
  const lake=lakeInside(x,z);fixed[k]=lake||i===0||j===0||i===n-1||j===n-1?1:0;base[k]=lake?1180:boundaryHeight(x,z);
  if(lake)uplift[k]=0;
 }
 return {uplift,hard,creep,fixed,base};
}
