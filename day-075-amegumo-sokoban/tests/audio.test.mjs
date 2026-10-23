import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenAudio,readAudioSettings,AUDIO_STORAGE_KEY,DEFAULT_AUDIO_SETTINGS} from '../lib/audio.js';

class Param {
 constructor(value=0){this.value=value;this.calls=[];}
 cancelScheduledValues(at){this.calls.push(['cancel',at]);}
 setValueAtTime(v,at){this.value=v;this.calls.push(['set',v,at]);}
 linearRampToValueAtTime(v,at){this.value=v;this.calls.push(['linear',v,at]);}
 exponentialRampToValueAtTime(v,at){this.value=v;this.calls.push(['exp',v,at]);}
 setTargetAtTime(v,at){this.value=v;this.calls.push(['target',v,at]);}
}
class Node {
 constructor(ctx){this.ctx=ctx;this.gain=new Param(1);this.frequency=new Param();this.detune=new Param();this.Q=new Param();this.pan=new Param();this.playbackRate=new Param(1);this.connected=[];this.stops=[];this.disconnected=false;ctx.nodes.push(this);}
 connect(destination){this.connected.push(destination);return destination;}
 disconnect(){this.disconnected=true;}
 start(at=0){this.started=at;this.ctx.sources.push(this);}
 stop(at=0){this.stops.push(at);}
}
class Context {
 constructor(){this.currentTime=0;this.sampleRate=8000;this.state='suspended';this.nodes=[];this.sources=[];this.destination={};this.resumeCalls=0;this.suspendCalls=0;this.closeCalls=0;this.listeners=new Map();}
 createGain(){return new Node(this);}
 createOscillator(){return new Node(this);}
 createBiquadFilter(){return new Node(this);}
 createBufferSource(){return new Node(this);}
 createStereoPanner(){return new Node(this);}
 createDynamicsCompressor(){const n=new Node(this);for(const k of ['threshold','knee','ratio','attack','release'])n[k]=new Param();return n;}
 createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate:rate,getChannelData:i=>data[i]};}
 addEventListener(type,listener){this.listeners.set(type,listener);}
 removeEventListener(type){this.listeners.delete(type);}
 resume(){this.resumeCalls++;if(this.resumeOverride)return this.resumeOverride();this.state='running';return Promise.resolve();}
 suspend(){this.suspendCalls++;if(this.suspendOverride)return this.suspendOverride();this.state='suspended';return Promise.resolve();}
 close(){this.closeCalls++;this.state='closed';return Promise.resolve();}
}
function timerMock(){
 let id=0;
 const jobs=new Map();
 return {
  jobs,setTimeout(fn,ms){jobs.set(++id,{fn,ms,type:'timeout'});return id;},clearTimeout(id){jobs.delete(id);},
  setInterval(fn,ms){jobs.set(++id,{fn,ms,type:'interval'});return id;},clearInterval(id){jobs.delete(id);},
  intervals(){return [...jobs.values()].filter(j=>j.type==='interval').length;},
  flushTimeouts(){for(const [id,job] of [...jobs])if(job.type==='timeout'){jobs.delete(id);job.fn();}}
 };
}
function memory(raw=null){const values=new Map(raw===null?[]:[[AUDIO_STORAGE_KEY,raw]]);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
function setup(extra={}){
 const ctx=new Context(),timers=timerMock(),storage=memory();
 let creations=0;
 const audio=createGardenAudio({contextFactory:()=>{creations++;return ctx;},timers,storage,clock:()=>ctx.currentTime*1000,...extra});
 return {audio,ctx,timers,storage,creations:()=>creations};
}
async function enabled(extra={}){const state=setup(extra);state.audio.setEnabled(true);await state.audio.unlock();return state;}

test('audio starts silent and does not construct a context before consent',async()=>{
 const {audio,creations}=setup();
 assert.deepEqual(readAudioSettings(undefined),DEFAULT_AUDIO_SETTINGS);
 assert.equal(audio.snapshot().enabled,false);assert.equal(audio.play('step'),false);
 assert.equal(await audio.unlock(),false);assert.equal(creations(),0);
});
test('saved preferences are validated and use their own storage key',()=>{
 for(const raw of ['null','[]','{','"enabled"','true'])assert.deepEqual(readAudioSettings(memory(raw)),DEFAULT_AUDIO_SETTINGS);
 const storage=memory(JSON.stringify({enabled:true,music:9,effects:-1}));
 storage.values.set('amegumo-sokoban.v1','{"first-rain":4}');
 const {audio}=setup({storage});
 assert.deepEqual(readAudioSettings(storage),{enabled:true,music:1,effects:0});
 audio.setVolumes({music:.35,effects:.7});
 assert.equal(storage.values.get('amegumo-sokoban.v1'),'{"first-rain":4}');
 assert.deepEqual(JSON.parse(storage.values.get(AUDIO_STORAGE_KEY)),{enabled:true,music:.35,effects:.7});
});
test('invalid settings and denied storage never prevent sound or gameplay controls',async()=>{
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('full');}};
 const {audio}=await enabled({storage:denied,onChange(){throw Error('view unavailable');}});
 assert.equal(audio.snapshot().saved,false);
 audio.setVolumes({music:NaN,effects:'1'});
 assert.equal(audio.snapshot().music,.28);assert.equal(audio.snapshot().effects,.65);
 assert.equal(audio.play('step'),true);audio.dispose();
});
test('repeated unlocking and scene updates keep one context and one music scheduler',async()=>{
 const {audio,timers,creations}=await enabled();
 audio.setScene({playing:true,level:0});
 const voices=audio.diagnostics().musicVoices;
 for(let i=0;i<4;i++){audio.setScene({playing:true,level:0});await audio.unlock();}
 assert.equal(creations(),1);assert.equal(timers.intervals(),1);
 assert.equal(audio.diagnostics().musicSchedulers,1);assert.equal(audio.diagnostics().musicVoices,voices);
 audio.dispose();assert.equal(timers.jobs.size,0);
});
test('cancelling delayed effects stops future sources without stopping the BGM',async()=>{
 const {audio,ctx}=await enabled();
 audio.setScene({playing:true,level:0});
 const before=ctx.sources.length;
 assert.equal(audio.play('bloom',{delay:520}),true);
 const future=ctx.sources.slice(before);
 assert(future.length>0);assert(future.every(s=>s.started>=.52));
 audio.cancelEffects();
 assert.equal(audio.diagnostics().effectVoices,0);
 assert.equal(audio.diagnostics().musicSchedulers,1);
 assert(future.every(s=>s.stops.some(at=>at<s.started)));
 audio.dispose();
});
test('old cleanup cannot cancel a newer effect batch',async()=>{
 const {audio,ctx,timers}=await enabled();
 audio.play('rain',{delay:500});audio.cancelEffects();
 audio.play('bloom');
 const current=ctx.sources.at(-1);
 const stops=current.stops.length;
 // Retired cleanup callbacks affect their own nodes only.
 for(const [id,job] of [...timers.jobs])if(job.type==='timeout'&&job.ms<30){timers.jobs.delete(id);job.fn();}
 assert.equal(current.stops.length,stops);
 assert.equal(audio.diagnostics().effectVoices,1);
 audio.dispose();
});
test('muting immediately stops current and future music and effects',async()=>{
 const {audio,ctx,timers}=await enabled();
 audio.setScene({playing:true,level:1});audio.play('clear',{delay:700});
 audio.setEnabled(false);
 assert.equal(audio.diagnostics().effectVoices,0);assert.equal(audio.diagnostics().musicVoices,0);
 assert.equal(audio.diagnostics().musicSchedulers,0);assert.equal(timers.intervals(),0);
 assert(ctx.sources.every(s=>s.stops.some(at=>at<=ctx.currentTime)));
 const count=ctx.sources.length;assert.equal(audio.play('rain'),false);assert.equal(ctx.sources.length,count);
 audio.dispose();
});
test('zero music volume stops its scheduler while effects remain available',async()=>{
 const {audio}=await enabled();
 audio.setScene({playing:true,level:0});audio.setVolumes({music:0});
 assert.equal(audio.diagnostics().musicSchedulers,0);
 assert.equal(audio.play('step'),true);
 audio.setVolumes({music:.4});assert.equal(audio.diagnostics().musicSchedulers,1);
 audio.setVolumes({effects:0});assert.equal(audio.play('bloom'),false);
 audio.dispose();
});
test('paused scenes cancel scheduled music and repeated pauses do not create timers',async()=>{
 const {audio,ctx,timers}=await enabled();
 audio.setScene({playing:true,level:0});
 const musicSources=[...ctx.sources];
 audio.setScene({playing:false,level:0});audio.setScene({playing:false,level:0});
 assert.equal(timers.intervals(),0);assert.equal(audio.snapshot().playing,false);
 assert(musicSources.every(s=>s.stops.length>0));
 audio.setScene({playing:true,level:2});
 assert.equal(timers.intervals(),1);audio.dispose();
});
test('a rejected resume can be retried without creating another context',async()=>{
 const ctx=new Context();ctx.resumeOverride=()=>Promise.reject(Error('blocked'));
 const {audio,creations}=setup({contextFactory:()=>ctx});
 audio.setEnabled(true);assert.equal(await audio.unlock(),false);
 assert.equal(audio.snapshot().ready,false);assert.match(audio.snapshot().error,/音/);
 delete ctx.resumeOverride;assert.equal(await audio.unlock(),true);
 assert.equal(ctx.resumeCalls,2);audio.dispose();
});
test('unsupported audio leaves all operations harmless',async()=>{
 const {audio}=setup({contextFactory:null});
 audio.setEnabled(true);assert.equal(await audio.unlock(),false);
 assert.equal(audio.snapshot().supported,false);audio.setScene({playing:true,level:0});
 assert.equal(audio.play('step'),false);audio.dispose();
});
test('a resume finishing while hidden cannot start or retain any sound',async()=>{
 const ctx=new Context();let finish;
 ctx.resumeOverride=()=>new Promise(resolve=>{finish=()=>{ctx.state='running';resolve();};});
 const {audio}=setup({contextFactory:()=>ctx});
 audio.setEnabled(true);audio.setScene({playing:true,level:0});
 const pending=audio.unlock();
 await audio.setVisible(false);finish();assert.equal(await pending,false);
 assert.equal(audio.diagnostics().musicSchedulers,0);assert.equal(ctx.sources.length,0);
 assert(ctx.suspendCalls>=2);assert.equal(audio.snapshot().ready,false);
 delete ctx.resumeOverride;assert.equal(await audio.unlock(),false);
 await audio.setVisible(true);
 assert.equal(await audio.unlock(),true);audio.dispose();
});
test('backgrounding removes reservations before suspend and resumes only previous consent',async()=>{
 const {audio,ctx}=await enabled();
 audio.setScene({playing:true,level:0});audio.play('rain',{delay:700});
 await audio.setVisible(false);
 assert.equal(ctx.state,'suspended');assert.equal(audio.diagnostics().retiringVoices,0);
 assert(ctx.sources.every(s=>s.stops.some(at=>at<=ctx.currentTime)));
 await audio.setVisible(true);assert.equal(audio.snapshot().ready,true);
 assert.equal(audio.diagnostics().musicSchedulers,1);audio.dispose();
});
test('blocked sound is rate limited, while other feedback remains responsive',async()=>{
 const {audio,ctx}=await enabled();
 assert.equal(audio.play('blocked'),true);assert.equal(audio.play('blocked'),false);
 assert.equal(audio.play('step'),true);ctx.currentTime=.17;
 assert.equal(audio.play('blocked'),true);audio.dispose();
});
test('dispose stops every timer and prevents delayed unlock completion',async()=>{
 const ctx=new Context();let finish;
 ctx.resumeOverride=()=>new Promise(resolve=>{finish=()=>{ctx.state='running';resolve();};});
 const {audio,timers}=setup({contextFactory:()=>ctx});
 audio.setEnabled(true);const pending=audio.unlock();audio.dispose();finish();
 assert.equal(await pending,false);assert.equal(audio.play('step'),false);assert.equal(timers.jobs.size,0);
 assert.equal(ctx.closeCalls,1);audio.dispose();assert.equal(ctx.closeCalls,1);
});

