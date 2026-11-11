import {readFileSync,writeFileSync} from 'node:fs';
import {readDelivered} from './verify-valley.mjs';
import {searchPark,parkPoint,parkWeight} from './lib/park-search.js';
const w=readDelivered(),b=readFileSync('.agent-harness/runs/worldgen/park/before-height.f32'),h=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),required=w.meta.features.filter(f=>['natural-520','natural-983','natural-1622'].includes(f.id));
const old={...w.meta.park,blend:105};
const stations=w.meta.stations,opts={bounds:[300,1700,-900,900],blend:105};const selected=[old],results=[];
for(const [id,size,length,lip] of [['east-park-small-2','S',260,45],['east-park-mid','M',300,60]]){
 const r=searchPark(h,w.meta,w.meta.structures,required,stations,{...opts,length,exclude:selected});
 const candidates=r.candidates.slice(0,40).map(p=>({...p,id,size,lip}));results.push({id,searched:r.searched,accepted:r.accepted,candidates});if(candidates.length)selected.push(candidates[0]);
 console.log(id,r.searched,r.accepted,candidates.slice(0,3));
}
writeFileSync('.agent-harness/runs/worldgen/i17d/search.json',JSON.stringify({selected,results},null,2));
