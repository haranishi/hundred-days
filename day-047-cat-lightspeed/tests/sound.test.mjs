import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSound,impactSoundPlan,MAX_IMPACT_VOICES} from '../lib/sound.js';

test('小物・木/柵・建物/大型の録音ファイル、速度とばらつきを固定',()=>{
  for(const type of ['rock','grass','flower','ice'])assert.equal(impactSoundPlan({type,size:.8}).file,'hit-light.mp3');
  for(const type of ['log','stump','tree','pine','fence','cityFence'])assert.equal(impactSoundPlan({type,size:.8}).file,'hit-wood.mp3');
  for(const type of ['buildingA','buildingC','buildingE','building'])assert.equal(impactSoundPlan({type}).file,'hit-heavy.mp3');
  assert.equal(impactSoundPlan({size:1.5}).file,'hit-heavy.mp3');
  assert.ok(impactSoundPlan({speed:1000}).volume>impactSoundPlan({speed:1}).volume);
  assert.notEqual(impactSoundPlan({},0).playbackRate,impactSoundPlan({},1).playbackRate);
  assert.equal(impactSoundPlan({speed:1224}).delay,0);assert.equal(impactSoundPlan({speed:1225}).delay,.75);assert.equal(impactSoundPlan({speed:27600}).silent,true);
});

function audioFixture(){
  const started=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
  const node=()=>({connect(){},disconnect(){},stop(){this.stopped=true;},start(){started.push(this);},gain:param(),playbackRate:param()});
  class AudioContext{
    currentTime=0;state='running';sampleRate=100;destination={};
    createGain(){return node();}resume(){return Promise.resolve();}
    createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
    createBuffer(){return {getChannelData:()=>new Float32Array(100)};}
    createBufferSource(){return node();}
    decodeAudioData(buffer){return Promise.resolve({duration:1.2,file:new TextDecoder().decode(buffer)});}
  }
  return {started,AudioContext,fetch:async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(String(url).split('/').at(-1)).buffer})};
}

test('実再生経路は4声を上限とし、録音だけを再生、連打を間引き、終了/ミュートで解放',async t=>{
  const f=audioFixture();t.mock.method(globalThis,'fetch',f.fetch);const previous=globalThis.AudioContext;globalThis.AudioContext=f.AudioContext;t.after(()=>{if(previous)globalThis.AudioContext=previous;else delete globalThis.AudioContext;});
  const sound=createSound();await sound.unlock();assert.equal(sound.stats().impactLoaded,3);assert.equal(MAX_IMPACT_VOICES,4);
  for(let i=0;i<100;i++){sound.impact([{type:i%2?'fence':'buildingA',speed:300}],i*.11,300);assert.ok(sound.stats().impacts<=4);}
  assert.equal(sound.stats().impacts,4);assert.equal(f.started.length,100);assert.ok(f.started.slice(0,-4).every(n=>n.stopped));
  assert.ok(f.started.every(n=>['hit-heavy.mp3','hit-wood.mp3'].includes(n.buffer.file)));
  sound.impact([{type:'rock'}],10.891,300);assert.equal(f.started.length,100);
  f.started.at(-1).onended();assert.equal(sound.stats().impacts,3);
  sound.setMute(true);assert.equal(sound.stats().impacts,0);assert.equal(sound.stats().pendingImpacts,0);
});

test('衝撃音も750ms遅延し、真空・中断で再生と予約を破棄する',async t=>{
  const f=audioFixture();t.mock.method(globalThis,'fetch',f.fetch);const previous=globalThis.AudioContext;globalThis.AudioContext=f.AudioContext;t.after(()=>{if(previous)globalThis.AudioContext=previous;else delete globalThis.AudioContext;});
  const sound=createSound();await sound.unlock();
  sound.impact([{type:'rock',speed:1500}],0,1500);assert.equal(f.started.length,0);
  sound.impact([],.749,1500);assert.equal(f.started.length,0);
  sound.impact([],.75,1500);assert.equal(f.started.length,1);assert.equal(f.started[0].buffer.file,'hit-light.mp3');
  sound.impact([{type:'fence',speed:1500}],1,1500);sound.setSilent(true);
  assert.equal(sound.stats().impacts,0);assert.equal(sound.stats().pendingImpacts,0);
  sound.impact([{type:'building',speed:27600}],2,27600);assert.equal(f.started.length,1);
  sound.setSilent(false);sound.impact([{speed:1500}],3,1500);sound.stop();sound.impact([],4,1500);assert.equal(f.started.length,1);
});
