import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {checkpoints} from '../../day-080-fifth-prince/source/tests/story-fixtures.ts';
const path='/day-080-fifth-prince/';
const route=checkpoints();
async function boot(page,state){await page.goto(path);await expect(page.locator('#loading')).toBeHidden();if(state){await page.evaluate(s=>localStorage.setItem('fifth-prince.save.v1',JSON.stringify(s)),state);await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();}}
async function ending(page){for(let i=0;i<70;i++){if(await page.locator('.ending-panel').isVisible())return;const choice=page.locator('[data-choice-action="ending-home"],[data-choice-action="ending-serve"],#ending-credits-finish');if(await choice.isVisible()){await choice.click();continue;}const next=page.locator('[data-next]');await expect(next).toBeEnabled();await next.click();}throw Error('終幕に到達しない');}
test('Day80の公開版を開始し、商いの購入を保存して再開できる',async({page,context})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});await boot(page);await page.locator('#new-game').click();await page.getByRole('button',{name:'あらすじへ',exact:true}).click();await page.locator('#opening-begin').click();await expect(page.locator('#modal')).toBeHidden();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('fifth-prince.save.v1')).gold);
 await page.locator('#guide-button').click();await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await page.locator('[data-buy="wheat"]').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fifth-prince.save.v1')).gold)).toBe(before-8);
 await page.locator('a.brand').click();await expect(page).toHaveURL(/day-080-fifth-prince\/$/);await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();await expect(page.locator('#objective-title')).toContainText('麦');
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.locator('#save-button').click();const at=await page.evaluate(()=>JSON.parse(localStorage.getItem('fifth-prince.save.v1')).position);
 const copy=page.locator('.share').getByRole('button',{name:'リンクをコピー',exact:true});await copy.focus();await page.keyboard.press('Enter');await expect(page.locator('.share__said')).toContainText('コピーしました');
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(400);await page.keyboard.up('ArrowRight');await page.locator('#save-button').click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fifth-prince.save.v1')).position)).toEqual(at);
});
test('Day80のサブパスで素材と音を読み、正式メタ情報と開発用操作口の非公開を保つ',async({page,context,baseURL})=>{
 const headers=readFileSync(new URL('../../dist/_headers',import.meta.url),'utf8'),block=headers.slice(headers.indexOf('/day-080-fifth-prince/*')).split(/\n(?=\S)/)[0];
 const csp=block.match(/Content-Security-Policy:\s*(.*)/)?.[1];expect(csp).toBeTruthy();
 await context.route('**/day-080-fifth-prince/**',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':csp}});});
 const failures=[],errors=[],media=[],external=[];page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(baseURL).origin)external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push(new URL(r.url()).pathname);if(/\.(?:ogg|wav)(?:$|\?)/.test(r.url()))media.push(new URL(r.url()).pathname);});
 await boot(page);await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content','第五王子と、名もなき加護');
 expect(await page.evaluate(()=>typeof window.__FIFTH_PRINCE__)).toBe('undefined');await page.locator('#new-game').click();await expect.poll(()=>media.length).toBeGreaterThan(0);expect(media.every(p=>p.startsWith(path))).toBe(true);expect(failures).toEqual([]);expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('Day80の本番版でも終章途中の再開から帰還・配膳・終幕へ進む',async({page})=>{
 test.setTimeout(60000);await boot(page,route.ended);await expect(page.locator('.dialogue-top')).toContainText('終章 1/4');await page.locator('[data-next]').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();await expect(page.locator('.dialogue-top')).toContainText('終章 1/4');await ending(page);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fifth-prince.save.v1')));expect(saved.flags).toContain('ending:seen');expect(saved.zone).toBe('town');expect(saved.battle).toBeNull();await page.locator('#epilogue').click();await expect(page.locator('#modal')).toBeHidden();
});
test('320pxの公開版で終章の選択と終幕が収まり、旧記録も使える',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:320,height:740});await page.emulateMedia({reducedMotion:'reduce'});await boot(page,{...route.ended,flags:route.ended.flags.filter(f=>!f.startsWith('story:'))});await ending(page);await expect(page.locator('.ending-panel')).toContainText('本編クリア');
 const box=await page.locator('#epilogue').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(740);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
