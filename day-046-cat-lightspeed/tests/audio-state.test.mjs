import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioState,voicePlan } from '../lib/audio-state.js';
test('音速の境界で即時から遅延に変わる',()=>{assert.equal(audioState(1224.999),'immediate');assert.equal(audioState(1225),'delayed');assert.equal(audioState(1225.001),'delayed');});
test('軌道の境界で遅延から無音に変わる',()=>{assert.equal(audioState(27599.999),'delayed');assert.equal(audioState(27600),'silent');assert.equal(audioState(27600.001),'silent');});
test('加速すると高く短く鳴き、遅延は0.5〜1秒',()=>{const low=voicePlan(1),fast=voicePlan(2000);assert.ok(fast.pitch>low.pitch);assert.ok(fast.interval<low.interval);assert.ok(fast.duration<low.duration);assert.equal(low.delay,0);assert.ok(fast.delay>=.5&&fast.delay<=1);});

import { soundNote } from '../lib/audio-state.js';
test('合成音の説明は開始後4秒だけ表示し、再開始で戻る',()=>{
  assert.equal(soundNote(0,0,'ready',false),'');
  for(const elapsed of [0,3.999])assert.equal(soundNote(0,elapsed,'playing',false),'合成した「ニャー」と一緒に。');
  for(const elapsed of [4,30])assert.equal(soundNote(0,elapsed,'playing',false),'');
  assert.equal(soundNote(0,0,'result',false),'');
  assert.equal(soundNote(0,0,'playing',false),'合成した「ニャー」と一緒に。');
});
test('説明が消えた後も音速・真空・ミュートの表示を維持する',()=>{
  assert.equal(soundNote(1225,30,'playing',false),'鳴き声が、後ろに置き去りになる。');
  assert.equal(soundNote(27600,30,'playing',true),'真空では音が伝わらない');
  assert.equal(soundNote(0,30,'playing',true),'音はオフ。猫は元気です。');
});
