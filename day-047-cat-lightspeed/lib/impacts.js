import { speedAtProgress,progressAtSpeed } from './physics.js';
// 衝突の進行（描画なし・決定的）。場面の単位は km/h や m ではない。
// v3：1列に3〜5個を並べ、主な接触は0.6〜1.2秒おき。列は頭の真後ろ（中心）からカメラ側へ0.45ずらし、近づく的が頭に隠れないようにする。
// 弾いた物は画面の右上（+X・上）へ飛ばし、顔の前を横切らない。重い物ほど低く遅く、軽い物ほど高く速く飛ぶ。
export const LIMITS=Object.freeze({waiting:5,flying:4,fragments:12,fragmentsReduced:4,flashes:4});
export const LANES=[0.25];
// 接触は鼻先の少し前（的の手前の面が鼻に届いたところ）。−0.7だと人工衛星などが胴に食い込んでいた。
export const CONTACT_Z=-1.35;
export const TYPES={farm:['hay','crate','log'],city:['cone','bin','box'],sky:['balloon','drone'],orbit:['satellite','junk'],solar:['asteroid','ice'],interstellar:['crystal','shard']};
const MATERIAL={hay:'soft',crate:'wood',log:'wood',cone:'soft',bin:'metal',box:'soft',balloon:'soft',drone:'metal',satellite:'metal',junk:'metal',asteroid:'rock',ice:'ice',crystal:'ice',shard:'ice'};
// 空と宇宙の的は頭の高さへ届かない大きさにする（v3-r2 の採点で岩・人工衛星が顔に重なった）。
const SIZE={hay:1,crate:.9,log:.8,cone:.8,bin:1,box:.8,balloon:.8,drone:.7,satellite:.7,junk:.55,asteroid:.8,ice:.7,crystal:.75,shard:.6};
// 地面のない世界では的を少し下に浮かべ、頭の下（胸・前脚）に当てる。
export const FLOAT_Y={farm:0,city:0,sky:-.45,orbit:-.45,solar:-.45,interstellar:-.45};
const MASS={soft:.7,wood:1,metal:1.5,rock:1.5,ice:.8};
// 背景と的が流れる速さ（場面の単位/秒）。牧場100km/hで6、街1,000で8、1万以上で10。速さの体感は流線と視差で足す。
export const flowSpeed=v=>v<.01?0:2+8*Math.min(1,Math.log10(1+v)/4);
// 主な接触の間隔の目安（秒）：遅いとき0.95、街で約0.7、1万km/h以上で0.6。速い世界ほど的を密に並べ、流れが速くても3〜5個先まで見えるようにする。
export const contactInterval=v=>.95-.35*Math.min(1,Math.log10(1+Math.max(0,v))/4);
export function impactProfile(v){const strength=Math.min(1,Math.log10(1+Math.max(0,v))/9);return {strength,life:.8-.2*strength,sideways:3.6+5*strength,lift:3.4+1.6*strength,back:1+3.5*strength,spin:4+8*strength};}
export function createImpacts(seed=47){return {seed:seed>>>0,time:0,distance:0,world:null,generation:0,serial:0,next:3.2,queues:[[]],flying:[],fragments:[],flashes:[],rings:[],total:0,last:null,shake:null,speed:0};}
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function capped(list,item,limit){if(list.length>=limit)list.shift();list.push(item);}
// 距離 oldS→newS の間に先頭が入った的だけを、手前から順に取り出す（二重計上なし）。
export function sweepQueues(queues,oldS,newS,radius=.6){
  if(newS<=oldS)return [];
  const hits=[];
  for(const queue of queues)while(queue.length&&queue[0].s<=newS+1e-10){const o=queue.shift();if(o.s>=oldS-1e-10&&Math.abs(o.x)<=radius+o.rx)hits.push({...o,alpha:Math.max(0,Math.min(1,(o.s-oldS)/(newS-oldS)))});}
  return hits.sort((a,b)=>a.s-b.s||a.serial-b.serial);
}
// 地面で跳ねるのは地面のある世界（牧場・街）だけ。空は重力で落ちるが、下に地面はない。
function move(body,dt,gravity,hasGround=gravity!==0){
  body.age+=dt;body.x+=body.vx*dt;body.z+=body.vz*dt;body.y+=body.vy*dt+gravity*dt*dt/2;body.vy+=gravity*dt;body.angle+=body.spin*dt;
  if(hasGround&&body.y<0){body.y=0;body.vy=Math.abs(body.vy)*.3;body.vx*=.7;}
}
export function updateImpacts(s,{speed,world,dt,reduced=false}){
  if(!Number.isFinite(dt)||dt<0)return [];
  if(dt>1/60+1e-10){const events=[];let left=dt;while(left>1e-10){const h=Math.min(left,1/60);events.push(...updateImpacts(s,{speed,world,dt:h,reduced}));left-=h;}return events;}
  const start=s.time,flow=flowSpeed(speed),m=reduced?.2:1;s.time+=dt;s.speed=speed;
  // 世界が変わっても待っている的の位置は保ち、種類だけ新しい世界の物に替える（接触の間隔を途切れさせない）。
  if(s.world!==world){const initial=s.world===null;s.world=world;s.generation++;if(initial){s.queues=[[]];s.next=s.distance+3.2;}else for(const o of s.queues[0]){const types=TYPES[world];o.type=types[o.serial%types.length];o.world=world;o.material=MATERIAL[o.type];o.size=SIZE[o.type];}for(const o of [...s.flying,...s.fragments])o.life=Math.min(o.life,o.age+.12);}
  const gravity=['farm','city','sky'].includes(world)?-9.8:0,hasGround=['farm','city'].includes(world);
  for(const name of ['flying','fragments']){for(const o of s[name])move(o,dt*m,gravity,hasGround);s[name]=s[name].filter(o=>o.age<o.life);}
  for(const f of s.flashes)f.age+=dt;s.flashes=s.flashes.filter(f=>f.age<f.life);
  const queue=s.queues[0],types=TYPES[world];
  // 的は常に5個まで先に置く。間隔は「その的に着くころの速さ」で見積もる（最大推力で加速している前提。加速中に間隔が詰まらない）。
  while(queue.length<LIMITS.waiting){const serial=s.serial++,type=types[serial%types.length];queue.push({id:`${s.generation}:${serial}`,serial,slot:0,s:s.next,x:LANES[0],y:0,rx:.35,type,world,material:MATERIAL[type],size:SIZE[type],turn:random(s)*Math.PI*2});
    const ahead=(queue.length)*contactInterval(speed),arrival=speedAtProgress(progressAtSpeed(speed)+ahead);s.next+=Math.max(2,flowSpeed(arrival))*contactInterval(arrival);}
  const old=s.distance;s.distance+=flow*dt*m;
  const hits=sweepQueues(s.queues,old,s.distance),events=[],p=impactProfile(speed);
  for(const hit of hits){
    const time=start+hit.alpha*dt,event={id:hit.id,time,position:{x:hit.x,y:.5,z:CONTACT_Z},material:hit.material,type:hit.type,size:hit.size,speed,strength:p.strength,count:1,row:hit.serial};
    events.push(event);s.last=event;s.total++;
    const jitter=.85+random(s)*.3,ground=gravity!==0;
    const mass=MASS[hit.material]||1,push=jitter/Math.sqrt(mass);
    // 地面のある世界は跳ね上げて右へ、地面のない世界は右下へ（顔のある右上を通らない）。
    const floor=FLOAT_Y[world]??0,body={...hit,x:hit.x,y:ground?.05+floor:floor,z:CONTACT_Z,age:0,life:p.life,vx:p.sideways*push,vy:ground&&!floor?p.lift*jitter/mass**.7:-(1+random(s)*.8),vz:p.back*push,spin:p.spin*jitter/mass,angle:hit.turn,mass};
    capped(s.flying,body,LIMITS.flying);
    const pieces=reduced?1:3,limit=reduced?LIMITS.fragmentsReduced:LIMITS.fragments;
    for(let i=0;i<pieces;i++)capped(s.fragments,{...body,id:`${hit.id}:f${i}`,age:0,life:.35+random(s)*.3,vx:body.vx*(.6+random(s)*.8),vy:ground&&!floor?2+random(s)*3:-(.5+random(s)*1.5),vz:body.vz*(.5+random(s)),size:.1+random(s)*.12},limit);
    capped(s.flashes,{x:hit.x+.15,y:.45+floor,z:CONTACT_Z+.2,age:(1-hit.alpha)*dt,life:reduced?.1:.15,strength:p.strength},LIMITS.flashes);
    if(!reduced&&(!s.shake||time-s.shake.time>=.2))s.shake={time,speed};
  }
  return events;
}
export function impactCounts(s){return {waiting:s.queues.reduce((n,q)=>n+q.length,0),flying:s.flying.length,fragments:s.fragments.length,flashes:s.flashes.length,rings:0};}
