import {readDelivered} from './verify-valley.mjs';
import {runRide} from './lib/verify-features.js';
import {createObstacleStore} from '../../src/world/obstacles.js';
const w=readDelivered();
for(const [id,ox,oz,radius,min,max]of [['first-snow',430,1050,250,10,15],['forest-trail',540,930,250,4,30],['summit',40,-1660,100,0,70]]){
 const d=w.drops.find(d=>d.id===id),passed=[];let snowCount=0;
 for(let z=oz-radius;z<=oz+radius;z+=10)for(let x=ox-radius;x<=ox+radius;x+=10){if(Math.hypot(x-ox,z-oz)>radius||id==='summit'&&z<oz)continue;const s=w.sampleSurface(x,z,{}),angle=Math.acos(s.ny)*180/Math.PI,snow=w.snowAt(x,z,{});if(angle<min||angle>max||snow.rock>.25||w.waterAt(x,z))continue;snowCount++;
  for(const turn of [0,-.4,.4]){Object.assign(d,{x,z,y:s.h,heading:Math.atan2(s.nx,-s.nz)+turn});w.obstaclesNear=createObstacleStore(w);const r=runRide(w,d,id==='summit'?6:25);if(!r.crash&&Math.hypot(r.end.x-x,r.end.z-z)>5){passed.push({x,z,heading:d.heading,angle,distance:Math.hypot(x-ox,z-oz),travel:Math.hypot(r.end.x-x,r.end.z-z)});break;}}
 }
 passed.sort((a,b)=>a.distance-b.distance);console.log(id,snowCount,passed.length,JSON.stringify(passed.slice(0,8)));
}
