import {readFileSync,writeFileSync} from 'node:fs';
import {readDelivered} from './verify-valley.mjs';
import {parkWeight} from './lib/park-search.js';
import {forestNearest,forestSamples} from './lib/forest-trail.js';
import {trailDistance,pathDistance,streamX} from './lib/valley-layout.js';
const old=readDelivered('.agent-harness/runs/worldgen/park/determinism/world'),w=readDelivered(process.argv[2]??'public/world'),forest=forestSamples(),bands=[old.meta.park,...w.meta.park.bands],buildings=[old.meta.structures.lodge,...old.meta.structures.chalets,old.meta.structures.lift.base,old.meta.structures.lift.top,...[w.meta.structures.lodge,...w.meta.structures.chalets,w.meta.structures.lift.base,w.meta.structures.lift.top]],features=[...old.meta.features,...w.meta.features],roads=w.meta.structures.roads;
function inScope(x,z){
 if(bands.some(p=>parkWeight(p,x,z)>0))return true;
 if(forestNearest(x,z,forest).distance<77)return true;
 if(x>=60&&x<=462&&z>=1150&&z<=1402)return true;
 if(trailDistance(x,z)<40||roads.some(r=>pathDistance(x,z,r)<17))return true;
 if(w.meta.terrainRepairs.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius))return true;
 if(features.some(f=>Math.abs(x-f.x)<42&&Math.abs(z-f.z)<42))return true;
 if(z>1290&&z<1405&&Math.abs(x-streamX(z))<9)return true;
 for(const st of [old.meta.structures,w.meta.structures])if(Math.abs(x-st.bridge.x)<27&&Math.abs(z-st.bridge.z)<17)return true;
 return buildings.some(b=>{const dx=x-b.x,dz=z-b.z;return Math.max(Math.abs(dx*Math.sin(b.yaw)-dz*Math.cos(b.yaw))-b.length/2-3,Math.abs(dx*Math.cos(b.yaw)+dz*Math.sin(b.yaw))-b.width/2-3)<12;});
}
let outsideMax=0,outside=0,changed=0,leaked=0,at=null;const leaks=[];
for(let j=0;j<w.meta.grid;j++)for(let i=0;i<w.meta.grid;i++){const k=j*w.meta.grid+i,x=(i+.5)*2-w.half,z=(j+.5)*2-w.half,delta=Math.abs(w.buffers.height[k]-old.buffers.height[k]);if(delta)changed++;if(inScope(x,z))continue;outside++;if(delta){leaked++;if(leaks.length<20)leaks.push({x,z,delta});}if(delta>outsideMax){outsideMax=delta;at={x,z};}}
const changes={drops:w.drops.filter(d=>{const a=old.drops.find(q=>q.id===d.id);return !a||a.x!==d.x||a.z!==d.z||a.name!==d.name||a.heading!==d.heading||a.speed!==d.speed;}).map(d=>({id:d.id,name:d.name,x:d.x,z:d.z,heading:d.heading,speed:d.speed??0})),removed:old.meta.features.filter(f=>!w.meta.features.some(q=>q.id===f.id)).map(f=>({id:f.id,name:f.name,x:f.x,z:f.z})),added:w.meta.features.filter(f=>!old.meta.features.some(q=>q.id===f.id)).map(f=>({id:f.id,name:f.name,x:f.x,z:f.z}))};
const result={baseline:'.agent-harness/runs/worldgen/park/determinism/world',outsideMax,outside,changed,leaked,at,leaks,splineHalo:2*w.meta.cell*Math.SQRT2,pass:outsideMax===0,changes};writeFileSync('.agent-harness/runs/worldgen/i17d/bounds-and-changes.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
