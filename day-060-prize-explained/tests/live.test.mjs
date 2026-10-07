import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchCurrent, normalizeResponses, loadCache, liveSlot, savedAge, saveAge, getStorage, cacheLifetime } from '../lib/live.js';
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}-2026-1006.json`, import.meta.url)));
const prizes=fixture('prizes'), laureates=fixture('laureates');
const now=Date.parse('2026-10-06T19:00:00+09:00');
function memory() { const entries = new Map(); return { getItem:(slot)=>entries.get(slot)||null, setItem:(slot,value)=>entries.set(slot,value), removeItem:(slot)=>entries.delete(slot) }; }
const respond = async (url) => ({ok:true,json:async()=>url.includes('/nobelPrizes?')?prizes:laureates});
test('実応答の医学賞3人、年齢情報と6分野の発表', () => {
  const result=normalizeResponses(prizes,laureates);
  assert.equal(result.awards.length,3); assert.equal(result.prizes.length,6);
  assert.equal(result.prizes.find(p=>p.cat==='med').people.length,3);
});
test('発表が進んだ合成応答・団体・誕生日待ち', () => {
  const sample=structuredClone(prizes);
  sample.nobelPrizes.find(p=>p.category.en==='Physics').laureates=[{id:'999901',knownName:{en:'Test Laureate A'}}];
  sample.nobelPrizes.find(p=>p.category.en==='Peace').laureates=[{id:'999902',orgName:{en:'Test Organization A'}}];
  const result=normalizeResponses(sample,laureates);
  assert.equal(result.awards.length,3); assert.equal(result.orgs.length,1);
  assert.equal(result.prizes.find(p=>p.cat==='phy').people[0].born,null);
});
test('2本だけ固定先へ取得、保存、新しい保存分は通信しない', async () => {
  const storage=memory(), calls=[];
  const result=await fetchCurrent({storage,now,fetcher:async(url,options)=>{calls.push([url,options]);return respond(url);}});
  assert.equal(result.state,'ready'); assert.equal(calls.length,2);
  for(const [url, options] of calls) { assert.equal(new URL(url).hostname,'api.nobelprize.org'); assert.equal(options.redirect,'error'); assert.equal(new URL(url).searchParams.has('age'),false); }
  assert.equal(loadCache(storage).awards.length,3);
  const cached=await fetchCurrent({storage,now:now+1000,fetcher:()=>assert.fail('通信しない')});
  assert.equal(cached.state,'stale'); assert.equal(cached.saved,true);
});
test('30分期限ちょうどで取り直す・週外24時間・未来保存は使わない', async () => {
  const storage=memory(); await fetchCurrent({storage,now,fetcher:respond});
  let calls=0;
  await fetchCurrent({storage,now:now+30*60000,fetcher:async(url)=>{calls++;return respond(url);}});
  assert.equal(calls,2); assert.equal(cacheLifetime(now),30*60000);
  assert.equal(cacheLifetime(Date.parse('2026-10-13T00:00:00+09:00')),24*3600000);
  calls=0; await fetchCurrent({storage,now:now-1,fetcher:async(url)=>{calls++;return respond(url);}});assert.equal(calls,2);
});
test('500・保存分へ退避・強制再試行・壊れた応答', async () => {
  const storage=memory(), fail=async()=>({ok:false,status:500});
  assert.equal((await fetchCurrent({storage,now,fetcher:fail})).state,'error');
  await fetchCurrent({storage,now,fetcher:respond});
  const stale=await fetchCurrent({storage,now:now+31*60000,fetcher:fail});
  assert.equal(stale.state,'stale'); assert.equal(stale.failed,true); assert.equal(stale.awards.length,3);
  assert.equal((await fetchCurrent({storage,now,force:true,fetcher:respond})).state,'ready');
  assert.throws(()=>normalizeResponses({},{}));
  assert.throws(()=>normalizeResponses({...prizes,meta:{count:100}},laureates));
  storage.setItem(liveSlot,'bad');assert.equal(loadCache(storage),null);
});
test('保存禁止・localStorage自体が例外でも答えが出る', async () => {
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal((await fetchCurrent({storage,now,fetcher:respond})).state,'ready');
  assert.equal(savedAge(storage),'');saveAge(storage,'26');
  assert.equal(getStorage({get localStorage(){throw new Error('blocked');}}),null);
});
test('年齢の保存と削除', () => {const storage=memory();saveAge(storage,'26');assert.equal(savedAge(storage),'26');saveAge(storage,'');assert.equal(savedAge(storage),'');});
