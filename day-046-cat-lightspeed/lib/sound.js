import { voicePlan } from './audio-state.js';
export function createSound() {
  let context,master,muted=false,silent=false;const sources=new Set();
  function stop() { for(const node of sources){try{node.stop();}catch{}}sources.clear(); }
  function unlock() {
    if(muted)return;
    try{if(!context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;context=new Audio();master=context.createGain();master.gain.value=.16;master.connect(context.destination);}context.resume().catch(()=>{});}catch{}
  }
  function track(node,end) { sources.add(node);node.onended=()=>{sources.delete(node);node.disconnect();};node.stop(end); }
  function envelope(start,duration,volume) { const gain=context.createGain();gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.04);gain.gain.exponentialRampToValueAtTime(.001,start+duration);gain.connect(master);return gain; }
  function noise(start,duration,volume,cutoff) {
    const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=envelope(start,duration,volume);source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;source.connect(filter);filter.connect(gain);source.start(start);track(source,start+duration);source.onended=()=>{sources.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
  }
  function meow(speed) {
    if(!context||muted||silent)return;
    const plan=voicePlan(speed);if(plan.mode==='silent')return;
    const start=context.currentTime+plan.delay;
    for(const [harmonic,volume] of [[1,.65],[2,.22]]){
      const osc=context.createOscillator(),gain=envelope(start,plan.duration,volume);osc.type='sine';osc.frequency.setValueAtTime(plan.pitch*.72*harmonic,start);osc.frequency.exponentialRampToValueAtTime(plan.pitch*1.4*harmonic,start+.12);osc.frequency.exponentialRampToValueAtTime(plan.pitch*.58*harmonic,start+plan.duration);osc.connect(gain);osc.start(start);track(osc,start+plan.duration);osc.onended=()=>{sources.delete(osc);osc.disconnect();gain.disconnect();};
    }
    noise(start,plan.duration,.045,1800);
  }
  function boom() { if(!context||muted||silent)return;noise(context.currentTime,.65,1.1,650); }
  return {unlock,meow,boom,stop,setMute(value){muted=value;if(master)master.gain.value=muted||silent?0:.16;if(muted)stop();},setSilent(value){if(value&&!silent)stop();silent=value;if(master)master.gain.value=muted||silent?0:.16;}};
}
