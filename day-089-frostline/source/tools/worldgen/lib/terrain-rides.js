import {createRide} from '../../../src/sim/index.js';
export function stationRide(w,d,{alternate=false,seconds=120,trace=false}={}){
 const station=w.meta.stations.find(s=>s.id==='village'),ride=createRide(w);ride.reset({...d,speed:d.speed??0});let maxSpeed=0,crash=null,arrival=null,elapsed=0;const points=[];
 for(let i=0;i<seconds*240;i++){
  ride.step({steer:alternate?(Math.floor(i/240)%2?.5:-.5):0},1/240);elapsed=(i+1)/240;maxSpeed=Math.max(maxSpeed,ride.state.speed*3.6);
  if(trace&&i%12===0)points.push({...ride.state.pos,speed:ride.state.speed,mode:ride.state.mode});
  for(const e of ride.events)if(e.type==='crash')crash={time:elapsed,reason:e.reason};
  if(Math.hypot(ride.state.pos.x-station.x,ride.state.pos.z-station.z)<=station.radius){arrival=elapsed;break;}if(crash)break;
 }
 return {id:d.id,alternate,maxSpeed,crash,arrival,elapsed,end:{...ride.state.pos},points};
}
