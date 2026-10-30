import {expect,type Page} from '@playwright/test';
export async function finishOpening(page:Page){
 await page.getByRole('button',{name:'あらすじへ',exact:true}).click();await expect(page.locator('.opening-recap')).toBeVisible();await page.locator('#opening-begin').click();await expect(page.locator('#modal')).toBeHidden();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

export async function openTalk(page:Page){
 const entry=page.locator('[data-choice-action="talk"],[data-choice-action="story"]');if(await entry.isVisible())await entry.click();
}

export async function advanceEnding(page:Page){
 const action=page.locator('[data-choice-action="ending-home"],[data-choice-action="ending-serve"],#ending-credits-finish');if(!await action.isVisible())return false;await action.click();return true;
}
