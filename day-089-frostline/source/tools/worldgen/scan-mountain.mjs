import {readFileSync,writeFileSync} from 'node:fs';import {readDelivered} from './verify-valley.mjs';import {scanNaturalFeatures,addSnowLip} from './lib/natural-features.js';import {addRollers} from './lib/roller-features.js';import {createObstacleStore} from '../../src/world/obstacles.js';import {snowFeature,calibrateFeature} from './lib/feature-rides.js';
const w=readDelivered(),existing=w.meta.features,a=w.buffers.masksA.slice(),b=w.buffers.masksB.slice();
// Subtract delivered snow mounds for a new whole-mountain survey; never write these buffers.
for(const f of existing)if(f.kind!=='rollers')addSnowLip(w,f,-f.mound);
const candidates=scanNaturalFeatures(w,{step:6}),prior=JSON.parse(readFileSync('.agent-harness/runs/worldgen/features/candidates.json')),extra=candidates.filter(c=>c.region==='west'&&c.drop>=5&&c.before>=0&&c.before<=30&&!prior.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<8)&&!existing.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<90));
writeFileSync('.agent-harness/runs/worldgen/features/whole-mountain-candidates.json',JSON.stringify(candidates));console.log('full',candidates.length,'additional west >=5m',extra.length);
const rows=[],accepted=[];
for(const [index,c]of extra.entries()){
 if(accepted.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<90))continue;
 const f={...c,id:'west-extra-'+index,name:'西の落とし口',size:'M',height:c.drop,y:w.heightAt(c.x,c.z),length:65,width:40,speed:[10,18],air:[.5,10],approach:{x:c.x-Math.sin(c.heading)*40,z:c.z+Math.cos(c.heading)*40,heading:c.heading,speed:0},mound:1.5,moundRun:6};
 w.meta.features=[...existing,f];snowFeature(w,f);w.obstaclesNear=createObstacleStore(w);const undo=addSnowLip(w,f,f.mound),runs=[];for(const target of [10,14,18]){const r=calibrateFeature(w,f,target);runs.push(r);if(r.error>=.15||!r.flight||r.flight.air<.5||r.crash||!r.completed||r.flight.landing.powder<.85||r.flight.landing.depth<.9)break;}
 const pass=runs.length===3&&runs.every(r=>r.error<.15&&r.flight?.air>=.5&&!r.crash&&r.completed&&r.flight.landing.powder>=.85&&r.flight.landing.depth>=.9);rows.push({feature:f,runs,pass});undo();w.buffers.masksA.set(a);w.buffers.masksB.set(b);if(pass){f.approach.speed=runs[1].initial;accepted.push(f);console.log('ACCEPT',f,runs.map(r=>[r.edge,r.flight.air,r.flight.impact]));}
}
writeFileSync('.agent-harness/runs/worldgen/features/whole-mountain-west.json',JSON.stringify({count:candidates.length,additional:extra.length,rows,accepted},null,2));console.log('extra accepted',accepted.length);
