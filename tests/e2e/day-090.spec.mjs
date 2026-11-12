import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const path = '/day-090-cpr-beat/';
const errors = new WeakMap(), external = new WeakMap();
test.beforeEach(async ({ page, baseURL }) => {
  errors.set(page, []); external.set(page, []);
  page.on('pageerror', e => errors.get(page).push(e.message));
  const origin = new URL(baseURL).origin;
  page.on('request', req => { if (!req.url().startsWith(origin + '/') && !/^(data|blob):/.test(req.url())) external.get(page).push(req.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(external.get(page)).toEqual([]); });
async function load(page) {
  await page.goto(path);
  await expect(page.locator('#start')).toBeEnabled();
}
async function clock(page) {
  const time = new Date('2026-11-12T04:00:00Z');
  await page.clock.install({ time }); await page.clock.pauseAt(time);
}
const click = (page, selector) => page.locator(selector).evaluate(el => el.click());
async function start(page, memory = true) {
  if (memory) await page.locator('[name="mode"][value="memory"]').check();
  else await page.locator('#sound').uncheck();
  await clock(page); await click(page, '#start'); await page.clock.runFor(3020);
  await expect(page.locator('#phase-label')).toContainText('PRACTICING');
}
async function steady(page, interval = 550, count = 50) {
  for (let i=0;i<count;i++) { await click(page,'#tap-pad'); await page.clock.runFor(interval); }
}

test('first view explains learning scope; no sound before interaction, and no health claim', async ({ page }) => {
  await load(page);
  await expect(page.getByRole('heading',{level:1})).toContainText('手に覚えよう');
  await expect(page.locator('.learning-banner')).toContainText('119番');
  await expect(page.locator('#tap-pad')).toBeDisabled();
  await expect(page.locator('.instrument-note')).toContainText('深さ・力は測れません');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test('30-second memory practice yields measured tempo, then resets on retry', async ({ page }) => {
  await load(page); await start(page); await steady(page); await page.clock.runFor(3000);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result-bpm')).toHaveText('109');
  await expect(page.locator('#result-percent')).toHaveText('100');
  await expect(page.locator('#result-taps')).toHaveText('50');
  await expect(page.locator('#result-detail')).toContainText('49区間');
  await click(page,'#retry'); await page.clock.runFor(3020);
  await expect(page.locator('#result')).toBeHidden(); await expect(page.locator('#tap-count')).toHaveText('0');
});
test('sparse input is insufficient, and ending silence is retained', async ({ page }) => {
  await load(page); await start(page); await steady(page,550,2); await page.clock.runFor(30000);
  await expect(page.locator('#result-bpm')).toHaveText('—'); await expect(page.locator('#result-percent')).toHaveText('—');
  await expect(page.locator('#result-message')).toContainText('足りません');
  expect(Number(await page.locator('#result-gap').textContent())).toBeGreaterThan(28);
});
test('fast and slow rhythms produce actionable feedback; abort does not claim completion', async ({ page }) => {
  await load(page); await start(page); await steady(page,350,7);
  await expect(page.locator('#feedback')).toContainText('速め');
  await steady(page,800,9); await expect(page.locator('#feedback')).toContainText('ゆっくり');
  await click(page,'#stop'); await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#start')).toBeEnabled(); await expect(page.locator('#phase-label')).toHaveText('PAUSED');
});
test('keyboard input counts once per press and ignores held Enter', async ({ page }) => {
  await load(page); await start(page);
  await page.locator('#tap-pad').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#tap-count')).toHaveText('1');
  await page.clock.runFor(550); await page.keyboard.down('Enter');
  await page.clock.runFor(550); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.locator('#tap-count')).toHaveText('2');
});
test('unsupported sensor and vibration leave tap input available', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window,'DeviceMotionEvent',{value:undefined,configurable:true}); Object.defineProperty(navigator,'vibrate',{value:undefined,configurable:true}); });
  await load(page); await page.locator('[name="input"][value="motion"]').click();
  await expect(page.locator('#motion-note')).toContainText('使えません');
  await expect(page.locator('[name="input"][value="tap"]')).toBeChecked();
  await expect(page.locator('#start')).toBeEnabled(); await expect(page.locator('#vibration')).toBeDisabled();
});
test('denied motion permission falls back; selecting it is the only permission request', async ({ page }) => {
  await page.addInitScript(() => { window.__permissionCalls=0; window.DeviceMotionEvent=class { static async requestPermission(){window.__permissionCalls++; return 'denied';} }; });
  await load(page); expect(await page.evaluate(()=>window.__permissionCalls)).toBe(0);
  await page.locator('[name="input"][value="motion"]').click();
  await expect(page.locator('#motion-note')).toContainText('許可されません');
  expect(await page.evaluate(()=>window.__permissionCalls)).toBe(1);
  await expect(page.locator('[name="input"][value="tap"]')).toBeChecked();
});
test('no motion events fall back rather than leaving Start disabled', async ({ page }) => {
  await load(page); await clock(page); await click(page,'[name="input"][value="motion"]');
  await page.clock.runFor(2400); await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('[name="input"][value="tap"]')).toBeChecked();
});
test('synthetic motion pulses count only in running state, and cease after stop', async ({ page }) => {
  await page.addInitScript(() => { window.DeviceMotionEvent=class {}; });
  await load(page); await page.locator('[name="mode"][value="memory"]').check();
  await clock(page); await click(page,'[name="input"][value="motion"]');
  const emit = async x => page.evaluate(x=>{ const e=new Event('devicemotion'); Object.defineProperty(e,'acceleration',{value:{x,y:0,z:0}}); window.dispatchEvent(e); },x);
  for(let i=0;i<5;i++) await emit(0);
  await click(page,'#start');
  for(let i=0;i<7;i++) { await emit(0); await page.clock.runFor(500); }
  await emit(4); await expect(page.locator('#tap-count')).toHaveText('1');
  await emit(6); await expect(page.locator('#tap-count')).toHaveText('1');
  await page.clock.runFor(550); await emit(-4); await emit(4);
  await expect(page.locator('#tap-count')).toHaveText('2');
  await click(page,'#stop'); await page.clock.runFor(550); await emit(-4); await emit(4);
  await expect(page.locator('#tap-count')).toHaveText('2');
});
test('backgrounding cancels session and leaves no completion result', async ({ page }) => {
  await load(page); await start(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true}); document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(33000); await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#notice')).toContainText('画面を離れた');
});
test('audio failure does not block visual guided practice', async ({ page }) => {
  await page.addInitScript(()=>{window.AudioContext=class { constructor(){throw new Error('blocked');} }; });
  await load(page); await clock(page); await click(page,'#start'); await page.clock.runFor(3100);
  await expect(page.locator('#notice')).toContainText('音を開始できません');
  await expect(page.locator('#tap-pad')).toBeEnabled();
});
test('audio is scheduled and every pending oscillator is stopped on cancellation', async ({ page }) => {
  await page.addInitScript(()=>{
    window.__audio={created:0,stopped:0};
    window.AudioContext=class {
      constructor(){this.state='running';this.destination={};}
      get currentTime(){return performance.now()/1000;}
      async resume(){}
      createOscillator(){ window.__audio.created++; return {type:'',frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){},stop(at){if(at===undefined)window.__audio.stopped++;}}; }
      createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    };
  });
  await load(page); expect(await page.evaluate(()=>window.__audio.created)).toBe(0);
  await clock(page); await click(page,'#start'); await page.clock.runFor(4500);
  expect(await page.evaluate(()=>window.__audio.created)).toBeGreaterThan(1);
  await click(page,'#stop'); const stopped=await page.evaluate(()=>({...window.__audio}));
  expect(stopped.stopped).toBe(stopped.created);
  await page.clock.runFor(1000); expect(await page.evaluate(()=>window.__audio.created)).toBe(stopped.created);
});
for (const width of [320,390,768,1440]) {
  test(`layout and targets at ${width}px, including result and reduced motion`, async ({ page }) => {
    await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'}); await load(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const box = await page.locator('#start').boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
    await start(page); await page.clock.runFor(30100);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('#result')).toBeVisible();
    await page.locator('#retry').focus(); expect(await page.locator('#retry').evaluate(el=>document.activeElement===el)).toBe(true);
  });
}
test('production CSP still permits local app, canonical and sharing use the public address', async ({ page }) => {
  const text=readFileSync(new URL('../../dist/_headers',import.meta.url),'utf8');
  const block=text.split('\n\n').find(b=>b.startsWith('/day-090-cpr-beat/'));
  const csp=block?.split('\n').find(l=>l.trim().startsWith('Content-Security-Policy:'))?.split('Content-Security-Policy: ')[1];
  expect(csp).toBeTruthy();
  await page.route('**/day-090-cpr-beat/**', async route=>{const r=await route.fetch(); await route.fulfill({response:r,headers:{...r.headers(),'content-security-policy':csp}});});
  await load(page);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://rairakku.com/100days/day-090-cpr-beat/');
  await expect(page.locator('.share')).toBeVisible();
  await expect(page.locator('.share').getByRole('link',{name:'Xで投稿'})).toHaveAttribute('href',/CPR/);
  await start(page); await steady(page,550,5); await expect(page.locator('#tap-count')).toHaveText('5');
});

