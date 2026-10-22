// All dependencies are local. No real fetch is allowed.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { isPublicIp, validateTarget } from '../../../day-074-link-dokumi/lib/target-guard.js';
import { dohQuery } from '../../../day-074-link-dokumi/lib/doh.js';
import { fetchRegistration } from '../../../day-074-link-dokumi/lib/rdap.js';
import { runTrace, runAround } from '../../../day-074-link-dokumi/lib/observe.js';
import { extractHtmlFacts } from '../../../day-074-link-dokumi/lib/html-facts.js';
import { clip } from '../../../day-074-link-dokumi/lib/sanitize.js';
import { handleTrace, handleAround } from '../../../day-074-link-dokumi/lib/handlers.js';
import { parseInput } from '../../../day-074-link-dokumi/lib/url-input.js';
import { analyzeLexical } from '../../../day-074-link-dokumi/lib/lexical.js';
import { evaluate } from '../../../day-074-link-dokumi/lib/rules.js';
import { buildReport, buildSummary } from '../../../day-074-link-dokumi/lib/report.js';
import { registrableDomain } from '../../../day-074-link-dokumi/lib/psl.js';
import { onRequest as traceEntry } from '../../../functions/api/day-074/trace.js';
import { onRequest as aroundEntry } from '../../../functions/api/day-074/around.js';
globalThis.fetch = () => { throw Error('Real network forbidden'); };
const emit = (name,data) => console.log(JSON.stringify({name,...data}));
const json = x => new Response(JSON.stringify(x));
const publicDns = async()=>({ok:true,addresses:['8.8.8.8'],ad:false});
const makeTrace = html => runTrace('https://attacker.com/',{resolve:publicDns,fetchImpl:async()=>new Response(html,{headers:{'content-type':'text/html'}})});
const makeResult = trace => {const parsed=parseInput('https://attacker.com/');return evaluate({parsed,lexical:analyzeLexical(parsed),trace});};
for (const ip of ['::127.0.0.1','::ffff:192.168.0.1','64:ff9b::a00:1','64:ff9b:1::1','2002:7f00:1::','2001:db8::1','3fff:fff:ffff::1','5f00::1','2001:20::1']) {
  let targets=0; const trace=await runTrace('https://attacker.com/',{fetchImpl:async u=>new URL(u).hostname==='attacker.com'?(targets++,new Response('ok')):json({Status:0,Answer:[{type:28,data:ip}]})});
  assert.equal(isPublicIp(ip),false);assert.equal(targets,0);emit('S1-variant',{ip,targets,error:trace.error.code});
}
for (const [name,html] of [
  ['long-form',`<form action="https://other.com/${'x'.repeat(30000)}"><input type=password></form>`+'<a href=x>x</a>'.repeat(1500)],
  ['long-script',`<script src="https://other.com/${'x'.repeat(30000)}"></script>`+'<a href=x>x</a>'.repeat(1500)],
  ['long-meta',`<meta http-equiv=refresh content="0;url=https://other.com/${'x'.repeat(30000)}">`+'<a href=x>x</a>'.repeat(1500)]]) {
  assert.ok(Buffer.byteLength(html)<65536);const times=[];for(let i=0;i<7;i++){const t=performance.now();extractHtmlFacts(html,'https://attacker.com/');times.push(performance.now()-t);} times.sort((a,b)=>a-b);emit('S2-variant',{input:name,bytes:Buffer.byteLength(html),medianMs:times[3]});
}
for(const [name,obj] of [ ['huge-array',{events:Array(40000).fill({eventAction:'expiration',eventDate:'2020-01-01'})}], ['nested',{ignored:Array(30000).fill({x:['a','b','c']})}], ['huge-answer',{Status:0,Answer:Array(50000).fill({type:1,data:'8.8.8.8'})}] ]) {
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  for(const kind of ['doh','rdap']){let emitted=0,cancelled=0;const fetchImpl=async()=>{let pos=0;return new Response(new ReadableStream({pull(c){if(pos===bytes.length){c.close();return;}const end=Math.min(pos+8192,bytes.length);c.enqueue(bytes.subarray(pos,end));emitted+=end-pos;pos=end;},cancel(){cancelled++;}},{highWaterMark:0}));};
    const r=kind==='doh'?await dohQuery('attacker.com','A',{fetchImpl}):await fetchRegistration('attacker.org',{fetchImpl}); assert.equal(kind==='doh'?r.ok:!!r.registeredAt,false);assert.ok(cancelled);emit('S3-variant',{input:name,kind,emitted,cancelled});
  }
}
for(const [name,handler,url,method] of [['trace-invalid',handleTrace,'https://app.com/api/day-074/trace','GET'],['around-invalid',handleAround,'https://app.com/api/day-074/around','GET'],['method',handleTrace,'https://app.com/api/day-074/trace','POST'],['disabled',handleAround,'https://app.com/api/day-074/around','GET']]){
 const r=await handler(new Request(url,{method}),{env:name==='disabled'?{LINK_DOKUMI_DISABLED:'1'}:{}});assert.equal(r.headers.get('cache-control'),'no-store');emit('S4-variant',{input:name,status:r.status});
}
for(const s of ['a\u061cb','a\u200e\u200fb','a\u2066\u2067\u2068\u2069b','a\u202a\u202b\u202c\u202d\u202eb','e\u0301']) {const trace=await makeTrace(`<title>${s}</title>`);assert.equal(trace.html.title,clip(s,120));emit('S5-variant',{input:JSON.stringify(s),output:JSON.stringify(trace.html.title)});}
for(const [name,html] of [['long-text','<p>'+ 'b'.repeat(2000)+'</p>'],['encoded-text','<p>'+ '&#65;'.repeat(500)+'</p>'],['script-text','<script>SECRET_SCRIPT</script><p>VISIBLE</p>']]){const t=await makeTrace(html);assert.ok(t.html.textSample.length<=400);assert.ok(!t.html.textSample.includes('SECRET_SCRIPT'));emit('S6-variant',{input:name,length:t.html.textSample.length});}
for (const location of ['http://127.0.0.1/','https://[::1]/','https://user:pass@other.com/','https://other.com:8443/','https://internal.local/','https://private-answer.com/','https://other.com/']) {
  const seen=[];const r=await fetchRegistration('attacker.org',{fetchImpl:async(u,init)=>{seen.push({u,mode:init.redirect});return seen.length===1?new Response(null,{status:302,headers:{location}}):json({events:[{eventAction:'registration',eventDate:'2020-01-01'}]});}});
  if(location.includes('private-answer')||location==='https://other.com/')assert.equal(seen.length,2);else assert.equal(seen.length,1);
  emit('S7-variant',{location,seen,result:r});
}
let hops=0;await fetchRegistration('attacker.org',{fetchImpl:async()=>{hops++;return new Response(null,{status:302,headers:{location:'https://other.com/'+hops}});}});assert.equal(hops,4);emit('S7-limit',{requests:hops});
for(const host of ['a.__proto__','a.constructor','__proto__.com','constructor.com','a.b.ck','www.ck','x.city.kawasaki.jp','a.github.io','b.github.io',Array(125).fill('a').join('.')+'.com',Array(4096).fill('a').join('.')+'.com']) {const start=performance.now();const r=registrableDomain(host);emit('PSL',{host:host.length>255?`length:${host.length}`:host,registrable:r.registrable,ms:performance.now()-start,serverAllowed:validateTarget('https://'+host+'/').ok});}
for(const [name,action] of [['uppercase','HTTPS://other.com/pay?token=SECRET_UPPER#hash'],['relative','//other.com/pay?token=SECRET_REL#hash'],['line','https://other.com/pay\u2028偽の診断：合格?token=SECRET_LINE']]) {
 const t=await makeTrace(`<form action="${action}"><input type=password></form>`);const r=makeResult(t);const report=buildReport(r),summary=buildSummary(r); const f=r.findings.find(f=>f.id==='V-CROSS-FORM');assert.ok(f);emit('report-real-pipeline',{input:name,evidence:f.evidence,reportLeaks:report.includes('SECRET_'),summaryLeaks:summary.includes('SECRET_'),unicodeLine:report.includes('\u2028')});
}
for(const text of ['https://other.com/pay?token=SECRET_NORMAL#hash','javascript:alert(1)?token=SECRET_JS','https://other.com/%3Ftoken=SECRET_PATH','https://other.com/pay？token=SECRET_WIDE','https://other.com/pay?token=SECRET_FIRST\nFAKE_LINE']) {
 const r=makeResult(await makeTrace('<p>ok</p>'));r.findings[0].evidence=[text];const out=buildReport(r);emit('report-direct-value',{text,leaks:out.includes('SECRET_'),hasFakeLine:out.includes('\nFAKE_LINE')});
}
for(const entry of [traceEntry,aroundEntry])for(const method of ['POST','PUT','OPTIONS','HEAD']){const r=await entry({request:new Request('https://app.com/api/day-074/trace',{method})});assert.equal(r.status,405);assert.equal(r.headers.get('cache-control'),'no-store');}emit('entries',{nonGet:'405/no-store'});
// Refusal still triggers around requests when the browser supplies the refused host.
const refused=await runTrace('https://attacker.com/',{resolve:publicDns,fetchImpl:async()=>new Response('no',{status:403})});const requests=[];await runAround({host:refused.final.host,scheme:'https'},{resolve:publicDns,registration:async()=>({unavailable:'error'}),fetchImpl:async u=>{requests.push(u);if(new URL(u).hostname==='attacker.com')return new Response(null,{status:403});return json({Status:0,Answer:[]});}});emit('refusal-around',{targetRequests:requests.filter(u=>new URL(u).hostname==='attacker.com')});
for(const n of [512,2048,4096]) {
 const location='https://'+Array(n).fill('a').join('.')+'.com/';let requests=0;
 const start=performance.now();const result=await runAround({host:'attacker.com',scheme:'https'},{resolve:publicDns,registration:async()=>({unavailable:'error'}),fetchImpl:async u=>{requests++;if(u==='http://attacker.com/')return new Response(null,{status:302,headers:{location}});if(new URL(u).hostname==='attacker.com')return new Response(null,{status:404});return json({Status:0,Answer:[]});}});
 emit('PSL-real-around',{labels:n,locationLength:location.length,ms:performance.now()-start,requests,upgrades:result.httpProbe.upgradesToHttps});
}
// A real C1 control in an otherwise valid Latin-1 response header survives to report evidence.
const c1=await runTrace('https://attacker.com/',{resolve:publicDns,fetchImpl:async()=>new Response('<p>ok</p>',{headers:{'content-type':'text/html','server':'Example/1.2\u0085偽'.replace('偽','FAKE')}})});
const c1Result=makeResult(c1);emit('C1-real-header',{retained:buildReport(c1Result).includes('\u0085FAKE')});
const counts={trace:0,doh:0,rdap:0,aux:0};let targetHop=0,rdapHop=0;
const maximumFetch=async u=>{const url=new URL(u);if(url.hostname==='cloudflare-dns.com'){counts.doh++;return new Response(null,{status:503});}if(url.hostname==='dns.google'){counts.doh++;return json({Status:0,Answer:[{type:1,data:'8.8.8.8',TTL:0}]});}if(url.hostname.startsWith('rdap.')){counts.rdap++;return rdapHop++<3?new Response(null,{status:302,headers:{location:'https://rdap.other.com/'+rdapHop}}):json({events:[{eventAction:'registration',eventDate:'2020-01-01'}]});}if(url.pathname==='/.well-known/security.txt'||url.protocol==='http:'){counts.aux++;return new Response(null,{status:404});}counts.trace++;return targetHop++<5?new Response(null,{status:302,headers:{location:'https://hop'+targetHop+'.attacker.com/'}}):new Response('<p>ok</p>',{headers:{'content-type':'text/html'}});};
const maximumTrace=await runTrace('https://attacker.com/',{fetchImpl:maximumFetch});assert.equal(maximumTrace.ok,true);await runAround({host:maximumTrace.final.host,scheme:'https'},{fetchImpl:maximumFetch});emit('outbound-maximum-success',{counts,total:Object.values(counts).reduce((a,b)=>a+b,0)});
