import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY,defaults,readStore,writeStore,recordClear,sanitize } from '../lib/store.js';
test('1キーだけで記録と音設定を読み書き',()=>{const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};const value={unlockedWorld:2,bestMs:{'1-5':12345},muted:true};assert.ok(writeStore(storage,value));assert.deepEqual(readStore(storage),value);assert.deepEqual([...map.keys()],[KEY]);});
test('壊れたJSON・例外・不正値を無視',()=>{for(const text of ['{','null','[]','42'])assert.deepEqual(readStore({getItem:()=>text}),defaults());assert.deepEqual(readStore(),defaults());assert.equal(writeStore(),false);assert.deepEqual(sanitize({unlockedWorld:99,bestMs:{'5-1':12,'1-1':-1,'2-2':'123','2-3':4.5},muted:'true'}),defaults());});
test('各ワールドの5面クリアだけが次の世界を解放',()=>{for(let w=1;w<=4;w++){const initial={...defaults(),unlockedWorld:w};for(let n=1;n<=4;n++)assert.equal(recordClear(initial,`${w}-${n}`,1000).unlockedWorld,w);assert.equal(recordClear(initial,`${w}-5`,1000).unlockedWorld,Math.min(4,w+1));}});
test('自己ベストは短い記録だけ更新',()=>{const a=recordClear(defaults(),'1-1',1000),b=recordClear(a,'1-1',2000);assert.equal(b.bestMs['1-1'],1000);assert.equal(recordClear(b,'1-1',500).bestMs['1-1'],500);});
