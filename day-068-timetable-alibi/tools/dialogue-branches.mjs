import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/day068-dialogue/branches';await mkdir(out,{recursive:true});
const started=Date.now(),events=[],errors=[];
const browser=await chromium.launch({channel:'chrome'});
const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.addInitScript(()=>{
 window.__day68Draws=0;
 for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
  const original=WebGL2RenderingContext.prototype[name];
  WebGL2RenderingContext.prototype[name]=function(...args){window.__day68Draws++;return original.apply(this,args);};
 }
});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5418/classic.html');await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
async function read(){
 const start=Date.now();await expect(page.locator('#dialogue-next')).not.toHaveText('続きを表示',{timeout:10000});
 const text=await page.locator('#dialogue-text').textContent();
 await page.waitForTimeout(Math.max(600,Math.min(9000,text.length*125)-(Date.now()-start)));
 return text;
}
for(const [chapter,people] of [
 [0,[['水瀬 栞','route'],['朝倉 透','transfer'],['三好 灯','route']]],
 [1,[['三好 灯','envelope'],['朝倉 透','why'],['水瀬 栞','train']]],
 [2,[['朝倉 透','photo'],['三好 灯','route'],['水瀬 栞','window']]]
]){
 await page.locator('[data-case="'+chapter+'"]').click();
 for(const [name,question] of people){
  await page.getByRole('button',{name:name+'の証言',exact:true}).click();
  // Previously read opening and testimony can be completed without waiting.
  for(let i=0;i<4;i++)await page.locator('#dialogue-next').click();
  await expect(page.locator('#dialogue-choices')).toBeVisible();
  await page.locator('[data-question="'+question+'"]').click();await read();await page.locator('#dialogue-next').click();
  const answer=await read();await page.locator('#dialogue-next').click();
  const memo=await page.locator('#conversation-clue').textContent();
  events.push({chapter:chapter+1,name,question,answer,memo});
  console.log(JSON.stringify(events.at(-1)));
 }
}
await page.emulateMedia({reducedMotion:'reduce'});
for(const [width,height] of [[1440,900],[768,1024],[390,844]]){
 await page.setViewportSize({width,height});await page.locator('[data-case="0"]').click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(200);
 await page.screenshot({path:out+'/final-'+width+'.png',fullPage:true});
 await page.screenshot({path:out+'/viewport-'+width+'.png'});
 const bounds=await page.locator('#conversation').boundingBox();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 events.push({screen:width,stageBounds:bounds});
}
await page.setViewportSize({width:1440,height:900});await page.locator('[data-case="0"]').click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
await page.screenshot({path:'test-results/day068-dialogue/screenshot.png'});
async function benchmark(target){
 await target.locator('#play-button').click();await target.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 return target.evaluate(()=>new Promise(resolve=>{
  const begin=performance.now(),intervals=[];let previousDraws=window.__day68Draws,lastDraw=begin,ticks=0;
  function sample(now){
   ticks++;const draws=window.__day68Draws;
   if(draws>previousDraws){intervals.push(now-lastDraw);lastDraw=now;}
   previousDraws=draws;
   if(now-begin<6000){requestAnimationFrame(sample);return;}
   const sorted=intervals.slice(2).sort((a,b)=>a-b);
   resolve({renderedFrames:intervals.length,durationMs:Math.round(now-begin),renderedFps:Number((intervals.length/(now-begin)*1000).toFixed(1)),medianRenderMs:Number(sorted[Math.floor(sorted.length*.5)]?.toFixed(1)),p95RenderMs:Number(sorted[Math.floor(sorted.length*.95)]?.toFixed(1)),rafTicks:ticks,cssWidth:innerWidth,cssHeight:innerHeight,devicePixelRatio});
  }
  requestAnimationFrame(sample);
 }));
}
await page.setViewportSize({width:1440,height:900});
await page.emulateMedia({reducedMotion:'no-preference'});
await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
const desktop=await benchmark(page);console.log(JSON.stringify({benchmark:'desktop, moving trains and dialogue',...desktop}));
await page.close();
const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
await touch.addInitScript(()=>{
 window.__day68Draws=0;
 for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
  const original=WebGL2RenderingContext.prototype[name];
  WebGL2RenderingContext.prototype[name]=function(...args){window.__day68Draws++;return original.apply(this,args);};
 }
});
const mobile=await touch.newPage();await mobile.goto('http://127.0.0.1:5418/classic.html');await expect(mobile.locator('#world')).toHaveAttribute('data-ready','true');
const mobilePerformance=await benchmark(mobile);console.log(JSON.stringify({benchmark:'touch emulation, moving trains and dialogue',...mobilePerformance}));
await browser.close();
const summary={durationSeconds:Math.round((Date.now()-started)/1000),method:'Paced UI walkthrough for remaining nine question branches, final viewport inspection, and rendered WebGL frames while playing.',events,desktop,touchEmulation:mobilePerformance,errors};
await writeFile(out+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({finished:true,durationSeconds:summary.durationSeconds,errors}));
if(errors.length)process.exitCode=1;
