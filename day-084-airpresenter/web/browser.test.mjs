import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {readFile, mkdtemp, mkdir, cp, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare, Log, LogLevel, convertV4MiniflareOptions} from 'miniflare';
import {chromium} from '@playwright/test';
import {APP_PATH, SECURITY_HEADERS} from './policy.mjs';

let mf, browser, address, assetDirectory, nextClient = 1;
const contexts = new Set();
const fixture = fileURLToPath(new URL('./test-fixtures/japanese-presentation.pdf', import.meta.url));
function options(extra = {}) {
  return convertV4MiniflareOptions({
    name:'day084-browser-test', unsafeInspectDurableObjects:true,
    modulesRoot:fileURLToPath(new URL('.', import.meta.url)),
    modules:['worker.mjs','policy.mjs'].map(file => ({type:'ESModule',path:fileURLToPath(new URL(file,import.meta.url))})),
    compatibilityDate:'2026-11-01',
    durableObjects:{ROOMS:{className:'PresentationRoom',useSQLite:true}},
    ratelimits:{CREATE_LIMIT:{namespace_id:'840084',simple:{limit:6,period:60}}},
    assets:{directory:assetDirectory,binding:'ASSETS',run_worker_first:[APP_PATH+'/api/*'],routerConfig:{has_user_worker:true},
      assetConfig:{base_path:APP_PATH,headers:{version:2,rules:{[APP_PATH+'/*']:{set:SECURITY_HEADERS,unset:[]}}}}},
    log:new Log(LogLevel.NONE), ...extra,
  });
}
before(async () => {
  assetDirectory=await mkdtemp(fileURLToPath(new URL('./test-fixtures/.browser-assets-',import.meta.url)));
  await mkdir(assetDirectory+'/web/test-fixtures',{recursive:true});
  for(const file of ['browser-api.js','session.js','pdf-import.js','vendor']) await cp(fileURLToPath(new URL('../'+file,import.meta.url)),assetDirectory+'/'+file,{recursive:true});
  for(const file of ['browser-harness.html','browser-harness.mjs']) await cp(fileURLToPath(new URL('./test-fixtures/'+file,import.meta.url)),assetDirectory+'/web/test-fixtures/'+file);
  await writeFile(assetDirectory+'/_headers',[APP_PATH+'/*',...Object.entries(SECURITY_HEADERS).map(([name,value])=>'  '+name+': '+value),''].join('\n'));
  mf = new Miniflare(options()); address = (await mf.ready).origin;
  browser = await chromium.launch({headless:true,...(process.env.CI ? {} : {channel:'chrome'})});
});
after(async () => {
  for (const context of contexts) await context.close();
  await browser?.close(); await mf?.dispose();
  if(assetDirectory) await rm(assetDirectory,{recursive:true,force:true});
});
async function pageFor(origin = address) {
  const context = await browser.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'192.0.2.'+nextClient++}});
  contexts.add(context);
  await context.addInitScript(() => {
    window.observations = {plain:[],frames:[],errors:[],violations:[],connections:[],sockets:[],wireTimes:[]};
    addEventListener('error', () => window.observations.errors.push('pageerror'));
    addEventListener('securitypolicyviolation', event => window.observations.violations.push(event.violatedDirective));
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      const value = JSON.parse(new TextDecoder().decode(data));
      window.observations.plain.push({value,bytes:data.byteLength});
      if (window.holdEncryption) await new Promise(resolve => {window.releaseEncryption=resolve;});
      return encrypt(algorithm,key,data);
    };
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args); window.observations.sockets.push(this);
        const send = this.send.bind(this);
        this.send = data => {window.observations.frames.push(JSON.parse(data));window.observations.wireTimes.push(performance.now());return send(data);};
      }
    };
  });
  const page = await context.newPage();
  const response=await page.goto(origin + APP_PATH + '/web/test-fixtures/browser-harness.html');
  assert.equal(response.headers()['content-security-policy'],SECURITY_HEADERS['Content-Security-Policy']);
  await page.waitForFunction(() => window.modulesReady);
  return page;
}
async function host(origin = address) {
  const page = await pageFor(origin);
  await page.evaluate(async () => {
    window.snapshots=[];
    window.api = await createBrowserApi({onSnapshot:state => {window.state=state;window.snapshots.push(state);},
      onConnection:(value,message) => observations.connections.push({value,message}),onError:() => observations.errors.push('callback')}).catch(error=>{throw new Error('Browser factory failed, HTTP '+error.status);});
  });
  await page.waitForFunction(() => api.session.connected);
  return page;
}
async function remote(hostPage, {change, origin = address} = {}) {
  const link = await hostPage.evaluate(() => api.remoteUrl);
  const page = await pageFor(origin);
  await page.evaluate(async ({link,change}) => {
    const url = new URL(link);
    if (change) {const fragment=new URLSearchParams(url.hash.slice(1));fragment.set(change.name,change.value);url.hash=fragment.toString();}
    // Secrets are confined to browser memory and are never included in a navigation log.
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    window.snapshots=[];
    window.api=await createBrowserApi({onSnapshot:value => {window.state=value;window.snapshots.push(value);},
      onConnection:(value,message)=>observations.connections.push({value,message}),onError:()=>observations.errors.push('callback')});
  },{link,change});
  return page;
}
async function readyRemote(hostPage, options) {
  const page = await remote(hostPage,options);
  await page.waitForFunction(() => api.session.connected && state?.peers.host === 1);
  await hostPage.waitForFunction(() => state.peers.remote === 1);
  return page;
}
async function request(page, resource, body, method = body === undefined ? 'GET' : 'POST') {
  return page.evaluate(async ({resource,body,method}) => {
    const result=await api.request(resource,{method,...(body===undefined?{}:{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})});
    return {status:result.status,value:await result.json()};
  },{resource,body,method});
}
async function command(page, body) {return request(page,'/api/command',body);}
async function upload(page, bytes, name='slides.pdf', id='import-for-test') {
  return page.evaluate(async ({bytes,name,id}) => {
    const file=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],name,{type:'application/pdf'});
    const result=await api.request('/api/upload?filename='+encodeURIComponent(name),{method:'POST',headers:{'X-AirPresenter-Import':id},body:file});
    return {status:result.status,value:await result.json()};
  },{bytes:Buffer.from(bytes).toString('base64'),name,id});
}
async function closePages(...pages) {
  for (const page of pages) {
    if (!page) continue;
    await page.evaluate(async () => {try {await window.api?.close();} catch {}}).catch(()=>{});
    contexts.delete(page.context()); await page.context().close();
  }
}
function pdf(pages, {width=1280,height=720,noise=false}={}) {
  const objects=[], bytes=[]; let size=0;
  const push=chunk => {const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes.push(data);size+=data.length;};
  const stream = body => Buffer.concat([Buffer.from('<< /Length '+body.length+' >>\nstream\n'),body,Buffer.from('\nendstream')]);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const firstPage = noise ? 5 : 4;
  objects.push('<< /Type /Pages /Count '+pages+' /Kids ['+Array.from({length:pages},(_,i)=>(i+firstPage)+' 0 R').join(' ')+'] >>');
  objects.push(stream(Buffer.from(noise ? `q ${width} 0 0 ${height} 0 0 cm /Noise Do Q` : '0.85 0.12 0.18 rg 10 10 300 100 re f')));
  if (noise) {
    const image=Buffer.alloc(width*height*3); let random=840084;
    for(let i=0;i<image.length;i++) {random^=random<<13;random^=random>>>17;random^=random<<5;image[i]=random&255;}
    objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${image.length} >>\nstream\n`),image,Buffer.from('\nendstream')]));
  }
  for(let i=0;i<pages;i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${noise?'<< /XObject << /Noise 4 0 R >> >>':'<< >>'} /Contents 3 0 R >>`);
  push('%PDF-1.7\n'); const offsets=[0];
  objects.forEach((object,i) => {offsets.push(size);push((i+1)+' 0 obj\n');push(object);push('\nendobj\n');});
  const xref=size;push('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');
  for(const offset of offsets.slice(1)) push(String(offset).padStart(10,'0')+' 00000 n \n');
  push('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
  return Buffer.concat(bytes);
}

// 1.2, 3.2: the former HTTP API is fulfilled in browser memory.
test('browser API supplies sample state, a fragment-only QR and validated local commands', async () => {
  const pc=await host();
  try {
    const info=await request(pc,'/api/info');
    assert.equal(info.status,200);assert.equal(info.value.state.total,5);assert.deepEqual(info.value.state.slides,[]);
    assert.equal(info.value.state.peers.host,1);
    const link=await pc.evaluate(async () => {
      const url=new URL(api.remoteUrl), qr=await api.request('/api/qrcode');
      return {query:url.search,fragmentKeys:[...new URLSearchParams(url.hash.slice(1)).keys()].sort(),role:api.session.role,
        expiresIn:api.session.expiresAt-Date.now(),qrStatus:qr.status,qrType:qr.headers.get('Content-Type'),qrBody:(await qr.text()).startsWith('<svg')};
    });
    assert.equal(link.query,'?mode=remote');assert.deepEqual(link.fragmentKeys,['key','room','token']);assert.equal(link.role,'host');
    assert.ok(link.expiresIn>14_390_000 && link.expiresIn<=14_400_000);assert.equal(link.qrStatus,200);assert.equal(link.qrType,'image/svg+xml');assert.equal(link.qrBody,true);
    assert.equal((await command(pc,{type:'NEXT'})).value.state.current,1);
    assert.equal((await command(pc,{type:'PREV'})).value.state.current,0);
    assert.equal((await command(pc,{type:'BLACKOUT',active:true})).value.state.isBlackout,true);
    assert.equal((await command(pc,{type:'PRESENTATION',active:true})).value.state.presentation,true);
    for (const input of [{type:'BLACKOUT',active:1},{type:'LASER',active:true,x:101,y:0},{type:'TIMER',action:'stop'},{type:'NOTE',page:5,text:'bad'},{type:'NOTE',page:0,text:'x'.repeat(4001)},{type:'UNKNOWN'}]) assert.equal((await command(pc,input)).status,400);
    assert.equal((await command(pc,{type:'TIMER',action:'start'})).status,200);
    await new Promise(resolve=>setTimeout(resolve,120));
    const ticking=(await request(pc,'/api/info')).value.state;
    assert.ok(ticking.serverNow-ticking.timer.startedAt>=100,'info snapshots advance the common clock');
    const paused=(await command(pc,{type:'TIMER',action:'pause'})).value.state;
    assert.equal(paused.timer.startedAt,null);assert.ok(paused.timer.elapsedMs>=100);
    assert.deepEqual((await command(pc,{type:'TIMER',action:'reset'})).value.state.timer,{elapsedMs:0,startedAt:null});
    assert.equal((await request(pc,'/api/not-found')).status,404);
  } finally {await closePages(pc);}
});

test('real encrypted peers synchronize ordered commands, deduplicate ids and enforce host-only notes', async () => {
  const pc=await host();let phone;
  try {
    phone=await readyRemote(pc);
    assert.equal((await command(phone,{type:'NOTE',page:0,text:'forbidden'})).status,403);
    assert.equal((await request(phone,'/api/upload',{})).status,403);
    assert.equal((await request(phone,'/api/qrcode')).status,403);
    await command(pc,{type:'NOTE',page:0,text:'いまのカンペ'});await command(pc,{type:'NOTE',page:1,text:'次の秘密'});
    await phone.waitForFunction(()=>state.notes[0]==='いまのカンペ');
    assert.equal(await phone.evaluate(()=>state.notes[1]),'');
    const result=await phone.evaluate(async () => {
      const results=await Promise.all(Array.from({length:4},()=>api.request('/api/command',{method:'POST',body:JSON.stringify({type:'NEXT'})})));
      return Promise.all(results.map(async response=>(await response.json()).state.current));
    });
    assert.deepEqual(result,[1,2,3,4]);
    await command(pc,{type:'PREV'});
    await phone.evaluate(async () => {
      const value={type:'COMMAND',id:'deduplicate-this-command-id',command:{type:'PREV'}};
      await api.session.send(value);await api.session.send(value);
    });
    await pc.waitForFunction(()=>state.current===2);
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await pc.evaluate(()=>state.current),2);
    await command(phone,{type:'LASER',active:true,x:23,y:64});
    await pc.waitForFunction(()=>state.laser.active);
    await pc.waitForFunction(()=>!state.laser.active,{},{timeout:2500});
    const privacy=await phone.evaluate(()=>({sample:state.slides.length,onlyCurrent:state.notes.every((text,index)=>index===state.current || text===''),
      encrypted:observations.frames.every(frame=>Object.keys(frame).sort().join(',')==='data,iv,type' && frame.type==='packet' && !JSON.stringify(frame).includes('NEXT')),
      plaintext:observations.plain.every(item=>item.bytes<=47*1024)}));
    assert.equal(privacy.sample,5);assert.equal(privacy.onlyCurrent,true);assert.equal(privacy.encrypted,true);assert.equal(privacy.plaintext,true);
  } finally {await closePages(phone,pc);}
});

