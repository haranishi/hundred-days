import {test,expect} from '@playwright/test';
import {actOne,continuationSeed} from './story-fixtures.mjs';
const key='day68-story-episode1-v1';
test.beforeEach(async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});});
async function read(page){
 for(let i=0;i<50;i++){
  if(!await page.locator('#episode-dialogue').isVisible()||!await page.locator('#episode-next').isVisible())return;
  await page.locator('#episode-next').click();
 }
 throw Error('Story did not reach an action');
}
async function choose(page,value){await page.locator('[data-choice="'+value+'"]').click();await read(page);}
async function hot(page,id){await page.locator('[data-hotspot="'+id+'"]:visible').click();}
async function saved(page){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);}
async function seed(page,s=actOne()){
 await page.addInitScript(({key,s})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{key,s});await page.goto('./');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
}
async function firstAct(page){
 await page.goto('./');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await read(page);await choose(page,'promise');await page.locator('#open-message').click();await read(page);await hot(page,'camera');await page.keyboard.press('Escape');await hot(page,'board');await page.locator('#record-express').click();await page.keyboard.press('Escape');
 await page.locator('#present-button').click();for(const id of ['photo','express'])await page.locator('[data-proof="'+id+'"]').click();await page.locator('input[value=no-stop]').check();await page.locator('#proof-submit').click();await read(page);await choose(page,'ticket');await hot(page,'door');await hot(page,'staircase');await read(page);await choose(page,'warm');await expect(page.locator('#continue-story')).toBeVisible();
}
async function branch(page,photo,route){
 await page.locator('#continue-story').click();await read(page);await choose(page,photo);await choose(page,route);
 if(route==='station'){for(const id of ['archive-ledger','archive-envelope']){await hot(page,id);await page.keyboard.press('Escape');}await hot(page,'leave-archive');}
}
async function board(page,id){await page.locator('#plan-trip').click();await page.locator('[data-trip="'+id+'"]').click();await page.locator('#trip-board').click();await read(page);}
async function port(page,route,{transfer=false}={}){
 await board(page,route==='station'||transfer?'R504':'R502');
 if(route==='station'||transfer)await board(page,'E405');
 await expect(page.locator('#scene-location')).toContainText('灯台港');
 if(route==='escort'){await hot(page,'akari');await read(page);}
 await hot(page,'editor');await read(page);await hot(page,'harbor-board');await page.keyboard.press('Escape');
}
async function solve(page,route){
 await page.locator('#present-button').click();
 for(const id of [route==='escort'?'toru-note':'station-log','return-table'])await page.locator('[data-proof="'+id+'"]').click();
 await page.locator('input[value=arrival]').check();await page.locator('#proof-submit').click();await expect(page.locator('#episode-speaker')).toBeInViewport();await expect(page.locator('#episode-next')).toBeInViewport();await read(page);await expect(page.locator('#camera-controls')).toBeVisible();
}
async function snap(page,framing='people'){await page.locator('input[name=framing][value="'+framing+'"]').check();await page.locator('#take-photo').click();await read(page);await expect(page.locator('#story-complete')).toBeVisible();}
for(const photo of ['erase','keep'])for(const route of ['escort','station'])test('full story '+photo+' / '+route+': real branch, transport, final proof and photograph',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await firstAct(page);await branch(page,photo,route);await expect(page.locator('#evidence-photo')).toHaveCount(photo==='keep'?1:0);await expect(page.locator('#evidence-photo-memory')).toHaveCount(photo==='erase'?1:0);
 await port(page,route);await expect(page.locator('#evidence-'+(route==='escort'?'toru-note':'station-log'))).toBeVisible();await expect(page.locator('#evidence-'+(route==='escort'?'station-log':'toru-note'))).toHaveCount(0);
 await solve(page,route);await snap(page,photo==='erase'?'tickets':'people');await expect(page.locator('#complete-postscript')).toContainText('撮影・三好 灯');await expect(page.locator('#decision-record')).toContainText(route==='escort'?'透と港':'栞と駅務室');expect((await saved(page)).phase).toBe('complete');expect(errors).toEqual([]);
 await page.locator('#review-photo').click();await expect(page.locator('.saved-photo')).toBeVisible();await expect(page.locator('.saved-tickets')).toHaveCount(photo==='erase'?1:0);await page.keyboard.press('Escape');await expect(page.locator('#review-photo')).toBeFocused();
});
test('later investigation misses 502; one-minute change is recoverable without losing time',async({page})=>{
 await seed(page);await branch(page,'erase','station');const before=await saved(page);
 await page.locator('#plan-trip').click();await page.locator('[data-trip=R502]').click();await expect(page.locator('#trip-feedback')).toContainText('前に出て');await expect(page.locator('#trip-board')).toBeDisabled();expect(await saved(page)).toEqual(before);
 await page.locator('[data-trip=R504]').click();await page.locator('#trip-board').click();await read(page);await expect(page.locator('#story-clock')).toHaveText('23:37');
 await page.locator('#plan-trip').click();await page.locator('[data-trip=E404]').click();await expect(page.locator('#trip-feedback')).toContainText('1分');await expect(page.locator('#trip-board')).toBeDisabled();await page.locator('#trip-reselect').click();await expect(page.locator('[data-trip=E404]')).toBeFocused();
 await page.locator('[data-trip=E405]').click();await page.locator('#trip-board').click();await read(page);await expect(page.locator('#story-clock')).toHaveText('23:46');
});
test('escort may choose the later valid connection, while passing express and wrong destination are explained',async({page})=>{
 await seed(page);await branch(page,'keep','escort');await page.locator('#plan-trip').click();
 await page.locator('[data-trip=EX1]').click();await expect(page.locator('#trip-feedback')).toContainText('停まりません');await page.locator('[data-trip=M501]').click();await expect(page.locator('#trip-feedback')).toContainText('温泉');
 await page.keyboard.press('Escape');await port(page,'escort',{transfer:true});await solve(page,'escort');await snap(page);expect((await saved(page)).journey.map(l=>l.trainId)).toEqual(['R504','E405']);
});
test('final accusation rejects wrong records and wrong reason before accepting owned evidence',async({page})=>{
 await seed(page);await branch(page,'erase','escort');await port(page,'escort');await page.locator('#present-button').click();await expect(page.locator('[data-proof=photo]')).toHaveCount(0);
 for(const id of ['photo-memory','return-table'])await page.locator('[data-proof="'+id+'"]').click();await page.locator('input[value=arrival]').check();await page.locator('#proof-submit').click();await expect(page.locator('#proof-feedback')).toContainText('行動とどう関係');expect((await saved(page)).phase).toBe('harbor');
 await page.locator('[data-proof=photo-memory]').click();await page.locator('[data-proof=toru-note]').click();await page.locator('input[value=transfer]').check();await page.locator('#proof-submit').click();await expect(page.locator('#proof-feedback')).toContainText('乗換えも不要');
 await page.locator('input[value=arrival]').check();await page.locator('#proof-submit').click();await read(page);await snap(page);
});
test('save resumes archive, riding, Central and camera without duplicating a leg or restoring erased photo',async({page})=>{
 await seed(page);await branch(page,'erase','station');await page.locator('#plan-trip').click();await page.locator('[data-trip=R504]').click();await page.locator('#trip-board').click();await page.reload();await read(page);await expect(page.locator('#story-clock')).toHaveText('23:37');expect((await saved(page)).journey).toHaveLength(1);
 await page.reload();await expect(page.locator('#plan-trip')).toBeVisible();await board(page,'E405');await hot(page,'editor');await read(page);await hot(page,'harbor-board');await page.keyboard.press('Escape');await solve(page,'station');await page.locator('input[value=tickets]').check();await page.reload();await read(page);await expect(page.locator('input[value=tickets]')).toBeChecked();await expect(page.locator('#evidence-photo')).toHaveCount(0);await snap(page,'tickets');await page.reload();await expect(page.locator('#story-complete')).toBeVisible();expect((await saved(page)).journey).toHaveLength(2);
});
test('legacy act-one completion migrates and keeps old classic progress',async({page})=>{
 const legacy={...actOne(),version:1};for(const k of ['photoChoice','route','journey','activeLeg','finalProof','solvedFinal','framing'])delete legacy[k];
 await seed(page,legacy);await page.evaluate(()=>localStorage.setItem('timetable-alibi-v1','classic-progress'));await page.locator('#continue-story').click();await read(page);await choose(page,'ask-photo');await expect(page.locator('[data-choice=erase]')).toBeVisible();await choose(page,'keep');await choose(page,'escort');expect(await page.evaluate(()=>localStorage.getItem('timetable-alibi-v1'))).toBe('classic-progress');
});
test('camera keeps its controls when sound is toggled and rewinding resets only the continuation',async({page})=>{
 await seed(page);await branch(page,'keep','escort');await port(page,'escort');await solve(page,'escort');await page.locator('#sound-button').click();await expect(page.locator('#take-photo')).toBeVisible();await snap(page);await page.locator('#rewind-story').click();await expect(page.locator('#continue-story')).toBeVisible();await expect(page.locator('#evidence-key')).toBeVisible();await expect(page.locator('#evidence-last-photo')).toHaveCount(0);expect((await saved(page)).route).toBe(null);
});
test('blocked storage can still finish the whole story',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('blocked');};Storage.prototype.setItem=function(){throw Error('blocked');};});
 await firstAct(page);await branch(page,'erase','station');await port(page,'station');await solve(page,'station');await snap(page,'tickets');await expect(page.locator('#storage-label')).toContainText('保存できません');
});
test('2D fallback route inspection leaves story time unchanged and still allows a complete journey',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};});
 await seed(page,continuationSeed('keep','escort'));await page.locator('#plan-trip').click();await page.locator('#trip-map').click();await page.locator('#rail-map-tab').click();await expect(page.locator('#world')).toHaveAttribute('data-renderer','svg');await page.locator('#time-range').focus();await page.keyboard.press('End');await expect(page.locator('#story-clock')).toHaveText('23:21');await page.keyboard.press('Escape');await expect(page.locator('#plan-trip')).toBeFocused();await port(page,'escort');await solve(page,'escort');await snap(page);
});
for(const width of [390,768,1440])test('new investigation, trip and camera fit '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page);await branch(page,'keep','station');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#plan-trip').click();expect(await page.locator('#trip-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);expect((await page.locator('[data-trip=R504]').boundingBox()).height).toBeGreaterThanOrEqual(44);await page.keyboard.press('Escape');await expect(page.locator('#plan-trip')).toBeFocused();
 await port(page,'station');await solve(page,'station');await expect(page.locator('#camera-controls')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('input[value=tickets]').check();await snap(page,'tickets');await page.locator('#review-photo').click();expect(await page.locator('#evidence-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
});
test('keyboard can choose a train and the shutter, with reduced motion and focus restoration',async({page})=>{
 await seed(page,continuationSeed('keep','escort'));await page.locator('#plan-trip').focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');await expect(page.locator('[data-trip=R502]')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#trip-board')).toBeEnabled();await page.keyboard.press('Escape');await expect(page.locator('#plan-trip')).toBeFocused();await port(page,'escort');await solve(page,'escort');await page.locator('#take-photo').focus();await page.keyboard.press('Enter');await read(page);await expect(page.locator('#story-complete')).toBeVisible();expect(await page.locator('#capture-flash').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
});
