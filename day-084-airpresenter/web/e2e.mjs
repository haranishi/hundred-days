import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {APP_PATH,SECURITY_HEADERS} from './policy.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const evidence=join(root,'.cache/day084-browser-e2e');
const deployment=JSON.parse(await readFile(join(here,'wrangler.jsonc'),'utf8'));
const assetsDirectory=resolve(here,deployment.assets.directory);
assert.equal(deployment.assets.base_path,undefined,'production must not require an account-gated base_path');
await mkdir(evidence,{recursive:true});
const mf=new Miniflare(convertV4MiniflareOptions({
 name:'day084-ui-test',modulesRoot:here,
 modules:['worker.mjs','policy.mjs'].map(name=>({type:'ESModule',path:join(here,name)})),
 compatibilityDate:'2026-11-01',
 durableObjects:{ROOMS:{className:'PresentationRoom',useSQLite:true}},
 ratelimits:{CREATE_LIMIT:{namespace_id:'840084',simple:{limit:6,period:60}}},
 assets:{directory:assetsDirectory,binding:deployment.assets.binding,
  run_worker_first:deployment.assets.run_worker_first,routerConfig:{has_user_worker:true}},
 log:new Log(LogLevel.NONE)
}));
let browser,stage='boot';
const errors=[],frames=[],steps=[],csp=[];
const step=name=>{stage=name;steps.push(name);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 const address=await mf.ready,base=address.origin+APP_PATH+'/';
 browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:'chrome'})});
 const hostContext=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const remoteContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const host=await hostContext.newPage(),phone=await remoteContext.newPage();
 await hostContext.exposeBinding('reportCsp',(_,value)=>csp.push(value));
 await hostContext.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.reportCsp({directive:event.effectiveDirective,blocked:event.blockedURI}))); 
 for(const page of [host,phone]){
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>socket.on('framesent',event=>frames.push(String(event.payload))));
 }
 const capture=async(width)=>{
   await host.bringToFront();
   await host.evaluate(()=>scrollTo(0,0));
   await host.locator('#qrImg').evaluate(img=>{img.style.visibility='hidden';});
   await host.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await host.evaluate(()=>['body','main','#mainHeader','#hostTools','#qrBadge','#qrImg','#blackoutOverlay','#dropOverlay','#importProgress','#conversionPreview','#fullscreenHud'].map(selector=>{const e=document.querySelector(selector),s=getComputedStyle(e),r=e.getBoundingClientRect();return {selector,display:s.display,position:s.position,bg:s.backgroundColor,opacity:s.opacity,z:s.zIndex,hidden:e.hidden,open:e.open,rect:{x:r.x,y:r.y,w:r.width,h:r.height}}}));
   await writeFile(join(evidence,'layout-'+width+'.json'),JSON.stringify(layout,null,2));
   await host.screenshot({path:join(evidence,'viewport-'+width+'.png')});
   await host.screenshot({path:join(evidence,'screen-'+width+'.png'),fullPage:true});
 };
 step('browser-entry');
 const response=await host.goto(base,{waitUntil:'networkidle'});
 assert.equal(response.status(),200);
 await expect(host.locator('#filePicker')).toHaveCount(1,{timeout:1500});
 await expect(host.locator('#choosePdf')).toBeVisible();
 assert.ok(!await host.locator('a#download').count(),'the primary interface opens documents instead of downloading the app');
 for(const [name,value] of Object.entries(SECURITY_HEADERS))assert.equal(response.headers()[name.toLowerCase()],value,name+' must come from the package root _headers');
 step('prefix-and-private-assets');
 for(const path of ['source/server.js','web/worker.mjs','tests/distribution.test.mjs','tools/package.py'])assert.equal((await hostContext.request.get(base+path)).status(),404,path);
 assert.equal((await hostContext.request.get(address.origin+'/100days/day-085-warikan/')).status(),404,'other Days are not in this asset collection');
 assert.equal((await hostContext.request.get(address.origin+'/app.js')).status(),404,'assets must exist only at the public prefix');
 if(process.argv.includes('--entry')){console.log('Browser entry PASS');}
 else if(process.argv.includes('--visual')) {
  await expect(host.locator('#connectionStatus')).toHaveAttribute('data-connected','true',{timeout:12000});
  await host.locator('#filePicker').setInputFiles(join(here,'test-fixtures/japanese-presentation.pdf'));
  await expect(host.locator('#conversionPreview')).toBeVisible({timeout:20000});
  await host.locator('#acceptPreview').click();
  await expect(host.locator('dialog[open]')).toHaveCount(0);
  for(const width of [390,768,1440]){await host.setViewportSize({width,height:width===390?844:1000});await capture(width);}
  console.log('Visual capture PASS');
 } else {
  await expect(host.locator('#connectionStatus')).toHaveAttribute('data-connected','true',{timeout:12000});
  const remoteUrl=await host.locator('#qrBadge').getAttribute('data-remote-url');
  assert.ok(remoteUrl&&new URL(remoteUrl).hash.includes('key='),'a capability QR is available');
  await phone.goto(remoteUrl,{waitUntil:'networkidle'});
  await expect(phone.locator('#connectionStatus')).toHaveAttribute('data-connected','true',{timeout:12000});
  step('qr-keyboard-copy');
  await host.locator('#qrBadge').focus();
  await host.keyboard.press('Space');
  await expect(host.locator('#toastText')).toContainText('接続用リンクをコピー');
  assert.equal(await host.evaluate(()=>navigator.clipboard.readText()),remoteUrl);
  await expect(host.locator('#footerCounter')).toHaveText('1 / 5');
  await host.locator('#qrBadge').evaluate(element=>element.blur());
  step('native-disclosure-keyboard');
  await host.locator('summary').focus();
  await host.keyboard.press('Space');
  await expect(host.locator('details').first()).toHaveAttribute('open','');
  await expect(host.locator('#footerCounter')).toHaveText('1 / 5');
  await host.keyboard.press('Space');
  await expect(host.locator('details').first()).not.toHaveAttribute('open');
  await expect(host.locator('#footerCounter')).toHaveText('1 / 5');
  await host.locator('summary').evaluate(element=>element.blur());
  await host.keyboard.press('Space');
  await expect(host.locator('#footerCounter')).toHaveText('2 / 5');
  await host.keyboard.press('ArrowLeft');
  await expect(host.locator('#footerCounter')).toHaveText('1 / 5');
  step('sample-navigation');
  await phone.locator('#btnNext').click();
  await expect(host.locator('#footerCounter')).toHaveText('2 / 5');
  await phone.locator('#btnPrev').click();
  await expect(host.locator('#footerCounter')).toHaveText('1 / 5');
  step('pdf-preview-adopt');
  const fixture=join(here,'test-fixtures/japanese-presentation.pdf');
  await host.locator('#filePicker').setInputFiles(fixture);
  await expect(host.locator('#conversionPreview')).toBeVisible({timeout:20000});
  await expect(host.locator('#previewPages figure')).toHaveCount(3);
  await host.locator('#acceptPreview').click();
  await expect(host.locator('dialog[open]')).toHaveCount(0);
  await expect(host.locator('#slideImgView')).toBeVisible();
  await expect(phone.locator('#remoteSlide')).toHaveText('1 / 3');
  await expect.poll(()=>host.locator('#slideImgView').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  step('notes-and-private-wire');
  const note='伝える要点を確認して、顔を上げる。';
  await host.locator('#noteEditor').fill(note);
  await host.locator('#saveNote').click();
  await expect(phone.locator('#speakerNote')).toHaveText(note);
  assert.ok(frames.length>0);
  assert.ok(frames.every(value=>!value.includes(note)&&!value.includes('伝えるプレゼンテーション')),'note and document text do not appear in WS plaintext');
  step('input-shortcuts');
  await host.locator('#noteEditor').press('ArrowRight');
  await expect(host.locator('#footerCounter')).toHaveText('1 / 3');
  await phone.locator('#btnNext').click();
  await expect(host.locator('#footerCounter')).toHaveText('2 / 3');
  step('blackout-pointer-clock');
  const blackout=phone.locator('.utility-bar .btn-blackout').first();
  await blackout.click();await expect(host.locator('#blackoutOverlay')).toHaveClass(/active/);
  await blackout.click();await expect(host.locator('#blackoutOverlay')).not.toHaveClass(/active/);
  const point=await phone.locator('#laserBtn').boundingBox();
  await phone.mouse.move(point.x+point.width/2,point.y+point.height/2);
  await phone.mouse.down();await expect(host.locator('#laserDot')).toHaveClass(/active/);
  await phone.mouse.move(point.x+point.width/2+25,point.y+point.height/2+15);
  await phone.mouse.up();await expect(host.locator('#laserDot')).not.toHaveClass(/active/);
  await phone.locator('#timerToggle').click();
  await expect(phone.locator('#timerToggle')).toHaveText('一時停止');
  await expect(phone.locator('#remoteTimer')).not.toHaveText('00:00',{timeout:5000});
  await phone.locator('#timerToggle').click();
  await expect(phone.locator('#timerToggle')).toHaveText('タイマー開始');
  const paused=await phone.locator('#remoteTimer').innerText();await wait(400);
  assert.equal(await phone.locator('#remoteTimer').innerText(),paused);
  step('disconnect-and-resync');
  await remoteContext.setOffline(true);
  await expect(phone.locator('#btnNext')).toBeDisabled({timeout:7000});
  await phone.locator('#btnNext').evaluate(button=>button.click());
  await remoteContext.setOffline(false);
  await expect(phone.locator('#connectionStatus')).toHaveAttribute('data-connected','true',{timeout:15000});
  await expect(host.locator('#footerCounter')).toHaveText('2 / 3');
  await phone.locator('#btnNext').click();await expect(host.locator('#footerCounter')).toHaveText('3 / 3');
  step('replacement-cancel-failure-retry');
  await host.locator('#filePicker').setInputFiles(fixture);
  await expect(host.locator('#conversionPreview')).toBeVisible({timeout:20000});
  await host.locator('#discardPreview').click();
  await expect(host.locator('dialog[open]')).toHaveCount(0);
  await expect(host.locator('#footerCounter')).toHaveText('3 / 3');
  await host.locator('#filePicker').setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-invalid')});
  await expect(host.locator('#importProgress')).toBeVisible();
  await expect(host.locator('#importRetry')).toBeVisible({timeout:15000});
  await expect(host.locator('#footerCounter')).toHaveText('3 / 3');
  await host.locator('#importHide').click();
  await host.locator('#filePicker').setInputFiles(fixture);
  await expect(host.locator('#conversionPreview')).toBeVisible({timeout:20000});
  await host.locator('#acceptPreview').click();
  await expect(host.locator('dialog[open]')).toHaveCount(0);
  await expect(host.locator('#footerCounter')).toHaveText('1 / 3');
  await expect(host.locator('#dropOverlay')).toBeHidden();
  step('responsive-and-public-share');
  for(const width of [390,768,1440]){
   await host.setViewportSize({width,height:width===390?844:1000});await wait(100);
   assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const selector of ['#choosePdf','#endSession','#saveNote','.remote-extras button','summary']){
    for(const box of await host.locator(selector).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))))assert.ok(box.w>=44&&box.h>=44,selector+' must offer a 44px target');
   }
   await capture(width);
  }
  await host.locator('.share button').filter({hasText:'リンクをコピー'}).click();
  assert.equal(await host.evaluate(()=>navigator.clipboard.readText()),'https://rairakku.com/100days/day-084-airpresenter/');
  step('native-fullscreen');
  await host.locator('#mainHeader [data-action="toggleFullscreen"]').click();
  await expect.poll(()=>host.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
  await host.keyboard.press('Escape');
  await expect.poll(()=>host.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
  await host.locator('#slideStage').dblclick();
  await expect.poll(()=>host.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
  await host.keyboard.press('Escape');
  await expect.poll(()=>host.evaluate(()=>Boolean(document.fullscreenElement))).toBe(false);
  assert.deepEqual(csp,[],'the app and double-click handler must satisfy the actual production CSP');
  step('end-and-clear');
  await host.locator('#endSession').click();
  await expect(host.locator('#restartSession')).toBeVisible();
  await expect(host.locator('#slideImgView')).toBeHidden();
  await expect(phone.locator('#speakerNote')).not.toContainText(note);
  await expect(phone.locator('#btnNext')).toBeDisabled();
  assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({steps,status:'PASS',pageErrors:errors,cspViolations:csp,wsFrames:frames.length},null,2));
  console.log(JSON.stringify({status:'PASS',steps,pageErrors:errors,cspViolations:csp,wsFrames:frames.length}));
 }
} catch(error){
 const message=String(error.message).split('\n')[0].replace(/#[^\s]+/g,'#<redacted>').replace(/credential\.[A-Za-z0-9_-]+/g,'credential.<redacted>');
 console.error('FAIL '+stage+': '+message);process.exitCode=1;
} finally {await browser?.close();await mf.dispose();}