test('PDF import renders Japanese pages locally, reports real progress and preserves decks on discard or failure', async () => {
  const pc=await host();let phone;
  try {
    const network=[];pc.on('request',r=>{if(['POST','PUT'].includes(r.method())) network.push({url:new URL(r.url()).pathname,bytes:r.postDataBuffer()?.length||0});});
    const bytes=await readFile(fixture);
    const candidate=await upload(pc,bytes,'日本語.pdf','japanese-import');
    assert.equal(candidate.status,200);assert.equal(candidate.value.preview.total,3);assert.equal(candidate.value.state.total,5);
    assert.equal(candidate.value.state.import.id,'japanese-import');assert.equal(candidate.value.state.import.status,'awaiting_confirmation');
    assert.equal(candidate.value.preview.slides.length,3);
    const rendered=await pc.evaluate(async resources=> {
      const output=[];
      for(const resource of resources) {const response=await api.request(resource);const blob=await response.blob();const bitmap=await createImageBitmap(blob);
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
        const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;const colors=new Set();for(let i=0;i<pixels.length;i+=400) colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
        output.push({status:response.status,type:blob.type,width:bitmap.width,height:bitmap.height,colors:colors.size});bitmap.close();}
      return output;
    },candidate.value.preview.slides);
    assert.ok(rendered.every(p=>p.status===200 && p.type==='image/png' && Math.max(p.width,p.height)<=1920 && p.width/p.height===16/9 && p.colors>8));
    const progress=await pc.evaluate(()=>snapshots.map(s=>s.import).filter(Boolean).map(p=>({stage:p.stage,completed:p.completed,total:p.total,status:p.status})));
    assert.ok(progress.some(p=>p.stage==='rendering' && p.completed===1 && p.total===3));
    assert.ok(progress.some(p=>p.completed===3 && p.total===3));
    assert.equal(network.length,0,'no source upload or external conversion request');
    await request(pc,'/api/discard',{id:candidate.value.preview.id});assert.equal((await request(pc,'/api/info')).value.state.total,5);
    assert.equal((await pc.evaluate(async resource=>(await api.request(resource)).status,candidate.value.preview.slides[0])),404);
    const second=await upload(pc,bytes,'same-file.pdf','second-import');
    const accepted=await request(pc,'/api/accept',{id:second.value.preview.id});assert.equal(accepted.value.state.total,3);assert.equal(accepted.value.state.import.status,'completed');
    const oldSlides=accepted.value.state.slides;
    phone=await readyRemote(pc);
    await phone.waitForFunction(()=>state.slides[0] && state.total===3);
    assert.equal(await phone.evaluate(async ()=>(await api.request(state.slides[0])).headers.get('Content-Type')),'image/jpeg');
    const invalid=await upload(pc,Buffer.from('not a PDF'),'broken.pdf','broken-import');assert.equal(invalid.status,422);
    assert.deepEqual((await request(pc,'/api/info')).value.state.slides,oldSlides);
    for(const name of ['slides.pptx','slides.ppt']) {const result=await upload(pc,Buffer.from('powerpoint'),name);assert.equal(result.status,422);assert.match(result.value.error,/PDF/);}
    assert.equal((await upload(pc,Buffer.alloc(25*1024*1024+1),'too-big.pdf')).status,413);
    const cancelled=await upload(pc,pdf(2),'cancel.pdf','discard-later');await request(pc,'/api/discard',{id:cancelled.value.preview.id});
    assert.deepEqual((await request(pc,'/api/info')).value.state.slides,oldSlides);
    assert.equal((await upload(pc,pdf(101),'101.pdf')).status,413);
    assert.deepEqual((await request(pc,'/api/info')).value.state.slides,oldSlides);
    const security=await pc.evaluate(()=>({errors:observations.errors,violations:observations.violations}));
    assert.deepEqual(security,{errors:[],violations:[]});
  } finally {await closePages(phone,pc);}
});

