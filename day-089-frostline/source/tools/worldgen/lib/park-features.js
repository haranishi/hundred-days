import {softenParkBanks} from './park-banks.js';
import {readFileSync} from 'node:fs';
import {makeKicker} from './feature-stamps.js';
import {searchPark,parkPoint,parkLocal,parkWeight} from './park-search.js';
import {calibrateFeature} from './feature-rides.js';
export const parkBands=p=>p.bands??[p];
export function choosePark(height,c,structures){
 const features=[...JSON.parse(readFileSync(new URL('./feature-sites.json',import.meta.url))),...JSON.parse(readFileSync(new URL('./roller-sites.json',import.meta.url)))];
 const stations=[{x:-80,z:100,radius:32},{x:205,z:1255,radius:32},structures.lift.base,structures.lift.top].map(s=>({...s,radius:s.radius??32}));
 const legacy=searchPark(height,c,structures,features,stations,{length:260});
 if(!legacy.best)throw new Error('No protected park fallback');
 const first={...legacy.best,id:'east-park',size:'S',lip:45,blend:105,slopeRange:[18,18]},bands=[first],searches=[];
 const required=features.filter(f=>['natural-520','natural-983','natural-1622'].includes(f.id)||f.kind==='rollers');
 for(const [id,size,length,lip] of [['east-park-small-2','S',260,45],['east-park-mid','M',300,60]]){
  const r=searchPark(height,c,structures,required,stations,{length,bounds:[300,1700,-900,900],blend:105,exclude:bands});
  searches.push({id,searched:r.searched,accepted:r.accepted,best:r.best});
  if(!r.best)throw new Error('No independent park band '+id);
  bands.push({...r.best,id,size,lip,slopeRange:[18,18]});
 }
 const removed=features.filter(f=>f.id.startsWith('natural-')&&bands.some(p=>{
  for(let s=-80;s<=f.length+40;s+=8)for(const t of [-f.width/2-24,0,f.width/2+24]){const q=parkPoint(f,s,t);if(parkWeight(p,q.x,q.z)>0)return true;}return false;
 })).map(f=>f.id);
 if(required.some(f=>removed.includes(f.id)))throw new Error('Protected natural feature intersects park');
 return {...first,bands,removed,searches,independent:true};
}
export function parkKickers(p){
 if(p.bands)return p.bands.flatMap(parkKickers);
 const medium=p.size==='M',lip=p.lip??45,stamp=makeKicker({size:medium?'medium':'small',slopeDeg:p.slopeDeg}),point=parkPoint(p,lip);
 return [{id:p.id==='east-park'?'park-small-1':medium?'park-mid':'park-small-2',band:p.id,name:p.id==='east-park'?'パークの小さい台':medium?'東の中くらいの台':'森上の小さい台',kind:'kicker',size:medium?'M':'S',...point,y:p.y-Math.tan(p.slopeDeg*Math.PI/180)*lip+stamp.lipHeight,heading:p.heading,length:stamp.after,width:stamp.edgeWidth,drop:0,height:stamp.lipHeight,speed:medium?[13,18]:[10,14],air:[medium?.85:.55,3],landingEnd:stamp.landingEnd,stampWidth:Math.min(150,stamp.width),before:stamp.before,approach:{...parkPoint(p,lip-35),heading:p.heading,speed:0}}];
}
export function groomPark(height,c,p){
 if(p.bands){const old=height.slice(),features=p.bands.flatMap(b=>groomPark(height,c,b));let max=0,count=0;for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){const x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2;if(p.bands.every(b=>parkWeight(b,x,z)<=0)){max=Math.max(max,Math.abs(height[j*c.grid+i]-old[j*c.grid+i]));count++;}}p.conservation={outsideGridMax:max,outsideGridCells:count,splineHalo:2*c.cell*Math.SQRT2};return features;}
 const pitch=Math.tan(p.slopeDeg*Math.PI/180),features=parkKickers(p),stamps=features.map(f=>makeKicker({size:f.size==='S'?'small':'medium',slopeDeg:p.slopeDeg}));
 let cut=0,fill=0,changed=0,volume=0;
 for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){
  const x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2,k=j*c.grid+i,a=parkWeight(p,x,z);if(a<=0)continue;
  const q=parkLocal(p,x,z),before=height[k];let target=before*(1-a)+(p.y-pitch*q.s)*a;
  for(let n=0;n<features.length;n++){const r=parkLocal(features[n],x,z),stamp=stamps[n];target+=stamp.delta(r.s,r.t*stamp.width/features[n].stampWidth);}
  height[k]=target;const delta=height[k]-before;cut=Math.max(cut,-delta);fill=Math.max(fill,delta);volume+=delta*c.cell*c.cell;changed++;
 }
 softenParkBanks(height,c,p);
 p.grading={cut,fill,changed,netVolumeWithKicker:volume};return features;
}
export function calibratePark(world){
 const features=world.meta.features.filter(f=>f.kind==='kicker');return features.map(f=>{
  f.y=world.heightAt(f.x,f.z);
  // Test velocities start nearer the lip; the published retry remains >=35m upstream.
  const test={...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}},targets=f.size==='M'?[13,15.5,18]:[10,12,14],runs=targets.map(v=>calibrateFeature(world,test,v));
  const retry=calibrateFeature(world,f,targets[1]);f.approach.speed=retry.initial;f.air=[Math.min(...runs.map(r=>r.flight?.air??0)),Math.max(...runs.map(r=>r.flight?.air??0))];
  const pass=runs.every(r=>r.error<.15&&r.flight?.air>=(f.size==='M'?.85:.55)&&!r.crash&&r.completed)&&retry.error<.15&&!retry.crash;
  if(!pass)throw new Error('Unverified park kicker '+f.id);
  return {id:f.id,runs:runs.map(({points,...r})=>r),pass};
 });
}
