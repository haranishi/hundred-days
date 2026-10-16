import {test,expect} from '@playwright/test';
const key='day68-story-episode1-v1';
test.beforeEach(async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});});
async function enter(page){await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');}
async function lines(page){
 for(let i=0;i<25;i++){
  if(!await page.locator('#episode-dialogue').isVisible()||!await page.locator('#episode-next').isVisible())return;
  await page.locator('#episode-next').click();
 }
 throw Error('Dialogue did not reach a choice or exploration');
}
async function choose(page,id){await page.locator('[data-choice="'+id+'"]').click();await lines(page);}
async function begin(page,choice='promise'){
 await enter(page);await lines(page);await choose(page,choice);await page.locator('#open-message').click();await lines(page);
 await expect(page.locator('#objective')).toContainText('カメラ');
}
async function hot(page,id){await page.locator('[data-hotspot="'+id+'"]:visible').click();}
async function collect(page,boardFirst=false){
 const photo=async()=>{await hot(page,'camera');await expect(page.locator('#evidence-title')).toHaveText('カメラの最後の写真');await page.keyboard.press('Escape');};
 const board=async()=>{await hot(page,'board');await page.locator('#record-express').click();await page.keyboard.press('Escape');};
 if(boardFirst){await board();await photo();}else{await photo();await board();}
}
async function prove(page,trust='ticket'){
 await page.locator('#present-button').click();for(const id of ['photo','express'])await page.locator('[data-proof="'+id+'"]').click();
 await page.locator('input[value="no-stop"]').check();await page.locator('#proof-submit').click();await lines(page);await choose(page,trust);
 await expect(page.locator('#evidence-key')).toBeVisible();
}
async function stateOf(page){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);}
test('opening scene, original artwork and dialogue appear without runtime errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await enter(page);
 await expect(page.locator('h1')).toContainText('時刻表アリバイ');
 expect(await page.locator('#scene-background').evaluate(i=>i.complete&&i.naturalWidth>1000)).toBe(true);
 await page.locator('#episode-next').click();await expect(page.locator('#episode-speaker')).toHaveText('朝倉 透');
 await expect(page.locator('#episode-actor')).toBeVisible();expect(errors).toEqual([]);
});
test('complete episode: records overturn lie, witness gives key, new area opens, partner is found',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await begin(page);await collect(page);await prove(page);
 await expect(page.locator('#relationship')).toContainText('鍵');
 await hot(page,'door');await expect(page.locator('#scene-background')).toHaveAttribute('src',/platform-night/);
 await hot(page,'ticket');await expect(page.locator('#evidence-body')).toContainText('裂け目が合う');await page.keyboard.press('Escape');
 await hot(page,'staircase');await lines(page);await choose(page,'warm');
 await expect(page.locator('#ending-card')).toBeVisible();await expect(page.locator('#evidence-reunion')).toBeVisible();expect((await stateOf(page)).phase).toBe('ending');expect(errors).toEqual([]);
});
test('wrong evidence and wrong reason preserve progress and allow correction',async({page})=>{
 await begin(page);await collect(page);await page.locator('#present-button').click();
 for(const id of ['ticket','message'])await page.locator('[data-proof="'+id+'"]').click();await page.locator('input[value="no-stop"]').check();await page.locator('#proof-submit').click();
 await expect(page.locator('#proof-feedback')).toContainText('行き先が違う');expect((await stateOf(page)).phase).toBe('investigate');
 for(const id of ['ticket','message','photo','express'])await page.locator('[data-proof="'+id+'"]').click();
 await page.locator('input[value="last-train"]').check();await page.locator('#proof-submit').click();await expect(page.locator('#proof-feedback')).toContainText('急行は23:15');
 await page.locator('input[value="no-stop"]').check();await page.locator('#proof-submit').click();await lines(page);await choose(page,'concern');await expect(page.locator('#evidence-key')).toBeVisible();
});
test('free exploration supports board first and locked door never skips proof',async({page})=>{
 await begin(page);await hot(page,'door');await lines(page);await expect(page.locator('#scene-location')).toContainText('待合室');await expect(page.locator('#evidence-key')).toHaveCount(0);
 await collect(page,true);await prove(page);await hot(page,'door');await hot(page,'staircase');await lines(page);await choose(page,'urgent');await expect(page.locator('#ending-card')).toBeVisible();await expect(page.locator('#evidence-fragment')).toHaveCount(0);
});
test('evidence dialog returns keyboard focus to the re-rendered source hotspot',async({page})=>{
 await begin(page);await hot(page,'camera');await page.keyboard.press('Escape');await expect(page.locator('[data-hotspot="camera"]:visible')).toBeFocused();
 await page.locator('#evidence-photo').click();await page.keyboard.press('Escape');await expect(page.locator('#evidence-photo')).toBeFocused();
 await page.locator('#help-button').click();await page.keyboard.press('Escape');await expect(page.locator('#help-button')).toBeFocused();
});
test('reload resumes confrontation, key, platform and ending without losing choices',async({page})=>{
 await begin(page,'tease');await collect(page);await page.locator('#present-button').click();for(const id of ['photo','express'])await page.locator('[data-proof="'+id+'"]').click();await page.locator('input[value="no-stop"]').check();await page.locator('#proof-submit').click();
 await page.reload();await lines(page);await choose(page,'concern');await expect(page.locator('#evidence-key')).toBeVisible();await page.reload();await expect(page.locator('#evidence-key')).toBeVisible();
 await hot(page,'door');await page.reload();await expect(page.locator('#scene-location')).toContainText('閉鎖ホーム');await hot(page,'staircase');await lines(page);await choose(page,'urgent');await page.reload();await expect(page.locator('#ending-card')).toBeVisible();
 const s=await stateOf(page);expect(s.openingChoice).toBe('tease');expect(s.trustChoice).toBe('concern');expect(s.reunionChoice).toBe('urgent');expect(new Set(s.log.map(l=>l.id+'|'+l.text)).size).toBe(s.log.length);
});
test('notebook and sound persist, restart preserves old game progress',async({page})=>{
 await begin(page);await page.evaluate(()=>localStorage.setItem('timetable-alibi-v1','legacy-keep'));await page.locator('#sound-button').click();await page.locator('#notebook-button').click();await expect(page.locator('#episode-log-list')).toContainText('23:15');await page.keyboard.press('Escape');
 await page.reload();await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed','true');await page.locator('#restart-button').click();await page.locator('#restart-confirm').click();await expect(page.locator('#episode-speaker')).toHaveText('捜査の記録');expect((await stateOf(page)).phase).toBe('prologue');expect(await page.evaluate(()=>localStorage.getItem('timetable-alibi-v1'))).toBe('legacy-keep');
});
test('blocked storage still permits completing the episode',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('blocked');};Storage.prototype.setItem=function(){throw Error('blocked');};});
 await begin(page);await expect(page.locator('#storage-label')).toContainText('保存できません');await collect(page);await prove(page);await hot(page,'door');await hot(page,'staircase');await lines(page);await choose(page,'warm');await expect(page.locator('#ending-card')).toBeVisible();
});
test('route reconstruction uses same schedule and cannot advance the story clock',async({page})=>{
 await begin(page);await hot(page,'board');await page.locator('#rail-map-tab').click();await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
 await expect(page.locator('.station-marker')).toHaveCount(5);await page.locator('#view-2d').click();await expect(page.locator('.flat-map')).toBeVisible();await page.locator('#time-range').focus();await page.keyboard.press('End');await expect(page.locator('#clock')).toHaveText('23:59');await expect(page.locator('#story-clock')).toHaveText('23:18');await page.keyboard.press('Escape');
});
test('WebGL unavailable falls back to playable map and station investigation',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};});
 await begin(page);await hot(page,'board');await page.locator('#rail-map-tab').click();await expect(page.locator('#world')).toHaveAttribute('data-renderer','svg');await expect(page.locator('.flat-map')).toBeVisible();await page.getByRole('button',{name:'霧山駅を調べる',exact:true}).click();await expect(page.locator('#station-caption')).toContainText('23:14');await page.keyboard.press('Escape');await hot(page,'camera');await expect(page.locator('#evidence-title')).toContainText('写真');
});
test('keyboard enters dialogue and choices; reduced motion presents full line immediately',async({page})=>{
 await enter(page);await page.locator('#episode-next').focus();await page.keyboard.press('Enter');await expect(page.locator('#episode-text')).toContainText('8時40分');await expect(page.locator('#episode-stage')).toHaveAttribute('data-speaking','false');await lines(page);await expect(page.locator('[data-choice="promise"]')).toBeFocused();await page.keyboard.press('Enter');await lines(page);await expect(page.locator('#open-message')).toBeFocused();
});
test('share options provide X, LINE and link copying',async({page})=>{
 await enter(page);await page.locator('#share-button').click();await expect(page.locator('#share-dialog')).toBeVisible();await expect(page.locator('#share a[href*="x.com/intent"]')).toBeVisible();await expect(page.locator('#share a[href*="line.me"]')).toBeVisible();await expect(page.locator('#share').getByRole('button',{name:/コピー/})).toBeVisible();
});
for(const width of [390,768,1440])test('responsive scene and investigation fit '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});await begin(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const b=page.locator('[data-hotspot="camera"]:visible'),box=await b.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);await b.click();await expect(page.locator('#evidence-dialog')).toBeVisible();expect(await page.locator('#evidence-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.keyboard.press('Escape');
 await collect(page);await page.locator('#present-button').click();expect(await page.locator('#proof-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#present-button')).toBeFocused();
});

test('witness footage appears during the claim and both optional questions return to exploration',async({page})=>{
 await enter(page);await lines(page);await choose(page,'promise');await page.locator('#open-message').click();
 for(let i=0;i<7;i++)await page.locator('#episode-next').click();
 await expect(page.locator('#scene-inset')).toBeVisible();await expect(page.locator('#episode-text')).toContainText('港の記録映像');await lines(page);await expect(page.locator('#scene-inset')).not.toBeVisible();
 for(const id of ['about-toru','why-locked']){await page.locator('#witness-button').click();await lines(page);await choose(page,id);await expect(page.locator('[data-hotspot="camera"]:visible')).toBeVisible();}
 const s=await stateOf(page);expect(s.asked).toEqual(['about-toru','why-locked']);expect(s.phase).toBe('investigate');
});
