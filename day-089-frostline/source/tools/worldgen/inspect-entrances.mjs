import {readDelivered} from './verify-valley.mjs';
import {traceValley} from './lib/stations.js';
import {runRide} from './lib/verify-features.js';
const w=readDelivered();
console.log(JSON.stringify(w.drops.map(d=>{const required=d.level<=2?25:6,r=runRide(w,{...d,speed:d.speed??0},required),stationDistance=Math.min(...traceValley(w,d).points.map(p=>Math.hypot(p.x-205,p.z-1255)));return {id:d.id,x:d.x,z:d.z,slope:Math.acos(w.sampleSurface(d.x,d.z,{}).ny)*180/Math.PI,snow:w.snowAt(d.x,d.z,{}),stationDistance,required,crash:r.crash,travel:Math.hypot(r.end.x-d.x,r.end.z-d.z)};}),null,2));
