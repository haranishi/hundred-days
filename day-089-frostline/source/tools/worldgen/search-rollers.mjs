import {readFileSync,writeFileSync} from 'node:fs';import {readDelivered} from './verify-valley.mjs';import {createObstacleStore} from '../../src/world/obstacles.js';import {calibrateFeature,snowFeature} from './lib/feature-rides.js';import {addRollers} from './lib/roller-features.js';
const w=readDelivered(),a=w.buffers.masksA.slice(),b=w.buffers.masksB.slice(),natural=JSON.parse(readFileSync('tools/worldgen/lib/feature-sites.json')),accepted=[],results=[];
for(const region of ['east','central']){
 let done=false;
 for(let z=-700;z<=1000&&!done;z+=80)for(let x=region==='east'?550:-150;x<(region==='east'?1500:200);x+=80){
  if(natural.some(f=>Math.hypot(f.x-x,f.z-z)<170))continue;const sf=w.sampleSurface(x,z,{}),slopeDeg=Math.acos(sf.ny)*180/Math.PI;if(slopeDeg<8||slopeDeg>24)continue;
  const heading=Math.atan2(sf.nx,-sf.nz),f={id:'rollers-'+region,name:region==='east'?'東のうねり':'谷のうねり',kind:'rollers',size:'S',x,z,y:sf.h,heading,slopeDeg,length:80,width:42,drop:0,speed:[20,20],air:[.2,.5],approach:{x:x-Math.sin(heading)*40,z:z+Math.cos(heading)*40,heading,speed:0}};
  const undo=addRollers(w,f);w.meta.features=[f];snowFeature(w,{...f,kind:'rollers'});w.obstaclesNear=createObstacleStore(w);const r=calibrateFeature(w,f,20),rollerFlights=r.flights.filter(p=>p.s>=0&&p.s<60),pass=rollerFlights.length>=2&&rollerFlights.every(p=>p.air>=.2&&p.air<=.5)&&r.error<.15&&r.flight?.air>=.2&&r.flight.air<=.5&&!r.crash&&r.completed;
  results.push({feature:f,run:r,pass});undo();w.buffers.masksA.set(a);w.buffers.masksB.set(b);
  if(pass){f.approach.speed=r.initial;accepted.push(f);console.log('ACCEPT',f,r.flight);done=true;break;}
 }
}
writeFileSync('.agent-harness/runs/worldgen/features/rollers-search.json',JSON.stringify(results,null,2));writeFileSync('tools/worldgen/lib/roller-sites.json',JSON.stringify(accepted,null,2)+'\n');
