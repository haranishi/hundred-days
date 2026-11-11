import {writeFileSync,mkdirSync} from 'node:fs';
import {createRide} from '../../../src/sim/index.js';
import {PARAMS} from '../../../src/sim/params.js';
import {scoreTrick} from '../../../src/play/tricks.js';
import {calibrateFeature,featureRide} from './feature-rides.js';
import {parkLocal,parkPoint,parkWeight} from './park-search.js';
import {parkBands} from './park-features.js';
export function verifyPark(w,dir='.agent-harness/runs/worldgen/i17d'){
 if(!w.meta.park)return null;mkdirSync(dir,{recursive:true});
 const measurements=w.meta.features.filter(f=>f.kind==='kicker').map(f=>{
  const test={...f,approach:{...parkPoint(f,-15),heading:f.heading,speed:0}},targets=f.size==='S'?[10,12,14]:[13,15.5,18],straight=targets.map(v=>calibrateFeature(w,test,v)),mid=straight[1];
  const runs=[...straight.map(r=>({...r,mode:'straight'})),{...featureRide(w,test,mid.initial,{pop:true}),mode:'pop',target:targets[1]},{...featureRide(w,test,mid.initial,{offset:2}),mode:'offset+2',target:targets[1]}];
  for(const r of runs)r.pass=!!r.flight&&!r.crash&&r.completed&&r.flight.air>=(f.size==='S'?.55:.85)&&r.flight.landing.powder>=.85&&r.flight.landing.depth>=.9&&(r.mode!=='straight'||r.error<.15)&&(r.mode!=='pop'||r.flight.pop&&['clean','heavy'].includes(r.flight.quality));
  const retry=featureRide(w,f,f.approach.speed),d=w.drops.find(d=>d.id===({'park-small-1':'jump-valley','park-small-2':'jump-small-2','park-mid':'jump-mid'}[f.id]));
  const ride=createRide(w);ride.reset({...d,speed:d.speed??0});let edge=null,land=null,crash=null,seconds=0;
  for(let tick=0;tick<40*240;tick++){
   const prev=parkLocal(f,ride.state.pos.x,ride.state.pos.z).s;ride.step({},1/240);seconds=(tick+1)/240;
   if(prev<0&&parkLocal(f,ride.state.pos.x,ride.state.pos.z).s>=0&&edge===null)edge=ride.state.speed;
   for(const e of ride.events){if(e.type==='crash')crash={time:seconds,reason:e.reason};if(e.type==='land'&&edge!==null&&land===null)land=seconds;}
   if(crash||land!==null&&seconds>=land+6)break;
  }
  const spawn={id:d.id,x:d.x,z:d.z,speed:d.speed??0,edge,land,seconds,crash,pass:!crash&&land!==null&&seconds>=land+6&&edge>=f.speed[0]&&edge<=f.speed[1]};
  return {id:f.id,x:f.x,z:f.z,runs:runs.map(({points,...r})=>r),retry:{edge:retry.edge,crash:retry.crash,pass:Math.abs(retry.edge-targets[1])<.15&&!retry.crash},spawn,pass:runs.every(r=>r.pass)};
 });
 const banks=parkBands(w.meta.park).map(p=>{let max=0,at=null;for(let s=-125;s<=p.length+125;s+=2)for(let t=-200;t<=200;t+=2){const q=parkPoint(p,s,t),a=parkWeight(p,q.x,q.z);if(a<=0||a>=1)continue;const deg=Math.acos(w.sampleSurface(q.x,q.z,{}).ny)*180/Math.PI;if(deg>max){max=deg;at={s,t,...q};}}return {id:p.id,max,at,pass:max<=38};});
 const popAir=Math.max(...measurements.flatMap(m=>m.runs.filter(r=>r.mode==='pop').map(r=>r.flight?.air??0)));
 const result={conservation:w.meta.park.conservation,measurements,banks,removed:w.meta.park.removed,estimate:{popAir,flipSeconds:2*Math.PI/PARAMS.flipSpeed+PARAMS.trickDelay+.2,combo:scoreTrick({air:popAir,spin:2*Math.PI,flip:2*Math.PI,grab:1,grabTime:1,quality:'clean'})},checks:{outside:w.meta.park.conservation?.outsideGridMax===0,three:measurements.length===3,individual:measurements.every(m=>m.pass),retry:measurements.every(m=>m.retry.pass),spawn:measurements.every(m=>m.spawn.pass),banks:banks.every(b=>b.pass)}};
 writeFileSync(dir+'/verify-park.json',JSON.stringify(result,null,2)+'\n');
 const lines=['# I17d 独立したジャンプ台の実測','','|台/条件|縁m/s|滞空s|新雪/深さm|着地|転倒|合否|','|---|---:|---:|---|---|---|---|'];for(const m of measurements)for(const r of m.runs)lines.push(`|${m.id}/${r.mode}/${r.target}|${r.edge?.toFixed(3)}|${r.flight?.air.toFixed(3)}|${r.flight?.landing.powder.toFixed(3)}/${r.flight?.landing.depth.toFixed(3)}|${r.flight?.quality}|${r.crash?.reason??'なし'}|${r.pass}|`);
 lines.push('',`接続：${JSON.stringify(banks)}`,`出発：${JSON.stringify(measurements.map(m=>m.spawn))}`,`除去：${result.removed.join(', ')}`,`判定：${JSON.stringify(result.checks)}`);writeFileSync(dir+'/verify-park.md',lines.join('\n')+'\n');return result;
}
