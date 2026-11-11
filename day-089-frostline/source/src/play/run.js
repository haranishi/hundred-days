import { RULES as R } from './rules.js';
import { scoreTrick } from './tricks.js';
export function createRun(drop,state) {
  return { dropId:drop?.id ?? null, time:0, descent:0, distance:0, maxSpeed:state.speed ?? 0, air:0, score:0, tricks:[], crashes:0,
    station:null, startY:state.pos.y, previous:{...state.pos}, stopped:0, stationStop:0, stationId:null };
}
export function updateRun(run,state,events,dt,stations) {
  run.time+=dt; run.distance+=Math.hypot(state.pos.x-run.previous.x,state.pos.y-run.previous.y,state.pos.z-run.previous.z);
  run.descent=Math.max(0,run.startY-state.pos.y); run.maxSpeed=Math.max(run.maxSpeed,state.speed ?? 0);
  if (state.mode==='air') run.air+=dt;
  run.previous={...state.pos};
  const landed=[];
  for (const event of events) {
    if(event.type==='crash') run.crashes++;
    if(event.type==='land') { const trick=scoreTrick(events.some(e=>e.type==='crash')?{...event,quality:'crash'}:event,state.gear);
      // 転んだ飛びは 0 点。記録には残すが、画面には「技」として出さない（「大きなジャンプ ＋0 点」と出た）
      if(trick) {run.tricks.push(trick);run.score+=trick.score;if(trick.score>0)landed.push(trick);}
      else run.tricks.push({name:'',score:0,spin:0,flip:0,air:event.air??0,drop:event.drop??0,quality:event.quality??'clean'}); }
  }
  const grounded=state.mode!=='air'&&state.mode!=='crash';
  const station=stations.find(s=>Math.hypot(state.pos.x-s.x,state.pos.z-s.z)<=s.radius);
  run.stopped=grounded&&state.speed<R.stopSpeed&&!station?run.stopped+dt:0;
  run.stationStop=grounded&&station&&state.speed<R.stopSpeed ? (run.stationId===station.id?run.stationStop:0)+dt:0;
  run.stationId=station?.id ?? null;
  if(grounded&&station&&((station.base&&state.speed<R.stationSpeed)||(!station.base&&run.stationStop+1e-9>=R.middleStop))) run.station=station.id;
  return landed;
}
