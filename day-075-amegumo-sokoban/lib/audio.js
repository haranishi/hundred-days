import {renderSound, scheduleMusicBar, MUSIC_BAR_SECONDS, SOUND_EVENTS} from './sound-design.js';

export const MASTER_GAIN = 3;
export const AUDIO_STORAGE_KEY = 'amegumo-sokoban.audio.v1';
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({enabled:false,music:.28,effects:.65});
const clamp = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : fallback;
const EVENTS = new Set(SOUND_EVENTS);

export function readAudioSettings(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(AUDIO_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {...DEFAULT_AUDIO_SETTINGS};
    return {enabled:saved.enabled === true,music:clamp(saved.music,.28),effects:clamp(saved.effects,.65)};
  } catch { return {...DEFAULT_AUDIO_SETTINGS}; }
}

/** One lazy context, one music scheduler, and separate cancellable effect voices. */
export function createGardenAudio(options = {}) {
  const {onChange=()=>{},timers=globalThis,clock=()=>Date.now()} = options;
  let storage;
  try { storage = Object.hasOwn(options,'storage') ? options.storage : globalThis.localStorage; } catch {}
  const NativeContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  const factory = Object.hasOwn(options,'contextFactory') ? options.contextFactory : NativeContext ? ()=>new NativeContext() : null;
  let settings=readAudioSettings(storage),saved=true,error=null,context=null,buses=null;
  let visible=true,unlocked=false,disposed=false,pendingUnlock=null,pendingSuspend=null,visibilityVersion=0,musicTimer=null;
  let scene={playing:false,level:0},playing=false,nextBar=0,nextBarAt=0;
  let lastBlocked=-Infinity;
  const effects=new Set(),music=new Set(),retiring=new Set();
  const ready=()=>Boolean(context && context.state==='running' && !pendingSuspend && unlocked && visible && !disposed);
  const audible=()=>settings.enabled && ready();
  function snapshot() {
    return {...settings,ready:ready(),supported:Boolean(factory),playing,
      contextState:context?.state || (disposed?'closed':'uncreated'),error,saved};
  }
  function notify() {try {onChange(snapshot());} catch {}}
  function persist() {
    try {if(!storage)throw Error('storage unavailable');storage.setItem(AUDIO_STORAGE_KEY,JSON.stringify(settings));saved=true;}
    catch {saved=false;}
  }
  function parameter(param,value,seconds=.025) {
    if(!param)return;
    const at=context?.currentTime || 0;
    try {
      param.cancelScheduledValues(at);
      param.setValueAtTime(param.value,at);
      if(seconds>0)param.linearRampToValueAtTime(value,at+seconds);
      else param.setValueAtTime(value,at);
    } catch {param.value=value;}
  }
  function applyVolumes(seconds=.025) {
    if(!buses)return;
    const enabled=audible();
    parameter(buses.effects.gain,enabled?settings.effects:0,seconds);
    parameter(buses.music.gain,enabled&&scene.playing?settings.music:0,seconds);
    parameter(buses.master.gain,enabled?MASTER_GAIN:0,seconds);
  }
  function stopSources(bundle,when) {
    for(const source of bundle.sources || [])try {source.stop(when);} catch {}
  }
  function retire(voice,set,grace=0) {
    timers.clearTimeout(voice.timer);
    set.delete(voice);
    const at=context?.currentTime || 0;
    if(grace>0){
      for(const node of voice.bundle.nodes || [])if(node.gain)parameter(node.gain,0,Math.min(.012,grace));
      stopSources(voice.bundle,at+grace);
      const old={bundle:voice.bundle,timer:null};
      old.timer=timers.setTimeout(()=>{retiring.delete(old);try{old.bundle.cleanup?.();}catch{}},grace*1000+5);
      retiring.add(old);
    } else {
      stopSources(voice.bundle,at);
      try {voice.bundle.cleanup?.();} catch {}
    }
  }
  function clearVoices(set,grace=0) {for(const voice of [...set])retire(voice,set,grace);}
  function clearRetiring() {
    for(const voice of retiring){
      timers.clearTimeout(voice.timer);stopSources(voice.bundle,context?.currentTime || 0);
      try {voice.bundle.cleanup?.();} catch {}
    }
    retiring.clear();
  }
  function track(bundle,set) {
    if(!bundle)return;
    const voice={bundle,timer:null};
    const lifetime=Math.max(0,(bundle.endTime-context.currentTime)*1000)+50;
    voice.timer=timers.setTimeout(()=>{
      set.delete(voice);
      try {bundle.cleanup?.();} catch {}
    },lifetime);
    set.add(voice);
  }
  function cancelEffects() {clearVoices(effects,.008);}
  function stopMusic(immediate=false) {
    const wasPlaying=playing;
    if(musicTimer!==null){timers.clearInterval(musicTimer);musicTimer=null;}
    playing=false;clearVoices(music,immediate?0:.02);
    if(buses)parameter(buses.music.gain,0,immediate?0:.02);
    if(wasPlaying)notify();
  }
  function shouldPlayMusic() {return audible()&&scene.playing&&settings.music>0;}
  function tickMusic() {
    if(!shouldPlayMusic()){stopMusic();return;}
    const now=context.currentTime;
    if(nextBarAt<now-.08)nextBarAt=now+.04;
    while(nextBarAt<=now+.22){
      track(scheduleMusicBar(context,buses.music,nextBar,nextBarAt,{level:scene.level}),music);
      nextBar+=1;nextBarAt+=MUSIC_BAR_SECONDS;
    }
  }
  function syncMusic() {
    if(!shouldPlayMusic()){stopMusic();return;}
    if(musicTimer!==null)return;
    playing=true;nextBar=0;nextBarAt=context.currentTime+.045;
    parameter(buses.music.gain,settings.music,.06);
    tickMusic();
    musicTimer=timers.setInterval(tickMusic,100);
    notify();
  }
  function contextStateChanged() {
    if(disposed)return;
    if(context.state!=='running'){
      stopMusic(true);clearVoices(effects);clearRetiring();
    }
    applyVolumes();syncMusic();notify();
  }
  function createContext() {
    if(context)return context;
    context=factory();
    const musicGain=context.createGain(),effectsGain=context.createGain(),master=context.createGain();
    const limiter=context.createDynamicsCompressor?.();
    if(limiter){
      limiter.threshold.value=-14;limiter.knee.value=15;limiter.ratio.value=4;
      limiter.attack.value=.004;limiter.release.value=.22;
    }
    musicGain.gain.value=0;effectsGain.gain.value=0;master.gain.value=0;
    musicGain.connect(limiter||master);effectsGain.connect(limiter||master);
    if(limiter)limiter.connect(master);
    master.connect(context.destination);
    buses={music:musicGain,effects:effectsGain,master,limiter};
    context.addEventListener?.('statechange',contextStateChanged);
    return context;
  }
  function suspendContext() {
    if(pendingSuspend)return pendingSuspend;
    if(!context||context.state==='closed')return Promise.resolve();
    let operation;
    try {operation=Promise.resolve(context.suspend()).catch(()=>{});}catch{return Promise.resolve();}
    const pending=operation.finally(()=>{if(pendingSuspend===pending)pendingSuspend=null;});
    pendingSuspend=pending;
    return pending;
  }
  function resumeAfterSuspend() {
    const waiting=pendingSuspend;
    if(!waiting)return context.state==='running'?Promise.resolve():context.resume();
    return waiting.then(()=>{
      if(disposed||!visible||!settings.enabled)return;
      // Another hide may have queued a suspension while this one settled.
      return resumeAfterSuspend();
    });
  }
  function unlock() {
    if(disposed||!settings.enabled||!visible)return Promise.resolve(false);
    if(!factory){error='このブラウザでは音を再生できません。音なしで遊べます。';notify();return Promise.resolve(false);}
    if(pendingUnlock)return pendingUnlock;
    let operation;
    try {
      createContext();
      // This call remains in the trusted click/key handler, before any await.
      operation=resumeAfterSuspend();
    } catch {
      error='音を始められませんでした。もう一度、音のボタンを押してください。';notify();return Promise.resolve(false);
    }
    const attempt=Promise.resolve(operation).then(async()=>{
      if(disposed)return false;
      // The first unlock may overlap a hide/show before it has marked itself
      // unlocked. Reconcile that queued suspension here as well as in setVisible.
      while(pendingSuspend&&visible&&settings.enabled&&!disposed)await resumeAfterSuspend();
      if(disposed)return false;
      if(!visible||!settings.enabled){
        stopMusic(true);clearVoices(effects);clearRetiring();applyVolumes(0);
        if(!visible)await suspendContext();
        notify();return false;
      }
      if(context.state!=='running'){error='音が休止中です。音のボタンで再開できます。';notify();return false;}
      unlocked=true;error=null;applyVolumes(.025);syncMusic();notify();return true;
    }).catch(()=>{
      if(disposed)return false;
      error='音を始められませんでした。もう一度、音のボタンを押してください。';notify();return false;
    }).finally(()=>{if(pendingUnlock===attempt)pendingUnlock=null;});
    pendingUnlock=attempt;
    return attempt;
  }
  function setEnabled(enabled) {
    if(disposed)return;
    settings={...settings,enabled:Boolean(enabled)};persist();
    if(!settings.enabled){
      stopMusic(true);clearVoices(effects);clearRetiring();applyVolumes(.012);
    } else {applyVolumes();syncMusic();}
    notify();
  }
  function setVolumes(values={}) {
    if(disposed)return;
    settings={...settings,music:clamp(values.music,settings.music),effects:clamp(values.effects,settings.effects)};
    persist();
    if(settings.effects===0){clearVoices(effects);clearRetiring();}
    applyVolumes();syncMusic();notify();
  }
  function setScene(value={}) {
    if(disposed)return;
    const level=Number.isInteger(value.level)?Math.max(0,Math.min(2,value.level)):scene.level;
    if(level!==scene.level)stopMusic();
    scene={playing:Boolean(value.playing),level};
    applyVolumes();syncMusic();
  }
  function setVisible(value) {
    if(disposed)return Promise.resolve(false);
    visible=Boolean(value);
    const version=++visibilityVersion;
    if(!visible){
      stopMusic(true);clearVoices(effects);clearRetiring();applyVolumes(0);notify();
      return suspendContext().then(()=>{notify();return false;});
    }
    if(unlocked&&settings.enabled){
      // WebKit may still report running until an earlier suspend resolves.
      // Wait for both the suspension and any older unlock, then recheck intent.
      return Promise.resolve(pendingSuspend).then(()=>pendingUnlock).then(()=>{
        if(disposed||!visible||!settings.enabled||version!==visibilityVersion)return false;
        return unlock();
      });
    }
    applyVolumes();notify();return Promise.resolve(false);
  }
  function play(event,{delay=0,variant=0}={}) {
    if(!EVENTS.has(event)||!audible()||settings.effects===0)return false;
    if(event==='blocked'){
      const now=clock();if(now-lastBlocked<160)return false;lastBlocked=now;
    }
    const after=clampDelay(delay);
    try {
      track(renderSound(context,buses.effects,event,context.currentTime+.005+after/1000,{variant}),effects);
      return true;
    } catch {return false;}
  }
  function dispose() {
    if(disposed)return;
    disposed=true;stopMusic(true);clearVoices(effects);clearRetiring();
    context?.removeEventListener?.('statechange',contextStateChanged);
    try {Promise.resolve(context?.close?.()).catch(()=>{});}catch{}
    notify();
  }
  function diagnostics() {
    return {contextCreated:Boolean(context),effectVoices:effects.size,musicVoices:music.size,
      musicSchedulers:musicTimer===null?0:1,retiringVoices:retiring.size};
  }
  return {snapshot,unlock,setEnabled,setVolumes,setScene,setVisible,play,cancelEffects,dispose,diagnostics};
}
function clampDelay(value) {return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(3000,value)):0;}
