import {readDelivered} from './verify-valley.mjs';
import {makeKicker} from './lib/feature-stamps.js';
import {writeFileSync} from 'node:fs';
const w=readDelivered(),r=w.meta.reserved[0],rows=[];
for(const size of ['small','medium'])for(let offset=size==='small'?30:255;offset<=(size==='small'?150:390);offset+=15){
 const x=r.x+Math.sin(r.heading)*offset,z=r.z-Math.cos(r.heading)*offset,y=w.heightAt(x,z),heading=r.heading;
 const h=s=>w.heightAt(x+Math.sin(heading)*s,z-Math.cos(heading)*s),mean=Math.atan((h(-30)-h(150))/180)*180/Math.PI,slopeDeg=[14,18,22].sort((a,b)=>Math.abs(a-mean)-Math.abs(b-mean))[0],stamp=makeKicker({size,slopeDeg});
 let cut=0,fill=0,flatten=0;for(let s=-stamp.before;s<=stamp.after;s+=2)for(let t=-stamp.width/2;t<=stamp.width/2;t+=2){const old=w.heightAt(x+Math.sin(heading)*s+Math.cos(heading)*t,z-Math.cos(heading)*s+Math.sin(heading)*t),plane=y-Math.tan(slopeDeg*Math.PI/180)*s,delta=plane+stamp.delta(s,t)-old;flatten=Math.max(flatten,Math.abs(plane-old));cut=Math.max(cut,-delta);fill=Math.max(fill,delta);}
 rows.push({size,offset,x,z,heading,meanSlope:mean,slopeDeg,before:stamp.before,after:stamp.after,width:stamp.width,flatten,cut,fill,decision:flatten>12?'omit: support plane differs by more than 12m; excessive earthwork':'requires on-mountain ride'});
}
writeFileSync('.agent-harness/runs/worldgen/features/park.json',JSON.stringify(rows,null,2));console.log(rows.reduce((o,r)=>{if(!o[r.size]||o[r.size].flatten>r.flatten)o[r.size]=r;return o;},{}));