function deferSuspension(ctx){
 const pending=[];
 ctx.suspendOverride=()=>new Promise(resolve=>pending.push(()=>{
  ctx.state='suspended';resolve();
 }));
 return {finish(){assert(pending.length>0);pending.shift()();},count:()=>pending.length};
}
test('visible recovery waits for asynchronous suspend before deciding whether to resume',async()=>{
 const {audio,ctx,timers}=await enabled();audio.setScene({playing:true,level:0});
 const suspend=deferSuspension(ctx);
 const hidden=audio.setVisible(false),shown=audio.setVisible(true);
 assert.equal(ctx.state,'running');assert.equal(audio.snapshot().ready,false);
 assert.equal(audio.diagnostics().musicSchedulers,0);assert.equal(suspend.count(),1);
 suspend.finish();await hidden;
 assert.equal(await shown,true);assert.equal(ctx.state,'running');
 assert.equal(audio.snapshot().ready,true);assert.equal(ctx.resumeCalls,2);
 assert.equal(timers.intervals(),1);audio.dispose();
});
test('a newer hidden intent prevents a delayed visible recovery from resuming',async()=>{
 const {audio,ctx,timers}=await enabled();audio.setScene({playing:true,level:0});
 const suspend=deferSuspension(ctx);
 const hidden=audio.setVisible(false),shown=audio.setVisible(true),hiddenAgain=audio.setVisible(false);
 suspend.finish();await Promise.all([hidden,hiddenAgain]);
 assert.equal(await shown,false);assert.equal(ctx.state,'suspended');
 assert.equal(ctx.resumeCalls,1);assert.equal(audio.snapshot().ready,false);
 assert.equal(timers.intervals(),0);audio.dispose();
});
test('only the latest rapid hide/show intent resumes once after the delayed suspend',async()=>{
 const {audio,ctx,timers}=await enabled();audio.setScene({playing:true,level:0});
 const suspend=deferSuspension(ctx);
 const firstHide=audio.setVisible(false),firstShow=audio.setVisible(true);
 const lastHide=audio.setVisible(false),lastShow=audio.setVisible(true);
 suspend.finish();await Promise.all([firstHide,lastHide]);
 assert.equal(await firstShow,false);assert.equal(await lastShow,true);
 assert.equal(ctx.resumeCalls,2);assert.equal(audio.snapshot().ready,true);
 assert.equal(timers.intervals(),1);audio.dispose();
});
test('muting while visibility recovery waits does not resurrect music',async()=>{
 const {audio,ctx,timers}=await enabled();audio.setScene({playing:true,level:0});
 const suspend=deferSuspension(ctx);
 const hidden=audio.setVisible(false),shown=audio.setVisible(true);
 audio.setEnabled(false);suspend.finish();await hidden;
 assert.equal(await shown,false);assert.equal(ctx.state,'suspended');
 assert.equal(ctx.resumeCalls,1);assert.equal(audio.snapshot().enabled,false);
 assert.equal(timers.intervals(),0);audio.dispose();
});
test('dispose while visibility recovery waits cannot resume the closed context',async()=>{
 const {audio,ctx,timers}=await enabled();audio.setScene({playing:true,level:0});
 const suspend=deferSuspension(ctx);
 const hidden=audio.setVisible(false),shown=audio.setVisible(true);
 audio.dispose();suspend.finish();await hidden;
 assert.equal(await shown,false);assert.equal(ctx.resumeCalls,1);
 assert.equal(audio.snapshot().ready,false);assert.equal(timers.jobs.size,0);
});

