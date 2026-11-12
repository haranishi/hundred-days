import { test, expect } from '@playwright/test';
const url='/day-090-cpr-beat/';
const errors=new WeakMap();
test.beforeEach(async({page})=>{errors.set(page,[]);page.on('pageerror',e=>errors.get(page).push(e.message));});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});
async function fakeAudio(page){
  await page.addInitScript(()=>{
    window.__audio={created:0,live:0,starts:[],stops:0,gains:[]};
    window.AudioContext=class extends EventTarget {
      constructor(){super();this.state='suspended';this.sampleRate=8000;this.destination={};window.__context=this;}
      get currentTime(){return performance.now()/1000;}
      async resume(){this.state='running';this.dispatchEvent(new Event('statechange'));}
      createBuffer(channels,n,rate){const data=new Float32Array(n);return{duration:n/rate,getChannelData:()=>data};}
      createBufferSource(){const stats=window.__audio;stats.created++;return{connect(){},disconnect(){},start(at){this.live=true;stats.live++;stats.starts.push({at,loop:this.loop,duration:this.buffer.duration});},stop(){if(this.live){this.live=false;stats.live--;stats.stops++;}this.onended?.();}};}
      createGain(){return{connect(){},disconnect(){},gain:{setValueAtTime(v){window.__audio.gains.push(v);},setTargetAtTime(v){window.__audio.gains.push(v);},linearRampToValueAtTime(){},cancelScheduledValues(){}}};}
    };
  });
}
async function load(page){await page.goto(url);await expect(page.locator('#rhythm-toggle')).toBeVisible();}
async function clock(page){const time=new Date('2026-11-12T06:00:00Z');await page.clock.install({time});await page.clock.pauseAt(time);}
const click=(page,selector)=>page.locator(selector).evaluate(el=>el.click());
async function playing(page){await click(page,'#rhythm-toggle');await expect(page.locator('#continuous')).toHaveAttribute('data-state','playing');}

