import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/day068/complete-observation';await mkdir(out,{recursive:true});
const started=Date.now(),events=[],errors=[],b=await chromium.launch({channel:'chrome',headless:true});
const context=await b.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
p.on('pageerror',e=>errors.push(e.message));
const stamp=async(name)=>{const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('day68-story-episode1-v1')));events.push({name,seconds:Math.round((Date.now()-started)/1000),phase:s.phase,time:await p.locator('#story-clock').innerText()});console.log(name);};
const shot=async(name)=>{await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.screenshot({path:out+'/'+name+'.png',fullPage:true});};
async function read(label,{paced=true,photoAt=-1}={}){
 for(let i=0;i<50;i++){
  if(!await p.locator('#episode-dialogue').isVisible()||!await p.locator('#episode-next').isVisible())return;
  if((await p.locator('#episode-next').innerText()).includes('全文'))await p.locator('#episode-next').click();
  const text=await p.locator('#episode-text').innerText();
  events.push({label,text,seconds:Math.round((Date.now()-started)/1000),paced});
  if(paced)await p.waitForTimeout(Math.min(7000,Math.max(3500,text.length*85)));
  if(i===photoAt)await shot(label);
  await p.locator('#episode-next').click();
 }
 throw Error('story stuck');
}
async function choose(value,label,{paced=true}={}){await p.locator('[data-choice="'+value+'"]').click();await read(label,{paced});}
async function hot(id){await p.locator('[data-hotspot="'+id+'"]:visible').click();}
async function board(id,label,{paced=true}={}){await p.locator('#plan-trip').click();await p.locator('[data-trip="'+id+'"]').click();await p.locator('#trip-board').click();await read(label,{paced,photoAt:1});}
async function proof(route,label,{paced=true}={}){
 await p.locator('#present-button').click();for(const id of [route==='escort'?'toru-note':'station-log','return-table'])await p.locator('[data-proof="'+id+'"]').click();await p.locator('input[value=arrival]').check();await p.locator('#proof-submit').click();await read(label,{paced,photoAt:2});
}
try{
 await p.goto('http://127.0.0.1:5418/');await p.locator('body[data-ready=true]').waitFor();await read('01-opening',{photoAt:2});await choose('promise','promise');await p.locator('#open-message').click();await read('message-and-witness');
 await hot('camera');await p.waitForTimeout(6500);await shot('02-first-photo');await p.keyboard.press('Escape');await hot('board');await p.waitForTimeout(6500);await p.locator('#record-express').click();await p.keyboard.press('Escape');
 await p.locator('#present-button').click();for(const id of ['photo','express'])await p.locator('[data-proof="'+id+'"]').click();await p.locator('input[value=no-stop]').check();await p.locator('#proof-submit').click();await read('first-proof');await choose('ticket','trust');await hot('door');await hot('staircase');await read('reunion');await choose('warm','reunion-response');await stamp('act-one-complete');
 await p.locator('#continue-story').click();await read('03-photo-request',{photoAt:2});await shot('04-photo-decision');await choose('erase','photo-erased');await choose('station','archive-intro');await stamp('chose-station-and-erased-photo');await shot('05-station-office');
 for(const id of ['archive-ledger','archive-envelope']){await hot(id);await p.waitForTimeout(6500);await shot(id);await p.keyboard.press('Escape');}
 await hot('leave-archive');await p.locator('#plan-trip').click();await p.locator('[data-trip=R502]').click();await p.waitForTimeout(4500);await stamp('missed-departure-explained');await p.locator('[data-trip=R504]').click();await p.locator('#trip-board').click();await read('06-riding-504',{photoAt:1});
 await p.locator('#plan-trip').click();await p.locator('[data-trip=E404]').click();await p.waitForTimeout(5000);await shot('07-one-minute-transfer');await stamp('transfer-error-recovered');await p.locator('[data-trip=E405]').click();await p.locator('#trip-board').click();await read('08-riding-405-and-harbor',{photoAt:0});await stamp('arrived-via-central');
 await hot('editor');await read('09-editor-claim',{photoAt:2});await hot('harbor-board');await p.waitForTimeout(6500);await p.keyboard.press('Escape');await proof('station','10-final-proof-and-resolution');await stamp('case-resolved');
 await p.locator('input[value=tickets]').check();await shot('11-your-framing');await p.locator('#take-photo').click();await read('epilogue');await stamp('promise-kept');await shot('12-complete');await p.locator('#review-photo').click();await p.waitForTimeout(5000);await shot('13-your-photo');await p.keyboard.press('Escape');
 const first=await p.evaluate(()=>JSON.parse(localStorage.getItem('day68-story-episode1-v1')));await writeFile(out+'/station-ending.json',JSON.stringify(first,null,2));
 await p.locator('#rewind-story').click();await p.locator('#continue-story').click();await read('second-request',{paced:false});await choose('ask-photo','ask-before-keeping');await choose('keep','kept-photo',{paced:false});await choose('escort','escort-route',{paced:false});await board('R502','14-direct-carriage',{paced:false});await hot('akari');await read('15-akari',{photoAt:6});await stamp('different-witness-and-evidence');await hot('editor');await read('second-editor',{paced:false});await hot('harbor-board');await p.keyboard.press('Escape');await proof('escort','second-proof',{paced:false});await p.locator('input[value=people]').check();await p.locator('#take-photo').click();await read('second-epilogue',{paced:false});await shot('16-second-ending');await stamp('second-path-complete');
 const report={elapsedSeconds:Math.round((Date.now()-started)/1000),events,errors,firstState:first,secondState:await p.evaluate(()=>JSON.parse(localStorage.getItem('day68-story-episode1-v1')))};
 await writeFile(out+'/observation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({elapsedSeconds:report.elapsedSeconds,errors,first:first.phase,second:report.secondState.phase}));
}finally{await b.close();}
