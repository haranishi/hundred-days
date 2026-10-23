import {LEVELS} from '../lib/levels.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readProgress,recordWin,STORAGE_KEY} from '../lib/progress.js';
const memory=value=>({getItem:()=>value,setItem(k,v){this.value=v;}});
test('rejects broken or unknown saved data',()=>{
 for(const raw of ['{','null','[]','true','"x"'])assert.deepEqual(readProgress(memory(raw)),{});
 assert.deepEqual(readProgress(memory(JSON.stringify({'first-rain':5,'return-rain':-1,'two-clouds':2.5,unknown:3}))),{'first-rain':5});
});
test('only keeps a completed level best, never a worse score',()=>{
 const storage=memory('{}');const a=recordWin({},'first-rain',9,storage);
 assert.equal(a.saved,true);assert.deepEqual(readProgress(memory(storage.value)),{'first-rain':9});
 assert.deepEqual(recordWin(a.progress,'first-rain',12,storage).progress,{'first-rain':9});
 assert.deepEqual(recordWin(a.progress,'first-rain',6,storage).progress,{'first-rain':6});
 assert.equal(recordWin({},'unknown',3,storage).saved,false);
});
test('blocked reads and writes leave the game usable',()=>{
 const unavailable={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
 assert.deepEqual(readProgress(unavailable),{});
 assert.deepEqual(recordWin({},'first-rain',7,unavailable),{progress:{'first-rain':7},saved:false});
});

test('campaign scores retain the three legacy records and accept every new level',()=>{
 let progress={'first-rain':4,'return-rain':9,'two-clouds':20};
 const storage=memory('{}');
 for(const level of LEVELS.slice(3)){
  const result=recordWin(progress,level.id,level.par,storage);
  assert.equal(result.saved,true);
  progress=result.progress;
 }
 assert.equal(Object.keys(progress).length,20);
 assert.deepEqual(readProgress(memory(storage.value)),progress);
 assert.deepEqual(Object.fromEntries(Object.entries(progress).slice(0,3)),{'first-rain':4,'return-rain':9,'two-clouds':20});
});
