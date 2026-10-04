import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../lib/audio.mjs';
function setup(saved){
  const events=[],timers=new Set(),data=new Map(saved?[['fruit-box.audio',JSON.stringify(saved)]]:[]);
  const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  const context={state:'running',currentTime:0,destination:{},async resume(){this.state='running';},close(){this.state='closed';},
    createGain(){return{gain:param,connect(){},disconnect(){}};},
    createOscillator(){return{frequency:param,connect(){},disconnect(){},start(time){events.push(['start',time]);},stop(time){events.push(['stop',time]);}};}};
  const audio=createAudio({makeContext:()=>context,storage:{getItem:key=>data.get(key),setItem:(key,v)=>data.set(key,v)},
    every:fn=>{timers.add(fn);return fn;},cancel:fn=>timers.delete(fn)});
  return{audio,events,timers,data,context};
}
test('opening the game never starts audio without a user unlock',()=>{
  const s=setup();s.audio.setActive(true);assert.equal(s.events.length,0);assert.equal(s.timers.size,0);
});
test('music starts after unlock, repeated drop gestures do not cut the phrase',async()=>{
  const s=setup();s.audio.setActive(true);await s.audio.unlock();assert.ok(s.events.length>0);
  const before=s.events.length;await s.audio.unlock();assert.equal(s.events.length,before);assert.equal(s.timers.size,1);
  s.audio.dispose();
});
test('pause cancels queued music and effects, resume never creates multiple timers',async()=>{
  const s=setup();s.audio.setActive(true);await s.audio.unlock();s.audio.drop();s.audio.setActive(false);
  assert.equal(s.audio.status().voices,0);assert.equal(s.timers.size,0);
  s.audio.setActive(true);s.audio.setActive(true);assert.equal(s.timers.size,1);s.audio.dispose();
});
test('music and effects are independent, muting an effect cuts its queued tail',async()=>{
  const s=setup();s.audio.setActive(true);await s.audio.unlock();s.audio.set('music',false);assert.equal(s.timers.size,0);
  const before=s.events.length;s.audio.merge(2);assert.ok(s.events.length>before);
  s.audio.set('effects',false);const after=s.events.length;s.audio.drop();assert.equal(s.events.length,after);assert.equal(s.audio.status().voices,0);
  s.audio.dispose();
});
test('zero volume stops music scheduling while preferences survive reload',async()=>{
  const s=setup();s.audio.setActive(true);await s.audio.unlock();s.audio.set('musicVolume',0);assert.equal(s.timers.size,0);
  const saved=JSON.parse(s.data.get('fruit-box.audio'));assert.equal(setup(saved).audio.get().musicVolume,0);s.audio.dispose();
});
test('bad preferences and blocked storage cannot prevent playing',async()=>{
  const s=setup({music:'oops',musicVolume:-50,effectsVolume:999});assert.equal(s.audio.get().music,true);
  assert.equal(s.audio.get().musicVolume,0);assert.equal(s.audio.get().effectsVolume,100);
  const audio=createAudio({storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}},makeContext(){throw new Error('unsupported');}});
  audio.set('music',false);assert.equal(await audio.unlock(),false);audio.drop();audio.dispose();
});
