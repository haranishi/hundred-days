import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {readDelivered} from './verify-valley.mjs';
import {createObstacleStore} from '../../src/world/obstacles.js';
import {calibrateFeature,featureRide,snowFeature} from './lib/feature-rides.js';
import {addSnowLip,scanNaturalFeatures} from './lib/natural-features.js';
const dir='.agent-harness/runs/worldgen/features';mkdirSync(dir,{recursive:true});
const w=readDelivered(),mound=process.argv.includes('--mound'),label=mound?'mound':'search';
const candidates=process.argv.includes('--scan')?scanNaturalFeatures(w,{step:6}):JSON.parse(readFileSync(dir+'/candidates.json'));
writeFileSync(dir+'/candidates.json',JSON.stringify(candidates));
const results=[],accepted=[],a=w.buffers.masksA.slice(),b=w.buffers.masksB.slice();
candidates.sort((a,b)=>a.before-b.before||a.z-b.z||a.x-b.x);
const dump=()=>{writeFileSync(dir+'/'+label+'.json',JSON.stringify(results,null,2));writeFileSync('tools/worldgen/lib/feature-sites'+(mound?'-mound':'')+'.json',JSON.stringify(accepted,null,2)+'\n');};
for(const [i,c]of candidates.entries()){
 if(c.before<0||c.before>30||accepted.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<90))continue;
 const f={...c,id:'natural-'+i,name:'雪の段',size:c.drop<5?'S':'M',height:c.drop,y:w.heightAt(c.x,c.z),length:65,width:40,speed:[10,18],air:[.5,10],approach:{x:c.x-Math.sin(c.heading)*40,z:c.z+Math.cos(c.heading)*40,heading:c.heading,speed:0},mound:mound?1.5:0};
 w.meta.features=[f];snowFeature(w,f);w.obstaclesNear=createObstacleStore(w);
 const undo=mound?addSnowLip(w,f):()=>{};
 const zero=featureRide(w,f,0,{entryOnly:true});let runs=[],reason=null;
 if(zero.edge!==null&&zero.edge>10.15)reason='minimum edge speed exceeds 10m/s';
 else for(const target of [10,14,18]){const r=calibrateFeature(w,f,target);runs.push(r);if(r.error>=.15||!r.flight||r.flight.air<.5||r.crash||!r.completed||r.flight.landing.powder<.85||r.flight.landing.depth<.9)break;}
 const pass=runs.length===3&&runs.every(r=>r.error<.15&&r.flight?.air>=.5&&!r.crash&&r.completed&&r.flight.landing.powder>=.85&&r.flight.landing.depth>=.9);
 if(pass){f.approach.speed=runs[1].initial;accepted.push(f);console.log('ACCEPT',i,c.region,c.x,c.z,c.drop,runs.map(r=>[r.edge,r.flight.air,r.flight.impact]));}
 results.push({feature:f,zero:{edge:zero.edge,crash:zero.crash},runs:runs.map(({points,...r})=>r),reason,pass});
 undo();w.buffers.masksA.set(a);w.buffers.masksB.set(b);
 if(i%20===0){console.log(i,'accepted',accepted.length);dump();}
}
dump();console.log('RESULT',accepted.length,'of',results.length);
