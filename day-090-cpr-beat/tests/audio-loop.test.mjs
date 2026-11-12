import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBeatLoop, AudioLoopPlayer } from '../lib/audio-loop.js';

for (const rate of [44100,48000]) {
  for (const bpm of [100,110,120]) {
    test(`rendered audio stays on the ${bpm} BPM grid at ${rate}Hz, including the loop seam`,()=>{
      const {samples,beats,framesPerBeat}=renderBeatLoop(rate,bpm);
      const attacks=[];let last=-Infinity,max=0;
      for(let i=0;i<samples.length;i++){
        assert.ok(Number.isFinite(samples[i]));max=Math.max(max,Math.abs(samples[i]));
        if(Math.abs(samples[i])>.08 && i-last>rate*.1){attacks.push(i);last=i;}
      }
      assert.equal(attacks.length,beats);assert.ok(max>0.2&&max<.9);
      for(let i=1;i<attacks.length;i++)assert.ok(Math.abs(attacks[i]-attacks[i-1]-framesPerBeat)<=1.01);
      assert.ok(Math.abs(attacks[0]+samples.length-attacks.at(-1)-framesPerBeat)<=1.01);
      assert.equal(samples[0],0);assert.equal(samples.at(-1),0);
    });
  }
}
test('tone choices are distinct, bounded synthetic signals; unsupported rates/tempos are rejected',()=>{
  const clear=renderBeatLoop(8000,110,'clear').samples,soft=renderBeatLoop(8000,110,'soft').samples;
  assert.notDeepEqual(clear,soft);assert.equal(clear.length,soft.length);
  for(const args of [[0,110],[Infinity,110],[44100,99],[44100,130],[44100,110,'unknown']])assert.throws(()=>renderBeatLoop(...args),RangeError);
});
function context(){
  return {sampleRate:8000,currentTime:0,state:'running',destination:{},sources:[],gains:[],
    createBuffer(channels,n,rate){const data=new Float32Array(n);return {duration:n/rate,getChannelData:()=>data};},
    createBufferSource(){const s={connect(){},disconnect(){},start(at){this.at=at;},stop(at){this.stopped=true;this.stopAt=at;this.onended?.();}};this.sources.push(s);return s;},
    createGain(){const g={connect(){},disconnect(){},gain:{values:[],setValueAtTime(v,t){this.values.push([v,t]);},setTargetAtTime(v,t){this.values.push([v,t]);},linearRampToValueAtTime(v,t){this.values.push([v,t]);},cancelScheduledValues(){}}};this.gains.push(g);return g;}
  };
}
test('audio uses one native looping source and changing tempo preserves the next beat',()=>{
  const ctx=context(),player=new AudioLoopPlayer();
  player.play(ctx,{bpm:110,tone:'clear',volume:65});
  const old=ctx.sources[0],next=0.025+60/110;
  assert.equal(old.loop,true);assert.ok(old.buffer.duration>1);assert.equal(old.at,.025);
  ctx.currentTime=.2;player.play(ctx,{bpm:120,tone:'soft',volume:50});
  assert.equal(old.stopped,true);assert.ok(Math.abs(ctx.sources[1].at-next)<1e-10);
  assert.equal(ctx.sources.filter(s=>!s.stopped).length,1);
  assert.ok(Math.abs(old.stopAt-next)<1e-10);
});
test('volume changes update gain without rebuilding or overlapping sources; stop is idempotent',()=>{
  const ctx=context(),player=new AudioLoopPlayer();
  player.play(ctx,{bpm:100,tone:'clear',volume:65});player.setVolume(10);
  assert.equal(ctx.sources.length,1);assert.equal(ctx.gains[0].gain.values.at(-1)[0],.035);
  player.stop();player.stop();assert.equal(player.source,null);assert.equal(ctx.sources[0].stopped,true);
});

test('a change ten milliseconds before the beat lets the old source play that beat',()=>{
  const ctx=context(),player=new AudioLoopPlayer();
  player.play(ctx,{bpm:110,tone:'clear',volume:65});
  const old=ctx.sources[0],near=.025+60/110;
  ctx.currentTime=near-.01;
  player.play(ctx,{bpm:120,tone:'clear',volume:65});
  assert.ok(old.stopAt>near);assert.ok(Math.abs(old.stopAt-ctx.sources[1].at)<1e-10);
  assert.ok(Math.abs(ctx.sources[1].at-(near+60/110))<1e-10);
});
