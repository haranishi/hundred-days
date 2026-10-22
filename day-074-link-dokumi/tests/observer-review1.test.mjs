import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { isPublicIp } from '../lib/target-guard.js';
import { extractHtmlFacts } from '../lib/html-facts.js';
import { dohQuery, resolvePublicHost } from '../lib/doh.js';
import { fetchRegistration } from '../lib/rdap.js';
import { runTrace, runAround } from '../lib/observe.js';
import { clip, readCapped } from '../lib/sanitize.js';
import { handleTrace, handleAround, jsonResponse } from '../lib/handlers.js';
import { LIMITS, validateTrace, validateHtmlFacts } from '../lib/contract.js';

const urls = {target:'https://attacker.com/', app:'https://app.com/api/day-074/trace', around:'https://app.com/api/day-074/around', base:'https://attacker.com/'};
const publicDns = async () => ({ok:true,addresses:['8.8.8.8'],ad:false});
const registration = {events:[{eventAction:'registration',eventDate:'2020-01-01'}]};
const json = data => Response.json(data);
const req = () => new Request(urls.app+'?url='+encodeURIComponent(urls.target));

test('S1 IPv6 allowlist and special-purpose boundaries', () => {
  const allowed = ['2000::','3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','3ffe:ffff:ffff:ffff:ffff:ffff:ffff:ffff','3fff:1000::','2001:200::','2001:4860:4860::8888','2606:4700:4700::1111','2a00:1450:4001:81b::200e','2400:cb00::1','2620:4f:7fff:ffff:ffff:ffff:ffff:ffff','2620:4f:8001::'];
  const denied = ['1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','3fff::','3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff','4000::','ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','2001::','2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff','2001:2::1','2001:db8::','2001:db8:ffff:ffff:ffff:ffff:ffff:ffff','2002::','2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff','2620:4f:8000::','2620:4f:8000:ffff:ffff:ffff:ffff:ffff','::ffff:8.8.8.8','64:ff9b::808:808','fec0::1','100:0:0:1::1'];
  for (const value of allowed) assert.equal(isPublicIp(value),true,value);
  for (const value of denied) assert.equal(isPublicIp(value),false,value);
});
for (const address of ['fec0::1','::ffff:0:7f00:1','2001:2::1','100:0:0:1::1','4000::1']) test('S1 non-public-ipv6-accepted fixed '+address, async () => {
  let targets = 0;
  const result = await runTrace(urls.target,{fetchImpl:async url => {
    if (new URL(url).hostname === 'attacker.com') { targets++; return new Response('ok'); }
    return json({Status:0,Answer:[{type:28,data:address,TTL:0}]});
  }});
  assert.equal(targets,0); assert.equal(result.error.code,'blocked_target');
  assert.deepEqual(validateTrace(result).errors,[]);
});

test('S2 large-base-cpu median stays below 10ms', () => {
  const html = '<base href="'+urls.base+'a'.repeat(32000)+'/"><a href=x>x</a>'.repeat(1500);
  const times = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    const facts = extractHtmlFacts(html,urls.target);
    times.push(performance.now()-start);
    assert.equal(facts.baseHref.length,300);
    assert.deepEqual(facts.links.externalHosts,[]);
  }
  const median = times.sort((a,b) => a-b)[4];
  assert.ok(median < 10,'median='+median+'ms');
});
test('S2 overlong base is recorded but never adopted', () => {
  const facts = extractHtmlFacts('<base href="https://other.com/'+'x'.repeat(2048)+'"><a href=x>x</a>',urls.target);
  assert.equal(facts.baseHref.length,300); assert.equal(facts.links.external,0);
});
for (const [tag,count] of [['<a href=x>x</a>',2000],['<script src=x></script>',200]]) test('S2 2KiB base with references '+count, () => {
  const base = urls.base+'a'.repeat(2048-urls.base.length);
  const facts = extractHtmlFacts('<base href="'+base+'">'+tag.repeat(count),urls.target);
  assert.deepEqual(validateHtmlFacts(facts).errors,[]);
  assert.equal(count === 2000 ? facts.links.total : facts.scripts.total,count);
});
test('S2 resolution budget makes later script relative', () => {
  const facts = extractHtmlFacts('<a href=x>x</a>'.repeat(1500)+'<script src="https://other.com/x"></script>',urls.target);
  assert.equal(facts.scripts.external[0].scheme,'relative');
  assert.equal(facts.scripts.external[0].host,null);
});

