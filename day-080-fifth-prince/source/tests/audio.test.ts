import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AUDIO, FootstepClock, footstepSamples, parseAudioPreferences, surfaceAt, volumeGain, type Surface } from '../src/audio-model';
import { createMap } from '../src/maps';
test('新規の音はオン。不正な設定を拒否し、音を切った意思と別々の音量を復元する',()=>{
 assert.equal(DEFAULT_AUDIO.muted,false);for(const raw of [null,'{broken','null','{}',JSON.stringify({muted:false,music:-1,effects:75}),JSON.stringify({muted:true,music:70,effects:101})])assert.deepEqual(parseAudioPreferences(raw),DEFAULT_AUDIO);
 const saved={muted:true,music:25,effects:80};assert.deepEqual(parseAudioPreferences(JSON.stringify(saved)),saved);assert.equal(volumeGain(0),0);assert.equal(volumeGain(100),1);assert.ok(volumeGain(25)<volumeGain(75));
});
test('実マップの草・道・橋・宮殿と魔王城の床を区別する',()=>{
 const town=createMap('town');assert.equal(surfaceAt(town,552,248),'grass');assert.equal(surfaceAt(town,376,368),'dirt');assert.equal(surfaceAt(town,600,344),'wood');assert.equal(surfaceAt(createMap('palace'),376,432),'stone');assert.equal(surfaceAt(createMap('abyss'),376,432),'stone');
});
test('歩行は実距離に従い、停止と壁で増えず、走行は同じ時間で足数が増える',()=>{
 const steps=(speed:number)=>{const clock=new FootstepClock();let count=0;for(let i=0;i<300;i++)if(clock.advance(speed/100))count++;return count;};assert.ok(steps(128)>steps(94));
 const clock=new FootstepClock();for(let n=0;n<100;n++)assert.equal(clock.advance(0),false);for(const distance of [-1,NaN,Infinity])assert.equal(clock.advance(distance),false);
 clock.advance(7);clock.advance(7);clock.reset();assert.equal(clock.advance(7),false);assert.equal(clock.advance(7),false);assert.equal(clock.advance(7),false);assert.equal(clock.advance(7),true);
});
test('短い接地音は無音で始まり終わり、有限な波形・余裕あるピーク・複数の音色を持つ',()=>{
 const shapes=new Set<string>();for(const surface of ['grass','dirt','stone','wood'] as Surface[]){const a=footstepSamples(surface,0),b=footstepSamples(surface,1);assert.ok(a.length>=2205&&a.length<=5512);assert.equal(Math.abs(a[0]),0);assert.equal(Math.abs(a[a.length-1]),0);assert.ok(a.every(Number.isFinite));assert.ok(Math.max(...a.map(Math.abs))<=.60);assert.ok(a.some(x=>Math.abs(x)>.1));assert.notDeepEqual(a,b);shapes.add(Array.from(a.slice(150,165)).join(','));}assert.equal(shapes.size,4);
});