test('the first pending unlock reconciles a suspend queued by a rapid hide/show',async()=>{
 const ctx=new Context(),resumes=[];
 ctx.resumeOverride=()=>new Promise(resolve=>resumes.push(()=>{ctx.state='running';resolve();}));
 const {audio,timers}=setup({contextFactory:()=>ctx});
 audio.setEnabled(true);audio.setScene({playing:true,level:0});
 const firstUnlock=audio.unlock(),suspend=deferSuspension(ctx);
 const hidden=audio.setVisible(false);audio.setVisible(true);
 assert.equal(resumes.length,1);resumes.shift()();
 for(let i=0;i<5;i++)await Promise.resolve();
 assert.equal(audio.snapshot().ready,false);assert.equal(timers.intervals(),0);
 suspend.finish();await hidden;
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(resumes.length,1);resumes.shift()();
 assert.equal(await firstUnlock,true);assert.equal(ctx.state,'running');
 assert.equal(audio.snapshot().ready,true);assert.equal(timers.intervals(),1);
 audio.dispose();
});


test('rain pickup and portal feedback use finite voices and obey cancellation',async()=>{
 const {audio,ctx}=await enabled();
 for(const event of ['pickup','warp']){
  const before=ctx.sources.length;
  assert.equal(audio.play(event,{delay:200}),true);
  const sources=ctx.sources.slice(before);
  assert(sources.length>0,event+' must schedule audio');
  audio.cancelEffects();
  assert(sources.every(source=>source.stops.some(at=>at<source.started)));
  assert.equal(audio.diagnostics().effectVoices,0);
 }
 audio.dispose();
});
