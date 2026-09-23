const finite=n=>Number.isFinite(n)?n:0;
export const INPUT_LIMIT=.45;
// 正規化距離120pxで1秒ぶんの推力。毎秒120px（高さ540の面で約150 CSS px）より速くこすれば最大推力を保てる。v2は180で、ゆっくりこすると全く進まなかった。
export const FILL_PX_PER_SECOND=120;
export const inputThrust=q=>Math.max(0,Math.min(1,finite(q)/.08));
// 直近の指の速さに比例する推力。送った距離を約0.12秒で薄れる「勢い」にため、こする速さ÷120px/秒を推力にする。
// v3-r1 の採点で、40pxの小さな往復では蓄え（q）が0.08に届かず推力がほぼ0だった。勢いが最大の5%を切ったら推力は0（止めて約0.36秒）。
export const PULSE_TAU=.12,PULSE_MAX=FILL_PX_PER_SECOND*PULSE_TAU;
// 読み出すときだけ5%未満を0にする（内部の勢いは小さな往復でも積み上がる）。
export const pulseThrust=pulse=>{const p=finite(pulse);return p<PULSE_MAX*.05?0:Math.min(1,p/PULSE_MAX);};
const decayPulse=(pulse,dt)=>{const p=finite(pulse)*Math.exp(-Math.max(0,finite(dt))/PULSE_TAU);return p<1e-6?0:p;};
export const normalizeDistance=(dy,height)=>Math.abs(finite(dy))*440/Math.max(290,Math.min(540,finite(height)||440));
export const wheelDistance=(dy,mode,height)=>finite(dy)*(mode===1?16:mode===2?Math.max(290,Math.min(540,finite(height)||440)):1);
export function createInput(){return {q:0,u:0,pulse:0,time:0,dead:0,held:false,samples:[]};}
// Pure reducer, also used by timestamped test input. Distance is normalized CSS px.
export function reduceInput(state,{distance=0,dt=0,reset=false,held=state.held,stroke=false,deadzone=4}={}){
  if(reset)return {...createInput(),time:state.time};
  let q=held?0:Math.max(0,state.q-Math.max(0,finite(dt))),dead=stroke?0:state.dead,pulse=held?0:decayPulse(state.pulse,dt);
  if(!held){const d=Math.abs(finite(distance)),accepted=Math.max(0,dead+d-deadzone)-Math.max(0,dead-deadzone);dead+=d;q=Math.min(INPUT_LIMIT,q+accepted/FILL_PX_PER_SECOND);pulse=Math.min(PULSE_MAX,pulse+accepted);}
  if(q<1e-12)q=0;
  return {...state,q,pulse,dead,held,u:held?1:Math.max(inputThrust(q),pulseThrust(pulse))};
}
export function enqueueInput(state,sample){
  if(!Number.isFinite(sample.time)||sample.time<state.time-1e-9)return state;
  return {...state,samples:[...state.samples,{...sample}].sort((a,b)=>a.time-b.time)};
}
// Split at event times and Q boundaries; the last .08 s uses midpoint thrust.
export function consumeInput(state,dt,integrate){
  let s={...state,samples:[...state.samples]},end=s.time+Math.max(0,finite(dt));
  while(s.time<end-1e-10||s.samples[0]?.time<=s.time+1e-10){
    while(s.samples.length&&s.samples[0].time<=s.time+1e-10){const sample=s.samples.shift(),samples=s.samples;s=reduceInput(s,sample);s.samples=samples;}
    if(s.time>=end-1e-10)break;
    const boundary=s.held||s.q===0?Infinity:s.q>.08?s.q-.08:s.q;
    const h=Math.min(end-s.time,1/60,boundary,s.samples.length?s.samples[0].time-s.time:Infinity);
    if(h<1e-10){s.q=Math.max(0,s.q-1e-10);continue;}
    const u=s.held?1:Math.max(inputThrust(Math.max(0,s.q-h/2)),pulseThrust(decayPulse(s.pulse,h/2)));integrate(u,h);
    s=reduceInput(s,{dt:h});s.time+=h;
  }
  s.time=end;return s;
}
