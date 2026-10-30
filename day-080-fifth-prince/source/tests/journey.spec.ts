import { finishOpening, openTalk, advanceEnding } from './helpers';
import { test, expect, type Page } from '@playwright/test';
import { intentFor } from '../src/encounters';
import type {WorldScene} from '../src/world';
import type { Soundscape } from '../src/audio';
import type { GameState } from '../src/types';
declare global { interface Window { __FIFTH_PRINCE__:()=>{state:GameState;mode:string;audio:ReturnType<Soundscape['debugSnapshot']>;world:ReturnType<WorldScene['getSnapshot']>} } }
const snap=(p:Page)=>p.evaluate(()=>window.__FIFTH_PRINCE__());
async function begin(p:Page){await p.goto('/');await expect(p.locator('#loading')).toBeHidden();await p.locator('#new-game').click();await finishOpening(p);}
async function story(p:Page){for(let n=0;n<80;n++){await openTalk(p);if(await advanceEnding(p))continue;const next=p.locator('[data-next]');if(await p.locator('#modal').isHidden()||!await next.count())return;await next.click();}}
async function walk(p:Page,id:string,kind:'dialogue'|'harvest'='dialogue'){
 await p.locator('#map-button').click();await p.locator(`[data-destination="${id}"]`).click();
 if(kind==='harvest')await expect.poll(async()=> (await snap(p)).state.flags.includes('gather:'+id),{timeout:20000}).toBe(true);
 else await expect(p.locator('#modal')).toBeVisible({timeout:20000});
 console.log('訪問:',id);
}
async function episode(p:Page,id:string,choice?:RegExp){
 await walk(p,id);const begin=p.getByRole('button',{name:'物語のつづきを聞く'});if(await begin.isVisible())await begin.click();await story(p);if(choice){await p.getByRole('button',{name:choice}).click();await story(p);}await expect(p.locator('#modal')).toBeHidden();
}
async function travel(p:Page,id:string,zone:string){await walk(p,id);await p.locator('#modal').getByRole('button',{name:/^先へ進む/}).click();await expect.poll(async()=>(await snap(p)).state.zone).toBe(zone);}
async function fight(p:Page,shot?:string){
 await expect(p.locator('.battle-panel')).toBeVisible();await expect(p.locator('.battle-v2')).toHaveClass(/visuals-ready/);await p.waitForTimeout(200);expect((await snap(p)).audio.active).toBe((await snap(p)).state.battle!.enemy==='demon'?'boss':'battle');if(shot)await p.screenshot({path:shot,fullPage:true});
 // Sharing must leave the combat interface and state intact.
 await p.locator('#share-button').click();await expect(p.locator('.battle-panel')).toBeVisible();
 for(let n=0;n<100;n++){
 const {state:s}=await snap(p),b=s.battle!;if(b.result!=='active'){expect(b.result).toBe('won');break;}
 const cmd=intentFor(b).kind==='heavy'?'guard':s.flags.includes('awakened')&&b.energy===5?'resonate':b.hp<60&&s.inventory.potion?'potion':b.cooldown===0&&s.party.length?'support':'attack';
 await p.locator(`[data-command="${cmd}"]`).click();await p.waitForTimeout(180);
 }
 await expect(p.locator('#battle-finish')).toBeVisible();expect((await snap(p)).audio.recent).toContain('victory');expect((await snap(p)).audio.errors).toEqual([]);await p.locator('#battle-finish').click();await story(p);
}
test('序章から商い・仲間・四兄弟・加護の覚醒・魔王討伐まで',async({page})=>{
 test.setTimeout(540000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await begin(page);
 const x=(await snap(page)).world.x;await page.keyboard.down('d');await page.waitForTimeout(330);await page.keyboard.up('d');expect((await snap(page)).world.x).toBeGreaterThan(x+10);
 await walk(page,'merchant');await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await page.locator('[data-quantity="wheat"]').selectOption('5');await page.locator('[data-buy="wheat"]').click();await expect(page.locator('#gold-value')).toContainText('20');await page.getByRole('button',{name:'店を閉じる'}).click();
 await walk(page,'nora');await page.getByRole('button',{name:'黄金麦を1つ渡す'}).click();await story(page);expect((await snap(page)).state.party).toContain('nora');
 await page.locator('#save-button').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();expect((await snap(page)).state.party).toContain('nora');expect((await snap(page)).state.gold).toBe(52);
 await episode(page,'nora',/^今日は分けよう/);await episode(page,'town:elder');await episode(page,'town:child');await episode(page,'nora');expect((await snap(page)).state.flags).toContain('story:bread:done');
 await walk(page,'merchant');await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await page.locator('[data-quantity="wheat"]').selectOption('4');await page.locator('[data-sell="wheat"]').click();await page.getByRole('button',{name:'店を閉じる'}).click();expect((await snap(page)).state.profit).toBe(24);
 await travel(page,'toForest','forest');await walk(page,'herb1','harvest');await walk(page,'herb2','harvest');await page.screenshot({path:'artifacts/04-forest-desktop.png',fullPage:true});await travel(page,'toTown','town');
 await walk(page,'mira');await page.getByRole('button',{name:'月しずく草を3つ渡す'}).click();await story(page);await episode(page,'mira');await episode(page,'guard');await travel(page,'toForest','forest');await episode(page,'story:well');await travel(page,'toTown','town');await episode(page,'guard',/^隣で待つ/);await travel(page,'toForest','forest');await walk(page,'bramble');await page.getByRole('button',{name:'番獣に立ち向かう'}).click();await fight(page,'artifacts/05-battle-desktop.png');
 expect((await snap(page)).state.party).toEqual(['nora','mira','toma']);await travel(page,'toTown','town');await walk(page,'toma');await page.getByRole('button',{name:'剣を鍛える'}).click();expect((await snap(page)).state.weapon).toBe(true);
 await travel(page,'toPalace','palace');await walk(page,'king');await page.getByRole('button',{name:'王都での歩みを報告する'}).click();await story(page);await page.screenshot({path:'artifacts/06-palace-desktop.png',fullPage:true});
 await travel(page,'toTown','town');await episode(page,'toma');await episode(page,'nora');await episode(page,'merchant',/^古い炉輪/);await episode(page,'nora',/^小さな火/);expect((await snap(page)).state.flags).toContain('story:forge:done');
 await episode(page,'guard');await travel(page,'toForest','forest');await episode(page,'story:patch');await episode(page,'story:patch',/^根と若い芽/);await travel(page,'toTown','town');await episode(page,'guard');await travel(page,'toPalace','palace');
 for(const brother of ['flame','tide','grove','storm']){await walk(page,brother);await story(page);await page.getByRole('button',{name:'仲間と、試練に挑む'}).click();await fight(page);}
 expect((await snap(page)).state.brothers).toHaveLength(4);await travel(page,'toTown','town');await episode(page,'inn',/^まだ傷ついてる/);await travel(page,'toPalace','palace');await walk(page,'sage');await openTalk(page);await expect(page.locator('#modal')).toContainText('「共鳴」');await page.screenshot({path:'artifacts/07-awakening-desktop.png',fullPage:true});await story(page);expect((await snap(page)).state.flags).toContain('awakened');
 await travel(page,'toAbyss','abyss');await episode(page,'story:power',/^兄さんたちは/);await episode(page,'story:voices',/^ノラ、声を/);await walk(page,'demon');await story(page);await page.getByRole('button',{name:'五人で、最後の戦いへ'}).click();await fight(page,'artifacts/08-final-battle-desktop.png');
 await expect(page.locator('.ending-panel')).toBeVisible();expect((await snap(page)).audio.active).toBe('ending');expect((await snap(page)).state.flags).toContain('ended');await page.screenshot({path:'artifacts/09-ending-desktop.png',fullPage:true});await page.locator('#epilogue').click();expect((await snap(page)).state.zone).toBe('town');await walk(page,'nora');await openTalk(page);await expect(page.locator('#modal')).toContainText('おかえり');await story(page);
 expect(errors).toEqual([]);
});
test('スマホのタッチ移動・会話・取引・キーボードの手帳',async({page})=>{
 await page.setViewportSize({width:390,height:844});await begin(page);await page.screenshot({path:'artifacts/10-town-mobile.png',fullPage:true});
 const x=(await snap(page)).world.x;const right=page.getByRole('button',{name:'右へ移動'});const bounds=await right.boundingBox();const touch=await page.context().newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds!.x+bounds!.width/2,y:bounds!.y+bounds!.height/2}]});await page.waitForTimeout(350);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect((await snap(page)).world.x).toBeGreaterThan(x+12);
 await page.keyboard.press('j');await expect(page.locator('#modal')).toContainText('冒険手帳');await page.keyboard.press('Escape');await expect(page.locator('#modal')).toBeHidden();
 await walk(page,'merchant');await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await page.locator('[data-buy="wheat"]').click();await page.screenshot({path:'artifacts/11-shop-mobile.png',fullPage:true});await page.getByRole('button',{name:'店を閉じる'}).click();await walk(page,'nora');await page.screenshot({path:'artifacts/12-dialogue-mobile.png',fullPage:true});await page.getByRole('button',{name:'黄金麦を1つ渡す'}).click();await story(page);expect((await snap(page)).state.party).toContain('nora');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('保存機能を拒否したブラウザでも冒険を開始できる',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}}));await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('.load-warning')).toContainText('セーブなし');await page.locator('#new-game').click();await finishOpening(page);await expect(page.locator('#modal')).toBeHidden();await page.locator('#guide-button').click();await expect(page.locator('#modal')).toContainText('商人 オルン');
});

