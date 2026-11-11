import {readFileSync,writeFileSync} from 'node:fs';import {readDelivered} from './verify-valley.mjs';import {createObstacleStore} from '../../src/world/obstacles.js';import {calibrateFeature,snowFeature} from './lib/feature-rides.js';import {addSnowLip} from './lib/natural-features.js';
const dir='.agent-harness/runs/worldgen/features',w=readDelivered(),accepted=JSON.parse(readFileSync('tools/worldgen/lib/feature-sites.json')),rows=JSON.parse(readFileSync(dir+'/mound.json')).filter(r=>r.feature.region==='west'&&r.feature.drop>=5),results=[],a=w.buffers.masksA.slice(),b=w.buffers.masksB.slice();
for(const row of rows){const f=structuredClone(row.feature);if(accepted.some(p=>Math.hypot(p.x-f.x,p.z-f.z)<85))continue;
 for(const offset of [0,-15,15,-30,30]){
  const base=row.feature.approach;f.approach={...base,x:base.x+Math.cos(f.heading)*offset,z:base.z+Math.sin(f.heading)*offset};
  for(const run of [6,12]){
   f.moundRun=run;w.meta.features=[f];snowFeature(w,f);w.obstaclesNear=createObstacleStore(w);const undo=addSnowLip(w,f,1.5),runs=[];
   for(const target of [10,14,18]){const r=calibrateFeature(w,f,target);runs.push(r);if(r.error>=.15||Math.abs(r.edgeT)>20||!r.flight||r.flight.air<.5||r.crash||!r.completed||r.flight.landing.powder<.85||r.flight.landing.depth<.9)break;}
   const pass=runs.length===3&&runs.every(r=>r.error<.15&&Math.abs(r.edgeT)<=20&&r.flight?.air>=.5&&!r.crash&&r.completed&&r.flight.landing.powder>=.85&&r.flight.landing.depth>=.9);
   results.push({feature:structuredClone(f),runs,pass});undo();w.buffers.masksA.set(a);w.buffers.masksB.set(b);
   if(pass){f.approach.speed=runs[1].initial;accepted.push(structuredClone(f));console.log('ACCEPT',f.id,f.x,f.z,f.drop,offset,run,runs.map(r=>[r.edge,r.flight.air,r.flight.impact]));break;}
  }
  if(accepted.some(p=>p.id===f.id))break;
 }
 writeFileSync(dir+'/west-refine.json',JSON.stringify(results));writeFileSync('tools/worldgen/lib/feature-sites.json',JSON.stringify(accepted,null,2)+'\n');
}
console.log('RESULT',accepted.length);
