import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {actOne,continuationSeed} from '../tests/story-fixtures.mjs';
import {advanceEpisode as step} from '../lib/episode-state.js';
const out='test-results/day068/complete-ui-final';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
const evolve=(s,events)=>events.reduce((s,e)=>step(s,e),s);
const harbor=()=>evolve(continuationSeed('keep','escort'),[{type:'board-train',trainId:'R502'},{type:'arrive'},{type:'heard-harbor'}]);
const camera=()=>evolve(harbor(),[{type:'heard-akari'},{type:'heard-editor'},{type:'record-return-table'},{type:'present-final',selected:['toru-note','return-table'],reason:'arrival'},{type:'resolve'}]);
async function ready(p){await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>[...document.images].filter(i=>i.getClientRects().length).every(i=>i.complete));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function scene(width,state,fn){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'}),p=await context.newPage();
 await p.addInitScript(s=>localStorage.setItem('day68-story-episode1-v1',JSON.stringify(s)),state);
 await p.goto('http://127.0.0.1:5418/');await p.locator('body[data-ready=true]').waitFor();
 await fn(p);await context.close();
}
async function shot(p,name){await ready(p);await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await p.screenshot({path:out+'/'+name+'.png',fullPage:true});}
async function read(p){for(let i=0;i<50&&await p.locator('#episode-dialogue').isVisible()&&await p.locator('#episode-next').isVisible();i++)await p.locator('#episode-next').click();}
try{
 for(const width of [390,768,1440]){
  await scene(width,continuationSeed('erase','station'),async p=>{
   await shot(p,'archive-'+width);
   checks.push({width,overflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),hotspots:await p.locator('[data-hotspot]:visible').evaluateAll(bs=>bs.map(b=>({text:b.innerText,height:b.getBoundingClientRect().height})))});
   await p.locator('[data-hotspot=archive-ledger]:visible').click();await expect(p.locator('#evidence-body')).toContainText('23:16');await shot(p,'ledger-'+width);await p.keyboard.press('Escape');
   await p.locator('[data-hotspot=archive-envelope]:visible').click();await p.keyboard.press('Escape');await p.locator('[data-hotspot=leave-archive]:visible').click();
   await p.locator('#plan-trip').click();await p.locator('[data-trip=R502]').click();await shot(p,'missed-'+width);
  });
  await scene(width,harbor(),async p=>{
   await p.locator('[data-hotspot=editor]:visible').click();await p.locator('#episode-next').click();await p.locator('#episode-next').click();await shot(p,'editor-'+width);
   if(width===1440){await ready(p);await p.screenshot({path:out+'/representative.png'});}
  });
  await scene(width,camera(),async p=>{
   await read(p);await shot(p,'camera-'+width);await p.locator('input[value=tickets]').check();await shot(p,'tickets-'+width);
   await p.locator('#take-photo').click();await read(p);await p.locator('#review-photo').click();await shot(p,'saved-'+width);
  });
  console.log('Reviewed '+width+'px');
 }
 await scene(1440,actOne(),async p=>{
  await p.locator('#continue-story').click();const lines=[];
  for(let i=0;i<30&&await p.locator('#episode-next').isVisible();i++){lines.push(await p.locator('#episode-text').innerText());await p.locator('#episode-next').click();}
  expect(lines.join(' ')).toContain('23:10');checks.push({timeline:{phoneBeforeMessage:true,entryBeforeFirstInterview:'23:16 < 23:18'},requestLines:lines});
 });
 await writeFile(out+'/review.json',JSON.stringify({checks},null,2));
 await copyFile(out+'/representative.png','day-068-timetable-alibi/og.png');
}finally{await browser.close();}
