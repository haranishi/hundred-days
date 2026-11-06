import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {APP_PATH,SECURITY_HEADERS} from './policy.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const evidence=join(root,'.cache/day084-powerpoint');
let mf,browser,origin;const contexts=[];
before(async()=>{
 const config=JSON.parse(await readFile(join(here,'wrangler.jsonc'),'utf8'));
 mf=new Miniflare(convertV4MiniflareOptions({name:'day084-powerpoint-test',modulesRoot:here,
  modules:['worker.mjs','policy.mjs','office-assets.mjs'].map(file=>({type:'ESModule',path:join(here,file)})),
  compatibilityDate:'2026-11-01',durableObjects:{ROOMS:{className:'PresentationRoom',useSQLite:true}},
  ratelimits:{CREATE_LIMIT:{namespace_id:'840084',simple:{limit:6,period:60}}},
  assets:{directory:resolve(here,config.assets.directory),binding:'ASSETS',run_worker_first:config.assets.run_worker_first,routerConfig:{has_user_worker:true}},log:new Log(LogLevel.NONE)}));
 origin=(await mf.ready).origin;
 browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:'chrome'})});
 await mkdir(evidence,{recursive:true});
});
after(async()=>{for(const c of contexts)await c.close();await browser?.close();await mf?.dispose();});
async function host(){
 const context=await browser.newContext();contexts.push(context);const errors=[],violations=[],requests=[],statuses=[];
 await context.exposeBinding('recordViolation',(_,v)=>violations.push(v));
 await context.addInitScript(()=>addEventListener('securitypolicyviolation',e=>window.recordViolation(e.effectiveDirective)));
 const page=await context.newPage();page.on('response',async r=>{if(new URL(r.url()).pathname.endsWith('/status')){let error;try{error=(await r.json()).error;}catch{error='non-json';}statuses.push({status:r.status(),type:r.headers()['content-type'],error});}});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:new URL(r.url()).pathname.replace(/(api\/rooms\/)[a-f0-9]{32}/g,'$1<room>')}));
 await page.goto(origin+APP_PATH+'/');try{await page.waitForFunction(()=>typeof browserApi!=='undefined'&&browserApi?.session.connected);await page.evaluate(()=>{window.api=browserApi;Object.defineProperty(window,'state',{get:()=>snapshot});window.snapshots=[];setInterval(()=>{if(snapshot?.import)window.snapshots.push({import:{...snapshot.import}});},10);});}catch(error){await writeFile(join(evidence,'boot-failure.json'),JSON.stringify({errors,violations,requests,statuses,boot:await page.evaluate(()=>({ready:window.ready,api:!!window.api,connected:window.api?.session.connected}))},null,2));throw error;}
 return {page,errors,violations,requests};
}
async function upload(page,name){
 const bytes=(await readFile(join(here,'test-fixtures',name))).toString('base64');
 return page.evaluate(async({bytes,name})=>{const f=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],name);const r=await api.request('/api/upload',{method:'POST',body:f});return {status:r.status,value:await r.json()};},{bytes,name});
}
async function officeStopped(page){for(let i=0;i<50&&page.workers().some(w=>!w.url().includes('pdf.worker'));i++)await page.waitForTimeout(100);assert.equal(page.workers().filter(w=>!w.url().includes('pdf.worker')).length,0,'office workers must terminate');}
test('PPTX and legacy PPT import locally with Japanese, backgrounds and no lingering engine workers', {timeout:180000},async()=>{
 const {page,errors,violations,requests}=await host();
 for(const name of ['japanese-presentation.pptx','japanese-presentation.ppt']){
  const result=await upload(page,name);assert.equal(result.status,200,result.value.error);assert.equal(result.value.preview.total,3);
  assert.equal(await page.evaluate(()=>state.total),5,'preview must keep old deck');
  const pixels=await page.evaluate(async({id})=>{const values=[];for(let i=0;i<3;i++){const r=await api.request('/api/preview/'+id+'/'+i);const bmp=await createImageBitmap(await r.blob());const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;const x=c.getContext('2d');x.drawImage(bmp,0,0);values.push([...x.getImageData(1,1,1,1).data]);bmp.close();}return values;},{id:result.value.preview.id});
  assert.deepEqual(pixels,[[255,255,255,255],[35,122,87,255],[23,38,68,255]]);
  assert.equal(await page.locator('iframe').count(),0);await officeStopped(page);
  const progress=await page.evaluate(()=>snapshots.map(s=>s.import).filter(Boolean));assert.ok(progress.some(s=>s.stage==='converting'));assert.ok(progress.some(s=>s.stage==='rendering'));assert.ok(progress.some(s=>s.completed===3));
  await page.screenshot({path:join(evidence,name+'.png')});
  await page.evaluate(async id=>{await api.request('/api/discard',{method:'POST',body:JSON.stringify({id})});},result.value.preview.id);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
 assert.equal(requests.filter(r=>r.method==='POST'&&!r.url.startsWith(APP_PATH+'/api/rooms')).length,0,'original documents must not enter HTTP');
 await writeFile(join(evidence,'import-result.json'),JSON.stringify({status:'PASS',formats:['pptx','ppt'],errors,violations,documentUploads:0},null,2));
});

test('PowerPoint page/input limits keep the current deck and release the engine', {timeout:90000},async()=>{
 const {page,errors,violations}=await host();
 const tooMany=await upload(page,'too-many-slides.pptx');assert.equal(tooMany.status,413);assert.equal(await page.evaluate(()=>state.total),5);
 const bad=await page.evaluate(async()=>{const r=await api.request('/api/upload',{method:'POST',body:new File(['not a PowerPoint file'],'broken.pptx')});return {status:r.status,value:await r.json()};});
 assert.equal(bad.status,422);assert.equal(await page.evaluate(()=>state.total),5);
 const large=await page.evaluate(async()=>{const r=await api.request('/api/upload',{method:'POST',body:new File([new Uint8Array(25*1024*1024+1)],'large.pptx')});return r.status;});
 assert.equal(large,413);assert.equal(await page.locator('iframe').count(),0);await officeStopped(page);
 const lifetime=await page.evaluate(async()=>{const fonts=await import('./local-fonts.js'),native=window.queryLocalFonts;window.queryLocalFonts=async()=>[{family:'Arial',blob:async()=>new Blob([Uint8Array.of(0,1,0,0)])}];try{await fonts.enableLocalFonts();const before=(await fonts.readLocalFontData()).fonts.length;await api.close();return {before,after:(await fonts.readLocalFontData()).fonts.length};}finally{window.queryLocalFonts=native;fonts.resetLocalFonts();}});assert.deepEqual(lifetime,{before:1,after:0});
 assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
});
test('PowerPoint cancellation during preparation and conversion preserves the old deck', {timeout:120000},async()=>{
 const {page,errors,violations}=await host();
 const bytes=(await readFile(join(here,'test-fixtures/japanese-presentation.pptx'))).toString('base64');
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/vendor/office/manifest.json',async route=>{await gate;try{await route.continue();}catch{}});
 const begin=async auto=>page.evaluate(({bytes,auto})=>{window.importController=new AbortController();const file=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'slides.pptx');window.importResult=null;if(auto){const t=setInterval(()=>{if(snapshot?.import?.stage==='converting'){clearInterval(t);importController.abort();}},5);}void api.request('/api/upload',{method:'POST',body:file,signal:importController.signal}).then(r=>window.importResult={status:r.status},e=>window.importResult={name:e.name});},{bytes,auto});
 await begin(false);await page.waitForFunction(()=>snapshot?.import?.stage==='loading_engine');await page.evaluate(()=>importController.abort());release();
 await page.waitForFunction(()=>window.importResult);assert.equal(await page.evaluate(()=>importResult.name),'AbortError');assert.equal(await page.evaluate(()=>state.total),5);assert.equal(await page.locator('iframe').count(),0);
 await page.unroute('**/vendor/office/manifest.json');
 await begin(true);await page.waitForFunction(()=>window.importResult,{},{timeout:60000});assert.equal(await page.evaluate(()=>importResult.name),'AbortError');assert.equal(await page.evaluate(()=>state.total),5);
 assert.equal(await page.locator('iframe').count(),0);await officeStopped(page);
 assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
 await writeFile(join(evidence,'cancel-result.json'),JSON.stringify({status:'PASS',preparation:'cancelled',conversion:'cancelled',oldDeckPreserved:true,workers:0,errors,violations},null,2));
});
