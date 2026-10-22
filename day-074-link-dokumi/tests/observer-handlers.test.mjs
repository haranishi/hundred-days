import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTrace, handleAround } from '../lib/handlers.js';
import { validateTrace, validateAround, LIMITS } from '../lib/contract.js';
const origin={url:'https://app.com/api/day-074/'};
function req(path='trace',params={url:'https://example.com/path'},headers={},method='GET'){
  const u=new URL(path,origin.url);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
  return new Request(u,{method,headers:{'cf-connecting-ip':'8.8.4.4',...headers}});
}
function memoryCache(){
  const data=new Map();
  return {data,async match(key){return data.get(key.url)?.clone()??null;},async put(key,response){data.set(key.url,response.clone());}};
}
const resolve=async()=>({ok:true,addresses:['8.8.8.8'],ad:true});
const fetchImpl=async()=>new Response('<title>Hello</title>',{headers:{'Content-Type':'text/html','Set-Cookie':'sid=SECRET'}});
test('handler rejects method, foreign fetch site, stop switch and bad input without fetch',async()=>{
  for(const handler of [handleTrace,handleAround]){
    const ctx={env:{},fetchImpl:()=>{throw Error('must not fetch');}};
    assert.equal((await handler(req('trace',{}, {},'POST'),ctx)).status,405);
    assert.equal((await handler(req('trace',{url:'https://example.com/'},{'sec-fetch-site':'cross-site'}),ctx)).status,403);
    assert.equal((await handler(req('trace',{url:'https://example.com/'},{'sec-fetch-site':'same-site'}),ctx)).status,403);
    assert.equal((await handler(req(),{...ctx,env:{LINK_DOKUMI_DISABLED:'1'}})).status,503);
    assert.equal((await handler(req('trace',{}),ctx)).status,400);
  }
  assert.equal((await handleTrace(req('trace',{url:'x'.repeat(2049)}),{})).status,400);
  assert.equal((await handleAround(req('around',{host:'example.com'}),{})).status,400);
});
test('handler 13th request rate limited and resets minute',async()=>{
  let now=120000;
  const cache=memoryCache(),ctx={cache,now:()=>now,resolve,fetchImpl};
  for(let i=0;i<12;i++)assert.equal((await handleTrace(req(),ctx)).status,200);
  const r=await handleTrace(req(),ctx);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal((await r.json()).error,'rate_limited');
  now+=60000;assert.equal((await handleTrace(req(),ctx)).status,200);
  for(const key of cache.data.keys()){assert.ok(!key.includes('8.8.4.4'));assert.ok(!key.includes('example.com'));}
});
test('handler concurrent rate counters in one isolate do not lose updates',async()=>{
  const cache=memoryCache();
  const responses=await Promise.all(Array.from({length:13},()=>handleTrace(req('trace',{url:'http://localhost/'}),{cache,now:()=>120000})));
  assert.equal(responses.filter(r=>r.status===429).length,1);
});
test('trace normalized cache hit and expiry; transient errors are not cached',async()=>{
  const cache=memoryCache();let calls=0,now=0;
  const ctx={cache,now:()=>now,resolve,fetchImpl:async()=>{calls++;return fetchImpl();}};
  const a=await handleTrace(req('trace',{url:'https://example.com:443/path#fragment'}),ctx);
  assert.deepEqual(validateTrace(await a.json()).errors,[]);
  const b=await handleTrace(req(),ctx);assert.equal((await b.json()).cached,true);assert.equal(calls,1);
  now=301000;await handleTrace(req(),ctx);assert.equal(calls,2);
  const errors={cache:memoryCache(),resolve,fetchImpl:async()=>{calls++;throw Error('connection');}};
  const before=calls;await handleTrace(req(),errors);await handleTrace(req(),errors);assert.equal(calls-before,4);
});
test('handler deterministic refusals are observations and can be cached',async()=>{
  const ctx={cache:memoryCache()};
  const first=await handleTrace(req('trace',{url:'http://127.1/'}),ctx);
  assert.equal(first.status,200);assert.equal((await first.json()).error.code,'blocked_target');
  const second=await handleTrace(req('trace',{url:'http://127.1/'}),ctx);assert.equal((await second.json()).cached,true);
});
test('handler headers and console do not leak IP, target or cookie values',async()=>{
  const messages=[],saved={log:console.log,error:console.error,warn:console.warn};
  try {
    for(const key of Object.keys(saved))console[key]=(...args)=>messages.push(args);
    for(const site of [undefined,'none','same-origin']){
      const response=await handleTrace(req('trace',{url:'https://example.com/path'},site?{'sec-fetch-site':site}:{}),{resolve,fetchImpl});
      assert.equal(response.status,200);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
      assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.equal(response.headers.get('Cache-Control'),'no-store');
      for(const header of ['Access-Control-Allow-Origin','Set-Cookie','Cookie'])assert.equal(response.headers.get(header),null);
      assert.ok(!(await response.text()).includes('SECRET'));
    }
    assert.deepEqual(messages,[]);
  } finally {Object.assign(console,saved);}
});
test('around caches RDAP for 24 hours and validates response',async()=>{
  const cache=memoryCache();let rdapCalls=0,now=Date.parse('2026-10-22T00:00:00Z');
  const ctx={cache,now:()=>now,registrable:'example.com',resolve,fetchImpl:async url=>{
    const u=new URL(url);
    if(u.hostname.startsWith('rdap.')){rdapCalls++;return Response.json({events:[{eventAction:'registration',eventDate:'2020-01-01T00:00:00Z'}]});}
    if(u.hostname==='cloudflare-dns.com')return Response.json({Status:0,AD:true,Answer:[]});
    return new Response('Contact: mailto:x@example.com');
  }};
  for(let i=0;i<2;i++){
    const r=await handleAround(req('around',{host:'example.com',scheme:'https'}),ctx);
    assert.equal(r.status,200);assert.deepEqual(validateAround(await r.json()).errors,[]);
  }
  assert.equal(rdapCalls,1);now+=86401000;
  await handleAround(req('around',{host:'example.com',scheme:'https'}),ctx);assert.equal(rdapCalls,2);
});
test('Pages entrypoints export GET and reject other methods',async()=>{
  for(const name of ['trace','around']){
    const entry=await import('../../functions/api/day-074/'+name+'.js');
    assert.equal(typeof entry.onRequestGet,'function');
    const r=entry.onRequest({request:req(name,{}, {},'POST')});assert.equal(r.status,405);
  }
});
for(const value of ['1','2','1000','0001',undefined,'','0','1001','-1','1.5','1e2',' 1','1 ','NaN',1])test('rate env validation '+JSON.stringify(value),async()=>{
  const valid=typeof value==='string' && /^\d+$/.test(value) && +value>=1 && +value<=1000;
  const limit=valid?+value:LIMITS.RATE_PER_MINUTE;
  const ctx={cache:memoryCache(),now:()=>120000,env:{LINK_DOKUMI_RATE_LIMIT:value}};
  for(let i=0;i<limit;i++)assert.equal((await handleTrace(req('trace',{url:'http://localhost/'}),ctx)).status,200);
  assert.equal((await handleTrace(req('trace',{url:'http://localhost/'}),ctx)).status,429);
});
test('around uses the same environment rate override',async()=>{
  const ctx={cache:memoryCache(),now:()=>120000,env:{LINK_DOKUMI_RATE_LIMIT:'1'}};
  const request=()=>req('around',{host:'localhost',scheme:'https'});
  assert.equal((await handleAround(request(),ctx)).status,200);
  assert.equal((await handleAround(request(),ctx)).status,429);
});
