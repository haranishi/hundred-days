import { finishOpening } from './helpers';
import { test, expect } from '@playwright/test';
test('タイトルと初期操作',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.screenshot({path:'artifacts/01-title-desktop.png',fullPage:true});
 await page.locator('#new-game').click();await finishOpening(page);await expect(page.locator('#modal')).toBeHidden();await expect(page.locator('#objective-title')).toContainText('黄金麦');await page.screenshot({path:'artifacts/02-town-desktop.png',fullPage:true});
 await page.locator('#guide-button').click();await expect(page.locator('#modal')).toBeVisible();await expect(page.locator('#modal')).toContainText('商人 オルン');await page.getByRole('button',{name:'仕入れ・販売をする'}).click();await expect(page.locator('.shop-panel')).toBeVisible();await page.screenshot({path:'artifacts/03-shop-desktop.png',fullPage:true});expect(errors).toEqual([]);
});
