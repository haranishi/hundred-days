import { test, expect } from '@playwright/test';
import { ARTWORKS, ART_BY_ID } from '../../day-050-art-uncovered/data/artworks.js';

let base;
test.beforeAll(async({baseURL})=>{base=new URL('/day-050-art-uncovered/',baseURL).href;});
async function open(page){await page.goto(base);await expect(page.locator('#art-loading')).toBeHidden();}
async function begin(page){await open(page);await page.getByRole('button',{name:'今日の5作品へ'}).click();await expect(page.locator('#choices button').first()).toBeEnabled();}
async function choose(page,correct=true){
  await expect(page.locator('#choices button').first()).toBeEnabled();
  const id=Number(await page.locator('#gallery').getAttribute('data-artwork'));
  const choice=correct?page.locator(`#choices button[data-id="${id}"]`):page.locator(`#choices button:not([data-id="${id}"])`).first();
  await choice.click();return ART_BY_ID.get(id);
}

test('actual paintings and all three GLB models load without runtime or external requests',async({page})=>{
  const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await open(page);await expect(page.locator('#gallery')).toHaveAttribute('data-models-loaded','3');
  expect(await page.locator('#flat-image').evaluate(img=>img.naturalWidth)).toBeGreaterThan(500);
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('sharing metadata has a bundled preview image and canonical URL',async({page,request})=>{
  await open(page);
  const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBe('https://hundred-days.pages.dev/day-050-art-uncovered/');
  const preview=await request.get(`${base}screenshot.webp`);expect(preview.ok()).toBe(true);expect(preview.headers()['content-type']).toBe('image/webp');
});
test('portfolio links to the published Day050 app',async({page})=>{
  await page.goto('/');
  const link=page.locator('a.btn[href="./day-050-art-uncovered/"]');
  await expect(link).toBeVisible();await link.click();
  await expect(page.locator('#start-daily')).toBeVisible();
});
test('correct answer reveals real artwork, historical background, intent, and source',async({page})=>{
  await begin(page);const work=await choose(page);await expect(page.locator('#answer-verdict')).toContainText('正解');
  await expect(page.locator('#answer-title')).toHaveText(work.title);await expect(page.locator('#answer-points')).toContainText('1,000');
  await expect(page.locator('#story-background')).toHaveText(work.background);await expect(page.locator('#story-intent')).toHaveText(work.intent);
  await expect(page.locator('#source-link')).toHaveAttribute('href',work.source);await expect(page.locator('.source-note')).toContainText('CC BY 4.0');
});
test('hints reduce points, wrong answer and skip still lead to the story',async({page})=>{
  await begin(page);await page.locator('#reveal-more').click();await page.locator('#reveal-more').click();
  await expect(page.locator('#available-points')).toHaveText('500');await expect(page.locator('#question-hint')).toBeVisible();
  await choose(page,false);await expect(page.locator('#answer-verdict')).toContainText('惜しい');await expect(page.locator('#answer-choice')).toBeVisible();
  await page.locator('#next-question').click();await expect(page.locator('#skip-question')).toBeEnabled();await page.locator('#skip-question').click();
  await expect(page.locator('#answer-points')).toContainText('0');await expect(page.locator('#story-background')).toBeVisible();
});
test('five questions, review, result sharing and replay form a complete loop',async({page})=>{
  await begin(page);
  for(let i=0;i<5;i++){await choose(page);await page.locator('#next-question').click();}
  await expect(page.locator('#final-score')).toHaveText('5,000');await expect(page.locator('.result-work')).toHaveCount(5);
  await page.locator('.result-work').first().click();await expect(page.locator('#story-background')).toBeVisible();await page.locator('#next-question').click();
  await expect(page.locator('#result-screen')).toBeVisible();await page.locator('#result-share').click();
  await expect(page.locator('#share-result-text')).toContainText('5問中5問');
  await expect(page.locator('#result-x')).toHaveAttribute('href',/5%2C000/);await page.getByRole('button',{name:'共有を閉じる'}).click();
  await page.locator('#replay').click();await expect(page.locator('#round-count')).toContainText('01');await expect(page.locator('#total-score')).toContainText('0');
});
test('catalog offers all thirty stories and persists viewed works',async({page})=>{
  await open(page);await page.locator('#collection-open').click();await expect(page.locator('.collection-item')).toHaveCount(30);
  await page.locator('.collection-item').last().click();await expect(page.locator('#answer-title')).toHaveText('聖母子と天使');
  await page.locator('#next-question').click();await expect(page.locator('#collection-dialog')).toBeVisible();
  await page.reload();await expect(page.locator('#seen-count')).toHaveText('1 / 30');
});
test('catalog search narrows, preserves query on return, and recovers from no matches',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);await page.locator('#collection-open').click();
  await page.getByLabel('作品名・作者名で探す').fill('モネ');await expect(page.locator('.collection-item')).toHaveCount(2);
  await page.locator('.collection-item').first().click();await page.locator('#next-question').click();
  await expect(page.locator('#collection-search')).toHaveValue('モネ');await expect(page.locator('.collection-item')).toHaveCount(2);
  await page.locator('#collection-search').fill('存在しない作品');await expect(page.locator('#collection-empty')).toBeVisible();
  await expect(page.locator('#collection-count')).toHaveText('0 / 30 作品');
  await page.locator('#collection-clear').click();await expect(page.locator('.collection-item')).toHaveCount(30);
  expect(await page.locator('#collection-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
test('catalog keeps its scroll position and close button when browsing the last artwork',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);await page.locator('#collection-open').click();
  await page.locator('.collection-item').last().scrollIntoViewIfNeeded();
  const before=await page.locator('#collection-dialog').evaluate(el=>el.scrollTop);expect(before).toBeGreaterThan(1000);
  const close=await page.getByRole('button',{name:'図録を閉じる'}).boundingBox();expect(close.y).toBeGreaterThanOrEqual(0);expect(close.y+close.height).toBeLessThan(844);
  await page.locator('.collection-item').last().click();await page.locator('#next-question').click();
  expect(Math.abs(await page.locator('#collection-dialog').evaluate(el=>el.scrollTop)-before)).toBeLessThan(3);
});
test('all thirty bundled images decode and each catalog story opens with the matching source',async({page})=>{
  test.setTimeout(90000);await open(page);await page.locator('#collection-open').click();
  for(const work of ARTWORKS){
    await page.locator(`.collection-item[data-id="${work.id}"]`).click();
    await expect(page.locator('#art-loading')).toBeHidden();await expect(page.locator('#art-error')).toBeHidden();
    await expect(page.locator('#answer-title')).toHaveText(work.title);await expect(page.locator('#source-link')).toHaveAttribute('href',work.source);
    expect(await page.locator('#flat-image').evaluate(img=>img.complete&&img.naturalWidth>100)).toBe(true);
    await page.locator('#next-question').click();
  }
  await expect(page.locator('#seen-count')).toHaveText('30 / 30');
});
test('clipboard denial offers selectable result text without losing the result',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}}});});
  await begin(page);
  for(let i=0;i<5;i++){await choose(page);await page.locator('#next-question').click();}
  await page.locator('#result-share').click();await page.locator('#copy-result').click();
  await expect(page.locator('#copy-fallback')).toBeVisible();await expect(page.locator('#copy-fallback')).toHaveValue(/5問中5問正解[\s\S]*https:\/\//);
  expect(await page.locator('#share-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/day050-share-390.png',fullPage:true,animations:'disabled'});
});
test('image failure disables scoring and retry recovers without losing a question',async({page})=>{
  let block=true;await page.route('**/assets/art/*',route=>block?route.abort():route.continue());
  await page.goto(base);await page.locator('#start-daily').click();await expect(page.locator('#art-error')).toBeVisible();
  await expect(page.locator('#choices button').first()).toBeDisabled();block=false;await page.locator('#image-retry').click();
  await expect(page.locator('#art-error')).toBeHidden();await expect(page.locator('#choices button').first()).toBeEnabled();await choose(page);
  await expect(page.locator('#answer-points')).toContainText('1,000');
});
test('WebGL unavailable and blocked storage still allow a complete question',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});
  await begin(page);await expect(page.locator('#flat-view')).toBeVisible();await choose(page);await expect(page.locator('#story-background')).toBeVisible();
});
test('keyboard answers and reduced motion work',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await begin(page);await page.keyboard.press('1');await expect(page.locator('#answer-screen')).toBeVisible();
  await page.locator('#next-question').focus();await page.keyboard.press('Enter');await expect(page.locator('#question-screen')).toBeVisible();
});
for(const width of [390,768,1440])test(`no horizontal overflow and usable controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await begin(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const sizes=await page.locator('#choices button,#reveal-more,#skip-question,#share-open,#view-toggle').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  expect(sizes.every(h=>h>=44)).toBe(true);
  await expect(page.locator('#question-title')).toBeFocused();
  await page.screenshot({path:`test-results/day050-question-${width}.png`,fullPage:true,animations:'disabled'});
  await choose(page);await expect(page.locator('#answer-title')).toBeFocused();await expect(page.locator('#art-loading')).toBeHidden();
  await page.screenshot({path:`test-results/day050-answer-${width}.png`,fullPage:true,animations:'disabled'});
  await page.locator('#share-open').click();
  expect(await page.locator('#share-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
