import {test,expect} from 'vitest';
import {settlementFlood} from '../../tools/worldgen/lib/settlement-drainage.js';
import {groomPark} from '../../tools/worldgen/lib/park-features.js';
import {parkWeight,parkPoint} from '../../tools/worldgen/lib/park-search.js';
import {paintGullySnow} from '../../tools/worldgen/lib/gully-snow.js';
import {readDelivered} from '../../tools/worldgen/verify-valley.mjs';
test('settlement escape audit detects an enclosed 3m basin, fills it and preserves every exterior cell',()=>{
 const c={size:4096,grid:256,cell:16},height=new Float32Array(256**2).fill(100),i=Math.floor((300+2048)/16),j=Math.floor((1250+2048)/16);height[j*256+i]=97;const old=height.slice();
 expect(settlementFlood(height,c).maxDepth).toBe(3);settlementFlood(height,c,{apply:true});expect(settlementFlood(height,c).maxDepth).toBe(0);
 for(let k=0;k<height.length;k++)if(k!==j*256+i)expect(height[k]).toBe(old[k]);
});
test('park grading and bank projection preserve every cell outside their finite support',()=>{
 const c={size:4096,grid:256,cell:16},p={id:'east-park',x:680,z:340,heading:Math.PI*7/6,y:1400,length:260,width:150,slopeDeg:18,blend:105},height=Float32Array.from({length:256**2},(_,k)=>1400-((Math.floor(k/256)+.5)*16-2048)*.2),old=height.slice();groomPark(height,c,p);let changed=0;
 for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){const k=j*c.grid+i;if(parkWeight(p,(i+.5)*16-2048,(j+.5)*16-2048)===0)expect(height[k]).toBe(old[k]);else changed+=height[k]!==old[k];}expect(changed).toBeGreaterThan(100);
});
test('gully snow never changes the height lattice',()=>{
 const c={size:4096,grid:128,cell:32,maskGrid:64},height=Float32Array.from({length:128**2},(_,k)=>2000-k%128*32+.0008*(Math.floor(k/128)*32-2048)**2),old=height.slice(),masks=new Uint8Array(64*64*4);for(let k=3;k<masks.length;k+=4)masks[k]=255;
 paintGullySnow(height,c,masks);expect(height).toEqual(old);
});
test('all three independent jump entrances and protected natural shelves are published',()=>{
 const w=readDelivered();for(const id of ['natural-520','natural-983','natural-1622'])expect(w.meta.features.some(f=>f.id===id)).toBe(true);
 const features=w.meta.features.filter(f=>f.kind==='kicker');expect(features).toHaveLength(3);for(let i=0;i<features.length;i++)for(let j=i+1;j<features.length;j++)expect(Math.hypot(features[i].x-features[j].x,features[i].z-features[j].z)).toBeGreaterThanOrEqual(300);
 for(const id of ['jump-valley','jump-small-2','jump-mid']){const d=w.drops.find(d=>d.id===id);expect(d.kind).toBe('park');expect(d.speed??0).toBe(0);}
});

test('rock-garden metadata places 25–60 physical rocks inside 300m and clears the unattended line',()=>{
 const w=readDelivered(),g=w.meta.rockGardens[0];expect(g.rocks.length).toBeGreaterThanOrEqual(25);expect(g.rocks.length).toBeLessThanOrEqual(60);
 for(const r of g.rocks){expect(Math.hypot(r.x-g.x,r.z-g.z)).toBeLessThanOrEqual(300);const across=(r.x-g.x)*Math.cos(g.heading)+(r.z-g.z)*Math.sin(g.heading);expect(Math.abs(across)).toBeGreaterThan(5);expect(w.obstaclesNear(r.x,r.z,0,[]).some(o=>o.id===r.id)).toBe(true);}
});
