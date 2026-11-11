import {parkPoint} from './park-search.js';
import {readFileSync} from 'node:fs';
import {addSnowLip} from './natural-features.js';
import {addRollers} from './roller-features.js';
import {snowFeature,calibrateFeature,featureRide} from './feature-rides.js';
import {createObstacleStore} from '../../../src/world/obstacles.js';
import {runRide} from './verify-features.js';
export const UNSAFE_RUNOUTS=['natural-575','natural-1706','natural-2096','natural-2195'];
const names=['東の肩','森上の段','大きな雪棚','ゲレンデ脇','氷河の肩','谷の雪棚','岩の落とし口','東の下段','西の小棚','東の入口','リフト脇','谷の上段','北東の棚','森の段','東の雪庇','東の中段','谷の西棚','南東の棚','下の谷棚','盆の出口'];
export function placeFeatures(world){
 const natural=JSON.parse(readFileSync(new URL('./feature-sites.json',import.meta.url))).filter(f=>!world.meta.park?.removed.includes(f.id)&&!UNSAFE_RUNOUTS.includes(f.id)),rollers=JSON.parse(readFileSync(new URL('./roller-sites.json',import.meta.url)));
 const features=[...natural.map((f,i)=>({...f,name:f.name&&f.name!=='雪の段'?f.name:names[i]??'雪の段',drop:f.drop,height:f.drop})),...rollers];
 for(const f of natural){
  const source=features.find(p=>p.id===f.id),at=s=>world.heightAt(f.x+Math.sin(f.heading)*s,f.z-Math.cos(f.heading)*s),slope=s=>Math.atan((at(s-3)-at(s+3))/6)*180/Math.PI;
  source.geometry={before:slope(-7.5),after:slope(7.5),landingAngles:Array.from({length:41},(_,i)=>20+i).map(slope),landingRockMax:Math.max(...[20,30,40,50,60].map(s=>world.snowAt(f.x+Math.sin(f.heading)*s,f.z-Math.cos(f.heading)*s,{}).rock)),naturalDrop:at(0)-at(15)-15*Math.tan(slope(-7.5)*Math.PI/180)};
  const g=source.geometry;if(g.after-g.before<12||g.landingAngles.some(a=>a<28||a>42)||g.naturalDrop<2||g.naturalDrop>12||g.landingRockMax>=.3)throw new Error(f.id+': current mountain does not match the measured natural site');
 }
 world.meta.removedUnsafe=UNSAFE_RUNOUTS;
 world.meta.features=features;
 for(const f of features){if(f.kind==='rollers')addRollers(world,f);else addSnowLip(world,f,f.mound);snowFeature(world,f);f.y=world.heightAt(f.x,f.z);}
 world.obstaclesNear=createObstacleStore(world);
 // Calibrate after all overlapping snow/height footprints exist. Keep evidence for every site.
 const measurements=features.map(f=>{const targets=f.kind==='rollers'?[20]:[10,14,18],runs=targets.map(v=>calibrateFeature(world,f,v)),mid=runs[Math.floor(runs.length/2)];
  f.approach.speed=mid.initial;const air=runs.flatMap(r=>f.kind==='rollers'?r.flights.filter(p=>p.s>=0&&p.s<60).map(p=>p.air):[r.flight?.air??0]);f.air=[Math.min(...air),Math.max(...air)];
  return {id:f.id,runs:runs.map(({points,...r})=>r),pass:runs.every(r=>r.error<.15&&Math.abs(r.edgeT)<=f.width/2&&r.flight?.landing.powder>=.85&&r.flight.landing.depth>=.9&&r.flight.impact<=r.flight.limit&&r.flight?.air>=(f.kind==='rollers'?.2:.5)&&(f.kind!=='rollers'||r.flights.filter(p=>p.s>=0&&p.s<60).length>=2&&r.flights.filter(p=>p.s>=0&&p.s<60).every(p=>p.air>=.2&&p.air<=.5))&&!r.crash&&r.completed)};});
 if(measurements.some(r=>!r.pass))throw new Error('Unverified features: '+measurements.filter(r=>!r.pass).map(r=>r.id).join(', '));
 return measurements;
}
export function alignFeatureEntrances(world,measurements){
 const naturals=world.meta.features.filter(f=>f.kind==='lip'||f.kind==='cliff');
 const longest=naturals.reduce((a,b)=>measurements.find(r=>r.id===a.id).runs[1].flight.air>=measurements.find(r=>r.id===b.id).runs[1].flight.air?a:b);
 const jump=naturals.find(f=>f.id==='natural-1922');
 const audit=[];
 for(const [id,f]of [['jump-valley',jump],['big-air',longest]]){
  if(id==='jump-valley'&&world.meta.park){
   for(const [index,p]of (world.meta.park.bands??[world.meta.park]).entries()){
    const k=world.meta.features.find(f=>f.band===p.id),dropId=['jump-valley','jump-small-2','jump-mid'][index];
    let d=world.drops.find(d=>d.id===dropId);if(!d){d={...world.drops.find(d=>d.id==='jump-valley'),id:dropId};world.drops.push(d);}
    Object.assign(d,parkPoint(p,p.size==='M'?-15:0),{name:k.name,speed:0,heading:p.heading,kind:'park',about:k.name+'。助走から深い新雪へ着地する'});d.y=world.heightAt(d.x,d.z);d.zone=world.zoneAt(d.x,d.z).id;
    world.obstaclesNear=createObstacleStore(world);const r=featureRide(world,{...k,approach:d},0),ride=runRide(world,d,25);audit.push({id:dropId,feature:k.id,edge:r.edge,air:r.flight?.air,crash:ride.crash,pass:!ride.crash&&r.edge>=k.speed[0]&&r.edge<=k.speed[1]});
   }continue;
  }
  if(!f)continue;const d=world.drops.find(d=>d.id===id);Object.assign(d,f.approach,{y:world.heightAt(f.approach.x,f.approach.z),zone:world.zoneAt(f.approach.x,f.approach.z).id,about:id==='big-air'?'下に、最も長く浮く大きな雪棚':'下に、東の自然の雪の段'});
  world.obstaclesNear=createObstacleStore(world);const r=featureRide(world,f,d.speed),ride=runRide(world,d,d.level<=2?25:6);audit.push({id,feature:f.id,edge:r.edge,air:r.flight?.air,crash:ride.crash,pass:!ride.crash&&r.edge>=f.speed[0]-.15&&r.edge<=f.speed[1]+.15});
 }
 for(const d of world.drops){if(d.speed!==undefined)continue;const near=naturals.filter(f=>{const dx=f.x-d.x,dz=f.z-d.z,s=dx*Math.sin(d.heading)-dz*Math.cos(d.heading),t=dx*Math.cos(d.heading)+dz*Math.sin(d.heading);return s>0&&s<160&&Math.abs(t)<f.width/2;});if(near.length)d.about=(d.about+'。下に雪の段'+near.length+'つ').slice(0,40);}
 return audit;
}

export function recalibratePlacedFeatures(world){
 return world.meta.features.map(f=>{
  const targets=f.kind==='rollers'?[20]:[f.speed[0],(f.speed[0]+f.speed[1])/2,f.speed[1]],test=f.kind==='kicker'?{...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}}:f,runs=targets.map(v=>calibrateFeature(world,test,v));
  const retry=calibrateFeature(world,f,targets[Math.floor(targets.length/2)]);f.approach.speed=retry.initial;f.y=world.heightAt(f.x,f.z);
  const air=runs.flatMap(r=>f.kind==='rollers'?r.flights.filter(p=>p.s>=0&&p.s<60).map(p=>p.air):[r.flight?.air??0]);f.air=[Math.min(...air),Math.max(...air)];
  return {id:f.id,runs:runs.map(({points,...r})=>r),pass:runs.every(r=>r.error<.15&&!!r.flight&&!r.crash&&r.completed)};
 });
}
