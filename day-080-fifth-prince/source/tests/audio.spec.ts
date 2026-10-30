import { test, expect, type Page } from '@playwright/test';
import { freshState } from '../src/state';
import { checkpoints } from './story-fixtures';
import { finishOpening } from './helpers';
import type { GameState } from '../src/types';
declare global {interface Window {__audioProbe:{context:AudioContext;analyser:AnalyserNode;tracks:HTMLAudioElement[]}}}
test.use({launchOptions:{args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=user-gesture-required']}});
const snap=(p:Page)=>p.evaluate(()=>window.__FIFTH_PRINCE__());
async function probe(page:Page){await page.addInitScript(()=>{const Native=window.AudioContext;const tracks:HTMLAudioElement[]=[];window.AudioContext=class extends Native{
 private tap:AnalyserNode;
 constructor(options?:AudioContextOptions){super(options);this.tap=this.createAnalyser();this.tap.fftSize=2048;const zero=this.createGain();zero.gain.value=0;this.tap.connect(zero);zero.connect(this.destination);window.__audioProbe={context:this,analyser:this.tap,tracks};}
 createDynamicsCompressor(){const node=super.createDynamicsCompressor();node.connect(this.tap);return node;}
 createMediaElementSource(media:HTMLMediaElement){tracks.push(media as HTMLAudioElement);return super.createMediaElementSource(media);}
 };});}
const rms=(p:Page)=>p.evaluate(()=>{const values=new Float32Array(2048);window.__audioProbe.analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((sum,n)=>sum+n*n,0)/values.length);});
async function boot(p:Page,s:GameState){await p.goto('/');await expect(p.locator('#loading')).toBeHidden();await p.evaluate(s=>localStorage.setItem('fifth-prince.save.v1',JSON.stringify(s)),s);await p.reload();await expect(p.locator('#loading')).toBeHidden();await p.locator('#continue').click();await expect.poll(async()=>(await snap(p)).audio.loaded).toBe(30);}
async function quietMusic(p:Page){await p.locator('#journal-button').click();await p.locator('.audio-settings summary').click();await p.locator('#music-volume').fill('0');await p.locator('#music-volume').dispatchEvent('input');await p.locator('[data-close]').click();await p.waitForTimeout(350);}
async function hold(p:Page,key:string,ms:number){await p.keyboard.down(key);await p.waitForTimeout(ms);await p.keyboard.up(key);}
test('音ボタンを押さずに序章からBGMが鳴り、会話で音量が下がって元に戻る',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await probe(page);await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed','true');expect((await snap(page)).audio.running).toBe(false);
 await page.locator('#new-game').click();await expect.poll(async()=>(await snap(page)).audio.running).toBe(true);await expect.poll(async()=>(await snap(page)).audio.playing.some(t=>t.id==='palace'&&t.time>.2)).toBe(true);await expect.poll(()=>rms(page)).toBeGreaterThan(.00001);await finishOpening(page);await page.waitForTimeout(700);const field=(await snap(page)).audio.musicGain;expect((await snap(page)).audio.playing).toHaveLength(1);
 await page.locator('#guide-button').click();await expect(page.locator('#modal')).toBeVisible();await page.waitForTimeout(350);expect((await snap(page)).audio.musicGain).toBeLessThan(field*.7);await page.getByRole('button',{name:'また話そう'}).click();await page.waitForTimeout(350);expect((await snap(page)).audio.musicGain).toBeCloseTo(field,3);expect(errors).toEqual([]);
});
test('草と道で足音が変わり、BGMゼロでも接地音の出力があり、止まると静かになる',async({page})=>{
 await probe(page);await boot(page,{...freshState(),position:{x:552,y:248}});await quietMusic(page);const before=(await snap(page)).audio.footsteps;await page.keyboard.down('s');const peak=await page.evaluate(()=>new Promise<number>(resolve=>{const start=performance.now();let peak=0;function sample(){const values=new Float32Array(2048);window.__audioProbe.analyser.getFloatTimeDomainData(values);peak=Math.max(peak,Math.sqrt(values.reduce((sum,n)=>sum+n*n,0)/values.length));if(performance.now()-start>400)resolve(peak);else requestAnimationFrame(sample);}sample();}));await page.keyboard.up('s');expect(peak).toBeGreaterThan(.00001);expect((await snap(page)).audio.footsteps).toBeGreaterThan(before);expect((await snap(page)).audio.surface).toBe('grass');
 await hold(page,'s',750);expect((await snap(page)).audio.surface).toBe('dirt');const stopped=(await snap(page)).audio.footsteps;await page.waitForTimeout(550);expect((await snap(page)).audio.footsteps).toBe(stopped);expect((await snap(page)).audio.voices).toBe(0);expect(await rms(page)).toBeLessThan(.00001);
 await page.locator('#journal-button').click();await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');expect((await snap(page)).audio.footsteps).toBe(stopped);await page.locator('.audio-settings summary').click();await page.screenshot({path:'artifacts/v5-audio-settings.png'});
});
test('木の橋と石床・走行・壁の停止を実際の移動で確認する',async({page})=>{
 await boot(page,{...freshState(),position:{x:584,y:344}});await hold(page,'d',420);expect((await snap(page)).audio.surface).toBe('wood');
 const palace={...checkpoints().trials,zone:'palace' as const,position:{x:376,y:432}};await boot(page,palace);await hold(page,'w',450);expect((await snap(page)).audio.surface).toBe('stone');
 await boot(page,{...freshState(),position:{x:552,y:248}});await page.keyboard.down('d');await page.waitForTimeout(600);const wall=await snap(page);await page.waitForTimeout(600);expect((await snap(page)).world.x).toBeCloseTo(wall.world.x,3);expect((await snap(page)).audio.footsteps).toBe(wall.audio.footsteps);await page.keyboard.up('d');
 await boot(page,{...freshState(),position:{x:216,y:368}});await hold(page,'d',1000);const walk=(await snap(page)).audio.footsteps;await boot(page,{...freshState(),position:{x:216,y:368}});await page.keyboard.down('Shift');await hold(page,'d',1000);await page.keyboard.up('Shift');expect((await snap(page)).audio.footsteps).toBeGreaterThan(walk);
});
test('ミュートと音量は再読込で保たれ、素早い曲切替と休止復帰でも音が重ならない',async({page})=>{
 await page.setViewportSize({width:390,height:844});await boot(page,freshState());await page.locator('#journal-button').click();await page.locator('.audio-settings summary').click();await page.locator('#music-volume').fill('25');await page.locator('#music-volume').dispatchEvent('input');await page.locator('#effects-volume').fill('40');await page.locator('#effects-volume').dispatchEvent('input');await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/v5-audio-settings-320.png'});await page.locator('[data-close]').click();await page.locator('#sound-button').click();await expect.poll(async()=>(await snap(page)).audio.running).toBe(false);expect((await snap(page)).audio.playing).toEqual([]);
 await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();expect((await snap(page)).audio.settings).toEqual({muted:true,music:25,effects:40});expect((await snap(page)).audio.running).toBe(false);await page.locator('#sound-button').click();await expect.poll(async()=>(await snap(page)).audio.running).toBe(true);
 for(let i=0;i<4;i++){await page.locator('#journal-button').click();await page.locator('[data-close]').click();}await page.waitForTimeout(700);expect((await snap(page)).audio.playing).toHaveLength(1);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(async()=>(await snap(page)).audio.running).toBe(false);expect((await snap(page)).audio.playing).toEqual([]);expect((await snap(page)).audio.voices).toBe(0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(async()=>(await snap(page)).audio.running).toBe(true);await page.waitForTimeout(700);expect((await snap(page)).audio.playing).toHaveLength(1);expect((await snap(page)).audio.errors).toEqual([]);
});
