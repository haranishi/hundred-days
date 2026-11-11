import {PARAMS} from '../../../src/sim/params.js';
import {createRide} from '../../../src/sim/index.js';
export const localPoint=(f,x,z)=>({s:(x-f.x)*Math.sin(f.heading)-(z-f.z)*Math.cos(f.heading),t:(x-f.x)*Math.cos(f.heading)+(z-f.z)*Math.sin(f.heading)});
export function featureRide(world,f,initial=f.approach.speed,{trace=false,entryOnly=false,pop=false,offset=0,followSeconds=0}={}){
 const ride=createRide(world);ride.reset({...f.approach,x:f.approach.x+Math.cos(f.heading)*offset,z:f.approach.z+Math.sin(f.heading)*offset,speed:initial});
 const release=pop?featureRide(world,f,initial,{entryOnly:true,offset}).edgeTime-.15:Infinity;
 let elapsed=0,edge=null,edgeT=null,edgeTime=null,crash=null,active=null;const flights=[],points=[];const dt=1/240;
 for(let tick=0;tick<(followSeconds?80:25)*240;tick++){
  const prev=localPoint(f,ride.state.pos.x,ride.state.pos.z).s,v=ride.state.speed;
  ride.step({jump:pop&&tick*dt>=release-.8&&tick*dt<release},dt);const q=ride.state,p=localPoint(f,q.pos.x,q.pos.z),time=(tick+1)*dt;elapsed=time;
  if(prev<0&&p.s>=0&&edge===null){edge=v+(q.speed-v)*(-prev/(p.s-prev));edgeT=p.t;edgeTime=time-dt+dt*(-prev/(p.s-prev));}
  if(q.mode==='air'&&!active)active={s:p.s,t:p.t,speed:q.speed};
  if(trace&&tick%4===0)points.push({time,s:p.s,t:p.t,y:q.pos.y,x:q.pos.x,z:q.pos.z,mode:q.mode});
  for(const e of ride.events){
   if(e.type==='land'){const snow=world.snowAt(q.pos.x,q.pos.z,{});flights.push({...active,time,air:e.air,impact:e.efh,quality:e.quality,pop:e.pop,drop:e.drop,landing:{x:q.pos.x,z:q.pos.z,s:p.s,t:p.t,y:q.pos.y,powder:snow.powder,depth:snow.depth,rock:snow.rock},limit:PARAMS.landingHard+PARAMS.landingPowder*snow.powder*Math.min(1,snow.depth/PARAMS.powderDepth)});active=null;}
   if(e.type==='crash')crash={reason:e.reason,time};
  }
  if(q.mode!=='air')active=null;
  if(q.mode==='crash'&&!crash)crash={reason:'crash',time};
  const landed=flights.filter(r=>r.s>=-18&&r.s<=18&&Math.abs(r.t)<f.width/2).sort((a,b)=>b.air-a.air)[0];
  if(crash||(entryOnly&&edge!==null)||(followSeconds?(landed&&time>=landed.time+followSeconds):Math.abs(p.t)>f.width/2+20||p.s>f.length+25||p.s< -85||tick>1200&&q.speed<.2))break;
 }
 const flight=flights.filter(r=>r.s>=-18&&r.s<=18&&Math.abs(r.t)<f.width/2).sort((a,b)=>b.air-a.air)[0]??null;
 return {initial,edge,edgeT,edgeTime,release:pop?release:null,flight,flights,crash,points,end:{...ride.state.pos},followed:flight?elapsed-flight.time:0,completed:followSeconds?!!flight&&elapsed>=flight.time+followSeconds:localPoint(f,ride.state.pos.x,ride.state.pos.z).s>f.length+25};
}
export function calibrateFeature(world,f,target,options={}){
 let lo=0,hi=45,best=null;
 for(let k=0;k<12;k++){
  const initial=k===0?0:(lo+hi)/2,r=featureRide(world,f,initial,{entryOnly:true}),error=Math.abs((r.edge??-100)-target);
  if(!best||error<best.error)best={initial,error};
  if(r.edge===null||r.edge<target)lo=initial;else hi=initial;
  if(k===0){if(r.edge!==null&&r.edge>target)break;hi=45;}
 }
 return {...featureRide(world,f,best.initial,options),error:best.error,target};
}
/** Bake only deep snow and obstacle masks; the natural height lattice stays untouched. */
export function snowFeature(world,f){
 const {meta:m,buffers:b}=world,cell=m.cell*2,n=m.maskGrid,half=m.size/2;
 const radius=f.length+100;
 for(let j=Math.max(0,Math.floor((f.z-radius+half)/cell));j<Math.min(n,Math.ceil((f.z+radius+half)/cell));j++)for(let i=Math.max(0,Math.floor((f.x-radius+half)/cell));i<Math.min(n,Math.ceil((f.x+radius+half)/cell));i++){
  const p=localPoint(f,(i+.5)*cell-half,(j+.5)*cell-half),k=(j*n+i)*4;
  if(p.s< -80||p.s>f.length+40||Math.abs(p.t)>f.width/2+20)continue;
  b.masksB[k]=0;b.masksB[k+1]=0;
  if(p.s>=0){b.masksA[k]=Math.max(50,b.masksA[k]);b.masksA[k+1]=255;b.masksA[k+2]=0;b.masksA[k+3]=0;}
 }
}
