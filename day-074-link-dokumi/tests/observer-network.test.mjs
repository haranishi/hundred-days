import test from 'node:test';
import assert from 'node:assert/strict';
import { dohQuery, resolvePublicHost, queryMailFacts } from '../lib/doh.js';
import { fetchRegistration } from '../lib/rdap.js';
import { runTrace, runAround } from '../lib/observe.js';
import { validateTrace, validateAround, LIMITS } from '../lib/contract.js';
const fixture={url:'https://example.com/path',other:'https://other.com/end'};
const publicDns=async()=>({ok:true,addresses:['8.8.8.8'],ad:true});
const checkTrace=r=>{assert.deepEqual(validateTrace(r).errors,[]);return r;};
const checkAround=r=>{assert.deepEqual(validateAround(r).errors,[]);return r;};
const dnsReply=(answers=[],status=0,ad=true)=>Response.json({Status:status,AD:ad,Answer:answers.map(([type,data])=>({type,data,TTL:300}))});
test('DoH fallback on error, non-200, malformed JSON; NXDOMAIN is a reply',async()=>{
  for(const first of [()=>{throw Error('offline');},()=>new Response('',{status:503}),()=>new Response('not json'),()=>Response.json({})]){
    const calls=[];
    const result=await dohQuery('example.com','A',{fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.headers.accept,'application/dns-json');return calls.length===1?first():dnsReply([[1,'8.8.8.8']]);}});
    assert.equal(result.ok,true);assert.equal(calls.length,2);assert.equal(result.answers[0].data,'8.8.8.8');
  }
  const nx=await dohQuery('example.com','AAAA',{fetchImpl:async()=>dnsReply([[28,'::1']],3)});
  assert.equal(nx.ok,true);assert.deepEqual(nx.answers,[]);
  assert.equal((await dohQuery('example.com/path','A',{fetchImpl:()=>{throw Error('must not call');}})).ok,false);
});
for(const address of ['127.0.0.1','10.0.0.5','::1','::ffff:10.0.0.5','fd00::1'])test('DNS private closes before target fetch '+address,async()=>{
  let targetCalls=0;
  const result=checkTrace(await runTrace(fixture.url,{fetchImpl:async url=>{
    if(new URL(url).hostname==='example.com'){targetCalls++;return new Response('bad');}
    return dnsReply([[address.includes(':')?28:1,address],[1,'8.8.8.8']]);
  }}));
  assert.equal(result.error.code,'blocked_target');assert.equal(targetCalls,0);
});
test('DNS unavailable, no answers, CNAME and later private answers',async()=>{
  assert.equal((await resolvePublicHost('example.com',{fetchImpl:async()=>{throw Error('offline');}})).reason,'resolver_unavailable');
  assert.equal((await resolvePublicHost('example.com',{fetchImpl:async()=>dnsReply([[5,'alias.com']])})).reason,'dns_failed');
  const answers=[...Array(65).fill([1,'8.8.8.8']),[1,'10.0.0.1']];
  assert.equal((await resolvePublicHost('example.com',{fetchImpl:async()=>dnsReply(answers)})).reason,'blocked_target');
  const r=checkTrace(await runTrace(fixture.url,{fetchImpl:async()=>{throw Error('offline');}}));
  assert.equal(r.error.code,'resolver_unavailable');
});
test('DNS mail facts quoted TXT chunks and policy',async()=>{
  const r=await queryMailFacts('example.com',{fetchImpl:async url=>{
    const p=new URL(url).searchParams,type=p.get('type');
    return type==='TXT'?dnsReply([[16,p.get('name').startsWith('_dmarc.')?'"v=DMARC1; p=reject"':'"v=spf1 " "-all"']]):dnsReply([[type==='CAA'?257:15,'value']]);
  }});
  assert.equal(r.spf.all,'-all');assert.equal(r.dmarc.policy,'reject');assert.equal(r.caa,true);assert.equal(r.mx,true);
});
for(const location of ['http://127.0.0.1/','http://169.254.169.254/','http://localhost/','http://[::1]/','https://private.com/'])test('redirect blocks '+location,async()=>{
  let calls=0;
  const r=checkTrace(await runTrace(fixture.url,{resolve:async host=>host==='private.com'?{ok:false,reason:'blocked_target'}:publicDns(),fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{Location:location}});}}));
  assert.equal(r.error.code,'blocked_redirect');assert.equal(calls,1);
});
test('trace redirects, allowlisted headers, no credentials and stream cancellation',async()=>{
  let cancelled=0;
  const calls=[];
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async(url,options)=>{
    calls.push(url);
    assert.equal(options.redirect,'manual');assert.equal(options.method,'GET');
    assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Accept-Language','User-Agent']);
    if(calls.length===1)return new Response(new ReadableStream({cancel(){cancelled++;}}),{status:302,headers:{Location:fixture.other}});
    return new Response('<title>Test</title><input type=password>',{headers:{'Content-Type':'text/html','Set-Cookie':'sid=DO_NOT_RETURN; HttpOnly','X-Secret':'omit','Content-Security-Policy':'x'.repeat(5000)}});
  }}));
  assert.equal(r.ok,true);assert.equal(r.hops.length,1);assert.equal(r.html.title,'Test');assert.equal(cancelled,1);
  assert.equal(r.final.headers['x-secret'],undefined);assert.equal(r.final.headers['set-cookie'],undefined);assert.equal(r.final.headers['content-security-policy'].length,4000);
  assert.ok(!JSON.stringify(r).includes('DO_NOT_RETURN'));assert.equal(calls.length,2);
});
test('sixth redirect and redirect loop terminate',async()=>{
  for(const loop of [true,false]){
    let count=0;
    const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>{count++;return new Response(null,{status:302,headers:{Location:loop?'/path':'/hop'+count}});}}));
    assert.equal(r.error.code,'too_many_redirects');assert.equal(r.hops.length,5);assert.equal(count,6);
  }
});
for(const [type,path,reason]of [
['application/vnd.android.package-archive','/file','apk'],['application/octet-stream','/file.apk','apk'],
['application/x-msdownload','/file','executable'],['text/plain','/file.ps1','executable'],['application/zip','/file','archive'],
['text/plain','/file.iso','archive'],['application/octet-stream','/file','binary'],['text/plain','/file',null]
])test('download kind '+type+path,async()=>{
  let cancelled=false,read=false;
  const r=checkTrace(await runTrace('https://example.com'+path,{resolve:publicDns,fetchImpl:async()=>new Response(new ReadableStream({pull(){read=true;},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'Content-Type':type}})}));
  assert.equal(r.final.download?.reason??null,reason);assert.equal(r.final.bytesRead,0);assert.equal(read,false);assert.equal(cancelled,true);
});
test('attachment filenames and cookie fallback never return values',async()=>{
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>new Response('',{headers:{'Content-Type':'text/html','Content-Disposition':'attachment; filename="x.exe"','set-cookie':'sid=SECRET; Expires=Wed, 21 Oct 2026 00:00:00 GMT, auth=SECRET2; Secure'}})}));
  assert.equal(r.final.kind,'download');assert.equal(r.final.download.reason,'executable');assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('infinite HTML stream capped at decompressed byte limit and cancelled',async()=>{
  let cancelled=false;
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(LIMITS.BODY_CAP_BYTES).fill(65));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/html'}})}));
  assert.equal(r.ok,true);assert.equal(r.final.bytesRead,LIMITS.BODY_CAP_BYTES);assert.equal(r.final.truncated,true);assert.equal(r.html.truncated,true);assert.ok(r.notes.includes('body_truncated'));assert.equal(cancelled,true);
});
test('trace stalled fetch, DNS, body all bounded',async()=>{
  for(const stage of ['fetch','dns','body']){
    const r=checkTrace(await runTrace(fixture.url,{
      limits:{TRACE_TIMEOUT_MS:30,HOP_TIMEOUT_MS:15},
      resolve:stage==='dns'?()=>new Promise(()=>{}):publicDns,
      fetchImpl:stage==='fetch'?()=>new Promise(()=>{}):async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{headers:{'Content-Type':'text/html'}})
    }));
    assert.equal(r.error.code,'timeout',stage);
  }
});
test('upstream TLS/challenge responses are not retried',async()=>{
  for(const status of [495,496,525,526,403,429,503]){
    let count=0;
    const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>{count++;return new Response(null,{status,headers:[403,429,503].includes(status)?{'cf-mitigated':'challenge'}:{}});}}));
    assert.equal(r.error.code,[403,429,503].includes(status)?'blocked_by_challenge':'tls_failed');assert.equal(count,1);
  }
});
test('response JSON byte cap trims arrays even with multibyte data',async()=>{
  const html='<form action="'+ 'あ'.repeat(300)+'"><input type=password></form>';
  const assets='<script src="'+ 'あ'.repeat(300)+'"></script><link rel=stylesheet href="'+ 'あ'.repeat(300)+'"><iframe src="'+ 'あ'.repeat(300)+'"></iframe>';
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>new Response(html.repeat(10)+assets.repeat(40),{headers:{'Content-Type':'text/html',...Object.fromEntries(['content-security-policy','content-security-policy-report-only'].map(k=>[k,'x'.repeat(4000)]))}})}));
  assert.ok(new TextEncoder().encode(JSON.stringify(r)).length<=LIMITS.MAX_RESPONSE_BYTES);
});
test('RDAP registration only, errors, source and timestamp',async()=>{
  const deps={now:()=>Date.parse('2026-10-22T00:00:00Z'),fetchImpl:async()=>Response.json({events:[{eventAction:'registration',eventDate:'2026-10-20T00:00:00Z'},{eventAction:'expiration',eventDate:'2027-10-20T00:00:00Z'}],entities:[{roles:['registrant'],vcardArray:['vcard',[['fn',{},'text','PRIVATE NAME']]]},{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','Registrar']]]}]})};
  const r=await fetchRegistration('example.com',deps);
  assert.equal(r.ageDays,2);assert.equal(r.registrar,'Registrar');assert.equal(r.source,'verisign');assert.ok(!JSON.stringify(r).includes('PRIVATE'));
  for(const [name,status,reason]of [['example.com',404,'not_found'],['example.jp',404,'unsupported'],['example.net',500,'error']])assert.equal((await fetchRegistration(name,{fetchImpl:async()=>new Response(null,{status})})).unavailable,reason);
  assert.equal((await fetchRegistration('example.com',{fetchImpl:async()=>{throw new DOMException('expired','AbortError');}})).unavailable,'timeout');
  let count=0;assert.equal((await fetchRegistration('example.com/x',{fetchImpl:async()=>{count++;}})).unavailable,'error');assert.equal(count,0);
});
function aroundFetch(url) {
  const u=new URL(url);
  if(u.hostname==='cloudflare-dns.com'||u.hostname==='dns.google'){
    const type=u.searchParams.get('type'),name=u.searchParams.get('name');
    return dnsReply(type==='TXT'?[[16,name.startsWith('_dmarc.')?'"v=DMARC1; p=reject"':'"v=spf1 -all"']]:[]);
  }
  if(u.hostname.startsWith('rdap.'))return Response.json({events:[{eventAction:'registration',eventDate:'2020-01-01T00:00:00Z'}]});
  if(u.pathname==='/.well-known/security.txt')return new Response('Contact: mailto:security@example.com\nExpires: 2030-01-01T00:00:00Z');
  return new Response(null,{status:301,headers:{Location:'https://example.com/'}});
}
test('around exact request types, DNS names only and manual probes',async()=>{
  for(const scheme of ['http','https']){
    const calls=[];
    const r=checkAround(await runAround({host:'example.com',scheme},{registrable:()=>({registrable:'example.com'}),resolve:publicDns,fetchImpl:async(url,options)=>{
      if(new URL(url).hostname==='example.com')assert.equal(options.redirect,'manual');
      return aroundFetch(url);
    },onRequest:(url,purpose)=>calls.push({url,purpose})}));
    assert.equal(r.error,null);assert.equal(r.dns.spf.all,'-all');assert.equal(r.securityTxt.hasContact,true);
    if(scheme==='https')assert.equal(r.httpProbe.upgradesToHttps,true);else assert.equal(r.httpsProbe.reachable,true);
    for(const {url,purpose}of calls){
      const u=new URL(url);
      if(['probe','security.txt'].includes(purpose)){assert.equal(u.hostname,'example.com');assert.ok(['/','/.well-known/security.txt'].includes(u.pathname));assert.equal(u.port,'');}
      else assert.ok(['doh','rdap'].includes(purpose));
      assert.ok(!['/robots.txt','/.env','/.git/','/admin','/wp-login.php'].includes(u.pathname));
    }
    assert.equal(calls.filter(x=>x.purpose==='probe').length,1);assert.equal(calls.filter(x=>x.purpose==='security.txt').length,1);
  }
});
test('around rejects bad host shapes and DNS without auxiliary requests',async()=>{
  for(const host of ['example.com/path','example.com:443','u@example.com','example.com?x','example.com#x','127.0.0.1','localhost']){
    let calls=0;
    const r=checkAround(await runAround({host,scheme:'https'},{fetchImpl:async()=>{calls++;}}));
    assert.equal(r.error.code,'blocked_target');assert.equal(calls,0);
  }
  const r=checkAround(await runAround({host:'example.com',scheme:'https'},{resolve:async()=>({ok:false,reason:'blocked_target'}),fetchImpl:async()=>{throw Error('unexpected');}}));
  assert.equal(r.error.code,'blocked_target');
});
test('around timeout remains partial and bounded',async()=>{
  const r=checkAround(await runAround({host:'example.com',scheme:'https'},{registrable:'example.com',resolve:publicDns,limits:{AUX_TIMEOUT_MS:15,AROUND_TIMEOUT_MS:50},fetchImpl:()=>new Promise(()=>{})}));
  assert.equal(r.error,null);assert.equal(r.rdap.unavailable,'timeout');assert.equal(r.httpProbe.tested,false);assert.ok(r.dns.unavailable);
});
test('around NFKC separators cannot introduce paths or default ports',async()=>{
  for(const host of ['example.com／private','example.com：443','example.com？x','example.com＃x','u＠example.com']){
    let count=0;
    const r=checkAround(await runAround({host,scheme:'https'},{resolve:publicDns,registrable:'example.com',fetchImpl:async()=>{count++;throw Error('unexpected');}}));
    assert.equal(r.error.code,'blocked_target');assert.equal(count,0);
  }
});
test('JSON cap includes maximal multibyte headers and full redirect path',async()=>{
  let count=0;
  const {HEADER_ALLOWLIST}=await import('../lib/contract.js');
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>{
    if(count++<5)return new Response(null,{status:302,headers:{location:'https://example.com/'+count+'x'.repeat(1800)}});
    const entries=Object.fromEntries(HEADER_ALLOWLIST.filter(x=>!['location','content-length','content-type','content-disposition','cf-mitigated'].includes(x)).map(x=>[x,'あ'.repeat(x.includes('content-security-policy')?4000:600)]));
    entries['content-type']='text/html';
    const headers={get:key=>entries[key]??null,has:key=>key in entries};
    return {status:200,headers,body:new Response('<p>Hello</p>').body};
  }}));
  assert.ok(new TextEncoder().encode(JSON.stringify(r)).length<=LIMITS.MAX_RESPONSE_BYTES);
  assert.ok(r.notes.includes('trimmed'));
});
test('HTTPS HTTP error response still proves an HTTPS connection',async()=>{
  const r=checkAround(await runAround({host:'example.com',scheme:'http'},{registrable:'example.com',resolve:publicDns,fetchImpl:async url=>{
    if(new URL(url).hostname==='example.com')return new Response(null,{status:403});
    return aroundFetch(url);
  }}));
  assert.equal(r.httpsProbe.reachable,true);assert.equal(r.httpsProbe.status,403);
});
test('around uses the A1 registrableDomain implementation when no injection is supplied',async()=>{
  const r=checkAround(await runAround({host:'www.example.co.jp',scheme:'https'},{resolve:publicDns,fetchImpl:async url=>aroundFetch(url)}));
  assert.equal(r.registrable,'example.co.jp');assert.equal(r.error,null);
});
test('mail DNS SERVFAIL stays unavailable instead of absent',async()=>{
  const result=await queryMailFacts('example.com',{fetchImpl:async()=>dnsReply([],2)});
  assert.equal(result.spf,null);assert.equal(result.dmarc,null);assert.equal(result.caa,null);assert.equal(result.mx,null);
});
for (const responds of [true,false]) test('opaque HTTPS failure classified by HTTP response '+responds,async()=>{
  const calls=[];let cancelled=false;
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,onRequest:(url,purpose)=>calls.push({url,purpose}),fetchImpl:async(url,options)=>{
    assert.equal(options.redirect,'manual');
    if(new URL(url).protocol==='https:' || !responds)throw Error('internal error; reference = abc');
    assert.equal(url,'http://example.com/');
    return new Response(new ReadableStream({pull(){assert.fail('fallback body read');},cancel(){cancelled=true;}},{highWaterMark:0}),{status:200});
  }}));
  assert.equal(r.error.code,responds?'tls_failed':'connect_failed');
  assert.equal(r.error.detail,responds?'http_responds':'no_response');
  assert.deepEqual(calls,[{url:fixture.url,purpose:'trace'},{url:'http://example.com/',purpose:'tls-fallback'}]);
  assert.equal(cancelled,responds);
});
test('HTTP input failures never trigger fallback or classify TLS by message',async()=>{
  const calls=[];
  const r=checkTrace(await runTrace('http://example.com/path',{resolve:publicDns,fetchImpl:async url=>{calls.push(url);throw Error('TLS certificate DNS failure');}}));
  assert.equal(r.error.code,'connect_failed');assert.equal(r.error.detail,'no_response');
  assert.deepEqual(calls,['http://example.com/path']);
});
test('redirect failure probes only the checked hop host and ignores HTTP redirect',async()=>{
  const calls=[];
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,onRequest:(url,purpose)=>calls.push({url,purpose}),fetchImpl:async url=>{
    if(url===fixture.url)return new Response(null,{status:302,headers:{Location:fixture.other}});
    if(url===fixture.other)throw Error('internal error; reference = abc');
    return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/'}});
  }}));
  assert.equal(r.error.code,'tls_failed');assert.equal(r.error.host,'other.com');assert.equal(r.hops.length,1);
  assert.deepEqual(calls,[{url:fixture.url,purpose:'trace'},{url:fixture.other,purpose:'trace'},{url:'http://other.com/',purpose:'tls-fallback'}]);
});
test('fallback is bounded by remaining hop and overall deadlines',async()=>{
  for(const limits of [{HOP_TIMEOUT_MS:25,TRACE_TIMEOUT_MS:200},{HOP_TIMEOUT_MS:200,TRACE_TIMEOUT_MS:25}]){
    let count=0;
    const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,limits,fetchImpl:async()=>{
      if(++count===1){await new Promise(resolve=>setTimeout(resolve,10));throw Error('internal error; reference = abc');}
      return new Promise(()=>{});
    }}));
    assert.equal(r.error.code,'timeout');assert.equal(count,2);
  }
});
test('body read errors do not trigger a TLS fallback',async()=>{
  let count=0;
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>{
    count++;return new Response(new ReadableStream({pull(c){c.error(Error('internal error; reference = abc'));}}),{headers:{'Content-Type':'text/html'}});
  }}));
  assert.equal(r.error.code,'connect_failed');assert.equal(r.error.stage,'read');assert.equal(count,1);
});
for(const reason of ['dns_failed','resolver_unavailable','blocked_target'])test('redirect DNS reason preserved '+reason,async()=>{
  let count=0;
  const r=checkTrace(await runTrace(fixture.url,{resolve:async host=>host==='example.com'?publicDns():{ok:false,reason},fetchImpl:async()=>{
    count++;return new Response(null,{status:302,headers:{Location:fixture.other}});
  }}));
  assert.equal(r.error.code,reason==='blocked_target'?'blocked_redirect':reason);assert.equal(r.error.stage,'dns');assert.equal(count,1);
});
test('HTML over cap ignores later signals and marks both truncations',async()=>{
  const r=checkTrace(await runTrace(fixture.url,{resolve:publicDns,fetchImpl:async()=>new Response(' '.repeat(LIMITS.BODY_CAP_BYTES)+'<title>ignored</title>',{headers:{'Content-Type':'text/html'}})}));
  assert.equal(r.final.bytesRead,LIMITS.BODY_CAP_BYTES);assert.equal(r.final.truncated,true);assert.equal(r.html.truncated,true);
  assert.equal(r.html.title,null);assert.ok(r.notes.includes('body_truncated'));
});
