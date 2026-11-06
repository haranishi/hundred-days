import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from 'miniflare';
import {chromium,expect} from '@playwright/test';import {APP_PATH} from './policy.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),evidence=join(root,'.cache/day084-powerpoint-ui');
const config=JSON.parse(await readFile(join(here,'wrangler.jsonc'),'utf8'));
const mf=new Miniflare(convertV4MiniflareOptions({name:'day084-powerpoint-ui',modulesRoot:here,
 modules:['worker.mjs','policy.mjs','office-assets.mjs'].map(file=>({type:'ESModule',path:join(here,file)})),compatibilityDate:'2026-11-01',
 durableObjects:{ROOMS:{className:'PresentationRoom',useSQLite:true}},ratelimits:{CREATE_LIMIT:{namespace_id:'840084',simple:{limit:6,period:60}}},
 assets:{directory:resolve(here,config.assets.directory),binding:'ASSETS',run_worker_first:config.assets.run_worker_first,routerConfig:{has_user_worker:true}},log:new Log(LogLevel.NONE)}));
let browser;const errors=[],csp=[],steps=[],phoneAssets=[];let stage='boot';const step=name=>{stage=name;steps.push(name);};
try{
 await mkdir(evidence,{recursive:true});const base=(await mf.ready).origin+APP_PATH+'/';
 browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:'chrome'})});
 const hc=await browser.newContext({viewport:{width:1440,height:1000},permissions:['local-fonts']});
 const pc=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 for(const context of [hc,pc]){await context.exposeBinding('reportCsp',(_,v)=>csp.push(v));await context.addInitScript(()=>addEventListener('securitypolicyviolation',e=>window.reportCsp(e.effectiveDirective)));}
 const host=await hc.newPage(),phone=await pc.newPage();for(const page of [host,phone])page.on('pageerror',e=>errors.push(e.message));
 phone.on('request',r=>{if(/\/(office|vendor\/office)\//.test(new URL(r.url()).pathname))phoneAssets.push(new URL(r.url()).pathname);});
 await host.goto(base);await host.waitForFunction(()=>browserApi?.session.connected);
 step('public-file-selection');assert.match(await host.locator('#filePicker').getAttribute('accept'),/pptx/);
 assert.match(await host.locator('#filePicker').getAttribute('accept'),/ppt/);
 const remoteUrl=await host.evaluate(()=>browserApi.remoteUrl);await phone.goto(remoteUrl);await phone.waitForFunction(()=>browserApi?.session.connected&&snapshot.peers.host===1);
 step('loading-and-ui-cancel');let release;const gate=new Promise(r=>release=r);
 await host.route('**/vendor/office/manifest.json',async r=>{await gate;try{await r.continue();}catch{}});
 await host.locator('#filePicker').setInputFiles(join(here,'test-fixtures/japanese-presentation.pptx'));
 await expect(host.locator('#importProgress')).toBeVisible();await expect(host.locator('#importStage')).toContainText('エンジン');
 await host.locator('#importCancel').click();release();await host.unroute('**/vendor/office/manifest.json');
 await expect(host.locator('#importProgress')).not.toBeVisible();await expect(host.locator('#footerCounter')).toHaveText('1 / 5');
 step('pptx-preview-adopt');
 await host.locator('#filePicker').setInputFiles(join(here,'test-fixtures/japanese-presentation.pptx'));
 await expect(host.locator('#conversionPreview')).toBeVisible({timeout:60000});await expect(host.locator('#acceptPreview')).toBeEnabled({timeout:20000});
 assert.equal(await host.locator('#previewPages img').count(),3);
 await host.locator('#acceptPreview').click();await expect(host.locator('#footerCounter')).toHaveText('1 / 3');await expect(phone.locator('#remoteSlide')).toHaveText('1 / 3');
 await expect(host.locator('dialog[open]')).toHaveCount(0);assert.equal(await host.locator('iframe').count(),0);
 await phone.locator('#btnNext').click();await expect(host.locator('#footerCounter')).toHaveText('2 / 3');
 step('explicit-pc-fonts');await host.locator('#pdfHelp summary').click();
 if(await host.locator('#localFontsButton').isVisible()){await host.locator('#localFontsButton').click();await expect(host.locator('#localFontStatus')).toContainText(/フォント|書体/);await expect(host.locator('#localFontsButton')).toBeEnabled();}
 step('legacy-ppt-replacement');await host.locator('#filePicker').setInputFiles(join(here,'test-fixtures/japanese-presentation.ppt'));
 await expect(host.locator('#conversionPreview')).toBeVisible({timeout:60000});await expect(host.locator('#acceptPreview')).toBeEnabled({timeout:20000});
 await host.locator('#acceptPreview').click();await expect(host.locator('#footerCounter')).toHaveText('1 / 3');await expect(phone.locator('#remoteSlide')).toHaveText('1 / 3');
 await expect(host.locator('dialog[open]')).toHaveCount(0);assert.equal(phoneAssets.length,0,'phone must not download the engine');
 step('responsive-controls');for(const width of [390,768,1440]){await host.setViewportSize({width,height:1000});assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await host.addStyleTag({content:'#qrBadge,#qrBadge *,#roomCodeText{visibility:hidden!important;opacity:0!important}'});await host.bringToFront();await host.evaluate(()=>scrollTo(0,0));await host.waitForTimeout(250);await host.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await host.screenshot({path:join(evidence,'powerpoint-ui.png')});
 step('end');await host.locator('[data-action="endSession"]').first().click();await expect(host.locator('#slideHeading')).toHaveText('接続を終了しました');
 assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
 await writeFile(join(evidence,'result.json'),JSON.stringify({status:'PASS',steps,errors,csp,phoneEngineRequests:phoneAssets.length},null,2));console.log(JSON.stringify({status:'PASS',steps,errors,csp,phoneEngineRequests:0}));
}catch(error){console.error('FAIL '+stage+': '+error.message.replace(/https?:\/\/[^\s]+/g,'<url>').replace(/credential\.[A-Za-z0-9_-]+/g,'credential.<redacted>'));process.exitCode=1;}finally{await browser?.close();await mf.dispose();}