test('100 pages with maximum Japanese notes project only the current page and fit both encrypted limits', async () => {
  const pc=await host();let phone;
  try {
    const candidate=await upload(pc,pdf(100));assert.equal(candidate.status,200);assert.equal(candidate.value.preview.total,100);
    await request(pc,'/api/accept',{id:candidate.value.preview.id});
    assert.equal(await pc.evaluate(async ()=> {
      for(let page=0;page<100;page++) {const result=await api.request('/api/command',{method:'POST',body:JSON.stringify({type:'NOTE',page,text:'漢'.repeat(4000)})});if(!result.ok)return false;}
      return true;
    }),true);
    phone=await readyRemote(pc);await phone.waitForFunction(()=>state.total===100 && state.notes[0]?.length===4000 && state.slides[0]);
    const wire=await pc.evaluate(()=> {
      const states=observations.plain.filter(item=>item.value.state?.total===100);
      return {count:states.length,projected:states.every(({value})=>value.state.notes.length===100 && value.state.slides.length===100 && value.state.notes.every((n,i)=>i===value.state.current?n.length===4000:n==='') && value.state.slides.every((s,i)=>i===value.state.current||s==='')),
        maxPlain:Math.max(...states.map(item=>item.bytes)),maxOuter:Math.max(...observations.frames.map(f=>new TextEncoder().encode(JSON.stringify({...f,from:'host'})).length)),
        thumb:states.some(({value})=>value.thumbnail && value.thumbnail.dataUrl.startsWith('data:image/jpeg;base64,'))};
    });
    assert.ok(wire.count>0);assert.equal(wire.projected,true);assert.equal(wire.thumb,true);assert.ok(wire.maxPlain<=47*1024);assert.ok(wire.maxOuter<=64*1024);
    const before=await pc.evaluate(()=>observations.plain.filter(x=>x.value.thumbnail).length);
    await command(phone,{type:'BLACKOUT',active:true});
    await phone.waitForFunction(()=>state.isBlackout);
    assert.equal(await pc.evaluate(()=>observations.plain.filter(x=>x.value.thumbnail).length),before,'unchanged page reuses cached image');
    const thumb=await phone.evaluate(async ()=> {const b=await(await api.request(state.slides[state.current])).blob();const i=await createImageBitmap(b);return{bytes:b.size,edge:Math.max(i.width,i.height)};});
    assert.ok(thumb.bytes<=20*1024 && thumb.edge<=480);
    await command(phone,{type:'NEXT'});await phone.waitForFunction(()=>state.current===1 && state.notes[1].length===4000);
    assert.equal(await phone.evaluate(()=>state.notes[0]),'');
  } finally {await closePages(phone,pc);}
});

