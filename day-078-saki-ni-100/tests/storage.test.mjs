import { test } from 'node:test';
import assert from 'node:assert/strict';
import {STORAGE,loadProgress,saveProgress,validateProgress} from '../lib/storage.js';
const initial={cleared:[],noHint:[],sound:false};
function memory(raw=null){return { getItem(key){assert.equal(key,'saki-ni-100.v1');return raw;},setItem(key,value){assert.equal(key,STORAGE);raw=value;} };}
test('保存は必要な値だけ往復し、入力の配列を共有しない',()=>{
  const value={cleared:[2,1],noHint:[1],sound:true},storage=memory();
  assert.equal(saveProgress(value,storage),true);
  assert.deepEqual(loadProgress(storage),{cleared:[1,2],noHint:[1],sound:true});
  const cloned=validateProgress(value);cloned.cleared.push(3);assert.deepEqual(value.cleared,[2,1]);
});
test('壊れたJSON・型違い・範囲外・重複・巨大配列は全体を初期化',()=>{
  for(const raw of ['{',null,'null','[]','true','123','"text"',JSON.stringify({...initial,cleared:'1'}),JSON.stringify({...initial,noHint:[1]}),JSON.stringify({...initial,sound:1}),JSON.stringify({...initial,cleared:[0]}),JSON.stringify({...initial,cleared:[13]}),JSON.stringify({...initial,cleared:[1,1]}),JSON.stringify({...initial,cleared:[1.5]}),JSON.stringify({...initial,cleared:['1']}),JSON.stringify({...initial,cleared:Array(10000).fill(1)}),JSON.stringify({...initial,extra:'text'}),JSON.stringify({cleared:[]})]){
    assert.deepEqual(loadProgress(memory(raw)),initial);
  }
});
test('localStorageの読取・書込例外でも落ちない',()=>{
  const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.deepEqual(loadProgress(broken),initial);assert.equal(saveProgress(initial,broken),false);
});