test('敗北から直接再戦でき、狭いスマホ画面でも操作できる',async({page})=>{
 await page.setViewportSize({width:390,height:844});await begin(page);
 const dpad=await page.locator('[data-dir="right"]').boundingBox();expect(dpad!.width).toBeGreaterThanOrEqual(44);expect(dpad!.height).toBeGreaterThanOrEqual(44);
 await travel(page,'toForest','forest');await walk(page,'bramble');await page.getByRole('button',{name:'番獣に立ち向かう'}).click();await expect(page.locator('.battle-panel')).toBeVisible();await expect(page.locator('.battle-v2')).toHaveClass(/visuals-ready/);
 await page.screenshot({path:'artifacts/13-battle-mobile.png',fullPage:true});
 for(let n=0;n<60;n++){if((await snap(page)).state.battle!.result!=='active')break;await page.locator('[data-command="guard"]').click();await page.waitForTimeout(180);}
 expect((await snap(page)).state.battle!.result).toBe('lost');await page.screenshot({path:'artifacts/14-retry-mobile.png',fullPage:true});await page.locator('#battle-finish').click();expect((await snap(page)).state.battle!.result).toBe('active');expect((await snap(page)).state.battle!.hp).toBeGreaterThan(100);expect((await snap(page)).state.gold).toBe(60);
 await page.setViewportSize({width:320,height:740});await page.screenshot({path:'artifacts/15-battle-small-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await expect(page.locator('[data-command="attack"]')).toBeVisible();
});

test('寄り道の宝箱を見つけ、開封状態と報酬を保存できる',async({page})=>{
 await begin(page);await walk(page,'town:parcel');await expect(page.locator('#modal')).toContainText('いつか旅に出る君へ');await story(page);expect((await snap(page)).state.gold).toBe(78);expect((await snap(page)).state.flags).toContain('found:town:parcel');
 await page.locator('#save-button').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();await walk(page,'town:parcel');await story(page);expect((await snap(page)).state.gold).toBe(78);
});