test('PNG output budget, abort and thumbnail size limits are enforced by real canvas rendering', async () => {
  const pc=await host();
  try {
    const noisy=pdf(100,{width:1920,height:1080,noise:true});
    const result=await upload(pc,noisy,'large-output.pdf','budget-import');
    assert.equal(result.status,413);assert.match(result.value.error,/120/);assert.equal((await request(pc,'/api/info')).value.state.total,5);
    const aborted=await pc.evaluate(async bytes=> {
      const controller=new AbortController();
      const file=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'abort.pdf',{type:'application/pdf'});
      let completed=0;
      try {await importPdf(file,{signal:controller.signal,onProgress:progress=>{if(progress.completed>0){completed=progress.completed;controller.abort();}}});return {aborted:false};}
      catch(error) {return {aborted:error.name==='AbortError',completed};}
    },pdf(20).toString('base64'));
    assert.deepEqual(aborted,{aborted:true,completed:1});
    const thumbnail=await pc.evaluate(async () => {
      const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
      const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(canvas.width,canvas.height);let random=84;
      for(let i=0;i<pixels.data.length;i+=4){random^=random<<13;random^=random>>>17;random^=random<<5;pixels.data[i]=random&255;pixels.data[i+1]=(random>>>8)&255;pixels.data[i+2]=(random>>>16)&255;pixels.data[i+3]=255;}
      ctx.putImageData(pixels,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const result=await createThumbnail(png);const image=await createImageBitmap(result);return {type:result.type,bytes:result.size,edge:Math.max(image.width,image.height)};
    });
    assert.equal(thumbnail.type,'image/jpeg');assert.ok(thumbnail.bytes<=20*1024);assert.ok(thumbnail.edge<=480);
  } finally {await closePages(pc);}
});

