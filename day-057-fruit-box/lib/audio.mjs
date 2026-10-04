// Original 8-bar score. No recordings, samples or melodies from another game.
export const MELODY = [
  74,null,69,72,76,null,72,69, 67,null,69,72,69,null,64,null,
  72,74,76,null,79,76,74,null, 72,null,69,67,64,null,67,null,
  69,null,72,76,74,null,69,72, 67,64,67,null,69,72,74,null,
  76,null,79,76,72,69,67,null, 64,null,67,69,72,null,null,null
];
const BASS = [45,48,43,40,45,43,48,40];
export const BEAT = 60/94/2;
export const frequency = note => 440*Math.pow(2,(note-69)/12);
function readStorage(){try{return globalThis.localStorage;}catch{return undefined;}}
export function createAudio({makeContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), storage = readStorage(),
  every = globalThis.setInterval, cancel = globalThis.clearInterval} = {}) {
  let context, timer, nextTime=0, index=0, active=false, unlocked=false;
  let settings={music:true,effects:true,musicVolume:28,effectsVolume:52};
  const voices=new Set();
  try {
    const saved=JSON.parse(storage?.getItem('fruit-box.audio')||'null');
    if(saved) for(const key of Object.keys(settings)) {
      if(typeof settings[key]==='boolean' && typeof saved[key]==='boolean') settings[key]=saved[key];
      else if(typeof settings[key]==='number' && Number.isFinite(saved[key])) settings[key]=Math.max(0,Math.min(100,saved[key]));
    }
  } catch {}
  function clear(kind) {
    for(const voice of voices) if(!kind || voice.kind===kind) {
      try {voice.osc.stop();} catch {}
      voice.osc.disconnect(); voice.gain.disconnect(); voices.delete(voice);
    }
  }
  function tone(note, time, duration, level, type='sine', kind='music', slide) {
    if(!context || !unlocked || context.state!=='running' || !settings[kind]) return;
    const volume=settings[kind==='music'?'musicVolume':'effectsVolume']/100;
    if(!volume) return;
    const osc=context.createOscillator(), gain=context.createGain();
    const voice={osc,gain,kind}; voices.add(voice);
    osc.type=type; osc.frequency.setValueAtTime(frequency(note),time);
    if(slide) osc.frequency.exponentialRampToValueAtTime(frequency(note)*slide,time+duration);
    gain.gain.setValueAtTime(0,time);
    gain.gain.linearRampToValueAtTime(level*volume,time+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(gain); gain.connect(context.destination);
    osc.onended=()=>{osc.disconnect();gain.disconnect();voices.delete(voice);};
    osc.start(time); osc.stop(time+duration+.02);
  }
  function schedule() {
    if(!context || context.state!=='running' || !active || !settings.music || !settings.musicVolume) return;
    if(nextTime<context.currentTime) nextTime=context.currentTime+.02;
    while(nextTime<context.currentTime+.13) {
      const note=MELODY[index%MELODY.length];
      if(note!==null) {tone(note,nextTime,.29,.12,'triangle');tone(note+12,nextTime,.16,.024);}
      if(index%4===0) tone(BASS[Math.floor(index/8)%BASS.length],nextTime,.42,.17,'sine');
      if(index%2===1) tone(88,nextTime,.035,.025,'triangle');
      nextTime+=BEAT; index++;
    }
  }
  function sync() {
    if(timer!==undefined) cancel(timer);
    timer=undefined; clear('music');
    if(active && unlocked && settings.music && settings.musicVolume && context?.state==='running') {
      nextTime=context.currentTime+.025; schedule(); timer=every(schedule,40);
    }
  }
  function persist(){try{storage?.setItem('fruit-box.audio',JSON.stringify(settings));}catch{}}
  async function unlock() {
    try {
      if(unlocked && context?.state==='running') return true;
      context ||= makeContext();
      if(context.state!=='running') await context.resume();
      unlocked=context.state==='running'; sync();
      return unlocked;
    } catch {unlocked=false;return false;}
  }
  return {
    unlock,
    setActive(value){active=Boolean(value);if(!active)clear();sync();},
    get(){return {...settings};},
    set(key,value){
      if(!(key in settings)) return;
      settings[key]=typeof settings[key]==='boolean'?Boolean(value):Math.max(0,Math.min(100,Number(value)||0));
      persist(); if(key.startsWith('music'))sync();else clear('effects');
    },
    drop(){tone(43,context?.currentTime||0,.12,.24,'triangle','effects',.7);},
    merge(level){const t=context?.currentTime||0,n=62+level*2;tone(n,t,.19,.25,'sine','effects');tone(n+7,t+.065,.18,.12,'sine','effects');},
    big(){const t=context?.currentTime||0;[72,76,79,84].forEach((n,i)=>tone(n,t+i*.12,.28,.2,'triangle','effects'));},
    over(){clear();const t=context?.currentTime||0;[64,60,57].forEach((n,i)=>tone(n,t+i*.15,.3,.16,'sine','effects'));},
    dispose(){active=false;if(timer!==undefined)cancel(timer);timer=undefined;clear();context?.close();},
    status(){return {active,unlocked,contextState:context?.state||'idle',voices:voices.size};}
  };
}
