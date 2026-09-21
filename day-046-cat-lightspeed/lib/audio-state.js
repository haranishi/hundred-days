import { SOUND_SPEED, ORBIT_SPEED } from './milestones.js';
export function audioState(speed) { return speed>=ORBIT_SPEED?'silent':speed>=SOUND_SPEED?'delayed':'immediate'; }
export function voicePlan(speed) { const level=Math.min(1,Math.log10(1+Math.max(0,speed))/4.45);return {mode:audioState(speed),pitch:420+level*470,interval:3.4-level*2.5,delay:audioState(speed)==='delayed'?.75:0,duration:.8-level*.4}; }

export function soundNote(speed,elapsed,phase,mute) {
  const mode=audioState(speed);
  if(mode==='silent')return '真空では音が伝わらない';
  if(mode==='delayed')return '鳴き声が、後ろに置き去りになる。';
  if(mute)return '音はオフ。猫は元気です。';
  return phase==='playing'&&elapsed<4?'合成した「ニャー」と一緒に。':'';
}
