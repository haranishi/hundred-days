import {test,expect,type Page} from '@playwright/test';
import {OPENING} from '../src/opening-script';
import {finishOpening} from './helpers';
const start=async(page:Page)=>{await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.locator('#new-game').click();};
test('序章が危機・儀式・決断・依頼をつなぎ、仕入れから配達へ進む',async({page})=>{
 const errors:string[]=[],paintings:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/art\/.*\.webp/.test(r.url()))paintings.push(r.url());});await start(page);
 const seen:string[]=[];
 for(let i=0;i<OPENING.length;i++){
  await expect(page.locator('#opening-host')).toHaveAttribute('data-beat',OPENING[i].id);await expect(page.locator('#opening-text')).toContainText(OPENING[i].text);seen.push(OPENING[i].id);
  await page.locator('[data-opening="next"]').click();await expect(page.locator('#opening-host')).toHaveAttribute('data-line-ready','true');
  if([0,2,5,10].includes(i))await page.screenshot({path:`artifacts/v3-opening-${i}.png`,fullPage:true});
  await page.locator('[data-opening="next"]').click();
 }
 await expect(page.locator('.opening-recap')).toBeVisible();await expect(page.locator('.opening-recap')).toContainText('第五王子リュカ');await expect(page.locator('.opening-recap')).toContainText('8G');await page.screenshot({path:'artifacts/v3-opening-recap.png'});
 await page.locator('#opening-begin').click();await expect(page.locator('#modal')).toBeHidden();await expect(page.locator('#objective-title')).toContainText('仕入れ');await page.locator('#guide-button').click();await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await expect(page.locator('.shop-panel')).toContainText('ノラの依頼');await expect(page.locator('.shop-summary')).not.toContainText('24');
 await page.locator('[data-buy="wheat"]').click();await expect(page.locator('#objective-title')).toContainText('ノラ');await expect(page.locator('#objective-title')).not.toContainText('仕入れ');await page.locator('#shop-to-nora').click();await expect(page.locator('#modal')).toContainText('黄金麦を1つ');await page.getByRole('button',{name:'黄金麦を1つ渡す'}).click();
 for(let i=0;i<3;i++){const next=page.locator('[data-next]');if(await next.isVisible())await next.click();}
 await expect.poll(async()=>page.evaluate(()=>window.__FIFTH_PRINCE__().state.party.includes('nora'))).toBe(true);expect(seen).toEqual(OPENING.map(x=>x.id));expect(errors).toEqual([]);expect(paintings).toEqual([]);
});
test('前の文・キーボード・あらすじと、再生時の保存保護',async({page})=>{
 await start(page);await page.keyboard.press('e');await page.keyboard.press('e');await expect(page.locator('#opening-host')).toHaveAttribute('data-beat',OPENING[1].id);await page.keyboard.press('ArrowLeft');await expect(page.locator('#opening-host')).toHaveAttribute('data-beat',OPENING[0].id);await page.keyboard.press('Escape');await page.locator('#opening-begin').click();
 await page.locator('#guide-button').click();await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await page.locator('[data-buy="wheat"]').click();await page.locator('[data-close]').click();await page.locator('#journal-button').click();await page.locator('#return-title').click();
 const original=await page.evaluate(()=>localStorage.getItem('fifth-prince.save.v1'));await page.locator('#opening-replay').click();await expect(page.locator('.opening-panel')).toBeVisible();await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');await page.reload();await expect(page.locator('#loading')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('fifth-prince.save.v1'))).toBe(original);
 await page.locator('#opening-replay').click();await page.getByRole('button',{name:'あらすじへ',exact:true}).click();await page.locator('#opening-begin').click();await expect(page.locator('#title-screen')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('fifth-prince.save.v1'))).toBe(original);await page.locator('#continue').click();expect(await page.evaluate(()=>window.__FIFTH_PRINCE__().state.inventory.wheat)).toBe(1);expect(await page.evaluate(()=>window.__FIFTH_PRINCE__().state.gold)).toBe(52);
});
test('スマホで儀式・本文・操作が収まり、動きを減らしても開始できる',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:390,height:844}});const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});await start(page);await page.screenshot({path:'artifacts/v3-opening-mobile.png'});
 for(let i=0;i<3;i++)await page.locator('[data-opening="next"]').tap();await expect(page.locator('#opening-host')).toHaveAttribute('data-beat',OPENING[3].id);await page.screenshot({path:'artifacts/v3-ritual-mobile.png'});
 for(const size of [{width:320,height:740},{width:768,height:1024}]){await page.setViewportSize(size);await page.screenshot({path:`artifacts/v3-opening-${size.width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await page.locator('[data-opening="next"]').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);expect(box!.height).toBeGreaterThanOrEqual(44);}
 await page.setViewportSize({width:320,height:740});for(let i=3;i<10;i++)await page.locator('[data-opening="next"]').tap();await expect(page.locator('#opening-host')).toHaveAttribute('data-beat','nora.request');const long=await page.locator('[data-opening="next"]').boundingBox();expect(long!.y+long!.height).toBeLessThanOrEqual(740);await page.screenshot({path:'artifacts/v3-long-dialogue-320.png'});
 await finishOpening(page);await expect(page.locator('#objective-title')).toContainText('黄金麦');await context.close();
});

test('タイトルの新規確認と序章中断で既存のプレイ時間と進行を保存し直さない',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();const fixture={version:1,zone:'town',position:{x:376,y:368},gold:52,xp:0,trust:0,profit:0,inventory:{wheat:1,herb:0,crystal:0,potion:3},flags:['intro'],party:[],brothers:[],weapon:false,battle:null,playSeconds:3600};
 await page.evaluate(state=>localStorage.setItem('fifth-prince.save.v1',JSON.stringify(state)),fixture);await page.reload();await expect(page.locator('#loading')).toBeHidden();const original=await page.evaluate(()=>localStorage.getItem('fifth-prince.save.v1'));
 await page.locator('#new-game').click();await expect(page.locator('#modal')).toContainText('新しい冒険');await page.reload();await expect(page.locator('#loading')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('fifth-prince.save.v1'))).toBe(original);
 await page.locator('#new-game').click();await page.getByRole('button',{name:/^新しくはじめる/}).click();await expect(page.locator('.opening-panel')).toBeVisible();await page.reload();await expect(page.locator('#loading')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('fifth-prince.save.v1'))).toBe(original);await page.locator('#continue').click();expect(await page.evaluate(()=>window.__FIFTH_PRINCE__().state.playSeconds)).toBe(3600);expect(await page.evaluate(()=>window.__FIFTH_PRINCE__().state.inventory.wheat)).toBe(1);
});
