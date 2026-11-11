import {spline} from '../../../src/world/surface-math.js';
import {VALLEY,RIDGES,GLACIER,LAKE,LAKE_LEVEL} from './alpine.js';
import {foundations} from './valley-objects.js';
import {lakeInside,trailDistance} from './valley-layout.js';
import {runRide} from './verify-features.js';
import {traceValley} from './stations.js';
const angle=(w,x,z)=>Math.acos(Math.max(-1,Math.min(1,w.sampleSurface(x,z,{}).ny)))*180/Math.PI;
export function auditValley(w){
 const points=[...VALLEY.map(([x,z,h],i)=>['valley-'+i,x,z,h]),...RIDGES.flatMap(r=>r.points.map(([x,z,h],i)=>[r.id+'-'+i,x,z,h])),['lake',LAKE.x,LAKE.z,LAKE_LEVEL],['bridge',w.meta.structures.bridge.x,w.meta.structures.bridge.z,w.meta.structures.bridge.y+w.meta.structures.bridge.rise],...GLACIER.map(([x,z,h],i)=>['glacier-'+i,x,z,h])].map(([name,x,z,target])=>({name,x,z,target,actual:w.heightAt(x,z),heightError:w.heightAt(x,z)-target}));
 let highest={x:0,z:0,y:-Infinity},lakeMin=Infinity,lakeMax=-Infinity,rock=0,count=0,piste=0,good=0,eastSum=0,eastCount=0;const bins=[0,0,0,0,0,0];
 for(let z=-2040;z<2048;z+=16)for(let x=-2040;x<2048;x+=16){const h=w.heightAt(x,z),a=angle(w,x,z);if(h>highest.y)highest={x,z,y:h};bins[a<10?0:a<25?1:a<38?2:a<50?3:a<62?4:5]++;rock+=w.snowAt(x,z,{}).rock;count++;
  if(x>=350&&x<=1700&&z>=-600&&z<=1150){eastSum+=a;eastCount++;}
  if(lakeInside(x,z)){lakeMin=Math.min(lakeMin,h);lakeMax=Math.max(lakeMax,h);}
  if(x>=350&&x<=1700&&z>=-600&&z<=1150&&trailDistance(x,z)<30){piste++;if(a>=10&&a<=25)good++;}
 }
 const raw=(x,z)=>spline(w.buffers.height,w.meta.grid,(x+2048)/w.meta.cell-.5,(z+2048)/w.meta.cell-.5);
 const buildings=foundations(w.meta.structures).map(b=>{let min=Infinity,max=-Infinity;for(let u=-b.length/2;u<=b.length/2;u+=2)for(let v=-b.width/2;v<=b.width/2;v+=2){const x=b.x+Math.sin(b.yaw)*u+Math.cos(b.yaw)*v,z=b.z-Math.cos(b.yaw)*u+Math.sin(b.yaw)*v,h=w.heightAt(x,z);min=Math.min(min,h);max=Math.max(max,h);}return {x:b.x,z:b.z,height:b.y,range:max-min,pass:max-min<.05};});
 const b=w.meta.structures.bridge,bridgeBanks=[-1,1].map(sign=>({height:raw(b.x+sign*b.length/2,b.z),target:b.y}));
 const surroundings=[['village',w.meta.stations[0].x,w.meta.stations[0].z],['lift-base',w.meta.structures.lift.base.x,w.meta.structures.lift.base.z]].map(([id,x,z])=>{let max=0;for(let dz=-150;dz<=150;dz+=6)for(let dx=-150;dx<=150;dx+=6)if(Math.hypot(dx,dz)<=150)max=Math.max(max,angle(w,x+dx,z+dz));return {id,max,pass:max<=40};});
 const village=w.meta.stations.find(s=>s.id==='village'),drops=w.drops.map(d=>{const required=d.level<=2?25:6,r=runRide(w,{...d,speed:d.speed??0},required),route=traceValley(w,d);let distance=Infinity;for(const p of route.points)distance=Math.min(distance,Math.hypot(p.x-village.x,p.z-village.z));return {id:d.id,x:d.x,z:d.z,required,crash:r.crash,ridePass:!r.crash,travel:Math.hypot(r.end.x-d.x,r.end.z-d.z),distance,routePass:distance<=150,routeReason:route.reason};});
 const RESERVED=w.meta.reserved[0],reserve=[];for(let s=0;s<=400;s+=20)for(const t of [-30,0,30]){const x=RESERVED.x+Math.sin(RESERVED.heading)*s+Math.cos(RESERVED.heading)*t,z=RESERVED.z-Math.cos(RESERVED.heading)*s+Math.sin(RESERVED.heading)*t;reserve.push({angle:angle(w,x,z),trees:w.treeDensityAt(x,z)});}
 const glacier=GLACIER.slice(1).map(([x,z],i)=>({x,z,drop:w.heightAt(GLACIER[i][0],GLACIER[i][1])-w.heightAt(x,z)}));
 // Current Alpine control lines, rather than the superseded I15c straight valley.
 const depths=VALLEY.slice(1,-2).map(([x,z])=>({x,z,west:w.heightAt(x-400,z)-w.heightAt(x,z),east:w.heightAt(x+400,z)-w.heightAt(x,z)}));
 const checks={placement:points.filter(p=>p.name.startsWith('valley-')||p.name==='lake').every(p=>Math.abs(p.heightError)<=60),summit:Math.hypot(highest.x-40,highest.z+1660)<=120&&Math.abs(highest.y-Math.max(...RIDGES.flatMap(r=>r.points.map(p=>p[2]))))<=60,lake:lakeMax-lakeMin<.05,foundations:buildings.every(b=>b.pass),bridgeBanks:bridgeBanks.every(p=>Math.abs(p.height-p.target)<.2),dropRides:drops.length===(w.meta.park?.independent?18:16)&&drops.every(d=>d.ridePass),stationRoutes:drops.filter(d=>d.routePass).length>=12,piste:piste>0&&good/piste>=.55&&eastSum/Math.max(1,eastCount)>=14&&eastSum/Math.max(1,eastCount)<=22,surroundings:surroundings.every(p=>p.pass),reserved:reserve.every(p=>p.angle>=Math.max(0,RESERVED.slopeRange[0]-2)&&p.angle<=RESERVED.slopeRange[1]+2&&p.trees<.001),views:w.meta.views.length===9&&w.meta.views.every(v=>v.pos[1]>w.heightAt(v.pos[0],v.pos[2]))};
 return {points,highest,lake:{min:lakeMin,max:lakeMax,range:lakeMax-lakeMin},buildings,bridgeBanks,surroundings,drops,piste:{samples:piste,fraction:good/Math.max(1,piste),regionMean:eastSum/Math.max(1,eastCount)},reserve,glacier,reportOnly:{rockFraction:rock/count,slopeBins:{bounds:[10,25,38,50,62],counts:bins},valleyDepth:depths,ridges:RIDGES.map(r=>({id:r.id,points:r.points})),method:'Alpine VALLEY nodes: banks +/-400m. RIDGES control heights are report-only: warped coordinates, crest noise and erosion move the actual crest. No I15c morphology probes.'},checks,pass:Object.values(checks).every(Boolean)};
}
export function valleyMarkdown(v){return '# Alpine 本番地形検査\n\n'+JSON.stringify(v.checks)+'\n\n|場所|X|Z|目標m|実測m|差m|\n|---|---:|---:|---:|---:|---:|\n'+v.points.map(p=>`|${p.name}|${p.x}|${p.z}|${p.target}|${p.actual.toFixed(2)}|${p.heightError.toFixed(2)}|`).join('\n')+'\n\n詳細は verify-valley.json。数値のための形状追加は行わない。\n';}
