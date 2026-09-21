import { expect,test } from '@playwright/test';
const PATH='/day-046-cat-lightspeed/',errors=new WeakMap(),external=new WeakMap();
test.beforeEach(async({page})=>{
  errors.set(page,[]);external.set(page,[]);
  page.on('pageerror',e=>errors.get(page).push(e.message));page.on('console',m=>{if(m.type()==='error')errors.get(page).push(m.text());});
  page.on('request',request=>{const u=new URL(request.url());if(['https:','http:'].includes(u.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))external.get(page).push(u.href);});
});
test.afterEach(async({page})=>{expect(errors.get(page),'コンソールエラー0件').toEqual([]);expect(external.get(page),'外部リクエスト0件').toEqual([]);});
async function ready(page){await page.goto(PATH);await expect(page.locator('#app')).toHaveAttribute('data-state','ready');await page.evaluate(()=>window.__day046.setManual(true));}
async function begin(page){await ready(page);await page.locator('#start').click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');}
const advance=(page,ms)=>page.evaluate(ms=>window.__day046.advance(ms),ms);
const snapshot=page=>page.evaluate(()=>window.__day046.snapshot());
test('開始でき、実際の3D描画がある',async({page})=>{await begin(page);const s=await snapshot(page);expect(s.speed).toBe(0);expect(s.render.calls).toBeGreaterThan(0);expect(s.render.triangles).toBeGreaterThan(0);});
test('描画領域を押し続けると速度が上がり、離すと下がる',async({page})=>{await begin(page);const box=await page.locator('#scene').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.65);await page.mouse.down();await advance(page,10000);const s=await snapshot(page);expect(s.speed).toBeGreaterThan(.5);expect(s.pressed).toBe(true);await page.mouse.up();await advance(page,1000);expect((await snapshot(page)).speed).toBeLessThan(s.speed);});
test('描画領域外の共有ボタンは操作でき、加速しない',async({page})=>{await page.addInitScript(()=>{window.copyCalls=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copyCalls.push(text)},configurable:true});});await begin(page);const copy=page.locator('.share button').filter({hasText:'コピー'});await copy.click();expect(await page.evaluate(()=>window.copyCalls.length)).toBe(1);await advance(page,1000);expect((await snapshot(page)).pressed).toBe(false);expect((await snapshot(page)).speed).toBe(0);await expect(copy).toBeVisible();});
test('Spaceで開始・長押し・自動結果・再挑戦',async({page})=>{await ready(page);await page.keyboard.down('Space');await expect(page.locator('#app')).toHaveAttribute('data-state','playing');await advance(page,100000);await expect(page.locator('#app')).toHaveAttribute('data-state','result');expect((await snapshot(page)).speed).toBeLessThan(1079252849);await expect(page.locator('#final-count')).toHaveText('20');await expect(page.locator('#final-gamma')).toHaveText('223.6');await expect(page.locator('#result-x')).toHaveAttribute('href',/x.com\/intent\/post/);await expect(page.locator('#result-copy')).toBeVisible();await page.keyboard.up('Space');await page.keyboard.press('Space');await expect(page.locator('#app')).toHaveAttribute('data-state','playing');expect((await snapshot(page)).speed).toBe(0);});
test('Enterでも開始と加速、離した後に減速',async({page})=>{await ready(page);await page.keyboard.down('Enter');await advance(page,10000);const v=(await snapshot(page)).speed;expect(v).toBeGreaterThan(0);await page.keyboard.up('Enter');await advance(page,1000);expect((await snapshot(page)).speed).toBeLessThan(v);});
test('音速の遅延表示から軌道の無音表示に変わる',async({page})=>{await begin(page);await page.keyboard.down('Space');await advance(page,32000);expect((await snapshot(page)).audio).toBe('delayed');await expect(page.locator('#sound-note')).toHaveText(/置き去り/);await advance(page,10000);expect((await snapshot(page)).audio).toBe('silent');await expect(page.locator('#sound-note')).toHaveText('真空では音が伝わらない');await page.keyboard.up('Space');});
for(const height of [844,664])test(`390×${height}で開始・プレイ・結果の操作が収まる`,async({page})=>{await page.setViewportSize({width:390,height});await ready(page);const start=await page.locator('#start').boundingBox();expect(start.y).toBeGreaterThanOrEqual(0);expect(start.y+start.height).toBeLessThanOrEqual(height);await page.keyboard.down('Space');await advance(page,80000);const box=await page.locator('#scene').boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await advance(page,20000);await page.keyboard.up('Space');await expect(page.locator('#result-screen')).toBeVisible();const result=await page.locator('#result-screen').boundingBox();expect(result.y).toBeGreaterThanOrEqual(0);expect(result.y+result.height).toBeLessThanOrEqual(height);const copy=await page.locator('#result-copy').boundingBox();expect(copy.y+copy.height).toBeLessThanOrEqual(height);const retry=await page.locator('#retry').boundingBox();expect(retry.y+retry.height).toBeLessThanOrEqual(height);await page.locator('#retry').click();const again=await page.locator('#scene').boundingBox();expect(again.y).toBeGreaterThanOrEqual(0);expect(again.y+again.height).toBeLessThanOrEqual(height);});
test('ミュート保存とベスト保存は2種類だけ',async({page})=>{await ready(page);await page.locator('#mute').click();await expect(page.locator('#mute')).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.locator('#app')).toHaveAttribute('data-state','ready');await expect(page.locator('#mute')).toHaveAttribute('aria-pressed','true');await page.evaluate(()=>window.__day046.setManual(true));await page.locator('#start').click();await page.keyboard.down('Space');await advance(page,100000);await page.keyboard.up('Space');const values=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));expect(Object.keys(values).sort()).toEqual(['day046.best.v1','day046.mute.v1']);expect(Object.keys(JSON.parse(values['day046.best.v1'])).sort()).toEqual(['date','seconds','speed']);});
test('フォーカスを失うと長押しを解除する',async({page})=>{await begin(page);await page.keyboard.down('Space');await advance(page,10000);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));expect((await snapshot(page)).pressed).toBe(false);const v=(await snapshot(page)).speed;await advance(page,1000);expect((await snapshot(page)).speed).toBeLessThan(v);await page.keyboard.up('Space');});
test('3Dモジュールが読み込めないと再読み込みを案内',async({page})=>{await page.route('**/app3d.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:'throw new Error("test import failure")'}));await page.goto(PATH);await expect(page.locator('#fatal-screen')).toBeVisible();await expect(page.locator('#reload-page')).toBeVisible();await expect(page.locator('#start-screen')).toBeHidden();});

// Exercise all six worlds plus the requested four framing checkpoints.
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:390,height:664}]){
  test(`${viewport.width}×${viewport.height}: 全世界で猫が中央に収まり、光速付近でも切れない`,async({page})=>{
    await page.setViewportSize(viewport);await begin(page);await page.keyboard.down('Space');
    const c=1079252849,transition=c*.9,transitionTime=Math.log((transition+.05)/.05)/.32;
    let elapsed=0;
    for(const speed of [0,300,1000,3000,30000,100000,300000,3000000,c*.9999]){
      const seconds=speed<transition?Math.log((speed+.05)/.05)/.32:transitionTime+Math.log((c-transition)/(c-speed))/.55;
      await advance(page,(seconds-elapsed)*1000);elapsed=seconds;
      const {catScreen:s}=await snapshot(page);
      expect(s.x).toBeGreaterThanOrEqual(.40);expect(s.x).toBeLessThanOrEqual(.60);
      expect(s.h).toBeGreaterThanOrEqual(.18);expect(s.h).toBeLessThanOrEqual(.38);
      expect(s.x-s.w/2).toBeGreaterThan(.02);expect(s.x+s.w/2).toBeLessThan(.98);
      expect(s.y-s.h/2).toBeGreaterThan(.02);expect(s.y+s.h/2).toBeLessThan(.98);
    }
    await page.keyboard.up('Space');
  });
}
