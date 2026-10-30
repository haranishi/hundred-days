import { finishOpening } from './helpers';
import {test,expect} from '@playwright/test';
test('戦闘絵の表示と二重入力の防止、ターン間の描画維持',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.locator('#new-game').click();await finishOpening(page);
 const walk=async(id:string)=>{await page.locator('#map-button').click();await page.locator(`[data-destination="${id}"]`).click();await expect(page.locator('#modal')).toBeVisible();};
 await walk('toForest');await page.locator('#modal').getByRole('button',{name:/^先へ進む/}).click();await walk('bramble');await page.getByRole('button',{name:'番獣に立ち向かう'}).click();await expect(page.locator('.battle-v2')).toHaveClass(/visuals-ready/);
 expect(await page.locator('.fighter img').evaluateAll(imgs=>imgs.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
 const button=page.locator('[data-command="attack"]'),box=await button.boundingBox();await page.mouse.dblclick(box!.x+box!.width/2,box!.y+box!.height/2,{delay:40});await page.waitForTimeout(180);
 expect(await page.evaluate(()=>window.__FIFTH_PRINCE__().state.battle!.turn)).toBe(2);await page.screenshot({path:'artifacts/v2-04-impact.png'});await expect(page.locator('[data-command="attack"]')).toBeEnabled();await expect(page.locator('.battle-loading')).toHaveCount(0);await expect(page.locator('.battle-v2')).toHaveClass(/visuals-ready/);
 await page.locator('[data-command="guard"]').click();await expect(page.locator('[data-command="attack"]')).toBeEnabled();expect(await page.evaluate(()=>window.__FIFTH_PRINCE__().state.battle!.turn)).toBe(3);
});

test('歩行中と停止後に進行方向を向き、複数の歩行コマが使われる',async({page})=>{
 await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.locator('#new-game').click();await finishOpening(page);
 for(const [key,facing] of [['d',3],['s',0],['a',2],['w',1]] as const){
  const frames=new Set<number>();await page.keyboard.down(key);
  for(let n=0;n<6;n++){await page.waitForTimeout(100);const {world}=await page.evaluate(()=>window.__FIFTH_PRINCE__());expect(world.facing).toBe(facing);expect(world.frame%4).toBe(facing);frames.add(world.frame);}
  await page.keyboard.up(key);await page.waitForTimeout(80);const {world}=await page.evaluate(()=>window.__FIFTH_PRINCE__());expect(world.frame).toBe(facing);expect(frames.size).toBeGreaterThan(1);
 }
 await page.screenshot({path:'artifacts/v2-walking.png'});
});
