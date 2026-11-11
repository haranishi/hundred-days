import {stationRide} from '../../tools/worldgen/lib/terrain-rides.js';
import {parkPoint} from '../../tools/worldgen/lib/park-search.js';
import {beforeAll,test,expect} from 'vitest';
import {readDelivered} from '../../tools/worldgen/verify-valley.mjs';
import {featureRide} from '../../tools/worldgen/lib/feature-rides.js';
import {runRide} from '../../tools/worldgen/lib/verify-features.js';
import {traceValley} from '../../tools/worldgen/lib/stations.js';
import {validateMeta} from '../../src/world/format.js';
let w;
beforeAll(()=>{w=readDelivered();});
test('every published feature can be ridden at all three measured speeds, including every roller flight',()=>{
 expect(w.meta.features.filter(f=>['lip','cliff'].includes(f.kind)).length).toBeGreaterThanOrEqual(10);
 for(const f of w.meta.features){const record=w.meta.featureVerification.measurements.find(r=>r.id===f.id);expect(record.runs.length).toBe(f.kind==='rollers'?1:3);
  for(const measured of record.runs){const r=featureRide(w,f.kind==='kicker'?{...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}}:f,measured.initial);expect(r.crash,f.id).toBeNull();expect(r.completed,f.id).toBe(true);expect(Math.abs(r.edge-measured.target),f.id).toBeLessThan(.15);expect(r.flight,f.id).not.toBeNull();expect(r.flight.air,f.id).toBeGreaterThanOrEqual(f.kind==='rollers'?.2:.5);expect(r.flight.impact).toBeLessThanOrEqual(r.flight.limit);expect(r.flight.landing.powder).toBeGreaterThanOrEqual(.85);expect(r.flight.landing.depth).toBeGreaterThanOrEqual(.9);
   if(f.kind==='rollers'){const flights=r.flights.filter(p=>p.s>=0&&p.s<60);expect(flights.length).toBeGreaterThanOrEqual(2);for(const flight of flights){expect(flight.air).toBeGreaterThanOrEqual(.2);expect(flight.air).toBeLessThanOrEqual(.5);}}
  }
 }
},60000);
test('all eighteen entrances survive their required unattended ride and twelve flow routes reach the village',()=>{
 expect(w.drops).toHaveLength(18);const village=w.meta.stations.find(s=>s.id==='village');let connected=0;
 for(const d of w.drops){const r=runRide(w,{...d,speed:d.speed??0},d.level<=2?25:6);expect(r.crash,d.id).toBeNull();if(traceValley(w,d).points.some(p=>Math.hypot(p.x-village.x,p.z-village.z)<=150))connected++;}
 expect(connected).toBeGreaterThanOrEqual(12);
 // 最初の一本（並びの先頭）は、森の道：無操作で、転ばず・浮かず・時速 55 km 以下で、駅に着く
 const first=w.drops[0],practice=stationRide(w,first,{seconds:80});expect(first.id).toBe('forest-trail');expect(practice.crash).toBeNull();expect(practice.maxSpeed).toBeLessThanOrEqual(55);expect(practice.arrival).not.toBeNull();expect(practice.arrival).toBeLessThanOrEqual(60);
 // 谷のゲレンデ（広い帯）：無操作で、転ばずに駅へ着く
 const piste=stationRide(w,w.drops.find(d=>d.id==='first-snow'),{seconds:80});expect(piste.crash).toBeNull();expect(piste.arrival).not.toBeNull();
 for(const id of ['jump-valley','big-air']){const row=w.meta.featureVerification.aligned.find(r=>r.id===id),f=w.meta.features.find(f=>f.id===row.feature),d=w.drops.find(d=>d.id===id),r=featureRide(w,{...f,approach:d},d.speed);expect(r.edge).toBeGreaterThanOrEqual(f.speed[0]-.15);expect(r.edge).toBeLessThanOrEqual(f.speed[1]+.15);}
},60000);
test('feature schema rejects missing drop, unsafe retry and duplicate identifiers in delivered data',()=>{
 for(const mutate of [f=>delete f.drop,f=>Object.assign(f.approach,{x:f.x,z:f.z}),f=>f.name='',f=>f.speed=[18,10]]){const meta=structuredClone(w.meta);mutate(meta.features[0]);expect(()=>validateMeta(meta)).toThrow(/npm run worldgen/);}
 const meta=structuredClone(w.meta);meta.features.push(meta.features[0]);expect(()=>validateMeta(meta)).toThrow(/npm run worldgen/);
});
