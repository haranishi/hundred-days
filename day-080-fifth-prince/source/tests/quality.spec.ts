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
  // Node側の固定間隔では描画コマを取り逃すため、画面の更新ごとに観測する。
  await page.evaluate(()=>{
   const start=window.__FIFTH_PRINCE__().world;
   const observed={frames:[] as number[],facings:[] as number[],distance:0,raf:0};
   (window as any).__qualityWalk=observed;
   const sample=()=>{
    const {world}=window.__FIFTH_PRINCE__();
    if(world.moving){
     if(!observed.frames.includes(world.frame))observed.frames.push(world.frame);
     if(!observed.facings.includes(world.facing))observed.facings.push(world.facing);
     observed.distance=Math.max(observed.distance,Math.hypot(world.x-start.x,world.y-start.y));
    }
    observed.raf=requestAnimationFrame(sample);
   };
   observed.raf=requestAnimationFrame(sample);
  });
  await page.keyboard.down(key);
  try{
   await expect.poll(()=>page.evaluate(()=>(window as any).__qualityWalk.frames.length),{intervals:[25,50,100]}).toBeGreaterThan(1);
   const observed=await page.evaluate(()=>{
    const {frames,facings,distance}=(window as any).__qualityWalk;
    return {frames:frames as number[],facings:facings as number[],distance:distance as number};
   });
   expect(observed.facings).toEqual([facing]);
   expect(observed.frames.every(frame=>frame%4===facing)).toBe(true);
   expect(observed.distance).toBeGreaterThan(1);
  }finally{
   await page.keyboard.up(key);
   await page.evaluate(()=>{cancelAnimationFrame((window as any).__qualityWalk.raf);delete (window as any).__qualityWalk;});
  }
  await expect.poll(()=>page.evaluate(()=>{
   const {world}=window.__FIFTH_PRINCE__();return {facing:world.facing,frame:world.frame,moving:world.moving};
  }),{intervals:[25,50,100]}).toEqual({facing,frame:facing,moving:false});
 }
 await page.screenshot({path:'artifacts/v2-walking.png'});
});