test('offline drops pending commands and reconnects to the PC current state without replay', async () => {
  const pc=await host();let phone;
  try {
    phone=await readyRemote(pc);await command(phone,{type:'LASER',active:true,x:50,y:50});
    await phone.evaluate(()=> {window.holdEncryption=true;window.pending=api.request('/api/command',{method:'POST',body:JSON.stringify({type:'NEXT'})}).then(r=>r.status,()=>0);});
    await phone.waitForFunction(()=>window.releaseEncryption);
    await phone.context().setOffline(true);
    await phone.waitForFunction(()=>!api.session.connected);await pc.waitForFunction(()=>!state.laser.active);
    await phone.evaluate(()=>{window.holdEncryption=false;window.releaseEncryption();});
    assert.ok(await phone.evaluate(()=>pending)>=400);
    await command(pc,{type:'NEXT'});await command(pc,{type:'NEXT'});
    await phone.context().setOffline(false);
    await phone.waitForFunction(()=>api.session.connected && state.current===2);
    await new Promise(resolve=>setTimeout(resolve,300));assert.equal(await pc.evaluate(()=>state.current),2);
    assert.equal((await command(phone,{type:'NEXT'})).value.state.current,3);
    const count=await phone.evaluate(()=>observations.sockets.length);assert.ok(count>=2);
  } finally {await closePages(phone,pc);}
});

