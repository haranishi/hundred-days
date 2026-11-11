import {readDelivered} from './verify-valley.mjs';
import {routeFlow} from './lib/drainage.js';
import {lakeInside} from './lib/alpine.js';
const w=readDelivered(),n=512,c={grid:n,cell:8,size:4096},h=Float32Array.from({length:n*n},(_,k)=>w.heightAt((k%n+.5)*8-2048,(Math.floor(k/n)+.5)*8-2048)),r=routeFlow(h,c,{outlet:lakeInside});
for(const d of w.drops){let k=Math.floor((d.z+2048)/8)*n+Math.floor((d.x+2048)/8),dist=Infinity,count=0,end;while(k>=0&&count++<n*n){const x=(k%n+.5)*8-2048,z=(Math.floor(k/n)+.5)*8-2048;dist=Math.min(dist,Math.hypot(x-205,z-1255));end={x,z};k=r.receiver[k];}console.log(d.id,Math.round(dist),end);}
