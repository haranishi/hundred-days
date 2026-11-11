import {clamp} from '../../../src/world/surface-math.js';
/** Separable finite-support filters. Three box passes approximate a smooth Gaussian. */
export function boxBlur(source,n,r,passes=1){
  r=Math.max(1,Math.round(r));let a=source.slice();const temp=new Float32Array(a.length),out=new Float32Array(a.length),width=2*r+1;
  for(let pass=0;pass<passes;pass++){
    for(let j=0;j<n;j++){
      let sum=0;for(let t=-r;t<=r;t++)sum+=a[j*n+clamp(t,0,n-1)];
      for(let i=0;i<n;i++){temp[j*n+i]=sum/width;sum+=a[j*n+clamp(i+r+1,0,n-1)]-a[j*n+clamp(i-r,0,n-1)];}
    }
    for(let i=0;i<n;i++){
      let sum=0;for(let t=-r;t<=r;t++)sum+=temp[clamp(t,0,n-1)*n+i];
      for(let j=0;j<n;j++){out[j*n+i]=sum/width;sum+=temp[clamp(j+r+1,0,n-1)*n+i]-temp[clamp(j-r,0,n-1)*n+i];}
    }
    a=out.slice();
  }
  return a;
}
export function widenField(source,n,r){
  const temp=new Float32Array(source.length),out=new Float32Array(source.length);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){let v=0;for(let d=-r;d<=r;d++)v=Math.max(v,source[j*n+clamp(i+d,0,n-1)]);temp[j*n+i]=v;}
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){let v=0;for(let d=-r;d<=r;d++)v=Math.max(v,temp[clamp(j+d,0,n-1)*n+i]);out[j*n+i]=v;}
  return out;
}