function streamed(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const stats = {read:0,cancelled:0};
  return {stats,response:new Response(new ReadableStream({
    pull(controller) {
      if (stats.read === bytes.length) { controller.close(); return; }
      const end = Math.min(stats.read+8192,bytes.length);
      controller.enqueue(bytes.subarray(stats.read,end)); stats.read=end;
    },
    cancel() { stats.cancelled++; }
  },{highWaterMark:0}))};
}
test('S3 DoH 2MiB response stops within 64KiB plus one chunk and falls back', async () => {
  const upstream = streamed({Status:0,ignored:'x'.repeat(2*1024*1024)});
  let calls = 0;
  const result = await dohQuery('attacker.com','A',{fetchImpl:async () => ++calls === 1 ? upstream.response : json({Status:0,Answer:[{type:1,data:'8.8.8.8'}]})});
  assert.equal(result.ok,true); assert.equal(calls,2);
  assert.ok(upstream.stats.read <= 65536+8192); assert.equal(upstream.stats.cancelled,1);
});
test('S3 RDAP 2MiB response stops within 256KiB plus one chunk', async () => {
  const upstream = streamed({...registration,ignored:'x'.repeat(2*1024*1024)});
  const result = await fetchRegistration('attacker.com',{fetchImpl:async () => upstream.response});
  assert.equal(result.unavailable,'error');
  assert.ok(upstream.stats.read <= 256*1024+8192); assert.equal(upstream.stats.cancelled,1);
});
test('S3 strict reader accepts exact cap and rejects one extra byte', async () => {
  assert.equal((await readCapped(new Response('1234'),4,undefined,{strict:true})).bytes.length,4);
  await assert.rejects(readCapped(new Response('12345'),4,undefined,{strict:true}),RangeError);
});
test('S3 DoH arrays capped without hiding private addresses beyond 64', async () => {
  const answers = Array.from({length:100},() => ({type:1,data:'8.8.8.8'}));
  const fetchImpl = async () => json({Status:0,Answer:answers});
  assert.equal((await dohQuery('attacker.com','A',{fetchImpl})).answers.length,64);
  answers.push({type:1,data:'127.0.0.1'});
  assert.equal((await resolvePublicHost('attacker.com',{fetchImpl})).reason,'blocked_target');
});
test('S3 RDAP events and entities beyond 64 are ignored', async () => {
  const events = Array(64).fill(null).concat(registration.events);
  assert.equal((await fetchRegistration('attacker.com',{fetchImpl:async () => json({events})})).unavailable,'error');
  const entities = Array(64).fill(null).concat([{roles:['registrar'],vcardArray:['vcard',[['fn',{},'text','ignored']]]}]);
  const result = await fetchRegistration('attacker.com',{fetchImpl:async () => json({...registration,entities})});
  assert.equal(result.registrar,null); assert.equal(result.registeredAt,'2020-01-01');
});
test('S3 security.txt still stops after 8KiB', async () => {
  const upstream = streamed({ignored:'x'.repeat(2*1024*1024)});
  await runAround({host:'attacker.com',scheme:'https'},{resolve:publicDns,registration:async () => ({unavailable:'error'}),fetchImpl:async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/.well-known/security.txt') return upstream.response;
    return parsed.hostname === 'attacker.com' ? new Response(null) : json({Status:0,Answer:[]});
  }});
  assert.ok(upstream.stats.read <= 8192); assert.equal(upstream.stats.cancelled,1);
});