test('unauthorized, replaced and ended remote sessions stop reconnecting and release their state', async () => {
  const pc=await host();let invalid,first,second;
  try {
    invalid=await remote(pc,{change:{name:'token',value:'A'.repeat(43)}});
    await invalid.waitForFunction(()=>api.session.terminated);
    assert.equal(await invalid.evaluate(()=>observations.sockets.length),0);
    first=await readyRemote(pc);second=await readyRemote(pc);
    await first.waitForFunction(()=>api.session.terminated);
    const oldSockets=await first.evaluate(()=>observations.sockets.length);
    await new Promise(resolve=>setTimeout(resolve,700));assert.equal(await first.evaluate(()=>observations.sockets.length),oldSockets);
    await command(pc,{type:'NOTE',page:0,text:'cleanup-me'});await second.waitForFunction(()=>state.notes[0]==='cleanup-me');
    await pc.evaluate(()=>api.close());await second.waitForFunction(()=>api.session.terminated);
    assert.equal(await second.evaluate(()=>state.notes.every(n=>n==='') && !state.laser.active),true);
    assert.equal((await request(second,'/api/info')).status,410);
    assert.equal(await pc.evaluate(()=>state.notes.every(n=>n==='') && !api.remoteUrl && !api.qrUrl),true);
  } finally {await closePages(invalid,first,second,pc);}
});

