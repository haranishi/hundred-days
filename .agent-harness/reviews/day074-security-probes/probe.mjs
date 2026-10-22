// Offline review probes. Every outgoing fetch is replaced; no network is used.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { isPublicIp, validateTarget } from '../../../day-074-link-dokumi/lib/target-guard.js';
import { dohQuery, resolvePublicHost } from '../../../day-074-link-dokumi/lib/doh.js';
import { fetchRegistration } from '../../../day-074-link-dokumi/lib/rdap.js';
import { runTrace, runAround } from '../../../day-074-link-dokumi/lib/observe.js';
import { extractHtmlFacts } from '../../../day-074-link-dokumi/lib/html-facts.js';
import { handleTrace } from '../../../day-074-link-dokumi/lib/handlers.js';
import { parseInput } from '../../../day-074-link-dokumi/lib/url-input.js';

globalThis.fetch = () => { throw Error('Unexpected real network'); };
const publicDns = async () => ({ok:true,addresses:['8.8.8.8'],ad:false});
const json = x => new Response(JSON.stringify(x), {headers:{'content-type':'application/json'}});
const report = (name, value) => console.log(JSON.stringify({name,...value}));

for (const address of ['fec0::1','::ffff:0:7f00:1','2001:2::1','100:0:0:1::1','4000::1']) {
  let targets = 0;
  const trace = await runTrace('https://attacker.com/', {fetchImpl:async url => {
    if (new URL(url).hostname === 'attacker.com') { targets++; return new Response('ok'); }
    return json({Status:0,Answer:[{type:28,data:address,TTL:0}]});
  }});
  assert.equal(isPublicIp(address),true);
  assert.equal(targets,1);
  report('non-public-ipv6-accepted',{address,targets,ok:trace.ok});
}

for (const fn of ['doh','rdap']) {
  const filler = 'x'.repeat(2*1024*1024);
  const document = fn === 'doh' ? {Status:0,Answer:[{type:16,data:filler}]} : {events:[{eventAction:'registration',eventDate:'2020-01-01'}],ignored:filler};
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let emitted=0;
  const fetchImpl = async () => new Response(new ReadableStream({pull(c){
    if (emitted === bytes.length) {c.close();return;}
    const end=Math.min(emitted+8192,bytes.length);c.enqueue(bytes.subarray(emitted,end));emitted=end;
  }},{highWaterMark:0}));
  const result = fn === 'doh' ? await dohQuery('attacker.com','TXT',{fetchImpl}) : await fetchRegistration('attacker.com',{fetchImpl});
  assert.ok(emitted>65536);
  report('json-unbounded',{fn,emitted,success:fn==='doh'?result.ok:!!result.registeredAt});
}

for (const n of [4000,16000,32000]) {
  const html='<base href="https://attacker.com/'+ 'a'.repeat(n)+'/"><a href=x>x</a>'.repeat(1500);
  assert.ok(Buffer.byteLength(html)<65536);
  const times=[];
  for(let i=0;i<7;i++){const start=performance.now();extractHtmlFacts(html,'https://attacker.com/');times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  report('large-base-cpu',{baseLength:n,htmlBytes:Buffer.byteLength(html),medianMs:+times[3].toFixed(3)});
}

let now=0,calls=0;
const data=new Map();
const cache={async match(k){return data.get(k.url)?.clone();},async put(k,v){data.set(k.url,v.clone());}};
const req=()=>new Request('https://app.com/api/day-074/trace?url=https%3A%2F%2Fattacker.com%2F', {headers:{'cf-connecting-ip':'8.8.8.8'}});
const ctx={cache,now:()=>now,resolve:publicDns,fetchImpl:async()=>{calls++;return new Response('ok');}};
await handleTrace(req(),ctx);
now=299000;
const late=await handleTrace(req(),ctx);
assert.equal((await late.json()).cached,true);
assert.equal(calls,1);
report('cache-freshness-reset',{ageSeconds:299,cacheControl:late.headers.get('cache-control'),age:late.headers.get('age')});

// Output sanitization: bidi controls survive both HTML facts and trace JSON.
const bidi='Invoice\u202egpj.exe\u202c';
const trace=await runTrace('https://attacker.com/',{resolve:publicDns,fetchImpl:async()=>new Response('<title>'+bidi+'</title>',{headers:{'content-type':'text/html'}})});
assert.equal(trace.html.title,bidi);
report('bidi-survives',{title:JSON.stringify(trace.html.title)});

const excerpt=await runTrace('https://attacker.com/',{resolve:publicDns,fetchImpl:async()=>new Response('<p>BODY_ONLY_MARKER_12345</p>',{headers:{'content-type':'text/html'}})});
assert.ok(excerpt.html.textSample.includes('BODY_ONLY_MARKER_12345'));
report('body-excerpt-returned',{textSample:excerpt.html.textSample});

// A trusted RDAP server redirect currently gets an unrestricted fetch follow.
let redirectMode;
await fetchRegistration('attacker.org',{fetchImpl:async (_url,init)=>{redirectMode=init.redirect;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}});}});
report('rdap-redirect-mode',{redirectMode,actualRedirectFollowed:false});

