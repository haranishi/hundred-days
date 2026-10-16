import {chromium} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {newEpisode,advanceEpisode} from '../../lib/episode-state.js';
import {actOne,continuationSeed} from '../../tests/story-fixtures.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const publicDir=join(here,'output/public');
const base=process.env.PROMO_BASE||'http://127.0.0.1:5418/';
const origin=new URL(base).origin;
const key='day68-story-episode1-v1';
const FPS=30,FRAMES=144;
const errors=[],events=[];
await mkdir(publicDir,{recursive:true});
for(const name of ['episode/concourse-night.webp','episode/platform-night.webp','complete/harbor-platform.webp','complete/train-car-night.webp','complete/station-office.webp','toru-expressions.webp','shiori-expressions.webp']){
 await copyFile(resolve(here,'../../assets',name),join(publicDir,name.replaceAll('/','-')));
}
const font=process.env.PROMO_FONT||join(homedir(),'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
await copyFile(font,join(publicDir,'zen-bold.ttf'));
const browser=await chromium.launch({channel:'chrome',headless:true});
async function setup(state){
 const context=await browser.newContext({viewport:{width:540,height:760},deviceScaleFactor:2,locale:'ja-JP',reducedMotion:'reduce'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.addInitScript(({state,key})=>localStorage.setItem(key,JSON.stringify(state)),{state,key});
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('body[data-ready=true]').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 return {page,context};
}
async function read(page){
 for(let i=0;i<50;i++){
  if(!await page.locator('#episode-dialogue').isVisible()||!await page.locator('#episode-next').isVisible())return;
  await page.locator('#episode-next').click();
 }
 throw Error('Dialogue did not reach a choice');
}
async function capture(page,name,actions){
 const dir=join(publicDir,name);await mkdir(dir,{recursive:true});
 await page.clock.install();
 await page.clock.pauseAt(new Date());
 for(let frame=0;frame<FRAMES;frame++){
  if(actions[frame]){
   await actions[frame]();events.push({take:name,frame,seconds:Number((frame/FPS).toFixed(3))});
  }
  await page.clock.runFor(1000/FPS);
  await page.screenshot({path:join(dir,String(frame).padStart(4,'0')+'.jpg'),type:'jpeg',quality:96,animations:'allow'});
 }
 console.log('Captured',name,FRAMES,'frames');
}
try{
 let investigate=newEpisode();
 for(const e of [{type:'opening-choice',value:'promise'},{type:'begin'},{type:'read-message'},{type:'heard-witness'}])investigate=advanceEpisode(investigate,e);
 let {page,context}=await setup(investigate);
 await page.locator('[data-hotspot=camera]:visible').waitFor();
 await capture(page,'investigate',{
  0:()=>page.locator('[data-hotspot=camera]:visible').scrollIntoViewIfNeeded(),
  36:()=>page.locator('[data-hotspot=camera]:visible').click()
 });
 if(!await page.locator('#evidence-dialog').isVisible())throw Error('Photo was not opened');
 await context.close();
 ({page,context}=await setup(actOne()));
 await page.locator('#continue-story').click();await read(page);
 await page.locator('[data-choice=erase]').waitFor();
 await page.locator('#episode-choices').scrollIntoViewIfNeeded();
 await capture(page,'choice',{
  38:()=>page.locator('[data-choice=erase]').hover(),
  84:()=>page.locator('[data-choice=keep]').hover()
 });
 const labels=await page.locator('#episode-choices').innerText();
 if(!labels.includes('消す')||!labels.includes('残す'))throw Error('Photo choice missing');
 await context.close();
 ({page,context}=await setup(continuationSeed('keep','escort')));
 await read(page);
 await page.locator('#plan-trip').scrollIntoViewIfNeeded();
 await capture(page,'journey',{
  24:()=>page.locator('#plan-trip').click(),
  75:()=>page.locator('[data-trip=R502]').click()
 });
 if(!await page.locator('#trip-board').isEnabled())throw Error('Valid train did not become boardable');
 const train=await page.locator('#trip-preview').innerText();
 events.push({take:'journey',verifiedTrain:train});
 await context.close();
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(join(here,'output/capture-report.json'),JSON.stringify({fps:FPS,framesPerTake:FRAMES,resolution:[1080,1520],events,errors},null,2)+'\n');
}finally{await browser.close();}