test('client expiry stops both peers even while idle and invalidates the link', async () => {
  const short=new Miniflare(options({name:'day084-browser-expiry',bindings:{AIRPRESENTER_TEST_TTL_MS:'1600'}}));let pc,phone;
  try {
    const origin=(await short.ready).origin;pc=await host(origin);phone=await readyRemote(pc,{origin});
    await pc.waitForFunction(()=>api.session.terminated,{},{timeout:4000});await phone.waitForFunction(()=>api.session.terminated,{},{timeout:4000});
    assert.equal(await phone.evaluate(()=>state.notes.every(n=>n==='') && state.peers.host===0),true);
    const count=await phone.evaluate(()=>observations.sockets.length);await new Promise(resolve=>setTimeout(resolve,700));assert.equal(await phone.evaluate(()=>observations.sockets.length),count);
  } finally {await closePages(phone,pc);await short.dispose();}
});

test('client send bursts remain ordered within relay frequency limits and oversize plaintext never encrypts', async () => {
  const pc=await host();let phone;
  try {
    phone=await readyRemote(pc);
    const revision=await pc.evaluate(()=>state.revision);
    const sent=await phone.evaluate(async ()=>Promise.all(Array.from({length:75},(_,n)=>api.session.send({type:'COMMAND',id:'burst-'+n,command:{type:'BLACKOUT',active:n%2===0}}).then(()=>true,()=>false))));
    await pc.waitForFunction(revision=>state.revision>=revision+75 || api.session.terminated,revision);
    assert.ok(sent.every(Boolean));assert.equal(await pc.evaluate(()=>api.session.terminated),false);assert.equal(await pc.evaluate(()=>state.isBlackout),true);
    assert.equal(await phone.evaluate(()=>api.session.terminated),false);
    const rate=await phone.evaluate(()=>Math.max(...observations.wireTimes.map(at=>observations.wireTimes.filter(other=>other>at-1000 && other<=at).length)));
    assert.ok(rate<=32,'client keeps headroom below forty relay messages per second');
    const denied=await phone.evaluate(async()=> {
      const before=observations.plain.length, frames=observations.frames.length;
      const status=await api.session.send({type:'STATE',payload:'漢'.repeat(17000)}).then(()=>200,error=>error.status);
      return {status,encrypted:observations.plain.length-before,sent:observations.frames.length-frames};
    });
    assert.deepEqual(denied,{status:413,encrypted:0,sent:0});
  } finally {await closePages(phone,pc);}
});

test('GCM rejects tampered ciphertext and wrong-room or wrong-role AAD; remote state and notes never override PC', async () => {
  const pc=await host();let phone;
  try {
    phone=await readyRemote(pc);
    assert.equal(await phone.evaluate(()=>api.session.command({type:'NOTE',page:0,text:'bypass-attempt'}).then(()=>200,error=>error.status)),403);
    const link=await pc.evaluate(()=>api.remoteUrl);
    await phone.evaluate(async link=> {
      const fragment=new URLSearchParams(new URL(link).hash.slice(1)), encoded=fragment.get('key');
      const raw=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
      const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']);raw.fill(0);
      const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const body=new TextEncoder().encode(JSON.stringify({type:'COMMAND',id:'forged-aad',command:{type:'NEXT'}}));
      for(const [room,role] of [[fragment.get('room'),'host'],['f'.repeat(32),'remote']]) {
        const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(JSON.stringify([room,role]))},key,body);
        observations.sockets.at(-1).send(JSON.stringify({type:'packet',iv:b64(iv),data:b64(new Uint8Array(cipher))}));
      }
      await api.session.send({type:'SYNC',id:'tamper-source'});
      const original=observations.frames.at(-1),tampered={...original,data:(original.data[0]==='A'?'B':'A')+original.data.slice(1)};
      observations.sockets.at(-1).send(JSON.stringify(tampered));
      await api.session.send({type:'STATE',state:{revision:999999,current:4,notes:['forged']}});
    },link);
    await pc.waitForFunction(()=>observations.errors.filter(value=>value==='callback').length===3);
    assert.equal(await pc.evaluate(()=>state.current),0);assert.equal(await pc.evaluate(()=>state.notes[0]),'');
    assert.equal((await command(phone,{type:'NEXT'})).value.state.current,1,'valid operations still work after rejected frames');
    const unknown=await remote(pc,{change:{name:'room',value:'f'.repeat(32)}});
    try {await unknown.waitForFunction(()=>api.session.terminated);assert.equal(await unknown.evaluate(()=>observations.sockets.length),0);}
    finally {await closePages(unknown);}
  } finally {await closePages(phone,pc);}
});

