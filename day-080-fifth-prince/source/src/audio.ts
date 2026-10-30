import { AUDIO_KEY, db, footstepSamples, parseAudioPreferences, volumeGain, type AudioPreferences, type Surface } from './audio-model';
import type { Zone } from './types';
import type { StorageLike } from './persistence';
type Mode='title'|'field'|'dialogue'|'opening'|'battle'|'ending'|'menu';
type Clip='click'|'confirm'|'cancel'|'coin'|'grass1'|'grass2'|'slash'|'hit'|'shield'|'heal'|'magic'|'victory'|'defeat'|'level';
interface Track {audio:HTMLAudioElement;gain:GainNode}
interface Voice {source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode|null;foot:boolean}
const CLIPS:Clip[]=['click','confirm','cancel','coin','grass1','grass2','slash','hit','shield','heal','magic','victory','defeat','level'];
export class Soundscape {
 private context:AudioContext|null=null;private master:GainNode|null=null;private music:GainNode|null=null;private effects:GainNode|null=null;private feet:GainNode|null=null;private ui:GainNode|null=null;
 private tracks=new Map<string,Track>();private buffers=new Map<string,AudioBuffer>();private voices=new Set<Voice>();private pauses=new Map<string,ReturnType<typeof setTimeout>>();private pending:Promise<void>|null=null;
 private zone:Zone='town';private storyZone:Zone|null=null;private mode:Mode='title';private boss=false;private active='';private queued=false;private activated=false;private hidden=false;private revision=0;private duckUntil=0;private duckTimer:ReturnType<typeof setTimeout>|undefined;
 private settings:AudioPreferences;private storage:StorageLike|undefined;private lastVariant=-1;private footCount=0;private lastSurface:Surface|null=null;private recent:string[]=[];private errors:string[]=[];
 constructor(storage?:StorageLike){
  try{this.storage=storage??globalThis.localStorage;this.settings=parseAudioPreferences(this.storage?.getItem(AUDIO_KEY)??null);}catch{this.settings=parseAudioPreferences(null);}
 }
 get muted(){return this.settings.muted;}
 get preferences(){return {...this.settings};}
 private remember(){try{this.storage?.setItem(AUDIO_KEY,JSON.stringify(this.settings));}catch{/* Audio settings must not block an adventure. */}}
 private graph(){
  if(this.context)return;
  const c=this.context=new AudioContext();this.master=c.createGain();this.master.gain.value=db(-3);
  const limiter=c.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=5;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.18;this.master.connect(limiter);limiter.connect(c.destination);
  this.music=c.createGain();this.effects=c.createGain();this.feet=c.createGain();this.ui=c.createGain();this.music.connect(this.master);this.effects.connect(this.master);this.feet.connect(this.effects);this.ui.connect(this.effects);this.feet.gain.value=db(-6);this.ui.gain.value=db(-4);
  for(const surface of ['grass','dirt','stone','wood'] as Surface[])for(let i=0;i<4;i++){const data=footstepSamples(surface,i),buffer=c.createBuffer(1,data.length,22050);buffer.getChannelData(0).set(data);this.buffers.set(`foot:${surface}:${i}`,buffer);}
  this.mix(false);void this.loadClips();
 }
 private loadClips(){
  if(this.pending)return this.pending;
  this.pending=Promise.all(CLIPS.map(async id=>{try{const response=await fetch(`./assets/sfx/${id}.wav`);if(!response.ok)throw new Error(id);const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.buffers.set(id,this.normalise(buffer));}catch{this.errors.push(id);}})).then(()=>{});return this.pending;
 }
 private normalise(buffer:AudioBuffer){
  let peak=0,sum=0;const means:number[]=[];
  for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);let mean=0;for(const x of data)mean+=x;mean/=data.length;means.push(mean);for(const x of data){const value=x-mean;peak=Math.max(peak,Math.abs(value));sum+=value*value;}}
  const rms=Math.sqrt(sum/(buffer.length*buffer.numberOfChannels));const gain=Math.min(.82/Math.max(peak,.001),.18/Math.max(rms,.001));const edge=Math.min(128,buffer.length/2);
  for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=(data[i]-means[ch])*gain*Math.min(1,i/edge,(data.length-1-i)/edge);}
  return buffer;
 }
 // Called directly from a real pointer/key gesture; enabled preference is separate from browser activation.
 async unlock(){
  if(this.muted||this.hidden)return false;this.activated=true;
  try{this.graph();this.mix();const resume=this.context!.resume();const music=this.syncMusic();await Promise.all([resume,music]);return !this.muted&&!this.hidden&&this.context!.state==='running';}catch{return false;}
 }
 async toggle():Promise<boolean>{
  this.settings.muted=!this.settings.muted;this.remember();
  if(this.muted){this.stopAll();await this.context?.suspend().catch(()=>{});}else await this.unlock();return !this.muted;
 }
 setVolumes(values:Partial<Pick<AudioPreferences,'music'|'effects'>>){
  for(const key of ['music','effects'] as const)if(typeof values[key]==='number'&&Number.isFinite(values[key]))this.settings[key]=Math.max(0,Math.min(100,values[key]!));this.remember();this.mix();
 }
 setMode(mode:Mode,enemy?:string){if(this.mode===mode&&this.boss===(enemy==='demon'))return;this.mode=mode;this.boss=enemy==='demon';if(mode!=='field')this.stopSteps();this.mix();this.queueMusic();}
 setZone(zone:Zone){if(this.zone!==zone){this.zone=zone;this.stopSteps();this.queueMusic();}}
 setStoryZone(zone:Zone|null){if(this.storyZone!==zone){this.storyZone=zone;this.queueMusic();}}
 setHidden(hidden:boolean){
  if(this.hidden===hidden)return;this.hidden=hidden;
  if(hidden){this.stopAll();void this.context?.suspend().catch(()=>{});}else if(this.activated&&!this.muted)void this.unlock();
 }
 private target(){return this.mode==='title'?'palace':this.mode==='ending'?'ending':this.mode==='battle'?(this.boss?'boss':'battle'):this.storyZone??this.zone;}
 private queueMusic(){if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;void this.syncMusic();});}
 private async syncMusic(){
  if(this.muted||this.hidden||!this.context||!this.music)return;
  const key=this.target();if(key===this.active)return;const previous=this.active;this.active=key;const revision=++this.revision,now=this.context.currentTime;
  const old=this.tracks.get(previous);if(old){this.fade(old.gain,0,.45);this.pauses.set(previous,setTimeout(()=>{this.pauses.delete(previous);if(this.active!==previous)old.audio.pause();},480));}
  const timer=this.pauses.get(key);if(timer){clearTimeout(timer);this.pauses.delete(key);}
  let track=this.tracks.get(key);
  if(!track){const audio=new Audio(`./assets/music/${key}.ogg`);audio.loop=true;audio.preload='none';const gain=this.context.createGain();gain.gain.value=0;this.context.createMediaElementSource(audio).connect(gain);gain.connect(this.music);track={audio,gain};this.tracks.set(key,track);}
  this.fade(track.gain,1,.55);
  try{await track.audio.play();if(this.muted||this.hidden||this.active!==key)track.audio.pause();}
  catch{if(this.revision===revision)this.active='';}
 }
 private fade(node:GainNode,value:number,seconds=.18){const now=this.context!.currentTime;node.gain.cancelScheduledValues(now);node.gain.setValueAtTime(node.gain.value,now);node.gain.linearRampToValueAtTime(value,now+seconds);}
 private mix(smooth=true){
  if(!this.context||!this.music||!this.effects)return;
  const dialogue=['dialogue','opening','menu'].includes(this.mode),jingle=this.context.currentTime<this.duckUntil;
  const music=volumeGain(this.settings.music)*db(-6+(dialogue?-5:0)+(jingle?-4:0)),effects=volumeGain(this.settings.effects);
  if(smooth){this.fade(this.music,music,.25);this.fade(this.effects,effects,.08);}else{this.music.gain.value=music;this.effects.gain.value=effects;}
 }
 private release(voice:Voice){if(!this.voices.delete(voice))return;voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();}
 private stopVoice(voice:Voice){try{voice.source.stop();}catch{/* Already finished. */}this.release(voice);}
 private stopSteps(){for(const voice of this.voices)if(voice.foot)this.stopVoice(voice);}
 private stopAll(){
  ++this.revision;this.active='';this.duckUntil=0;if(this.duckTimer)clearTimeout(this.duckTimer);for(const timer of this.pauses.values())clearTimeout(timer);this.pauses.clear();for(const track of this.tracks.values()){track.audio.pause();track.gain.gain.cancelScheduledValues(this.context!.currentTime);track.gain.gain.value=0;}
  for(const voice of this.voices)this.stopVoice(voice);
 }
 private play(id:string,{volume=-4,rate=1,foot=false,ui=false,pan=0,duration=Infinity}:{volume?:number;rate?:number;foot?:boolean;ui?:boolean;pan?:number;duration?:number}={}){
  if(this.muted||this.hidden||!this.context||this.context.state!=='running'||this.settings.effects===0)return false;
  const buffer=this.buffers.get(id);if(!buffer)return false;
  if(this.voices.size>=16){if(foot)return false;const oldest=[...this.voices].find(v=>v.foot)??this.voices.values().next().value;if(oldest)this.stopVoice(oldest);}
  const c=this.context,source=c.createBufferSource(),gain=c.createGain(),panner=typeof c.createStereoPanner==='function'?c.createStereoPanner():null,now=c.currentTime;
  source.buffer=buffer;source.playbackRate.value=rate;const length=Math.min(duration,buffer.duration/rate),volumeGain=db(volume);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volumeGain,now+.003);gain.gain.setValueAtTime(volumeGain,now+Math.max(.004,length-.025));gain.gain.linearRampToValueAtTime(0,now+length);
  source.connect(gain);const bus=foot?this.feet!:ui?this.ui!:this.effects!;if(panner){panner.pan.value=pan;gain.connect(panner);panner.connect(bus);}else gain.connect(bus);
  const voice:Voice={source,gain,pan:panner,foot};this.voices.add(voice);source.onended=()=>this.release(voice);source.start(now);source.stop(now+length+.003);this.recent.push(id);if(this.recent.length>24)this.recent.shift();return true;
 }
 footstep(surface:Surface,running=false){
  if(this.mode!=='field')return;
  let variant=Math.floor(Math.random()*4);if(variant===this.lastVariant)variant=(variant+1)%4;this.lastVariant=variant;
  const rate=(running?1.05:1)+Math.random()*.07-.035,pan=this.footCount%2?-.06:.06;
  if(this.play(`foot:${surface}:${variant}`,{foot:true,rate,volume:-2+Math.random()*1.2,pan})){this.footCount++;this.lastSurface=surface;if(surface==='grass')this.play(this.footCount%2?'grass1':'grass2',{foot:true,rate,volume:-10,pan,duration:.18});}
 }
 ping(kind:'good'|'bad'|'click'='click'){this.play(kind==='bad'?'cancel':kind==='good'?'confirm':'click',{ui:true,volume:kind==='click'?-9:-5});}
 reward(kind:'trade'|'gather'|'discover'|'level'){
  this.play(kind==='trade'?'coin':kind==='gather'?'grass1':kind==='discover'?'confirm':'level',{volume:kind==='gather'?-6:-4});if(kind==='level')this.duck(1.3);
 }
 effect(kind:'hit'|'shield'|'heal'|'magic'|'victory'|'defeat'){
  if(kind==='hit'){this.play('slash',{volume:-5,rate:.96+Math.random()*.08});this.play('hit',{volume:-8});}
  else this.play(kind,{volume:kind==='magic'?-9:-4,duration:kind==='magic'?.85:Infinity});
  if(kind==='victory'||kind==='defeat')this.duck(kind==='victory'?.9:1.8);
 }
 private duck(seconds:number){
  if(!this.context)return;this.duckUntil=this.context.currentTime+seconds;this.mix();if(this.duckTimer)clearTimeout(this.duckTimer);this.duckTimer=setTimeout(()=>{if(this.context&&this.context.currentTime>=this.duckUntil)this.mix();},seconds*1000+30);
 }
 debugSnapshot(){return {muted:this.muted,settings:this.preferences,running:this.context?.state==='running',active:this.active,playing:[...this.tracks.entries()].filter(([,t])=>!t.audio.paused).map(([id,t])=>({id,time:t.audio.currentTime,gain:t.gain.gain.value})),voices:this.voices.size,footsteps:this.footCount,surface:this.lastSurface,musicGain:this.music?.gain.value??0,effectsGain:this.effects?.gain.value??0,recent:[...this.recent],loaded:this.buffers.size,errors:[...this.errors]};}
}