test('motion completion returns to tap and retry begins on its first click', async ({ page }) => {
  await page.addInitScript(() => { window.DeviceMotionEvent=class {}; });
  await load(page); await page.locator('[name="mode"][value="memory"]').check();
  await clock(page); await click(page,'[name="input"][value="motion"]');
  await page.evaluate(()=>{window.__motionTimer=setInterval(()=>{const e=new Event('devicemotion');Object.defineProperty(e,'acceleration',{value:{x:0,y:0,z:0}});window.dispatchEvent(e);},20);});
  await page.clock.runFor(100);await click(page,'#start');await page.clock.runFor(33200);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('[name="input"][value="tap"]')).toBeChecked();
  await expect(page.locator('#input-hint')).toContainText('画面タップ');
  await click(page,'#retry');await page.clock.runFor(3100);
  await expect(page.locator('#tap-pad')).toBeEnabled();await expect(page.locator('#result')).toBeHidden();
});

test('late permission after changing back to tap does not attach a sensor listener', async ({ page })=>{
  await page.addInitScript(()=>{window.__resolvePermission=null;window.__motionAdds=0;const add=window.addEventListener.bind(window);window.addEventListener=(type,...args)=>{if(type==='devicemotion')window.__motionAdds++;return add(type,...args);};window.DeviceMotionEvent=class{static requestPermission(){return new Promise(resolve=>window.__resolvePermission=resolve);}};});
  await load(page);await page.locator('[name="input"][value="motion"]').click();
  await page.locator('[name="input"][value="tap"]').click();
  await page.evaluate(()=>window.__resolvePermission('granted'));
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(()=>window.__motionAdds)).toBe(0);
  await expect(page.locator('#input-hint')).toContainText('画面タップ');
});
