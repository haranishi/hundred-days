import { test,expect } from '@playwright/test';
const PATH='/day-047-namahage-night/';
const errors=new WeakMap(),external=new WeakMap();
test.beforeEach(async({page})=>{
 errors.set(page,[]);external.set(page,[]);
 page.on('pageerror',e=>errors.get(page).push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.get(page).push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))external.get(page).push(u.href);});
});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);expect(external.get(page)).toEqual([]);});
async function begin(page){await page.goto(PATH);await page.locator('#start').click();await page.locator('[data-level="1-1"]').click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');}
test('読込・面選択の施錠・保存した解放の復元',async({page})=>{
 await page.goto(PATH);await expect(page.locator('h1')).toHaveText('泣ぐ子は、いねがぁ');await page.locator('#start').click();
 for(let w=1;w<=4;w++)for(let n=1;n<=5;n++){const b=page.locator(`[data-level="${w}-${n}"]`);if(w===1)await expect(b).toBeEnabled();else await expect(b).toBeDisabled();}
 await page.evaluate(()=>localStorage.setItem('namahage.v1',JSON.stringify({unlockedWorld:2,bestMs:{'1-5':12345},muted:false})));
 await page.reload();await page.locator('#start').click();await expect(page.locator('[data-level="2-1"]')).toBeEnabled();await expect(page.locator('[data-level="3-1"]')).toBeDisabled();
});
test('実キーボード入力と固定更新で1-1をクリア',async({page})=>{
 await page.clock.install({time:new Date('2026-09-22T00:00:00Z')});await page.clock.pauseAt(new Date('2026-09-22T00:01:00Z'));await begin(page);
 await page.keyboard.down('ArrowRight');
 for(let i=0;i<14;i++){
   if(await page.locator('#app').getAttribute('data-state')==='clear')break;
   await page.keyboard.down('Space');await page.clock.runFor(600);await page.keyboard.up('Space');await page.clock.runFor(32);
 }
 await page.keyboard.up('ArrowRight');await expect(page.locator('#clear')).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('namahage.v1')));expect(saved.bestMs['1-1']).toBeGreaterThan(0);expect(saved.unlockedWorld).toBe(1);
 await page.locator('#next').click();await expect(page.locator('#level-label')).toHaveText('1-2');
});
test('下端にタッチ3ボタン・整数倍Canvas・押下と解放',async({page})=>{
 await page.setViewportSize({width:390,height:844});await begin(page);
 await expect(page.locator('#touch button')).toHaveCount(3);
 for(const b of await page.locator('#touch button').all())await expect(b).toBeVisible();
 const dimensions=await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),touch=document.querySelector('#touch').getBoundingClientRect();return{w:r.width,h:r.height,smooth:c.getContext('2d').imageSmoothingEnabled,bottom:r.bottom,touchTop:touch.top};});
 expect(dimensions.w%320).toBe(0);expect(dimensions.h%192).toBe(0);expect(dimensions.smooth).toBe(false);expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.touchTop);
 const right=await page.locator('[data-input="right"]').boundingBox();await page.mouse.move(right.x+right.width/2,right.y+right.height/2);await page.mouse.down();await page.mouse.up();
 await page.keyboard.press('Escape');await expect(page.locator('#select')).toBeVisible();
});
test('音設定の保存と壊れた保存の回復',async({page})=>{
 await page.goto(PATH);await page.locator('#mute').click();await page.reload();await expect(page.locator('#mute')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>localStorage.setItem('namahage.v1','{broken'));await page.reload();await page.locator('#start').click();await expect(page.locator('[data-level="1-1"]')).toBeEnabled();await expect(page.locator('[data-level="2-1"]')).toBeDisabled();
});
test('共通共有欄とビルドで注入されるOGP',async({page})=>{
 await page.goto(PATH);await expect(page.locator('#share .share')).toHaveCount(1);await expect(page.locator('#share .share__button').first()).toBeVisible();
 await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',/泣ぐ子は、いねがぁ/);
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content',/^https?:\/\//);
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',/\/day-047-namahage-night\//);
});