test('primary playback starts from the first mobile screen and is not the practice mode',async({page})=>{
  await page.setViewportSize({width:390,height:844});await fakeAudio(page);await load(page);
  expect(await page.locator('#practice-panel').getAttribute('open')).toBeNull();
  const box=await page.locator('#rhythm-toggle').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(()=>window.__audio.created)).toBe(0);
  await playing(page);await expect(page.locator('#rhythm-toggle')).toContainText('音を止める');
  expect(await page.evaluate(()=>window.__audio.live)).toBe(1);
});
test('one looping source keeps playing past five minutes until explicitly stopped',async({page})=>{
  await fakeAudio(page);await load(page);await clock(page);await playing(page);
  await page.clock.fastForward(300000);
  await expect(page.locator('#continuous')).toHaveAttribute('data-state','playing');
  await expect(page.locator('#rhythm-elapsed')).toHaveText('05:00');
  expect(await page.evaluate(()=>window.__audio.starts)).toMatchObject([{loop:true}]);
  expect(await page.evaluate(()=>window.__audio.live)).toBe(1);
  await click(page,'#rhythm-toggle');expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
});
test('tempo and tone replace rather than overlap; volume updates gain without restarting',async({page})=>{
  await fakeAudio(page);await load(page);await playing(page);
  await page.locator('[data-rhythm-bpm="120"]').click();await expect(page.locator('#rhythm-bpm')).toHaveText('120');
  await page.locator('#rhythm-tone').selectOption('soft');
  expect(await page.evaluate(()=>window.__audio.live)).toBe(1);
  const created=await page.evaluate(()=>window.__audio.created);
  await page.locator('#rhythm-volume').fill('20');
  expect(await page.evaluate(()=>window.__audio.created)).toBe(created);
  expect(await page.evaluate(()=>window.__audio.gains.at(-1))).toBeCloseTo(.07);
  await expect(page.locator('#rhythm-volume-value')).toHaveText('20%');
});
test('Escape and repeat start/stop leave no overlapping audio',async({page})=>{
  await fakeAudio(page);await load(page);
  for(let i=0;i<3;i++){await playing(page);await page.keyboard.press('Escape');await expect(page.locator('#continuous')).toHaveAttribute('data-state','idle');}
  expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
});
test('browser-hidden playback stays alive, but audio interruption requires manual restart',async({page})=>{
  await fakeAudio(page);await load(page);await playing(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__audio.live)).toBe(1);
  await page.evaluate(()=>{window.__context.state='interrupted';window.__context.dispatchEvent(new Event('statechange'));});
  await expect(page.locator('#continuous')).toHaveAttribute('data-state','interrupted');
  expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
  await page.evaluate(()=>{window.__context.state='running';window.__context.dispatchEvent(new Event('statechange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
  await expect(page.locator('#rhythm-toggle')).toContainText('再開');await playing(page);
});
test('late audio readiness after cancellation cannot start playback',async({page})=>{
  await fakeAudio(page);await page.addInitScript(()=>{window.AudioContext.prototype.resume=function(){return new Promise(resolve=>{window.__resume=()=>{this.state='running';resolve();};});};});
  await load(page);await click(page,'#rhythm-toggle');await expect(page.locator('#continuous')).toHaveAttribute('data-state','starting');
  await click(page,'#rhythm-toggle');await page.evaluate(()=>window.__resume());
  await expect(page.locator('#continuous')).toHaveAttribute('data-state','idle');
  expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
});
test('leaving while preparing cancels a pending start even if the page becomes visible again',async({page})=>{
  await fakeAudio(page);await page.addInitScript(()=>{window.AudioContext.prototype.resume=function(){return new Promise(resolve=>{window.__resume=()=>{this.state='running';resolve();};});};});
  await load(page);await click(page,'#rhythm-toggle');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));window.__resume();});
  await expect(page.locator('#continuous')).toHaveAttribute('data-state','idle');
  expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
});
test('unsupported wake lock and audio failure are visible rather than a false playing state',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'wakeLock',{value:undefined,configurable:true});window.AudioContext=undefined;window.webkitAudioContext=undefined;});
  await load(page);await expect(page.locator('#keep-awake')).toBeDisabled();
  await click(page,'#rhythm-toggle');await expect(page.locator('#continuous')).toHaveAttribute('data-state','error');
  await expect(page.locator('#rhythm-state')).toContainText('再生できません');
});
test('wake lock rejection allows audio and explains the missing protection',async({page})=>{
  await fakeAudio(page);await page.addInitScript(()=>{Object.defineProperty(navigator,'wakeLock',{value:{request:()=>Promise.reject(new Error('denied'))},configurable:true});});
  await load(page);await playing(page);await expect(page.locator('#awake-status')).toContainText('利用できません');
  expect(await page.evaluate(()=>window.__audio.live)).toBe(1);
});
test('late wake lock after stopping is released immediately',async({page})=>{
  await fakeAudio(page);await page.addInitScript(()=>{
    window.__released=0;Object.defineProperty(navigator,'wakeLock',{value:{request:()=>new Promise(resolve=>window.__wake=()=>{const lock=new EventTarget();lock.released=false;lock.release=async()=>{lock.released=true;window.__released++;lock.dispatchEvent(new Event('release'));};resolve(lock);})},configurable:true});
  });
  await load(page);await playing(page);await click(page,'#rhythm-toggle');await page.evaluate(()=>window.__wake());
  expect(await page.evaluate(()=>window.__released)).toBe(1);
  await expect(page.locator('#continuous')).toHaveAttribute('data-state','idle');
});
test('OS wake release is displayed; background/return reacquires only while playing',async({page})=>{
  await fakeAudio(page);await page.addInitScript(()=>{
    window.__wakeCount=0;window.__released=0;
    Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{window.__wakeCount++;const lock=new EventTarget();lock.released=false;lock.release=async()=>{if(!lock.released){lock.released=true;window.__released++;lock.dispatchEvent(new Event('release'));}};window.__lock=lock;return lock;}},configurable:true});
  });
  await load(page);await playing(page);await expect(page.locator('#awake-status')).toContainText('維持しています');
  await page.evaluate(()=>window.__lock.release());await expect(page.locator('#awake-status')).toContainText('解除');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__wakeCount)).toBe(2);
  await click(page,'#rhythm-toggle');expect(await page.evaluate(()=>window.__released)).toBe(2);
});
test('practice and continuous playback cannot sound together',async({page})=>{
  await fakeAudio(page);await load(page);await clock(page);await playing(page);
  await page.locator('#practice-panel > summary').click();await page.locator('[name="mode"][value="memory"]').check();
  await click(page,'#start');expect(await page.evaluate(()=>window.__audio.live)).toBe(0);
  await page.clock.runFor(3020);await expect(page.locator('#phase-label')).toContainText('PRACTICING');
  await playing(page);await expect(page.locator('#phase-label')).toHaveText('PAUSED');
  await expect(page.locator('#result')).toBeHidden();
});
test('closing practice stops its preview/session without stopping an independent continuous loop',async({page})=>{
  await fakeAudio(page);await load(page);await page.locator('#practice-panel > summary').click();await playing(page);
  await page.locator('#practice-panel > summary').click();expect(await page.evaluate(()=>window.__audio.live)).toBe(1);
});
test('native offline audio renders 18 seconds of equally spaced beats through multiple loop boundaries',async({page})=>{
  await load(page);
  const result=await page.evaluate(async()=>{
    const {AudioLoopPlayer}=await import('./lib/audio-loop.js');
    const ctx=new OfflineAudioContext(1,18*44100,44100),player=new AudioLoopPlayer();
    player.play(ctx,{bpm:110,tone:'clear',volume:65});
    const rendered=await ctx.startRendering(),samples=rendered.getChannelData(0),attacks=[];let last=-Infinity;
    for(let i=0;i<samples.length;i++)if(Math.abs(samples[i])>.02&&i-last>4410){attacks.push(i);last=i;}
    return {count:attacks.length,maxError:Math.max(...attacks.slice(1).map((v,i)=>Math.abs(v-attacks[i]-44100*60/110)))};
  });
  expect(result.count).toBe(33);expect(result.maxError).toBeLessThanOrEqual(1.01);
});
for(const width of [320,390,768,1440])test(`playback has no overflow and accessible controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await load(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const id of ['rhythm-toggle','rhythm-tone','rhythm-volume'])expect((await page.locator('#'+id).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('#rhythm-toggle').focus();expect(await page.locator('#rhythm-toggle').evaluate(el=>document.activeElement===el)).toBe(true);
});

test('native audio has no missing beat when tempo changes ten milliseconds before an attack',async({page})=>{
  await load(page);
  const result=await page.evaluate(async()=>{
    const {AudioLoopPlayer}=await import('./lib/audio-loop.js');
    const ctx=new OfflineAudioContext(1,3*44100,44100),player=new AudioLoopPlayer();
    player.play(ctx,{bpm:110,tone:'clear',volume:65});
    const when=.025+60/110-.01;
    const suspended=ctx.suspend(when).then(()=>{player.play(ctx,{bpm:120,tone:'clear',volume:65});return ctx.resume();});
    const rendered=await ctx.startRendering();await suspended;
    const samples=rendered.getChannelData(0),attacks=[];let last=-Infinity;
    for(let i=0;i<samples.length;i++)if(Math.abs(samples[i])>.02&&i-last>4410){attacks.push(i);last=i;}
    return {count:attacks.length,maxGap:Math.max(...attacks.slice(1).map((v,i)=>(v-attacks[i])/44100))};
  });
  expect(result.count).toBeGreaterThanOrEqual(6);expect(result.maxGap).toBeLessThan(.56);
});
