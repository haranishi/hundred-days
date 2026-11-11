import {writeFileSync,mkdirSync} from 'node:fs';
import {readDelivered} from './verify-valley.mjs';
import {verifyPark} from './lib/verify-park.js';
import {surveyRunouts} from './lib/runout-repairs.js';
import {stationRide} from './lib/terrain-rides.js';
import {settlementFlood} from './lib/settlement-drainage.js';
import {runRide} from './lib/verify-features.js';
import {forestNearest,forestSamples} from './lib/forest-trail.js';
const out=process.argv[2]??'public/world',dir=process.argv[3]??'.agent-harness/runs/worldgen/i17d';mkdirSync(dir,{recursive:true});
const w=readDelivered(out),park=verifyPark(w,dir),runouts=surveyRunouts(w),forest=w.drops.find(d=>d.id==='forest-trail'),first=w.drops.find(d=>d.id==='first-snow'),forestRides=[false,true].map(alternate=>stationRide(w,forest,{alternate,trace:true})),firstRide=stationRide(w,first,{trace:true}),pits=settlementFlood(w.buffers.height,w.meta);
const drops=w.drops.map(d=>({id:d.id,...runRide(w,{...d,speed:d.speed??0},d.level<=2?25:6)}));
let roadMax=0,roadAt=null;for(const road of w.meta.structures.roads)for(let k=1;k<road.length;k++){const a=road[k-1],b=road[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/l,dz=(b[1]-a[1])/l;for(let s=3;s<l-3;s+=2)for(const t of [-2,0,2]){const x=a[0]+dx*s+dz*t,z=a[1]+dz*s-dx*t,sf=w.sampleSurface(x,z,{}),deg=Math.atan(Math.abs(sf.nx*dz-sf.nz*dx)/sf.ny)*180/Math.PI;if(deg>roadMax){roadMax=deg;roadAt={x,z};}}}
const samples=forestSamples();let curvature=0;for(let i=2;i<samples.length;i++){const a=samples[i-2],b=samples[i-1],c=samples[i],ab=Math.hypot(a.x-b.x,a.z-b.z),bc=Math.hypot(b.x-c.x,b.z-c.z),ac=Math.hypot(a.x-c.x,a.z-c.z);curvature=Math.max(curvature,2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/(ab*bc*ac));}
const treeRows=(w.meta.structures.forestTrail?.trees??[]).map(p=>({distance:forestNearest(p.x,p.z,samples).distance,height:p.height}));
const result={park,runouts,forestRides,firstRide,pits,roads:{maxCrossSlope:roadMax,at:roadAt},forestGeometry:{minRadius:1/curvature,trees:treeRows.length,treeMin:Math.min(...treeRows.map(t=>t.distance)),treeMax:Math.max(...treeRows.map(t=>t.distance))},drops,checks:{park:Object.values(park.checks).every(Boolean),runouts:runouts.every(r=>r.pass),forest:forestRides.every(r=>!r.crash&&r.arrival!==null)&&forestRides[0].maxSpeed<=70,forestRadius:1/curvature>=60,pits:pits.maxDepth<=.6,roads:roadMax<=14,first:!firstRide.crash&&firstRide.arrival>=22&&firstRide.arrival<=45&&firstRide.maxSpeed<=65,drops:drops.every(d=>!d.crash)}};
writeFileSync(dir+'/terrain-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks:result.checks,forest:forestRides.map(({points,...r})=>r),first:(({points,...r})=>r)(firstRide),pits,roads:result.roads,forestGeometry:result.forestGeometry,runouts:runouts.filter(r=>!r.pass).map(r=>({id:r.id,runs:r.runs.filter(r=>!r.pass).map(r=>({v:r.target,crash:r.crash,followed:r.followed}))})),drops:drops.filter(d=>d.crash).map(d=>({id:d.id,crash:d.crash}))},null,2));if(!Object.values(result.checks).every(Boolean))process.exitCode=1;
