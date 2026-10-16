import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/day068-dialogue/walkthrough';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
const page=await context.newPage(),started=Date.now(),observations=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+new URL(r.url()).pathname);});
function note(event,data={}){const row={seconds:Math.round((Date.now()-started)/1000),event,...data};observations.push(row);console.log(JSON.stringify(row));}
async function readLine(){
 const begin=Date.now();
 await expect(page.locator('#dialogue-next')).not.toHaveText('続きを表示',{timeout:15000});
 const text=await page.locator('#dialogue-text').textContent(),speaker=await page.locator('#speaker-name').textContent();
 // Allow approximately ten Japanese characters per second, including the typewriter time.
 await page.waitForTimeout(Math.max(700,Math.min(8500,text.length*100)-(Date.now()-begin)));
 note('read',{speaker,text});
}
async function listen(question){
 for(let i=0;i<2;i++){await readLine();await page.locator('#dialogue-next').click();}
 await expect(page.locator('#dialogue-choices')).toBeVisible();
 await page.locator('[data-question="'+question+'"]').click();
 await readLine();await page.locator('#dialogue-next').click();await readLine();await page.locator('#dialogue-next').click();
 await expect(page.locator('#conversation-clue')).toBeVisible();
}
async function frameStats(target){
 return target.evaluate(()=>new Promise(resolve=>{
  const samples=[];let previous=performance.now();
  function frame(now){samples.push(now-previous);previous=now;if(samples.length<120)requestAnimationFrame(frame);else{const sorted=samples.slice(6).sort((a,b)=>a-b);resolve({fps:Number((1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length)).toFixed(1)),medianMs:Number(sorted[Math.floor(sorted.length*.5)].toFixed(1)),p95Ms:Number(sorted[Math.floor(sorted.length*.95)].toFixed(1))});}}
  requestAnimationFrame(frame);
 }));
}
await page.goto('http://127.0.0.1:5418/classic.html');
await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
await page.locator('#sound-button').click();note('sound opt-in');
const chapters=[
 {id:0,people:[['水瀬 栞','ticket'],['朝倉 透','photo'],['三好 灯','bag']],person:'朝倉 透',wrong:'coast',key:'arrival',arrival:'18:38',lines:4},
 {id:1,people:[['三好 灯','platform'],['朝倉 透','route'],['水瀬 栞','paper']],person:'三好 灯',wrong:'ridge',key:'transfer',arrival:'19:30',lines:4},
 {id:2,people:[['朝倉 透','express'],['三好 灯','book'],['水瀬 栞','grandfather']],person:'水瀬 栞',wrong:'express-time',key:'stops',arrival:'20:34',lines:5}
];
for(const chapter of chapters){
 note('chapter',{chapter:chapter.id+1});
 for(const [name,q] of chapter.people){
  await page.getByRole('button',{name:name+'の証言',exact:true}).click();await listen(q);
  await page.screenshot({path:out+'/chapter-'+(chapter.id+1)+'-'+q+'.png',fullPage:true});
 }
 await expect(page.locator('#heard-count')).toHaveText('聴取 3 / 3');
 if(chapter.id===0){
  await page.locator('#log-button').click();await expect(page.locator('#conversation-log')).toContainText('祖父');
  await page.screenshot({path:out+'/conversation-log.png'});await page.keyboard.press('Escape');note('log reopened and closed');
 }
 await page.locator('#investigate-link').click();await expect(page.locator('#panel-timetable')).toBeVisible();
 await page.locator('#train-list .follow-button').first().click();await page.waitForTimeout(2200);await page.locator('#play-button').click();
 await page.screenshot({path:out+'/chapter-'+(chapter.id+1)+'-timetable.png',fullPage:true});
 await page.getByRole('button',{name:chapter.person+'の証言',exact:true}).click();
 await page.locator('#accuse-button').click();await page.locator('[data-proof="'+chapter.wrong+'"]').click();
 await expect(page.locator('#proof-feedback')).toContainText('反証できない');note('wrong proof explained',{chapter:chapter.id+1});
 await page.screenshot({path:out+'/chapter-'+(chapter.id+1)+'-wrong.png'});await page.waitForTimeout(2600);
 await page.locator('[data-proof="'+chapter.key+'"]').click();
 for(let i=0;i<chapter.lines;i++){
  await readLine();
  if(i===1)await page.screenshot({path:out+'/chapter-'+(chapter.id+1)+'-confession.png',fullPage:true});
  await page.locator('#dialogue-next').click();
 }
 await expect(page.locator('#result-dialog')).toBeVisible();await expect(page.locator('#result-arrival')).toHaveText(chapter.arrival);
 await page.screenshot({path:out+'/chapter-'+(chapter.id+1)+'-result.png',fullPage:true});
 note('chapter solved',{chapter:chapter.id+1,arrival:chapter.arrival});
 if(chapter.id<2){await page.waitForTimeout(1500);await page.locator('#next-case').click();}
}
await expect(page.locator('#ending-ticket')).toBeVisible();await expect(page.locator('#result-closing')).toContainText('展示台へ返した');
await page.locator('#next-case').click();await page.reload();await expect(page.locator('#progress-label')).toHaveText('解決 3 / 3');note('ending and saved progress verified');
await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();await page.locator('#play-button').click();
const desktop=await frameStats(page);note('desktop rendering',{viewport:'1440x900',dpr:2,...desktop});
await context.close();
const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const mobile=await touch.newPage();mobile.on('pageerror',e=>errors.push(e.message));
await mobile.goto('http://127.0.0.1:5418/classic.html');await expect(mobile.locator('#world')).toHaveAttribute('data-ready','true');
await mobile.getByRole('button',{name:'三好 灯の証言',exact:true}).tap();await mobile.waitForTimeout(150);
await mobile.screenshot({path:out+'/mobile-speaking.png',fullPage:true});
const mobileStats=await frameStats(mobile);note('touch emulation rendering',{viewport:'390x844',dpr:2,...mobileStats});
await mobile.emulateMedia({reducedMotion:'reduce'});
await mobile.locator('#dialogue-next').tap();await mobile.locator('#dialogue-next').tap();
await expect(mobile.locator('#dialogue-choices')).toBeVisible();await mobile.locator('[data-question="bag"]').tap();await mobile.locator('#dialogue-next').tap();await mobile.locator('#dialogue-next').tap();
await mobile.locator('#investigate-link').tap();await expect(mobile.locator('#tab-timetable')).toBeFocused();await expect(mobile.locator('#panel-timetable')).toBeVisible();
await mobile.getByRole('button',{name:'朝倉 透の証言',exact:true}).tap();await mobile.locator('#accuse-button').tap();await mobile.locator('[data-proof="arrival"]').tap();await mobile.locator('#reveal-skip').tap();
await expect(mobile.locator('#result-dialog')).toBeVisible();await mobile.screenshot({path:out+'/mobile-result.png',fullPage:true});
await mobile.keyboard.press('Escape');await mobile.locator('#view-2d').tap();await expect(mobile.locator('.flat-map')).toBeVisible();note('touch questions, evidence, skipped confession, result and 2D verified');
await browser.close();
const summary={durationSeconds:Math.round((Date.now()-started)/1000),method:'Single implementer review using paced Playwright interactions; not a human or independent playtest.',desktop,touchEmulation:mobileStats,errors,observations};
await writeFile(out+'/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({finished:true,durationSeconds:summary.durationSeconds,errors,desktop,touchEmulation:mobileStats}));
if(errors.length)process.exitCode=1;