test('ACK timeout discards its id, reconnects and never resends a command', async () => {
  const pc=await pageFor();let phone;
  try {
    await pc.evaluate(async ()=> {
      window.commands=[];
      window.silent=await createSecureSession({onMessage:message=>{if(message.type==='COMMAND')commands.push(message);}});
      window.api={get remoteUrl(){return silent.remoteUrl;},close:()=>silent.close()};silent.start();
    });
    await pc.waitForFunction(()=>silent.connected);
    phone=await remote(pc);
    await phone.waitForFunction(()=>api.session.connected);
    const status=await phone.evaluate(()=>api.session.command({type:'NEXT'}).then(()=>200,error=>error.status));
    assert.equal(status,504);
    await phone.waitForFunction(()=>api.session.connected && observations.sockets.length>=2);
    assert.equal(await pc.evaluate(()=>commands.length),1);
    await pc.evaluate(()=>silent.send({type:'ACK',id:commands[0].id}));
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await pc.evaluate(()=>commands.length),1);
  } finally {await closePages(phone,pc);}
});

test('maximal JSON escaping plus a noisy preview remains below the encrypted packet budget', async () => {
  const pc=await host();let phone;
  try {
    const candidate=await upload(pc,pdf(1,{width:1920,height:1080,noise:true}));assert.equal(candidate.status,200);
    await request(pc,'/api/accept',{id:candidate.value.preview.id});
    assert.equal((await command(pc,{type:'NOTE',page:0,text:'\u0000'.repeat(4000)})).status,200);
    phone=await readyRemote(pc);await phone.waitForFunction(()=>state.notes[0]?.length===4000 && state.slides[0]);
    const bounds=await pc.evaluate(()=>({plain:Math.max(...observations.plain.map(p=>p.bytes)),outer:Math.max(...observations.frames.map(p=>new TextEncoder().encode(JSON.stringify({...p,from:'host'})).length))}));
    assert.ok(bounds.plain<=47*1024);assert.ok(bounds.outer<=64*1024);
  } finally {await closePages(phone,pc);}
});

test('peer-only disconnection rejects pending work before host return while the remote socket stays open', async () => {
  const pc=await host();let phone;
  try {
    phone=await readyRemote(pc);
    await phone.evaluate(()=>{window.holdEncryption=true;window.pending=api.request('/api/command',{method:'POST',body:JSON.stringify({type:'NEXT'})}).then(r=>r.status,()=>0);});
    await phone.waitForFunction(()=>window.releaseEncryption);
    await pc.context().setOffline(true);
    await phone.waitForFunction(()=>state.peers.host===0);
    assert.equal(await phone.evaluate(()=>api.session.connected),true);
    const status=await phone.evaluate(()=>Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still-pending'),200))]));
    assert.equal(status,409,'loss of the peer invalidates ACKs without waiting for timeout');
    await command(pc,{type:'NEXT'});await command(pc,{type:'NEXT'});
    await pc.context().setOffline(false);
    await phone.evaluate(()=>{window.holdEncryption=false;window.releaseEncryption();});
    await phone.waitForFunction(()=>state.current===2 && state.peers.host===1);
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(await pc.evaluate(()=>state.current),2);
    assert.equal((await command(phone,{type:'NEXT'})).value.state.current,3);
  } finally {await closePages(phone,pc);}
});
