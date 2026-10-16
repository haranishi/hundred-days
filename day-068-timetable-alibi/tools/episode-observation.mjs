import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5418',dir='test-results/day068/episode-observation';
await mkdir(dir,{recursive:true});const started=Date.now(),events=[],errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
const note=async(name)=>{events.push({name,seconds:Math.round((Date.now()-started)/1000),location:await page.locator('#scene-location').innerText(),goal:await page.locator('#objective').innerText()});console.log(name);};
const shot=async(name)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});};
async function readLines(label){
 for(let i=0;i<30;i++){
  if(!await page.locator('#episode-dialogue').isVisible()||!await page.locator('#episode-next').isVisible())return;
  if((await page.locator('#episode-next').innerText()).includes('全文'))await page.locator('#episode-next').click();
  const text=await page.locator('#episode-text').innerText();events.push({line:text,seconds:Math.round((Date.now()-started)/1000)});
  await page.waitForTimeout(Math.min(9500,Math.max(5500,text.length*110)));
  if(label==='opening'&&i===2)await shot('01-promise');
  if(label==='confrontation'&&i===2)await shot('05-shiori-reacts');
  await page.locator('#episode-next').click();
 }
 throw Error('Dialogue stuck');
}
async function choice(id){await page.locator('[data-choice="'+id+'"]').click();await readLines(id);}
const hot=async(id)=>page.locator('[data-hotspot="'+id+'"]:visible').click();
try{
 await page.goto(base);await page.locator('body[data-ready=true]').waitFor();await readLines('opening');await choice('promise');await note('promise-made');
 await page.waitForTimeout(4000);await page.locator('#open-message').click();await readLines('witness');await note('investigation-start');await shot('02-investigation');
 await hot('door');await readLines('locked-door');
 await hot('camera');await page.waitForTimeout(10000);await shot('03-camera-record');await page.keyboard.press('Escape');
 await hot('board');await page.waitForTimeout(12000);await page.locator('#record-express').click();await page.locator('#rail-map-tab').click();await page.locator('#world[data-ready=true]').waitFor();await page.waitForTimeout(7000);await shot('04-railway');await page.keyboard.press('Escape');
 await page.locator('#present-button').click();for(const id of ['ticket','message'])await page.locator('[data-proof="'+id+'"]').click();await page.locator('input[value="no-stop"]').check();await page.locator('#proof-submit').click();await page.waitForTimeout(6500);await note('wrong-proof-recovered');
 for(const id of ['ticket','message','photo','express'])await page.locator('[data-proof="'+id+'"]').click();await page.waitForTimeout(6000);await page.locator('#proof-submit').click();await readLines('confrontation');await choice('ticket');await note('key-received');await shot('06-unlocked');
 await page.waitForTimeout(5000);await hot('door');await note('new-area-opened');await shot('07-closed-platform');
 await hot('ticket');await page.waitForTimeout(7500);await page.keyboard.press('Escape');await hot('staircase');await readLines('reunion');await choice('warm');await note('reunion-and-ending');await shot('08-ending');
 await page.waitForTimeout(4500);
 const record={elapsedSeconds:Math.round((Date.now()-started)/1000),events,errors,state:await page.evaluate(()=>JSON.parse(localStorage.getItem('day68-story-episode1-v1')))};
 await writeFile(dir+'/observation.json',JSON.stringify(record,null,2));console.log(JSON.stringify({elapsedSeconds:record.elapsedSeconds,errors,phase:record.state.phase}));
}finally{await browser.close();}
