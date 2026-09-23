import { SOUND_SPEED, ORBIT_SPEED } from './milestones.js';
export function audioState(speed) { return speed>=ORBIT_SPEED?'silent':speed>=SOUND_SPEED?'delayed':'immediate'; }
export function voicePlan(speed){
  const v=Math.max(.01,Number.isFinite(speed)?speed:0),bands=[[.01,100,3.2,2.4,1,1.08,0],[100,1225,2.4,1.5,1.08,1.2,1],[1225,27600,1.5,1,1.2,1.3,2]],b=bands.find(b=>v<b[1])||bands[2],t=Math.max(0,Math.min(1,Math.log(v/b[0])/Math.log(b[1]/b[0]))),playbackRate=b[4]+(b[5]-b[4])*t;
  return {mode:audioState(speed),sample:b[6],playbackRate,pitch:playbackRate,volume:.65-.15*t,interval:b[2]+(b[3]-b[2])*t,delay:audioState(speed)==='delayed'?.75:0,duration:2.4/playbackRate};
}
export function createVoiceState(){return {active:null,pending:null,next:0};}
export function advanceVoice(state,time,speed,durations=[2.4,2.4,2.4],reset=false){
  if(reset||audioState(speed)==='silent')return {state:{...createVoiceState(),next:time+.1},emission:null,play:null};
  const s={...state};let emission=null,play=null;
  if(s.active&&time>=s.active.end)s.active=null;
  if(s.pending&&time>=s.pending.start&&!s.active){play=s.pending;s.active={...play,end:time+play.duration};s.pending=null;}
  if(speed>.01&&time>=s.next&&!s.pending){const plan=voicePlan(speed),duration=durations[plan.sample]/plan.playbackRate,start=Math.max(time+plan.delay,s.active?.end||time);emission={...plan,duration,start,mouth:time};s.next=Math.max(time+plan.interval,start+duration);if(start<=time&&!s.active){play=emission;s.active={...play,end:time+duration};}else s.pending=emission;}
  return {state:s,emission,play};
}
export function soundNote(speed,elapsed,phase,mute) {
  const mode=audioState(speed);
  if(mode==='silent')return '真空では音が伝わらない';
  if(mode==='delayed')return '鳴き声が、後ろに置き去りになる。';
  if(mute)return '音はオフ。猫は元気です。';
  return phase==='playing'&&elapsed<4?'本物の「ニャー」と一緒に。':'';
}
