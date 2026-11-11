import {clamp} from '../../../src/world/surface-math.js';
export const SUN_PARAMS=Object.freeze({elevationDegrees:28,azimuthDegrees:135,edgeAngleDegrees:1.5,blurWidth:30});
export function eveningSun() {
  const p=SUN_PARAMS,e=p.elevationDegrees*Math.PI/180,a=p.azimuthDegrees*Math.PI/180;
  return {x:Math.sin(a)*Math.cos(e),y:Math.sin(e),z:-Math.cos(a)*Math.cos(e)};
}
function blur(a,n,r) {
  if(!r)return a;
  const temp=new Float32Array(a.length),out=new Float32Array(a.length),width=2*r+1;
  for(let j=0;j<n;j++){
    let sum=0;for(let t=-r;t<=r;t++)sum+=a[j*n+clamp(t,0,n-1)];
    for(let i=0;i<n;i++){temp[j*n+i]=sum/width;sum+=a[j*n+clamp(i+r+1,0,n-1)]-a[j*n+clamp(i-r,0,n-1)];}
  }
  for(let i=0;i<n;i++){
    let sum=0;for(let t=-r;t<=r;t++)sum+=temp[clamp(t,0,n-1)*n+i];
    for(let j=0;j<n;j++){out[j*n+i]=sum/width;sum+=temp[clamp(j+r+1,0,n-1)*n+i]-temp[clamp(j-r,0,n-1)*n+i];}
  }
  return out;
}
/** Upwind horizon sweep. The retained distance converts elevation margin to angle. O(GRID²). */
export function bakeSun(height,c,sun=eveningSun()) {
  const n=c.grid,horizontal=Math.hypot(sun.x,sun.z),dx=sun.x/horizontal,dz=sun.z/horizontal;
  if(!Number.isFinite(horizontal)||horizontal<1e-10||sun.y<=0)throw new Error('太陽の向きが不正です');
  const majorX=Math.abs(dx)>=Math.abs(dz),major=majorX?dx:dz,minor=majorX?dz:dx;
  const signMajor=Math.sign(major),signMinor=Math.sign(minor),f=Math.abs(minor/major),step=c.cell/Math.abs(major),fall=step*sun.y/horizontal;
  const horizons=new Float32Array(height.length),distances=new Float32Array(height.length),vis=new Float32Array(height.length),soft=Math.tan(SUN_PARAMS.edgeAngleDegrees*Math.PI/180);
  for(let v=0;v<n;v++)for(let u=0;u<n;u++){
    const majorIndex=signMajor>0?n-1-u:u,minorIndex=signMinor>0?n-1-v:v;
    const i=majorX?majorIndex:minorIndex,j=majorX?minorIndex:majorIndex,k=j*n+i;
    const mi=majorIndex+signMajor,ni=minorIndex+signMinor;
    if(mi<0||mi>=n){horizons[k]=height[k];vis[k]=1;continue;}
    const k0=majorX?minorIndex*n+mi:mi*n+minorIndex,k1=majorX?clamp(ni,0,n-1)*n+mi:mi*n+clamp(ni,0,n-1);
    const upstream=horizons[k0]*(1-f)+horizons[k1]*f-fall,dist=distances[k0]*(1-f)+distances[k1]*f+step;
    vis[k]=clamp(.5+(height[k]-upstream)/(dist*soft*2),0,1);
    if(height[k]>=upstream){horizons[k]=height[k];distances[k]=0;}
    else {horizons[k]=upstream;distances[k]=dist;}
  }
  const softened=blur(vis,n,Math.max(0,Math.round(SUN_PARAMS.blurWidth/(2*c.cell))));
  return Uint8Array.from(softened,v=>Math.round(clamp(v,0,1)*255));
}
