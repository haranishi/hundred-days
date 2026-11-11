import {readFileSync,writeFileSync} from 'node:fs';
import {readDelivered} from './verify-valley.mjs';
import {createObstacleStore} from '../../src/world/obstacles.js';
import {calibrateFeature,snowFeature} from './lib/feature-rides.js';
import {addSnowLip} from './lib/natural-features.js';
const dir='.agent-harness/runs/worldgen/features',w=readDelivered(),accepted=JSON.parse(readFileSync('tools/worldgen/lib/feature-sites-mound.json')),rows=JSON.parse(readFileSync(dir+'/mound.json')),results=[],a=w.buffers.masksA.slice(),b=w.buffers.masksB.slice();
const pool=rows.filter(r=>!r.pass&&r.runs[0]?.error<.15&&r.runs[0]?.flight&&r.runs[0].flight.air<.5).sort((a,b)=>(a.feature.region==='west'?-1:0)-(b.feature.region==='west'?-1:0)||a.feature.drop-b.feature.drop);
for(const row of pool){
 const f=structuredClone(row.feature);if(accepted.some(p=>Math.hypot(p.x-f.x,p.z-f.z)<90))continue;
 for(const run of [8,6,4]){
  f.moundRun=run;w.meta.features=[f];snowFeature(w,f);w.obstaclesNear=createObstacleStore(w);const undo=addSnowLip(w,f,1.5),runs=[];
  for(const target of [10,14,18]){const r=calibrateFeature(w,f,target);runs.push(r);if(r.error>=.15||!r.flight||r.flight.air<.5||r.crash||!r.completed||r.flight.landing.powder<.85||r.flight.landing.depth<.9)break;}
  const pass=runs.length===3&&runs.every(r=>r.error<.15&&r.flight?.air>=.5&&!r.crash&&r.completed&&r.flight.landing.powder>=.85&&r.flight.landing.depth>=.9);
  results.push({feature:{...f},runs,pass});undo();w.buffers.masksA.set(a);w.buffers.masksB.set(b);
  if(pass){f.approach.speed=runs[1].initial;accepted.push(f);console.log('ACCEPT',f.id,f.region,f.x,f.z,f.drop,run,runs.map(r=>[r.edge,r.flight.air,r.flight.impact]));break;}
 }
 writeFileSync(dir+'/refine.json',JSON.stringify(results));writeFileSync('tools/worldgen/lib/feature-sites.json',JSON.stringify(accepted,null,2)+'\n');
}
console.log('RESULT',accepted.length);
