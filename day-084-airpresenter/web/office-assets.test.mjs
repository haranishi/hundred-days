import assert from 'node:assert/strict';
import {test} from 'node:test';
import {brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';
import {get} from 'node:http';
import {Miniflare, Log, LogLevel, convertV4MiniflareOptions} from 'miniflare';
import {serveOfficeAsset} from './office-assets.mjs';
import {buildOfficeAssets} from './build-office.mjs';
import {APP_PATH, CONTENT_SECURITY_POLICY, SECURITY_HEADERS} from './policy.mjs';

const ORIGIN='https://airpresenter.test', ASSET_PATH=APP_PATH+'/vendor/office';
const VERSION='zetaoffice-24.2.8.0.beta1-zetajs-1.2.0-noto-f8d15753-stream-v2';
const BASE=ASSET_PATH+'/'+VERSION;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function temporaryDirectory(prefix) {
  const cache=fileURLToPath(new URL('../../.cache/',import.meta.url));
  await mkdir(cache,{recursive:true});return mkdtemp(join(cache,prefix));
}
const raw=Buffer.from('Public fixture: Japanese font and browser office bytes. '.repeat(8));
function fixture(encoding='br',{holdOpen=false}={}) {
  const compressed=encoding==='br'?brotliCompressSync(raw):gzipSync(raw);
  const split=Math.floor(compressed.length/2);
  const chunks=[compressed.subarray(0,split),compressed.subarray(split)];
  const name=encoding==='br'?'soffice.wasm':'NotoSansCJKjp-Regular.otf';
  const parts=chunks.map((bytes,i)=>({file:name+'.'+encoding+'.part-'+String(i).padStart(3,'0'),bytes:bytes.length}));
  const asset={mime:encoding==='br'?'application/wasm':'font/otf',encoding,bytes:compressed.length,parts};
  const manifest={schemaVersion:1,base:BASE,assets:{[name]:asset}};
  const calls=[], reads=[], cancels=[];
  const files=new Map([[ASSET_PATH+'/manifest.json',Buffer.from(JSON.stringify(manifest))],...parts.map((part,i)=>[BASE+'/'+part.file,chunks[i]])]);
  const ASSETS={async fetch(request) {
    const path=new URL(request.url).pathname; calls.push({method:request.method,path});
    const value=files.get(path);
    if(!value)return new Response(null,{status:404});
    if(request.method==='HEAD')return new Response(null,{headers:{'Content-Length':String(value.length)}});
    let sent=false;
    const body=path.endsWith('manifest.json')?value:new ReadableStream({
      pull(controller) {if(sent)return new Promise(()=>{});sent=true;reads.push(path);controller.enqueue(new Uint8Array(value));if(!holdOpen)controller.close();},
      cancel() {cancels.push(path);}
    },{highWaterMark:0});
    return new Response(body,{headers:{'Content-Length':String(value.length),'Content-Security-Policy':CONTENT_SECURITY_POLICY}});
  }};
  return {name,manifest,compressed,parts,files,calls,reads,cancels,ASSETS};
}
async function serve(path,env,init={}) {
  const response=await serveOfficeAsset(new Request(ORIGIN+path,init),env,()=>new TransformStream());
  assert.ok(response,'office route must handle registered requests');return response;
}

test('build verifies raw SHA, keeps Brotli, gzip fonts and bounds each part',async()=>{
  const directory=await temporaryDirectory('day084-office-test-');
  const wasm=brotliCompressSync(raw), font=Buffer.from('public font fixture');
  const sources={schemaVersion:1,version:VERSION,assets:[
    {name:'soffice.wasm',url:'https://example.invalid/wasm',sha256:sha(raw),rawBytes:raw.length,mime:'application/wasm',encoding:'br'},
    {name:'NotoSansCJKjp-Regular.otf',url:'https://example.invalid/font',sha256:sha(font),rawBytes:font.length,mime:'font/otf',encoding:'gzip'}
  ]};
  try {
    const result=await buildOfficeAssets({sources,cacheDirectory:join(directory,'cache'),outputDirectory:join(directory,'out'),partBytes:11,
      download:async source=>({body:source.name==='soffice.wasm'?wasm:font,encoding:source.name==='soffice.wasm'?'br':null})});
    assert.equal(result.base,BASE);assert.equal(result.schemaVersion,1);
    for(const [name,asset] of Object.entries(result.assets)) {
      assert.ok(asset.parts.every(part=>part.bytes<=11));
      const wire=Buffer.concat(await Promise.all(asset.parts.map(part=>readFile(join(directory,'out',VERSION,part.file)))));
      assert.equal(wire.length,asset.bytes);
      assert.deepEqual(asset.encoding==='br'?brotliDecompressSync(wire):gunzipSync(wire),name==='soffice.wasm'?raw:font);
      if(name==='soffice.wasm')assert.deepEqual(wire,wasm,'official Brotli bytes remain unmodified');
    }
    assert.deepEqual(JSON.parse(await readFile(join(directory,'out','manifest.json'),'utf8')),result);
    const bad={...sources,assets:[{...sources.assets[0],sha256:'0'.repeat(64)}]};
    await assert.rejects(buildOfficeAssets({sources:bad,cacheDirectory:join(directory,'bad-cache'),outputDirectory:join(directory,'bad-out'),download:async()=>({body:wasm,encoding:'br'})}),/SHA256/);
    await assert.rejects(buildOfficeAssets({sources:{...sources,assets:[{...sources.assets[0],name:'../outside'}]},cacheDirectory:join(directory,'bad-name'),outputDirectory:join(directory,'bad-name-out')}),/asset|name/i);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('GET concatenates registered Brotli/gzip parts without changing encoded bytes',async()=>{
  for(const encoding of ['br','gzip']) {
    const f=fixture(encoding);
    const response=await serve(BASE+'/'+f.name,f);
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Encoding'),encoding);
    assert.equal(response.headers.get('Content-Type'),f.manifest.assets[f.name].mime);
    assert.equal(response.headers.get('Content-Length'),String(f.compressed.length));
    assert.match(response.headers.get('Cache-Control'),/immutable/);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes,f.compressed);assert.deepEqual(encoding==='br'?brotliDecompressSync(bytes):gunzipSync(bytes),raw);
    assert.deepEqual(f.calls.filter(c=>c.method==='GET'&&!c.path.endsWith('manifest.json')).map(c=>c.path),f.parts.map(p=>BASE+'/'+p.file));
  }
});

test('HEAD checks every part but never reads asset bodies',async()=>{
  const f=fixture(),response=await serve(BASE+'/'+f.name,f,{method:'HEAD'});
  assert.equal(response.status,200);assert.equal(response.body,null);
  assert.equal(response.headers.get('Content-Encoding'),'br');
  assert.deepEqual(f.reads,[]);
  assert.deepEqual(f.calls.filter(c=>c.path!==ASSET_PATH+'/manifest.json').map(c=>c.method),['HEAD','HEAD']);
});

test('backpressure bounds native prefetch and cancellation stops the active source',async()=>{
  const f=fixture('br',{holdOpen:true}),response=await serve(BASE+'/'+f.name,f);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(f.reads.length<=1,'native piping may prefetch at most the active source chunk');
  assert.ok(!f.calls.some(c=>c.method==='GET'&&c.path===BASE+'/'+f.parts[1].file));
  const reader=response.body.getReader();
  assert.deepEqual(Buffer.from((await reader.read()).value),f.compressed.subarray(0,f.parts[0].bytes));
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.reads.length,1,'next part waits for the active source to complete');
  await reader.cancel('consumer stopped');
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(f.cancels,[BASE+'/'+f.parts[0].file]);
  assert.ok(!f.calls.some(c=>c.method==='GET'&&c.path===BASE+'/'+f.parts[1].file));
  // Cancel before the first read proves cancellation reaches an open source reader.
  const second=fixture('br',{holdOpen:true}),unread=await serve(BASE+'/'+second.name,second);
  await unread.body.cancel('consumer stopped');
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(second.cancels,[BASE+'/'+second.parts[0].file]);
});

test('missing parts, malformed manifest, invalid paths and methods fail closed',async()=>{
  const missing=fixture();missing.files.delete(BASE+'/'+missing.parts[1].file);
  assert.equal((await serve(BASE+'/'+missing.name,missing)).status,502);
  assert.equal(missing.reads.length,0,'missing parts must fail before a partial 200');
  const malformed=fixture();malformed.manifest.assets[malformed.name].parts[0].file='../outside';
  malformed.files.set(ASSET_PATH+'/manifest.json',Buffer.from(JSON.stringify(malformed.manifest)));
  assert.equal((await serve(BASE+'/'+malformed.name,malformed)).status,502);
  for(const path of [BASE+'/unknown.wasm',BASE+'/soffice.wasm?private=1',BASE+'/%2e%2e%2fsoffice.wasm',BASE+'/soffice.wasm%2f',BASE+'/'+fixture().parts[0].file]) {
    assert.equal((await serve(path,fixture())).status,404,path);
  }
  const f=fixture();
  const method=await serve(BASE+'/'+f.name,f,{method:'POST',body:'do not read'});
  assert.equal(method.status,405);assert.equal(method.headers.get('Allow'),'GET, HEAD');assert.deepEqual(f.calls,[]);
  assert.equal((await serve(BASE+'/'+f.name,{})).status,404);
  assert.equal(await serveOfficeAsset(new Request(ORIGIN+APP_PATH+'/api/rooms'),f),null);
  assert.equal(await serveOfficeAsset(new Request(ORIGIN+'/other-day/vendor/office/soffice.wasm'),f),null);
});

test('manifest is public GET/HEAD and advertises only fixed registered paths',async()=>{
  const f=fixture(),response=await serve(ASSET_PATH+'/manifest.json',f);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),f.manifest);
  assert.equal((await serve(ASSET_PATH+'/manifest.json',f,{method:'HEAD'})).body,null);
});

