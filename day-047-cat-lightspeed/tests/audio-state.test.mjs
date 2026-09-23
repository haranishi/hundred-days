import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioState,voicePlan } from '../lib/audio-state.js';
test('音速の境界で即時から遅延に変わる',()=>{assert.equal(audioState(1224.999),'immediate');assert.equal(audioState(1225),'delayed');assert.equal(audioState(1225.001),'delayed');});
test('軌道の境界で遅延から無音に変わる',()=>{assert.equal(audioState(27599.999),'delayed');assert.equal(audioState(27600),'silent');assert.equal(audioState(27600.001),'silent');});
test('加速すると高く短く鳴き、遅延は0.5〜1秒',()=>{const low=voicePlan(1),fast=voicePlan(2000);assert.ok(fast.pitch>low.pitch);assert.ok(fast.interval<low.interval);assert.ok(fast.duration<low.duration);assert.equal(low.delay,0);assert.ok(fast.delay>=.5&&fast.delay<=1);});

import { soundNote } from '../lib/audio-state.js';
test('録音の説明は開始後4秒だけ表示し、再開始で戻る',()=>{
  assert.equal(soundNote(0,0,'ready',false),'');
  for(const elapsed of [0,3.999])assert.equal(soundNote(0,elapsed,'playing',false),'本物の「ニャー」と一緒に。');
  for(const elapsed of [4,30])assert.equal(soundNote(0,elapsed,'playing',false),'');
  assert.equal(soundNote(0,0,'result',false),'');
  assert.equal(soundNote(0,0,'playing',false),'本物の「ニャー」と一緒に。');
});
test('説明が消えた後も音速・真空・ミュートの表示を維持する',()=>{
  assert.equal(soundNote(1225,30,'playing',false),'鳴き声が、後ろに置き去りになる。');
  assert.equal(soundNote(27600,30,'playing',true),'真空では音が伝わらない');
  assert.equal(soundNote(0,30,'playing',true),'音はオフ。猫は元気です。');
});

import {createVoiceState,advanceVoice} from '../lib/audio-state.js';
test('録音は1再生＋1予約、超音速では750ms後、真空と中断で予約破棄',()=>{
  let result=advanceVoice(createVoiceState(),0,1500,[1.3,1.5,2.4]);assert.equal(result.play,null);assert.equal(result.emission.start,.75);let state=result.state;
  result=advanceVoice(state,.749,1500);assert.equal(result.play,null);
  result=advanceVoice(state,.75,1500);assert.ok(result.play);assert.equal(result.state.pending,null);
  result=advanceVoice(result.state,.76,27600);assert.equal(result.state.active,null);assert.equal(result.state.pending,null);
  assert.ok(advanceVoice(createVoiceState(),0,30).play);
  assert.equal(advanceVoice(state,.2,1500,undefined,true).state.pending,null);
});
test('減速しても先の声を追い越さず、100回でも音の状態は有界',()=>{let state=createVoiceState();for(let i=0;i<10000;i++){const r=advanceVoice(state,i/60,i<300?2000:30,[1.3,1.5,2.4]);state=r.state;if(state.pending&&state.active)assert.ok(state.pending.start>=state.active.end);assert.ok(Object.keys(state).length<=3);}});
