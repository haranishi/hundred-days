import {chromium,expect,type Page} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newAdventure} from '../../source/src/state';
import {apply,checkpoints,finishEpisode,travelTo} from '../../source/tests/story-fixtures';
import type {GameState} from '../../source/src/types';
const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'output/public');
const base=process.env.PROMO_BASE||'http://127.0.0.1:5480/day-080-fifth-prince/';
const route=checkpoints(),errors:string[]=[],events:unknown[]=[];
await mkdir(out,{recursive:true});await copyFile(join(here,'../../source/public/fonts/DotGothic16-Regular.ttf'),join(out,'kingdom.ttf'));
const browser=await chromium.launch({channel:'chrome',headless:true});
async function setup(state:GameState){
 const context=await browser.newContext({viewport:{width:720,height:960},deviceScaleFactor:1,locale:'ja-JP'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await expect(page.locator('#loading')).toBeHidden();
 await page.evaluate(s=>localStorage.setItem('fifth-prince.save.v1',JSON.stringify(s)),state);
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();await page.evaluate(()=>document.fonts.ready);await expect(page.locator('#toast')).toBeHidden({timeout:7000});await page.waitForTimeout(200);
 return {context,page};
}
async function read(page:Page){for(let n=0;n<35;n++){const next=page.locator('[data-next]');if(await page.locator('#modal').isHidden()||!await next.count())return;await expect(next).toBeEnabled();await next.click();}throw Error('Dialogue did not reach a choice');}
async function fight(enemy:'bramble'|'storm'){
 const state=enemy==='bramble'?travelTo(finishEpisode(route.mira,'mira'),'forest'):travelTo(route.trials,'palace');
 const shot=await setup({...state,position:enemy==='bramble'?{x:600,y:180}:{x:584,y:262}});
 await shot.page.keyboard.press('e');
 if(enemy==='bramble')await shot.page.getByRole('button',{name:'番獣に立ち向かう'}).click();
 else{await shot.page.locator('[data-choice-action="talk"]').click();await read(shot.page);await shot.page.getByRole('button',{name:'仲間と、試練に挑む'}).click();}
 await expect(shot.page.locator('.battle-v2')).toHaveClass(/visuals-ready/);await expect(shot.page.locator('.resonance-status')).not.toContainText('共鳴の加護');await expect(shot.page.locator('[data-command="resonate"]')).toHaveCount(0);await shot.page.waitForTimeout(250);return shot;
}
async function command(page:Page,name:string){if(await page.locator('#battle-finish').isVisible())return {outcome:'victory'};let button=page.locator(`[data-command="${name}"]`);if(!await button.isEnabled())button=page.locator('[data-command="attack"]');if(await button.isEnabled()){const selected=await button.getAttribute('data-command');await button.click({force:true});return {command:selected};}else throw Error('Battle was still busy at capture command');}
async function capture(page:Page,name:string,frames:number,actions:Record<number,()=>Promise<unknown>>){
 const dir=join(out,'footage',name);await mkdir(dir,{recursive:true});await page.clock.install();await page.clock.pauseAt(new Date());
 for(let frame=0;frame<frames;frame++){
  if(actions[frame]){const result=await actions[frame]();events.push({take:name,frame,seconds:frame/30,result:result??null});}
  await page.clock.runFor(1000/30);await page.screenshot({path:join(dir,String(frame).padStart(4,'0')+'.jpg'),type:'jpeg',quality:96,animations:'allow'});
 }
 console.log('Captured',name,frames,'frames');
}
try{
 let shot=await fight('bramble');await capture(shot.page,'hook',108,{0:()=>command(shot.page,'attack'),48:()=>command(shot.page,'guard'),90:()=>command(shot.page,'support')});await shot.context.close();
 const start=apply(newAdventure(),{type:'flag',flag:'intro'});
 shot=await setup({...start,position:{x:340,y:370}});
 await capture(shot.page,'market',180,{0:()=>shot.page.locator('#guide-button').click({force:true}),60:()=>shot.page.getByRole('button',{name:'仕入れ・販売をする'}).click({force:true}),105:()=>shot.page.locator('[data-buy="wheat"]').click({force:true}),150:()=>shot.page.getByRole('button',{name:'店を閉じる'}).click({force:true})});await shot.context.close();
 shot=await setup(travelTo(route.trials,'forest'));
 await capture(shot.page,'companions',180,{0:()=>shot.page.keyboard.down('ArrowRight'),80:async()=>{await shot.page.keyboard.up('ArrowRight');await shot.page.keyboard.down('ArrowDown');},106:async()=>{await shot.page.keyboard.up('ArrowDown');await shot.page.keyboard.down('ArrowRight');},160:()=>shot.page.keyboard.up('ArrowRight')});await shot.context.close();
 const family=travelTo(route.family,'town');shot=await setup({...family,position:{x:488,y:260}});await shot.page.keyboard.press('e');await shot.page.locator('[data-choice-action="story"]').click();await read(shot.page);await expect(shot.page.locator('#modal .choice-list')).toBeVisible();
 await capture(shot.page,'brothers',180,{30:()=>shot.page.keyboard.press('ArrowDown'),65:()=>shot.page.keyboard.press('ArrowUp'),95:()=>shot.page.locator('#modal .choice-list button').first().click({force:true})});await shot.context.close();
 shot=await fight('storm');await capture(shot.page,'battle',252,{0:()=>command(shot.page,'guard'),55:()=>command(shot.page,'attack'),110:()=>command(shot.page,'support'),170:()=>command(shot.page,'attack'),225:()=>command(shot.page,'guard')});await shot.context.close();
 shot=await setup({...travelTo(route.trials,'town'),position:{x:376,y:440}});
 await capture(shot.page,'outro',180,{0:()=>shot.page.keyboard.down('ArrowUp'),90:async()=>{await shot.page.keyboard.up('ArrowUp');await shot.page.keyboard.down('ArrowRight');},165:()=>shot.page.keyboard.up('ArrowRight')});await shot.context.close();
 if(errors.length)throw Error(errors.join('; '));
 await writeFile(join(here,'output/capture-report.json'),JSON.stringify({fps:30,viewport:[720,960],frames:1080,source:'production UI at normal checkpoints; no debug UI or altered combat values',events,pageErrors:errors},null,2)+'\n');
}finally{await browser.close();}
