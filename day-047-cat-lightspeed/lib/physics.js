import { LIGHT_SPEED } from './milestones.js';
export const FINISH_RATIO = .99999, MAX_SPEED = LIGHT_SPEED * FINISH_RATIO;
const finite = n => Number.isFinite(n) ? n : 0, OFFSET = .05;
export function lorentzFactor(speed) {
  const ratio = Math.min(FINISH_RATIO,Math.max(0,finite(speed)/LIGHT_SPEED));
  return 1 / Math.sqrt((1-ratio)*(1+ratio));
}
// 最大推力で押し続けたときの到達時刻（秒）と速度（km/h）。v2までは約91秒かかり、最初の20秒が歩く速さ以下だった。
// 区間の中は log10(速度+0.05) を時刻に対して直線でつなぐ。境界：街9秒・空15秒・軌道20秒・太陽系25秒・星間30秒。
export const PACE = Object.freeze([[0,0],[.8,.05],[2.5,4],[4.5,20],[9,100],[15,1000],[20,10000],[25,100000],[30,1000000],[37,LIGHT_SPEED*.9]].map(p=>Object.freeze(p)));
// 光速の90%から先は、光速との差（1−v/c）の桁を3秒に1桁ずつ縮める：99%が40秒、99.9%が43秒、99.999%が49秒。
export const GLOW_AT = 37, FINISH_AT = 49;
// 推力があれば推力の割合で進む（ゆっくりこすっても少しずつ速くなる）。推力が0の間だけ、進んだぶんを1秒につき0.5秒ぶん戻す。
// 1にすると、小さな往復（40px）では止めている間の減速が勝って全く進まなかった。
export const RELEASE_RATE = .5;
const W = PACE.map(([t,v])=>[t,Math.log10(v+OFFSET)]);
export function speedAtProgress(progress) {
  const p = Math.max(0,finite(progress));
  if(p>=FINISH_AT)return MAX_SPEED;
  if(p>=GLOW_AT)return LIGHT_SPEED*(1-10**(-1-4*(p-GLOW_AT)/(FINISH_AT-GLOW_AT)));
  let i=0;while(i<W.length-2&&p>W[i+1][0])i++;
  const [t0,w0]=W[i],[t1,w1]=W[i+1];
  return Math.max(0,10**(w0+(w1-w0)*(p-t0)/(t1-t0))-OFFSET);
}
export function progressAtSpeed(speed) {
  const v = Math.min(MAX_SPEED,Math.max(0,finite(speed)));
  if(v>=MAX_SPEED)return FINISH_AT;
  if(v>=LIGHT_SPEED*.9)return GLOW_AT+(-1-Math.log10(1-v/LIGHT_SPEED))/4*(FINISH_AT-GLOW_AT);
  const w=Math.log10(v+OFFSET);let i=0;while(i<W.length-2&&w>W[i+1][1])i++;
  const [t0,w0]=W[i],[t1,w1]=W[i+1];
  return Math.max(0,t0+(t1-t0)*(w-w0)/(w1-w0));
}
export function advanceSpeed(speed,thrust,seconds) {
  const v=Math.min(MAX_SPEED,Math.max(0,finite(speed))),dt=Math.max(0,finite(seconds));
  const u=typeof thrust==='boolean'?Number(thrust):Math.max(0,Math.min(1,finite(thrust)));
  const rate=u>0?u:-RELEASE_RATE;
  if(!dt||!rate)return v;
  const p=progressAtSpeed(v)+rate*dt;
  if(p<=0)return 0;
  if(p>=FINISH_AT)return MAX_SPEED;
  return Math.max(rate>0?v:0,Math.min(rate>0?MAX_SPEED:v,speedAtProgress(p)));
}
