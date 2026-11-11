import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readDelivered} from '../../tools/worldgen/verify-valley.mjs';
import {parkWeight,parkPoint} from '../../tools/worldgen/lib/park-search.js';
import {featureRide,calibrateFeature} from '../../tools/worldgen/lib/feature-rides.js';
import {inFeatureClearance} from '../../src/world/feature-clearance.js';
test('park blend has finite support, level cross sections and a clear inner margin',()=>{
 const p={id:'east-park',x:600,z:0,heading:Math.PI/3,length:260,width:150};
 for(const s of [0,40,130,260]){for(const t of [-75,0,75]){const q=parkPoint(p,s,t);expect(parkWeight(p,q.x,q.z)).toBeCloseTo(1,10);}for(const t of [-170,170]){const q=parkPoint(p,s,t);expect(parkWeight(p,q.x,q.z)).toBe(0);}const q=parkPoint(p,s,94);expect(inFeatureClearance({reserved:[p]},q.x,q.z,2)).toBe(true);}
 for(const s of [-100,360]){const q=parkPoint(p,s);expect(parkWeight(p,q.x,q.z)).toBe(0);}
});
test('delivered kicker flies at all requested speeds, with charged pop and offset; retry stays upstream',()=>{
 const w=readDelivered('public/world'),features=w.meta.features.filter(f=>f.kind==='kicker');expect(features.length).toBeGreaterThan(0);
 for(const f of features){const test={...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}},targets=f.size==='M'?[13,15.5,18]:[10,12,14],runs=targets.map(v=>calibrateFeature(w,test,v));
 for(const r of runs){expect(r.error).toBeLessThan(.15);expect(r.flight?.air).toBeGreaterThanOrEqual(f.size==='M'?.85:.55);expect(r.crash).toBe(null);expect(r.completed).toBe(true);}
 const mid=runs[1];for(const options of [{pop:true},{offset:2}]){const r=featureRide(w,test,mid.initial,options);expect(r.crash).toBe(null);expect(r.flight?.landing.powder).toBeGreaterThanOrEqual(.85);expect(r.flight?.landing.depth).toBeGreaterThanOrEqual(.9);if(options.pop){expect(r.flight.pop).toBe(true);expect(['clean','heavy']).toContain(r.flight.quality);}}
 const a=f.approach,along=(a.x-f.x)*Math.sin(f.heading)-(a.z-f.z)*Math.cos(f.heading);expect(along).toBeLessThanOrEqual(-35+1e-8);const retry=featureRide(w,f);expect(Math.abs(retry.edge-targets[1])).toBeLessThan(.15);expect(retry.crash).toBe(null);
 }
});
test('independent bands replace the former continuous three-kicker layout',()=>{
 const m=JSON.parse(readFileSync('public/world/world.json'));expect(m.park.independent).toBe(true);expect(m.park.bands.map(b=>b.length)).toEqual([260,260,300]);expect(m.reserved.map(b=>b.id)).toEqual(m.park.bands.map(b=>b.id));
});
