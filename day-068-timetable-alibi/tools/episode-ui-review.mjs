import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.env.DAY68_QUICK?'test-results/day068/episode-ui-final':'test-results/day068/episode-ui';await mkdir(dir,{recursive:true});const started=Date.now(),checks=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
async function untilChoice(page,read=false){
 for(let i=0;i<20;i++){
  if(!await page.locator('#episode-dialogue').isVisible()||!await page.locator('#episode-next').isVisible())return;
  if(read){await page.waitForTimeout(4800);checks.push(await page.locator('#episode-text').innerText());}
  await page.locator('#episode-next').click();
 }
 throw Error('Dialogue stuck');
}
async function ready(p){await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
try{
 for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'}),p=await context.newPage();await p.goto('http://127.0.0.1:5418/');await p.locator('body[data-ready=true]').waitFor();
  await p.locator('#episode-next').click();await p.locator('#episode-next').click();await ready(p);await p.screenshot({path:dir+'/promise-'+width+'.png',fullPage:true});if(width===1440)await p.screenshot({path:dir+'/representative.png'});
  await untilChoice(p);await p.locator('[data-choice=promise]').click();await untilChoice(p);await p.locator('#open-message').click();
  for(let i=0;i<7;i++)await p.locator('#episode-next').click();await ready(p);await p.screenshot({path:dir+'/witness-film-'+width+'.png',fullPage:true});await untilChoice(p);await ready(p);await p.screenshot({path:dir+'/explore-'+width+'.png',fullPage:true});
  checks.push({width,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),buttons:await p.locator('[data-hotspot]:visible').evaluateAll(bs=>bs.map(b=>({text:b.innerText,height:b.getBoundingClientRect().height})))});
  if(width===1440&&!process.env.DAY68_QUICK){
   await p.locator('#evidence-footage').click();await ready(p);await p.screenshot({path:dir+'/harbor-record.png'});await p.waitForTimeout(12000);await p.keyboard.press('Escape');
   for(const id of ['about-toru','why-locked']){
    await p.locator('#witness-button').click();await untilChoice(p,true);await p.locator('[data-choice="'+id+'"]').click();await untilChoice(p,true);
   }
   await p.locator('[data-hotspot=camera]:visible').click();await p.waitForTimeout(10000);await p.keyboard.press('Escape');
   await p.locator('[data-hotspot=board]:visible').click();await p.waitForTimeout(8000);await p.locator('#record-express').click();await p.keyboard.press('Escape');await p.locator('#present-button').click();await p.waitForTimeout(7000);await ready(p);await p.screenshot({path:dir+'/proof.png'});await p.keyboard.press('Escape');
  }
  await context.close();console.log('captured '+width);
 }
 await writeFile(dir+'/review.json',JSON.stringify({elapsedSeconds:Math.round((Date.now()-started)/1000),checks},null,2));console.log('visual review complete');
}finally{await browser.close();}