test('S4 all API statuses and header overrides use no-store', async () => {
  for (const status of [200,400,403,405,429,500,503]) assert.equal(jsonResponse({ok:true},status,{'Cache-Control':'public'}).headers.get('cache-control'),'no-store');
  const result = await handleAround(new Request(urls.around+'?host=localhost&scheme=https'));
  assert.equal(result.headers.get('cache-control'),'no-store');
});
test('S4 cached result at 299 seconds stays no-store; internal keys use cache.invalid', async () => {
  let now = 0, calls = 0;
  const stored = new Map();
  const cache = {async match(key) { return stored.get(key.url)?.clone(); },async put(key,value) { stored.set(key.url,value.clone()); }};
  const ctx = {cache,now:() => now,resolve:publicDns,fetchImpl:async () => { calls++; return new Response('ok'); }};
  await handleTrace(req(),ctx); now = 299000;
  const response = await handleTrace(req(),ctx);
  assert.equal((await response.json()).cached,true); assert.equal(calls,1);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const around = await handleAround(new Request(urls.around+'?host=attacker.com&scheme=https'),{...ctx,fetchImpl:async url => {
    const host = new URL(url).hostname;
    return host.startsWith('rdap.') ? json(registration) : host === 'attacker.com' ? new Response(null) : json({Status:0,Answer:[]});
  }});
  assert.equal(around.headers.get('cache-control'),'no-store');
  assert.equal((await around.json()).error,null);
  assert.ok([...stored.keys()].some(key => key.includes('/rdap/')));
  for (const [key,value] of stored) {
    assert.match(key,/^https:\/\/cache\.invalid\/day-074\/(trace|rate|rdap)\/[a-f0-9-]+$/);
    assert.match(value.headers.get('cache-control'),/^public, max-age=(300|70|86400)$/);
  }
});
test('S5 bidi-survives fixed; S6 visible excerpt retained within 400 characters', async () => {
  const bidi = '\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069';
  assert.equal(clip(bidi+'Invoice'+bidi,100),'Invoice');
  const result = await runTrace(urls.target,{resolve:publicDns,fetchImpl:async () => new Response('<title>Invoice'+bidi+'gpj.exe</title><p>BODY_ONLY_MARKER_12345'+'あ'.repeat(1000)+'</p>',{headers:{'content-type':'text/html'}})});
  assert.equal(result.html.title,'Invoicegpj.exe');
  assert.ok(result.html.textSample.includes('BODY_ONLY_MARKER_12345'));
  assert.equal(result.html.textSample.length,400);
});

test('S7 RDAP HTTPS registrar redirect uses manual mode and cancels bodies', async () => {
  const seen = []; let cancelled = 0;
  const result = await fetchRegistration('attacker.org',{fetchImpl:async (url,init) => {
    assert.equal(init.redirect,'manual'); seen.push(url);
    return seen.length === 1 ? new Response(new ReadableStream({cancel() { cancelled++; }}),{status:302,headers:{location:'https://registry.org/domain/attacker.org'}}) : json(registration);
  }});
  assert.equal(seen.length,2); assert.equal(new URL(seen[1]).hostname,'registry.org');
  assert.equal(cancelled,1); assert.equal(result.registeredAt,'2020-01-01');
});
for (const location of ['http://127.0.0.1/','http://169.254.169.254/','https://localhost/','https://[2606:4700:4700::1111]/','https://hundred-days.pages.dev/','https://custom-self.com/','http://registry.org/']) test('S7 RDAP blocks redirect '+location, async () => {
  let calls = 0;
  const result = await fetchRegistration('attacker.org',{selfHosts:['custom-self.com'],fetchImpl:async () => { calls++; return new Response(null,{status:302,headers:{location}}); }});
  assert.equal(result.unavailable,'error'); assert.equal(calls,1);
});
test('S7 RDAP permits three redirects but refuses the fourth', async () => {
  for (const redirects of [3,4]) {
    let calls = 0;
    const result = await fetchRegistration('attacker.org',{fetchImpl:async () => ++calls <= redirects ? new Response(null,{status:302,headers:{location:'/domain/next'+calls}}) : json(registration)});
    assert.equal(calls,4);
    assert.equal(redirects === 3 ? result.registeredAt : result.unavailable,redirects === 3 ? '2020-01-01' : 'error');
  }
});
test('BG rejected redirect keeps source response and clipped destination within hop cap', async () => {
  for (const depth of [0,LIMITS.MAX_REDIRECTS-1]) {
    let calls = 0;
    const result = await runTrace(urls.target,{resolve:publicDns,fetchImpl:async () => new Response(null,{status:302,headers:{location:++calls <= depth ? '/hop'+calls : 'http://127.0.0.1/'+'x'.repeat(3000)}})});
    assert.equal(result.error.code,'blocked_redirect'); assert.equal(result.hops.length,depth+1);
    const last = result.hops.at(-1);
    assert.equal(last.status,302); assert.equal(last.host,'attacker.com');
    assert.equal(last.location.length,2048); assert.match(last.location,/^http:\/\/127\.0\.0\.1\//);
    assert.deepEqual(validateTrace(result).errors,[]);
  }
});
