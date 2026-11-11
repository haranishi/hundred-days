import {routeFlow} from './drainage.js';
import {makeLandscapeInputs,TARGETS} from './landscape-inputs.js';
import {hashString,hashInt} from './rng.js';
import {spline,clamp} from '../../../src/world/surface-math.js';
export function flatSeed(c,seed){const s=hashString(seed);return Float32Array.from({length:c.grid**2},(_,k)=>1180+10*(hashInt(k^s)/4294967296-.5));}
export function resizeField(a,from,to){const b=new Float32Array(to.grid**2);for(let j=0;j<to.grid;j++)for(let i=0;i<to.grid;i++)b[j*to.grid+i]=spline(a,from.grid,(i+.5)*from.grid/to.grid-.5,(j+.5)*from.grid/to.grid-.5);return b;}
export function growLandscape(source,c,fields,seed,iterations=400,options={}){
 const {uplift,hard,creep,fixed,base}=fields,n=c.grid,a=source.slice(),delta=new Float32Array(a.length),s=hashString(seed+':routing'),K=options.K??.014;
 const incision=new Float32Array(a.length),repose=new Float32Array(a.length);
 for(let k=0;k<a.length;k++){incision[k]=K*(1-.86*hard[k]);repose[k]=Math.tan((36+26*hard[k])*Math.PI/180)*c.cell;if(fixed[k])a[k]=base[k];}
 for(let pass=0;pass<iterations;pass++){
  const flow=routeFlow(a,c,{outletMask:fixed,randomSeed:s});a.set(flow.height);
  for(let k=0;k<a.length;k++)if(!fixed[k])a[k]+=uplift[k]*(options.dt??2);
  for(let t=flow.order.length-1;t>=0;t--){const k=flow.order[t],r=flow.receiver[k];if(r<0)continue;const q=incision[k]*Math.pow(flow.area[k],.45)*(options.dt??2)/flow.distance[k];a[k]=(a[k]+q*a[r])/(1+q);}
  delta.fill(0);
  for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
   const k=j*n+i;if(fixed[k])continue;
   for(const offset of [1,n,n+1,n-1]){const q=k+offset,d=a[k]-a[q],excess=Math.abs(d)-Math.max(repose[k],repose[q])*(offset===1||offset===n?1:Math.SQRT2);if(excess>0){const move=Math.sign(d)*excess*.055;delta[k]-=move;if(!fixed[q])delta[q]+=move;}}
   delta[k]+=creep[k]*(a[k-1]+a[k+1]+a[k-n]+a[k+n]-4*a[k]);
  }
  for(let k=0;k<a.length;k++)a[k]=fixed[k]?base[k]:a[k]+delta[k];
 }return a;
}
export function calibrateUplift(a,c,fields,apply=true){
 const measured=TARGETS.map(([id,x,z,h])=>({id,x,z,target:h,actual:spline(a,c.grid,(x+2048)/c.cell-.5,(z+2048)/c.cell-.5)}));
 if(!apply)return measured;
 // An over-high summit away from the requested summit is also an uplift constraint.
 const peaks=new Map();for(let j=1;j<c.grid-1;j+=3)for(let i=1;i<c.grid-1;i+=3){const x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048,h=a[j*c.grid+i];if(h<2650||Math.hypot(x-40,z+1800)<140)continue;const key=Math.floor((x+2048)/600)+':'+Math.floor((z+2048)/600),old=peaks.get(key);if(!old||h>old.actual)peaks.set(key,{id:'excess-peak',x,z,target:2600,actual:h});}measured.push(...peaks.values());
 for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){
  const k=j*c.grid+i;if(fields.fixed[k])continue;const x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048;let sum=0,w=0;
  for(const p of measured){const dist2=(x-p.x)**2+(z-p.z)**2,weight=Math.exp(-dist2/(2*460**2))/(dist2+230**2),ratio=clamp((p.target-1180)/Math.max(8,p.actual-1180),.25,3);sum+=weight*Math.log(ratio);w+=weight;}
  fields.uplift[k]*=Math.exp(.8*sum/Math.max(w,.00001));
 }return measured;
}
export function generateLandscape(c,seed,options={},stage=null){
 const coarse={...c,grid:Math.min(512,c.grid),cell:4096/Math.min(512,c.grid)},fields=makeLandscapeInputs(coarse,seed,options),initial=flatSeed(coarse,seed),history=[];
 let a;for(let outer=0;outer<(options.cycles??5);outer++){a=growLandscape(initial,coarse,fields,seed,options.iterations??400,options);history.push(calibrateUplift(a,coarse,fields,outer<(options.cycles??5)-1));stage?.('growth-'+outer);}
 if(c.grid>512){const fine={...c,grid:1024,cell:4},f=makeLandscapeInputs(fine,seed,options);f.uplift=resizeField(fields.uplift,coarse,fine);a=growLandscape(resizeField(a,coarse,fine),fine,f,seed,60,{...options,dt:.2});a=resizeField(a,fine,c);}
 return {height:a,history,fields};
}