test('engine HTML/JS CSP replaces static main policy; main still forbids JS eval',async()=>{
  for(const name of ['engine.html','engine.js','engine-thread.js']) {
    const f=fixture();f.files.set(APP_PATH+'/office/'+name,Buffer.from(name));
    const response=await serve(APP_PATH+'/office/'+name,f);
    assert.equal(response.status,200);
    const policy=response.headers.get('Content-Security-Policy');
    assert.match(policy,/script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'/);
    assert.match(policy,/connect-src 'self'(?:;|$)/);assert.match(policy,/frame-ancestors 'self'(?:;|$)/);
    assert.match(policy,/object-src 'none'/);assert.match(policy,/form-action 'none'/);
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'),'same-origin');
  }
  assert.ok(!CONTENT_SECURITY_POLICY.split(';').find(d=>d.trim().startsWith('script-src')).includes("'unsafe-eval'"));
  assert.equal((await serve(APP_PATH+'/office/not-registered.js',fixture())).status,404);
  const f=fixture(),js={mime:'text/javascript; charset=utf-8',encoding:null,bytes:4,parts:[{file:'soffice.js',bytes:4}]};
  f.manifest.assets['soffice.js']=js;f.files.set(ASSET_PATH+'/manifest.json',Buffer.from(JSON.stringify(f.manifest)));f.files.set(BASE+'/soffice.js',Buffer.from('test'));
  assert.match((await serve(BASE+'/soffice.js',f)).headers.get('Content-Security-Policy'),/script-src 'self' 'unsafe-eval'/);
});


test('real Worker and static binding preserve compressed wire bytes and scoped headers',async()=>{
  const directory=await temporaryDirectory('day084-office-runtime-');
  let mf;
  try {
    const f=fixture();
    f.files.set(APP_PATH+'/index.html',Buffer.from('<!doctype html><title>Main</title>'));
    f.files.set(APP_PATH+'/office/engine.html',Buffer.from('<!doctype html><title>Engine</title>'));
    f.files.set(APP_PATH+'/office/engine-thread.js',Buffer.from('self.onmessage=()=>{};'));
    for(const [path,bytes]of f.files){const file=join(directory,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
    await writeFile(join(directory,'_headers'),[APP_PATH+'/*',...Object.entries(SECURITY_HEADERS).map(([name,value])=>'  '+name+': '+value),''].join('\n'));
    const deployment=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
    mf=new Miniflare(convertV4MiniflareOptions({name:'day084-office-delivery-test',modulesRoot:fileURLToPath(new URL('.',import.meta.url)),
      modules:['worker.mjs','policy.mjs','office-assets.mjs'].map(name=>({type:'ESModule',path:fileURLToPath(new URL('./'+name,import.meta.url))})),
      compatibilityDate:'2026-11-01',assets:{directory,binding:'ASSETS',run_worker_first:deployment.assets.run_worker_first,routerConfig:{has_user_worker:true}},log:new Log(LogLevel.NONE)}));
    const address=await mf.ready;
    const wire=await new Promise((resolve,reject)=>get(address.origin+BASE+'/'+f.name,{headers:{'Accept-Encoding':'br'}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));response.on('error',reject);
    }).on('error',reject));
    assert.equal(wire.status,200);assert.equal(wire.headers['content-length'],String(f.compressed.length),'encoded length must survive real HTTP');assert.equal(wire.headers['content-encoding'],'br');assert.deepEqual(wire.body,f.compressed);
    assert.deepEqual(brotliDecompressSync(wire.body),raw,'workerd must not apply a second Brotli layer');
    const head=await fetch(address.origin+BASE+'/'+f.name,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),String(f.compressed.length));assert.equal((await head.arrayBuffer()).byteLength,0);
    const main=await fetch(address.origin+APP_PATH+'/');assert.equal(main.headers.get('Content-Security-Policy'),CONTENT_SECURITY_POLICY);
    assert.equal(main.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
    const engine=await fetch(address.origin+APP_PATH+'/office/engine.html');assert.equal(engine.status,200);
    assert.match(engine.headers.get('Content-Security-Policy'),/script-src 'self' 'unsafe-eval'/);
    assert.ok(!engine.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"),'static wildcard policy must be replaced');
    const thread=await fetch(address.origin+APP_PATH+'/office/engine-thread.js');assert.match(thread.headers.get('Content-Security-Policy'),/connect-src 'self'(?:;|$)/);
    assert.equal((await fetch(address.origin+BASE+'/'+f.parts[0].file)).status,404);
  } finally {await mf?.dispose();await rm(directory,{recursive:true,force:true});}
});


async function faultRuntime(f,mode) {
  return new Miniflare(convertV4MiniflareOptions({name:'day084-office-'+mode,modulesRoot:fileURLToPath(new URL('.',import.meta.url)),
    modules:['test-fixtures/office-stream-worker.mjs','office-assets.mjs','policy.mjs'].map(file=>({type:'ESModule',path:fileURLToPath(new URL('./'+file,import.meta.url))})),
    compatibilityDate:'2026-11-01',bindings:{OFFICE_STREAM_FIXTURE:JSON.stringify({base:BASE,name:f.name,parts:f.parts,mode,
      files:[...f.files].map(([path,bytes])=>[path,[...bytes]])})},log:new Log(LogLevel.NONE)}));
}
function wireRequest(url,onHeaders=()=>{}) {
  return new Promise((resolve,reject)=>get(url,{headers:{'Accept-Encoding':'br'}},response=>{
    onHeaders(response);const chunks=[];
    response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(Buffer.concat(chunks)));
    response.on('aborted',()=>reject(new Error('HTTP body aborted')));response.on('error',reject);
  }).on('error',reject));
}

test('real fixed-length HTTP rejects both truncated and excessive part bodies',async()=>{
  for(const mode of ['short','long']) {
    const f=fixture(),mf=await faultRuntime(f,mode);let status,length;
    try {
      const address=await mf.ready;
      await assert.rejects(wireRequest(address.origin+BASE+'/'+f.name,response=>{status=response.statusCode;length=response.headers['content-length'];}));
      assert.ok(status===undefined||status===200,'invalid bodies must abort before or after response headers');
      if(status===200)assert.equal(length,String(f.compressed.length));
      const stats=await (await fetch(address.origin+'/_test/stats')).json();
      assert.deepEqual(stats.gets,f.parts.map(part=>BASE+'/'+part.file));
    } finally {await mf.dispose();}
  }
});

test('native Workerd body cancellation stops the pending asset source',async()=>{
  const f=fixture(),mf=await faultRuntime(f,'cancel');
  try {
    const address=await mf.ready;
    const response=await fetch(address.origin+'/_test/cancel'),stats=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(stats.cancelled,[BASE+'/'+f.parts[0].file]);
    assert.deepEqual(stats.gets,[BASE+'/'+f.parts[0].file]);
  } finally {await mf.dispose();}
});
