import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEST_STORAGE_NAME,MUTE_STORAGE_NAME,load,saveBest,saveMute } from '../lib/store.js';
const memory=()=>{const values=new Map();return {getItem:n=>values.get(n)??null,setItem:(n,v)=>values.set(n,v),values};};
test('壊れたJSONでもbestは初期化しミュートを保つ',()=>{const s=memory();s.setItem(BEST_STORAGE_NAME,'{broken');s.setItem(MUTE_STORAGE_NAME,'true');assert.deepEqual(load(s),{best:null,mute:true,available:false});});
test('読み書き禁止環境で落ちない',()=>{const s={getItem(){throw Error();},setItem(){throw Error();}};assert.equal(load(s).available,false);assert.equal(saveMute(s,true),false);const result=saveBest(s,null,20,1);assert.equal(result.saved,false);assert.equal(result.best.speed,20);assert.equal(load(undefined).best,null);});
test('無効な保存値は復元しない',()=>{for(const v of [{speed:-1,seconds:1,date:'2026-09-21'},{speed:1,seconds:0,date:'2026-09-21'},{speed:1e20,seconds:1,date:'2026-09-21'},{speed:2,seconds:1,date:'bad'}]){const s=memory();s.setItem(BEST_STORAGE_NAME,JSON.stringify(v));assert.equal(load(s).best,null);}});
test('速度を優先し、同速では短い時間だけ更新',()=>{const s=memory(),a=saveBest(s,null,100,20,'2026-09-21');assert.equal(saveBest(s,a.best,99,10).improved,false);assert.equal(saveBest(s,a.best,100,21).improved,false);assert.equal(saveBest(s,a.best,100,19).improved,true);assert.equal(saveBest(s,a.best,101,40).improved,true);});
test('保存はベストの3項目とミュートだけ',()=>{const s=memory();saveBest(s,null,100,20,'2026-09-21');saveMute(s,true);assert.deepEqual([...s.values.keys()].sort(),[BEST_STORAGE_NAME,MUTE_STORAGE_NAME].sort());assert.deepEqual(load(s),{best:{speed:100,seconds:20,date:'2026-09-21'},mute:true,available:true});});

test('保存失敗後の遅い再挑戦でも保存不可を維持',()=>{const s={setItem(){throw Error();}},a=saveBest(s,null,100,10),b=saveBest(s,a.best,100,11);assert.equal(a.saved,false);assert.equal(b.saved,false);assert.equal(b.improved,false);assert.equal(b.best.seconds,10);});
