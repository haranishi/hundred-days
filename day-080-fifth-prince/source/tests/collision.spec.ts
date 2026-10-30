import {test,expect,type Page} from '@playwright/test';
import {createMap,walkable} from '../src/maps';
import {newAdventure} from '../src/state';
import {checkpoints,travelTo} from './story-fixtures';
import type {GameState,Zone} from '../src/types';
test.use({hasTouch:true});
const route=checkpoints(),snap=(p:Page)=>p.evaluate(()=>window.__FIFTH_PRINCE__());
const state=(zone:Zone,position:{x:number;y:number}):GameState=>({...zone==='palace'?travelTo(route.trials,'palace'):zone==='abyss'?travelTo(route.citadel,'abyss'):newAdventure(),zone,position});
async function boot(p:Page,s:GameState){await p.goto('/');await expect(p.locator('#loading')).toBeHidden();await p.evaluate(s=>localStorage.setItem('fifth-prince.save.v1',JSON.stringify(s)),s);await p.reload();await expect(p.locator('#loading')).toBeHidden();await p.locator('#continue').click();await expect(p.locator('#modal')).toBeHidden();}
test('走って柵・水際・本棚・魔王城の柱へ向かっても足元が通り抜けない',async({page})=>{
 for(const c of [{zone:'town' as const,x:200,y:440,key:'w',axis:'y',limit:421},{zone:'town' as const,x:568,y:280,key:'d',axis:'x',limit:572},{zone:'palace' as const,x:544,y:405,key:'w',axis:'y',limit:391},{zone:'abyss' as const,x:264,y:380,key:'w',axis:'y',limit:358.4}]){
  await boot(page,state(c.zone,{x:c.x,y:c.y}));await page.keyboard.down('Shift');await page.keyboard.down(c.key);await page.waitForTimeout(850);await page.keyboard.up(c.key);await page.keyboard.up('Shift');const w=(await snap(page)).world;expect(walkable(createMap(c.zone),w.x,w.y)).toBe(true);if(c.axis==='x')expect(w.x).toBeLessThanOrEqual(c.limit+.1);else expect(w.y).toBeGreaterThanOrEqual(c.limit-.1);expect(Math.hypot(w.x-c.x,w.y-c.y)).toBeGreaterThan(1);await page.screenshot({path:`artifacts/v07-collision-${c.zone}-${c.axis}.png`});
 }
});
test('斜めの移動は壁に沿って進み、旧記録の重なった位置は近くの道へ復帰する',async({page})=>{
 await boot(page,state('town',{x:260,y:160}));await page.keyboard.down('Shift');await page.keyboard.down('a');await page.keyboard.down('w');await expect.poll(async()=>(await snap(page)).world.y).toBeLessThan(145);await page.keyboard.up('a');await page.keyboard.up('w');await page.keyboard.up('Shift');const slid=(await snap(page)).world;expect(slid.x).toBeGreaterThanOrEqual(259.9);expect(walkable(createMap('town'),slid.x,slid.y)).toBe(true);
 const old=state('town',{x:257,y:160});await boot(page,old);const restored=(await snap(page)).state;expect(walkable(createMap('town'),restored.position.x,restored.position.y)).toBe(true);expect(Math.hypot(restored.position.x-old.position.x,restored.position.y-old.position.y)).toBeLessThan(30);expect(restored.gold).toBe(old.gold);expect(restored.flags).toEqual(old.flags);await page.locator('#save-button').click();await page.reload();await expect(page.locator('#loading')).toBeHidden();await page.locator('#continue').click();expect((await snap(page)).state.position).toEqual(restored.position);
});
test('魔王城の案内は柱の台座を避け、二つの封印へ接近できる',async({page})=>{
 for(const id of ['story:voices','story:power']){await boot(page,state('abyss',{x:376,y:432}));await page.evaluate(()=>{const samples:{x:number;y:number}[]=[];(window as any).__collisionSamples=samples;const tick=()=>{const s=window.__FIFTH_PRINCE__();if(s.mode==='play')samples.push({x:s.world.x,y:s.world.y});(window as any).__collisionFrame=requestAnimationFrame(tick);};tick();});await page.locator('#map-button').click();await page.locator(`[data-destination="${id}"]`).click();await expect(page.locator('[data-next]')).toBeVisible();const samples=await page.evaluate(()=>{cancelAnimationFrame((window as any).__collisionFrame);return (window as any).__collisionSamples as {x:number;y:number}[];});expect(samples.length).toBeGreaterThan(10);for(const p of samples)expect(walkable(createMap('abyss'),p.x,p.y)).toBe(true);}
});
test('320pxの実タッチ移動でも柵で止まり、壁へのクリックはすり抜けない',async({page,context})=>{
 await page.setViewportSize({width:320,height:740});await boot(page,state('town',{x:200,y:440}));const session=await context.newCDPSession(page),box=await page.locator('[data-dir="up"]').boundingBox();await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});await page.waitForTimeout(900);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect((await snap(page)).world.y).toBeGreaterThanOrEqual(420.9);
 const w=(await snap(page)).world,canvas=await page.locator('#game-canvas canvas').boundingBox(),x=(200-w.view.x)*w.view.zoom/w.view.width*canvas!.width+canvas!.x,y=(415-w.view.y)*w.view.zoom/w.view.height*canvas!.height+canvas!.y;await page.touchscreen.tap(x,y);await page.waitForTimeout(500);expect((await snap(page)).world.y).toBeGreaterThanOrEqual(420.9);await page.screenshot({path:'artifacts/v07-collision-touch-320.png'});
});

test('木と家の接触境界からも目標案内を開始できる',async({page})=>{
 await boot(page,state('town',{x:510,y:110}));const before=(await snap(page)).world;expect(before.x).toBe(510);expect(before.y).toBe(110);await page.locator('#guide-button').click();await expect(page.getByRole('button',{name:'仕入れ・販売をする'})).toBeVisible();expect(walkable(createMap('town'),(await snap(page)).state.position.x,(await snap(page)).state.position.y)).toBe(true);
});
