import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {actOne} from '../../day-068-timetable-alibi/tests/story-fixtures.mjs';
import '../../day-068-timetable-alibi/tests/complete-story.spec.mjs';

// Reuse the complete-story scenarios against the published build and its CSP.
const port=Number(process.env.PLAYWRIGHT_PORT||4173);
const headers=readFileSync(new URL('../../dist/_headers',import.meta.url),'utf8');
const block=headers.split('/day-068-timetable-alibi/*\n')[1]?.split(/\n(?=\/)/)[0];
const csp=block?.split('\n').find(line=>line.trim().startsWith('Content-Security-Policy:'))?.trim().replace('Content-Security-Policy: ','');
if(!csp)throw Error('Day68 production CSP is missing');
const violations=new WeakMap();
test.use({baseURL:`http://127.0.0.1:${port}/day-068-timetable-alibi/`,viewport:{width:1440,height:1000}});
test.beforeEach(async({page,context})=>{
 const errors=[];violations.set(page,errors);
 page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|violates the following.*directive/i.test(message.text()))errors.push(message.text());});
 await context.route('**/day-068-timetable-alibi/**',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,headers:{...response.headers(),'content-security-policy':csp}});
 });
});
test.afterEach(async({page})=>{expect(violations.get(page),'Day68 must not violate its production CSP').toEqual([]);});

test('published path loads railway reconstruction, share links and only runtime files',async({page,request})=>{
 await page.addInitScript(state=>localStorage.setItem('day68-story-episode1-v1',JSON.stringify(state)),actOne());
 const response=await page.goto('./');expect(response.status()).toBe(200);
 await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://hundred-days.pages.dev/day-068-timetable-alibi/');
 await page.locator('#rail-button').click();await page.locator('#rail-map-tab').click();
 await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
 await expect(page.locator('.station-marker')).toHaveCount(5);
 await page.locator('#view-2d').click();await expect(page.locator('.flat-map')).toBeVisible();
 await expect(page.locator('#story-clock')).toHaveText('23:21');await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.locator('#share-button').click();expect(await page.locator('#share-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await expect(page.locator('#share a[href*="x.com/intent"]')).toBeVisible();await expect(page.locator('#share a[href*="line.me"]')).toBeVisible();await page.keyboard.press('Escape');
 for(const path of ['tools/serve.mjs','tests/story-fixtures.mjs'])expect((await request.get(path)).status()).toBe(404);
 expect((await request.get('vendor/THREE-LICENSE.txt')).status()).toBe(200);
});
