import {test,expect} from 'vitest';
import {routeFlow} from '../../tools/worldgen/lib/drainage.js';
import {erodeTerrain} from '../../tools/worldgen/lib/erosion.js';
test('depressions drain, every receiver is the steepest D8 link and catchment area is conserved',()=>{
  const n=48,c={grid:n,cell:12,size:n*12},h=Float32Array.from({length:n*n},(_,k)=>100+Math.hypot(k%n-24,Math.floor(k/n)-24)*2);
  h[22*n+22]-=50;const f=routeFlow(h,c),position=new Int32Array(h.length);
  for(let t=0;t<f.order.length;t++)position[f.order[t]]=t;
  let outletArea=0,mergers=0;const donors=new Uint8Array(h.length);
  for(let k=0;k<h.length;k++){
    const r=f.receiver[k];if(r<0){expect(k%n===0||k%n===n-1||k<n||k>=n*(n-1)).toBe(true);outletArea+=f.area[k];continue;}
    expect(f.height[k]).toBeGreaterThan(f.height[r]);expect(position[k]).toBeLessThan(position[r]);donors[r]++;
    const best=(f.height[k]-f.height[r])/f.distance[k];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(dx||dz)expect((f.height[k]-f.height[k+dz*n+dx])/(12*(dx&&dz?Math.SQRT2:1))).toBeLessThanOrEqual(best+1e-6);
  }
  for(const d of donors)if(d>1)mergers++;
  expect(outletArea).toBe(n*n*144);expect(mergers).toBeGreaterThan(0);expect(f.filled).toBeGreaterThan(0);
});
test('one implicit stream-power step cuts the cell using its updated receiver and A^m',()=>{
  const n=16,c={grid:n,cell:6,size:n*6},h=Float32Array.from({length:n*n},(_,k)=>600+(n-1-Math.floor(k/n))*3);
  const f=routeFlow(h,c),expected=h.slice(),K=.018,m=.45;
  for(let t=f.order.length-1;t>=0;t--){const k=f.order[t],r=f.receiver[k];if(r<0)continue;const coeff=K*f.area[k]**m/f.distance[k];expected[k]=(expected[k]+coeff*expected[r])/(1+coeff);}
  const actual=erodeTerrain(h,c,'formula',{iterations:1,K,hardK:K,m,uplift:0,thermalPasses:0,fanRate:0,creep:0});
  let maxError=0;for(let k=0;k<h.length;k++)maxError=Math.max(maxError,Math.abs(actual[k]-expected[k]));
  expect(maxError).toBeLessThan(.0002);
});
test('gradient-proportional routing is seeded, downhill, acyclic and conserves catchment area',()=>{
 const n=48,c={grid:n,cell:8,size:n*8},h=Float32Array.from({length:n*n},(_,k)=>1000-2*(k%n)-Math.floor(k/n)),a=routeFlow(h,c,{randomSeed:71}),b=routeFlow(h,c,{randomSeed:71}),other=routeFlow(h,c,{randomSeed:72}),pos=new Int32Array(h.length);
 expect(a.receiver).toEqual(b.receiver);expect(a.receiver).not.toEqual(other.receiver);a.order.forEach((k,i)=>pos[k]=i);let area=0,nonSteep=0;
 for(let k=0;k<h.length;k++){const r=a.receiver[k];if(r<0){area+=a.area[k];continue;}expect(a.height[r]).toBeLessThan(a.height[k]);expect(pos[k]).toBeLessThan(pos[r]);if(r!==k+1)nonSteep++;}
 expect(area).toBe(c.size**2);expect(nonSteep).toBeGreaterThan(100);
});