// Positive boundary checks, including hostile URL delimiters and forged DNS values.
for(const raw of ['http://[64:ff9b::7f00:1]/','http://[2002:7f00:1::]/','https://u@attacker.com/','https://attacker.com:8080/','https://attacker.com%00/','https://attacker.com./']) assert.equal(validateTarget(raw).ok,false,raw);
for(const address of ['::1','::ffff:7f00:1','64:ff9b::7f00:1','2002:7f00:1::','10.0.0.1','127.0.0.1']) {
  const result=await resolvePublicHost('attacker.com',{fetchImpl:async()=>json({Status:0,Answer:[{type:1,data:'8.8.8.8'},{type:address.includes(':')?28:1,data:address}]})});
  assert.equal(result.reason,'blocked_target',address);
}
for(const malformed of [null,{}, {Status:'0'}, {Status:0,Answer:{}}, {Status:0,Answer:[null]}, {Status:0,Answer:[{type:'1',data:'127.0.0.1'}]}]) {
  const result=await resolvePublicHost('attacker.com',{fetchImpl:async()=>json(malformed)});
  assert.equal(result.ok,false);
}
const only6=await resolvePublicHost('attacker.com',{fetchImpl:async url=>json({Status:0,AD:false,Answer:new URL(url).searchParams.get('type')==='AAAA'?[{type:28,data:'2606:4700:4700::1111',TTL:0}]:[]})});
assert.equal(only6.ok,true);assert.equal(only6.ad,false);
for(const host of ['attacker.com／admin','attacker.com？x','u＠attacker.com','attacker.com：443','attacker.com\\x']) {
  let count=0;
  const result=await runAround({host,scheme:'https'},{fetchImpl:async()=>{count++;throw Error('must not fetch');}});
  assert.equal(result.error.code,'blocked_target');assert.equal(count,0);
}
for(const domain of ['attacker.com/x','attacker.com?x','attacker.com#x','u@attacker.com','attacker.com\n']) {
  let count=0;await fetchRegistration(domain,{fetchImpl:async()=>{count++;throw Error('must not fetch');}});assert.equal(count,0);
}
for(const location of ['/next','//other.com/','\\\\other.com/','javascript:alert(1)','data:text/html,x','','https://attacker.com:8080/','https://u@other.com/','https://other.com/'+'x'.repeat(2048)]) {
  const seen=[];
  const result=await runTrace('https://attacker.com/',{resolve:publicDns,fetchImpl:async url=>{seen.push(url);return seen.length===1?new Response(null,{status:302,headers:{location}}):new Response('ok');}});
  if(['javascript:alert(1)','data:text/html,x','https://attacker.com:8080/','https://u@other.com/'].includes(location)||location.length>2048) {assert.equal(seen.length,1);assert.equal(result.error.code,'blocked_redirect');}
  else assert.equal(result.ok,true);
}
report('positive-boundaries',{passed:true});

const queryInput='https://attacker.com/path?token=TEST_VALUE#fragment';
assert.equal(parseInput(queryInput).fetch.href,'https://attacker.com/path');
assert.equal(parseInput(queryInput,{includeQuery:true}).fetch.href,'https://attacker.com/path?token=TEST_VALUE');
report('query-default',{passed:true,scope:'parseInput only; app.js is a placeholder'});
