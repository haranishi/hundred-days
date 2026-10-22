import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTarget, isPublicIp, isNumericHost } from '../lib/target-guard.js';
import { runTrace } from '../lib/observe.js';
import { validateTrace } from '../lib/contract.js';
import { clip, hostOf, schemeOf } from '../lib/sanitize.js';

const ATTACKS = [
'http://localhost/','http://LOCALHOST/','http://localhost./','http://127.0.0.1/','http://127.1/','http://0x7f.0.0.1/','http://2130706433/','http://017700000001/','http://0/','http://[::1]/','http://[::ffff:127.0.0.1]/','http://[::ffff:7f00:1]/','http://169.254.169.254/latest/meta-data/','http://[fd00:ec2::254]/','http://metadata.google.internal/','http://100.100.100.200/','http://10.0.0.1/','http://192.168.0.1/','http://172.16.0.1/','http://foo.local/','http://foo.internal/','http://printer.lan/','http://example/','http://a.example/','ftp://example.com/','file:///etc/passwd','javascript:alert(1)','data:text/html,x','http://user:pw@example.com/','https://amazon.co.jp@evil.example/','http://example.com:8080/','http://example.com:22/','http://①②⑦.0.0.1/','http://127。0。0。1/','http://127.0.0.1#@example.com/','http://example.com%00.evil.example/','http://exa mple.com/','http://exa\nmple.com/','http://exa\tmple.com/','https://example.com/'+ 'x'.repeat(2049),'https://hundred-days.pages.dev/api/day-074/trace?url=x',
'https://preview.hundred-days.pages.dev/','http://foo.home.arpa/','http://foo.onion/','http://foo.test/','http://foo.invalid/','http://foo.private/','http://foo.corp/','http://foo.intranet/','http://foo.localdomain/','http://foo.home/','http://example.com./'
];
for (const [index,url] of ATTACKS.entries()) test('guard attack '+index,async () => {
  assert.equal(validateTarget(url).ok,false);
  let calls=0;
  const result=await runTrace(url,{fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  assert.equal(calls,0);assert.equal(result.ok,false);assert.deepEqual(validateTrace(result).errors,[]);
});
test('guard normalization and reason matrix',()=>{
  for (const input of ['https://example.com/','http://example.com:80/','https://example.com:443/',' ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｃｏｍ／ ','https://日本語.jp/','https://3ds.com/']) assert.equal(validateTarget(input).ok,true,input);
  assert.equal(validateTarget('https://mine.com/',{selfHosts:['mine.com']}).reason,'self');
  assert.equal(validateTarget('https://a'.padEnd(80,'a')+'.com/').reason,'bad_host');
  assert.equal(isNumericHost('0x7f.1'),true);
});
test('guard rejection mutation harness detects removal of each gate',()=>{
  const vectors = [
    ['invalid','no URL'],['scheme','ftp://example.com/'],['credentials','https://u:p@example.com/'],
    ['port','https://example.com:8080/'],['too_long','https://example.com/'+'x'.repeat(2050)],
    ['numeric_host','http://127.1/'],['reserved_name','https://a.internal/'],['self','https://hundred-days.pages.dev/'],['bad_host','https://a_b.com/']
  ];
  const check = fn => vectors.every(([,url])=>!fn(url).ok);
  assert.equal(check(validateTarget),true);
  for (const [reason] of vectors) {
    const mutant = value => {const r=validateTarget(value);return r.reason===reason ? {ok:true,url:value} : r;};
    assert.equal(check(mutant),false,reason);
  }
});
const blocks = [[0,8],[0x0a000000,8],[0x64400000,10],[0x7f000000,8],[0xa9fe0000,16],[0xac100000,12],[0xc0000000,24],[0xc0000200,24],[0xc0586300,24],[0xc0a80000,16],[0xc6120000,15],[0xc6336400,24],[0xcb007100,24],[0xe0000000,4],[0xf0000000,4]];
const ip = n => [24,16,8,0].map(b=>Math.floor(n/2**b)%256).join('.');
const blocked = n => blocks.some(([base,bits])=>n>=base&&n<base+2**(32-bits));
for (const [base,bits] of blocks) test('IPv4 range '+ip(base)+'/'+bits,()=>{
  const last=base+2**(32-bits)-1;
  assert.equal(isPublicIp(ip(base)),false);assert.equal(isPublicIp(ip(last)),false);
  for (const n of [base-1,last+1]) if(n>=0&&n<=0xffffffff) assert.equal(isPublicIp(ip(n)),!blocked(n),ip(n));
});
const ipv6Blocked = [
['::','::1'],['100::','100::ffff:ffff:ffff:ffff'],['2001::','2001:0:ffff:ffff:ffff:ffff:ffff:ffff'],
['2001:db8::','2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'],['fc00::','fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
['fe80::','febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],['ff00::','ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']
];
for (const pair of ipv6Blocked) test('IPv6 blocked '+pair[0],()=>{for(const value of pair)assert.equal(isPublicIp(value),false,value);});
test('IPv6 public boundaries and embedded IPv4',()=>{
  for (const value of ['2000:ffff:ffff:ffff:ffff:ffff:ffff:ffff','2001:db7:ffff:ffff:ffff:ffff:ffff:ffff','2001:db9::','2606:4700:4700::1111'])assert.equal(isPublicIp(value),true,value);
  for (const value of ['ff::ffff:ffff:ffff:ffff','100:0:0:1::','2001:1::','fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','fe00::','fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff','fec0::','feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','::ffff:8.8.8.8','64:ff9b::808:808','2002:0808:0808::','::ffff:10.0.0.5','::ffff:7f00:1','64:ff9b::a00:1','2002:7f00:1::','::ffff:0:0','::ffff:ffff:ffff','64:ff9b::','64:ff9b::ffff:ffff','2002::','2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff','1::2::3',':::','garbage','12345::','999.0.0.1','01.2.3.4','[::1]','fe80::1%en0',''])assert.equal(isPublicIp(value),false,value);
});
test('sanitize clips controls and classifies schemes',()=>{
  assert.equal(clip(undefined,10),null);assert.equal(clip('a\n\0bc',2),'ab');
  assert.equal(hostOf('bad'),null);assert.equal(hostOf('https://example.com/a'),'example.com');
  for(const [src,result]of [['//x.com','protocol-relative'],['/x','relative'],['data:x','data'],['https://x.com','https'],['http://x.com','http'],['javascript:x','other']])assert.equal(schemeOf(src,'https://example.com/'),result);
});
const addedV6Blocks = [
  ['::','::ffff:ffff',null,'::1:0:0'],
  ['3fff::','3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff','3ffe:ffff:ffff:ffff:ffff:ffff:ffff:ffff','3fff:1000::'],
  ['64:ff9b:1::','64:ff9b:1:ffff:ffff:ffff:ffff:ffff','64:ff9b:0:ffff:ffff:ffff:ffff:ffff','64:ff9b:2::'],
  ['5f00::','5f00:ffff:ffff:ffff:ffff:ffff:ffff:ffff','5eff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','5f01::']
];
for (const [first,last,before,after] of addedV6Blocks) test('IPv6 additional range boundaries '+first,()=>{
  for(const value of [first,last])assert.equal(isPublicIp(value),false,value);
  // S1: 境界の外側でも2000::/3外、または3fff::/20内なら拒否する。
  for(const value of [before,after].filter(Boolean))assert.equal(isPublicIp(value),first === '3fff::',value);
});
test('IPv4-compatible loopback cannot pass DNS guard',async()=>{
  assert.equal(isPublicIp('::7f00:1'),false);
  assert.equal(isPublicIp('::127.0.0.1'),false);
  let calls=0;
  const result=await runTrace('https://example.com/',{fetchImpl:async url=>{
    if(new URL(url).hostname==='example.com'){calls++;throw Error('must not fetch');}
    return Response.json({Status:0,Answer:[{type:28,data:'::7f00:1'}]});
  }});
  assert.equal(result.error.code,'blocked_target');assert.equal(calls,0);
});
