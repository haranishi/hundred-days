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
async function begin(page,id='1-1'){await page.goto(PATH);await page.locator('#start').click();await page.locator(`[data-level="${id}"]`).click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');}
// 自動操作で戸口まで進める。手動の時計なので実時間に依存しない。
async function autoClear(page){
 await page.evaluate(async()=>{const g=window.__day047;g.setManual(true);g.autopilot(true);
  for(let i=0;i<12000&&g.mode()==='playing';i++)g.advance(1000/120);
  g.autopilot(false);return g.mode();});
 await expect(page.locator('#clear')).toBeVisible();
}
test('読込・面選択の施錠・保存した解放の復元',async({page})=>{
 await page.goto(PATH);await expect(page.locator('h1')).toHaveText('泣ぐ子は、いねがぁ');await page.locator('#start').click();
 for(let w=1;w<=4;w++)for(let n=1;n<=5;n++){const b=page.locator(`[data-level="${w}-${n}"]`);if(w===1)await expect(b).toBeEnabled();else await expect(b).toBeDisabled();}
 await page.evaluate(()=>localStorage.setItem('namahage.v1',JSON.stringify({unlockedWorld:2,rulesVersion:2,recordsV2:{'1-5':{bestTicks:1234,bestScore:900,seals:5}},muted:false})));
 await page.reload();await page.locator('#start').click();await expect(page.locator('[data-level="2-1"]')).toBeEnabled();await expect(page.locator('[data-level="3-1"]')).toBeDisabled();
 // 面えらびに、その面のお札とベスト時間が出る。
 await expect(page.locator('[data-level="1-5"]')).toHaveAttribute('data-seals','5');
 await expect(page.locator('[data-level="1-5"] .seal-row')).toHaveText('●○●');
 await expect(page.locator('[data-level="1-5"]')).toContainText('10.3秒');
 await expect(page.locator('[data-level="1-1"] .seal-row')).toHaveText('○○○');
});
test('実キーボード入力で進み、上端1行のHUDが状態を映す',async({page})=>{
 await page.clock.install({time:new Date('2026-09-22T00:00:00Z')});await page.clock.pauseAt(new Date('2026-09-22T00:01:00Z'));await begin(page);
 await expect(page.locator('#level-label')).toHaveText('1-1');
 await expect(page.locator('#rice')).toHaveText('米 0/6');
 await expect(page.locator('#ability-text')).toHaveText('能力なし');
 await expect(page.locator('#lives')).toHaveText('残 3');
 await expect(page.locator('#seals b')).toHaveCount(3);
 await expect(page.locator('#lesson')).toBeVisible();
 const before=await page.evaluate(()=>window.__day047.snapshot().x);
 // 最初のうさぎ（列8）に触れる手前まで。餅は列4にある。
 await page.keyboard.down('ArrowRight');await page.clock.runFor(800);await page.keyboard.up('ArrowRight');
 const after=await page.evaluate(()=>window.__day047.snapshot());
 expect(after.x).toBeGreaterThan(before+40);
 expect(after.stage).toBe(1); // 開始から10タイル以内の餅で、なまはげになる
 await expect(page.locator('#form')).toHaveText('◆ なまはげ');
 await expect(page.locator('#time')).not.toHaveText('0.0秒');
});
test('1-1をクリアすると、3条件の実数と記録が出る',async({page})=>{
 await begin(page);await autoClear(page);
 await expect(page.locator('#clear-title')).toHaveText('よい年を、迎えれよ。');
 await expect(page.locator('#clear-score')).toContainText('点');
 await expect(page.locator('#clear-seals li')).toHaveCount(3);
 await expect(page.locator('#clear-seals li').nth(0)).toContainText('早駆け');
 await expect(page.locator('#clear-seals li').nth(1)).toContainText('米俵');
 await expect(page.locator('#clear-seals li').nth(2)).toContainText('被弾');
 await expect(page.locator('#clear-best')).toContainText('秒');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('namahage.v1')));
 expect(saved.rulesVersion).toBe(2);
 expect(saved.recordsV2['1-1'].bestTicks).toBeGreaterThan(0);
 expect(saved.unlockedWorld).toBe(1);
 for(const id of ['next','again','to-select'])await expect(page.locator(`#${id}`)).toBeVisible();
 await page.locator('#next').click();await expect(page.locator('#level-label')).toHaveText('1-2');
});
test('最後の面は締めの1行を出し、少し待ってから操作できる',async({page})=>{
 await page.goto(PATH);await page.evaluate(()=>window.__day047.unlockAll());
 await page.locator('#start').click();await page.locator('[data-level="4-5"]').click();
 await autoClear(page);
 await expect(page.locator('#clear-title')).toHaveText('戸口は、ここまで。');
 await expect(page.locator('#clear-note')).toContainText('訪問した戸口');
 await expect(page.locator('#clear-note')).toContainText('お札');
 await expect(page.locator('#next')).toBeHidden();
 await expect(page.locator('#to-select')).toBeEnabled({timeout:4000});
 await page.locator('#to-select').click();await expect(page.locator('#select')).toBeVisible();
});
test('下端にタッチ3ボタン・整数倍Canvas・押下と解放',async({page})=>{
 await page.setViewportSize({width:390,height:844});await begin(page);
 await expect(page.locator('#touch button')).toHaveCount(3);
 for(const b of await page.locator('#touch button').all())await expect(b).toBeVisible();
 const dimensions=await page.evaluate(()=>{const c=document.querySelector('canvas#game'),r=c.getBoundingClientRect(),touch=document.querySelector('#touch').getBoundingClientRect();return{w:r.width,h:r.height,smooth:c.getContext('2d').imageSmoothingEnabled,bottom:r.bottom,touchTop:touch.top};});
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

test('1-1は右キーを押し続けるだけで雪うさぎを踏み、面の頭の説明にその手段が書いてある',async({page})=>{
 await page.clock.install({time:new Date('2026-09-22T00:00:00Z')});await page.clock.pauseAt(new Date('2026-09-22T00:01:00Z'));await begin(page);
 await expect(page.locator('#lesson')).toContainText('進む');
 await page.keyboard.down('ArrowRight');
 await page.clock.runFor(1500); // 1.5秒＝180tick。丘を駆け下りる途中で手段の説明に入れ替わる。
 await expect(page.locator('#lesson')).toContainText('踏むとはずむ');
 await expect(page.locator('#lesson')).toContainText('上の棚');
 await page.clock.runFor(600); // 2.1秒までに踏みが成立する（実測240tick）。
 await page.keyboard.up('ArrowRight');
 const snapshot=await page.evaluate(()=>window.__day047.snapshot());
 expect(snapshot.attemptScore).toBeGreaterThanOrEqual(100); // 雪うさぎ100点ぶん
 expect(snapshot.lives).toBe(3);
});
test('戸口に着いた結果画面には、得点の浮き文字が残らない',async({page})=>{
 await begin(page);await autoClear(page);
 expect(await page.evaluate(()=>window.__day047.snapshot().pops)).toBe(0);
 await expect(page.locator('#clear-score')).toContainText('この挑戦');
});
