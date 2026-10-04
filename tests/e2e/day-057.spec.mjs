import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const URL='/day-057-fruit-box/';
const policy=readFileSync('dist/_headers','utf8').split('/day-057-fruit-box/*\n')[1].split('\n')[0].trim().replace('Content-Security-Policy: ','');
async function open(page,{clock=false,random=.04,seed=null}={}){
  await page.addInitScript(({random,seed})=>{
    Math.random=seed===null?()=>random:()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  },{random,seed});
  await page.route('**/day-057-fruit-box/',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}});});
  if(clock)await page.clock.install();
  await page.goto(URL);await expect(page.locator('#frame')).toHaveAttribute('data-state','playing');
}
async function drop(page,fraction=.5){
  const box=await page.locator('#cv').boundingBox();
  await page.mouse.click(box.x+box.width*fraction,box.y+box.height*.12);
}
test('local-only loading works under the production CSP',async({page})=>{
  const errors=[],outside=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))outside.push(r.url());});
  await open(page);await drop(page);await expect(page.locator('#frame')).toHaveAttribute('data-fruits','1');
  expect(errors).toEqual([]);expect(outside).toEqual([]);await expect(page.locator('#share .share')).toHaveCount(1);
  await page.locator('#btn-share').click();await expect(page.locator('#app-share-dialog')).toBeVisible();
  await expect(page.locator('#frame')).toHaveAttribute('data-state','paused');
  await page.keyboard.press('Escape');await expect(page.locator('#app-share-dialog')).toBeHidden();
  await expect(page.locator('#frame')).toHaveAttribute('data-state','playing');await expect(page.locator('#frame')).toHaveAttribute('data-fruits','1');
  await expect(page.locator('#nextname')).toHaveText('ブルーベリー');
  expect(await page.locator('#nextname').evaluate(el=>getComputedStyle(el).display)).not.toBe('none');
  const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'遊び方・素材'}).click();const guide=await popup;
  await expect(guide).toHaveTitle('遊び方・素材 | 夜店のくだもの箱');
  await expect(guide.getByRole('link',{name:'← くだもの箱に戻る'})).toBeVisible();
  await guide.setViewportSize({width:390,height:844});await guide.mouse.wheel(0,2200);
  await expect.poll(()=>guide.evaluate(()=>scrollY)).toBeGreaterThan(100);
  await expect(guide.getByRole('link',{name:'箱に戻って、あそぶ →'})).toBeInViewport();await guide.close();
});
for(const [width,height] of [[390,844],[768,1024],[1440,900],[390,600],[320,568]])test(`play and pause fit ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await open(page);
  const overflow=await page.evaluate(()=>({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight}));expect(overflow).toEqual({x:0,y:0});
  for(const id of ['btn-pause','btn-music','btn-effects','btn-restart','btn-share']){const box=await page.locator('#'+id).boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
  await page.locator('#btn-pause').click();await expect(page.locator('#pause-veil')).toBeVisible();await expect(page.locator('#btn-resume')).toBeInViewport();
  await page.locator('#btn-resume').click();await expect(page.locator('#frame')).toHaveAttribute('data-state','playing');
});
test('two drops really merge and the best survives restarting and reloading',async({page})=>{
  await open(page,{clock:true});await drop(page);await page.clock.runFor(1300);await drop(page);await page.clock.runFor(2000);
  await expect(page.locator('#score')).toHaveText('4');await expect(page.locator('#goal')).toContainText('さくらんぼ');
  await page.locator('#btn-restart').click();await expect(page.locator('#score')).toHaveText('4');
  await page.locator('#btn-restart').click();await expect(page.locator('#score')).toHaveText('0');await expect(page.locator('#best')).toHaveText('4');
  await page.reload();await expect(page.locator('#best')).toHaveText('4');
});
test('secondary touches and cancelled gestures never drop a fruit',async({page})=>{
  await open(page);await page.locator('#cv').evaluate(el=>{
    const r=el.getBoundingClientRect(),o={bubbles:true,clientX:r.x+r.width/2,clientY:r.y+50,pointerType:'touch',pointerId:2,isPrimary:false,button:0};
    el.dispatchEvent(new PointerEvent('pointerdown',o));el.dispatchEvent(new PointerEvent('pointerup',o));
    o.pointerId=1;o.isPrimary=true;el.dispatchEvent(new PointerEvent('pointerdown',o));el.dispatchEvent(new PointerEvent('pointercancel',o));el.dispatchEvent(new PointerEvent('pointerup',o));
  });await expect(page.locator('#frame')).toHaveAttribute('data-fruits','0');await drop(page);await expect(page.locator('#frame')).toHaveAttribute('data-fruits','1');
});
test('Space on a control never also drops, and pause blocks keyboard play',async({page})=>{
  await open(page,{clock:true});await page.locator('#btn-effects').focus();await page.keyboard.press('Space');
  await expect(page.locator('#btn-effects')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#frame')).toHaveAttribute('data-fruits','0');
  await page.locator('#cv').focus();await page.keyboard.press('Space');await page.clock.runFor(700);await expect(page.locator('#frame')).toHaveAttribute('data-fruits','1');
  await page.keyboard.press('p');await page.keyboard.press('ArrowDown');await page.clock.runFor(1500);await expect(page.locator('#frame')).toHaveAttribute('data-fruits','1');
  await page.locator('#music-volume').focus();await page.keyboard.press('Escape');await expect(page.locator('#frame')).toHaveAttribute('data-state','playing');
  await expect(page.locator('#cv')).toBeFocused();
});
test('backgrounding freezes the game until an explicit resume',async({page})=>{
  await open(page,{clock:true});await drop(page);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#frame')).toHaveAttribute('data-state','paused');await page.clock.runFor(3000);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('#frame')).toHaveAttribute('data-state','paused');
  await page.locator('#btn-resume').click();await expect(page.locator('#frame')).toHaveAttribute('data-state','playing');
});
test('audio unlocks after a gesture, stops while paused, and persists both volumes',async({page})=>{
  await page.addInitScript(()=>{
    window.__audioProbe={contexts:[],starts:0};const Base=window.AudioContext;
    window.AudioContext=class extends Base{constructor(...args){super(...args);window.__audioProbe.contexts.push(this);}createOscillator(){const o=super.createOscillator(),start=o.start.bind(o);o.start=(...args)=>{window.__audioProbe.starts++;start(...args);};return o;}};
  });
  await open(page);expect(await page.evaluate(()=>__audioProbe.contexts.length)).toBe(0);
  await drop(page);await expect.poll(()=>page.evaluate(()=>__audioProbe.starts)).toBeGreaterThan(0);
  await page.locator('#btn-pause').click();const starts=await page.evaluate(()=>__audioProbe.starts);await page.waitForTimeout(250);expect(await page.evaluate(()=>__audioProbe.starts)).toBe(starts);
  for(const [id,value] of [['music-volume','17'],['effects-volume','36']])await page.locator('#'+id).fill(value);
  await page.reload();await page.locator('#btn-pause').click();await expect(page.locator('#music-volume')).toHaveValue('17');await expect(page.locator('#effects-volume')).toHaveValue('36');
});
test('blocked storage still allows play and audio settings',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await drop(page);await page.locator('#btn-music').click();
  await expect(page.locator('#frame')).toHaveAttribute('data-fruits','1');expect(errors).toEqual([]);
});
test('a stable overflow gets its grace period, shares the actual score, and retries with one click',async({page})=>{
  // Capture the real Matter world in the browser fixture; ship no game-state test hooks.
  await page.addInitScript(()=>{
    let matter;Object.defineProperty(window,'Matter',{configurable:true,get(){return matter;},set(value){
      matter=value;const create=value.Engine.create;value.Engine.create=function(...args){const engine=create.apply(this,args);window.__gameEngine=engine;return engine;};
    }});
  });
  await open(page,{clock:true});await drop(page);await page.clock.runFor(1300);await drop(page);await page.clock.runFor(2000);
  await expect(page.locator('#score')).toHaveText('4');
  const landed=await page.evaluate(()=>{
    const fruit=Matter.Composite.allBodies(__gameEngine.world).find(body=>body.label==='fruit');
    const landed=fruit.plugin.landed;
    // Model a settled stack at the limit using the fruit that actually landed and merged.
    Matter.Body.setPosition(fruit,{x:210,y:100});Matter.Body.setStatic(fruit,true);return landed;
  });expect(landed).toBe(true);
  await page.clock.runFor(1600);await expect(page.locator('#veil')).toBeHidden();
  await page.clock.runFor(250);await expect(page.locator('#veil')).toBeVisible();
  const score=await page.locator('#score').innerText(),href=await page.locator('#sh-x').getAttribute('href');
  expect(new globalThis.URL(href).searchParams.get('text')).toContain(score+'点');expect(new globalThis.URL(href).searchParams.get('url')).toBe('https://hundred-days.pages.dev/day-057-fruit-box/');
  await page.locator('#sh-copy').click();await expect(page.locator('#share-said')).toContainText('コピー');
  await page.locator('#btn-again').click();await expect(page.locator('#veil')).toBeHidden();await expect(page.locator('#score')).toHaveText('0');await expect(page.locator('#frame')).toHaveAttribute('data-fruits','0');
});
