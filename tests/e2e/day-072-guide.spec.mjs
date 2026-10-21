import { test, expect } from '@playwright/test';
import { GUIDE_STORAGE_KEY } from '../../day-072-jibun-note/lib/guide-data.js';
import { STORAGE_KEY } from '../../day-072-jibun-note/lib/model.js';
const path = '/day-072-jibun-note/';
const supportAnswers = ['yes', 'maybe', 'unlikely', 'unlikely', 'unlikely', 'unlikely', 'yes', 'maybe', 'unlikely', 'unlikely', 'unlikely', 'unlikely'];
async function start(page) { await page.goto(path); await page.locator('#guide-start').click(); }
async function choose(page, value) { await page.locator('#guide-answers [data-answer="' + value + '"]').click(); }
async function finish(page, values = supportAnswers) { for (const value of values) await choose(page, value); await expect(page.locator('#guide-result')).toBeVisible(); }

test('twelve choices lead to a reasoned job-search axis, industries and next questions', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await expect(page.locator('input[type=text]:visible, textarea:visible')).toHaveCount(0);
  await expect(page.locator('#guide-question-title')).toHaveAttribute('data-question', 'care-first');
  await finish(page);
  await expect(page.locator('#guide-axes')).toContainText('誰かの変化を、そばで支える');
  await expect(page.locator('#guide-axes')).toContainText('かなり当てはまる');
  await expect(page.locator('#guide-industries')).toContainText('教育・人材');
  await expect(page.locator('#guide-industries')).toContainText('仕事の例');
  await expect(page.locator('#guide-draft')).toContainText('仕事選びでは');
  await expect(page.locator('#guide-company-list')).toContainText('継続して関われますか');
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test('back restores the preceding question and early edits recalculate later branches', async ({ page }) => {
  await start(page); await choose(page, 'yes');
  await expect(page.locator('#guide-count')).toHaveText('02 / 12');
  await page.locator('#guide-back').click();
  await expect(page.locator('#guide-question-title')).toHaveAttribute('data-question', 'care-first');
  await finish(page);
  await page.locator('#guide-review').click();
  await page.locator('#guide-answer-list button').first().click();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#guide-result')).toBeVisible();
  await page.locator('#guide-answer-list button').first().click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#guide-result')).toBeHidden();
  for (let i = 0; i < 6; i++) await choose(page, 'no');
  await expect(page.locator('#guide-question-title')).toHaveAttribute('data-question', 'care-explore');
  for (let i = 0; i < 6; i++) await choose(page, 'no');
  await expect(page.locator('#guide-industries .guide-industry-card')).toHaveCount(0);
  await expect(page.locator('#guide-result-summary')).toContainText('軸を絞るだけの手がかり');
});

test('all unsure choices explain uncertainty without inventing industry rankings', async ({ page }) => {
  await start(page); await finish(page, Array(12).fill('unknown'));
  await expect(page.locator('#guide-result-summary')).toContainText('軸や業界を絞れませんでした');
  await expect(page.locator('#guide-industries .guide-industry-card')).toHaveCount(0);
  await expect(page.locator('#guide-draft-card')).toBeHidden();
  await expect(page.locator('#guide-company-questions')).toBeHidden();
});

test('a broad set of interests keeps ties visible instead of forcing three candidates', async ({ page }) => {
  await start(page); await finish(page, Array(12).fill('yes'));
  await expect(page.locator('#guide-result-summary')).toContainText('同じくらい関心');
  await expect(page.locator('#guide-axes .guide-axis-card')).toHaveCount(6);
  await expect(page.locator('#guide-industries .guide-industry-card')).toHaveCount(8);
  await expect(page.locator('#guide-industry-note')).toContainText('同点');
});

test('demo results preserve actual answers and their saved snapshot', async ({ page }) => {
  await start(page); await choose(page, 'no'); await choose(page, 'maybe');
  await page.locator('#guide-save-control').click();
  const snapshot = await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY);
  await page.locator('#home-button').click();
  const homeSnapshot = await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY);
  await page.locator('#guide-example').click();
  await expect(page.locator('#guide-demo')).toBeVisible();
  await expect(page.locator('#guide-copy-text')).toHaveValue(/架空の結果見本/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#guide-demo')).toBeVisible();
  await expect(page.locator('#guide-demo')).toContainText('架空の回答');
  await expect(page.locator('#guide-exit-demo')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBe(homeSnapshot);
  await page.locator('#guide-exit-demo').click();
  await expect(page.locator('#guide-count')).toHaveText('03 / 12');
  expect(JSON.parse(snapshot).answers).toEqual(JSON.parse(homeSnapshot).answers);
});

test('opt-in saving resumes exact question and disabling preserves the old workbook key', async ({ page }) => {
  await page.goto(path);
  await page.evaluate(key => localStorage.setItem(key, 'legacy-marker'), STORAGE_KEY);
  await page.locator('#guide-start').click(); await choose(page, 'maybe');
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBeNull();
  await page.locator('#guide-save-control').click(); await choose(page, 'no');
  await page.reload(); await expect(page.locator('#guide-count')).toHaveText('03 / 12');
  await expect(page.locator('#guide-save-toggle')).toBeChecked();
  await page.locator('#guide-save-control').click();
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('legacy-marker');
  await expect(page.locator('#guide-count')).toHaveText('03 / 12');
});

test('storage failures and corrupt snapshots preserve an operable guide', async ({ page }) => {
  await page.addInitScript(key => { localStorage.setItem(key, '{broken-guide'); Storage.prototype.setItem = () => { throw new DOMException('denied', 'QuotaExceededError'); }; }, GUIDE_STORAGE_KEY);
  await page.goto(path);
  await expect(page.locator('#guide-status')).toContainText('読み込めません');
  await expect(page.locator('body')).not.toContainText('{broken-guide');
  await page.locator('#guide-start').click(); await choose(page, 'yes');
  await page.locator('#guide-save-control').click();
  await expect(page.locator('#guide-save-toggle')).not.toBeChecked();
  await expect(page.locator('#guide-status')).toContainText('保存できません');
  await expect(page.locator('#guide-count')).toHaveText('02 / 12');
});

test('a newer saved answer in another tab pauses saving and requires replacement consent', async ({ page, context }) => {
  await start(page); await choose(page, 'yes'); await page.locator('#guide-save-control').click();
  const second = await context.newPage(); await second.goto(path);
  await choose(second, 'no');
  await expect(page.locator('#guide-status')).toContainText('別のタブ');
  const newer = await second.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY);
  await choose(page, 'maybe');
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBe(newer);
  await page.locator('#guide-save-control').click(); await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBe(newer);
  await second.close();
});

test('copy fallback, download and printing expose the current guide while sharing keeps answers private', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('denied'); } } }));
  const requests = []; page.on('request', request => requests.push(request.url() + (request.postData() ?? '')));
  await start(page); await finish(page);
  await page.locator('#guide-copy').click(); await expect(page.locator('#guide-copy-text')).toBeFocused();
  const text = await page.locator('#guide-copy-text').inputValue();
  const download = page.waitForEvent('download'); await page.locator('#guide-download').click();
  const file = await download; expect(file.suggestedFilename()).toBe('じぶんの手がかり-就活軸.txt');
  const chunks = []; for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe(text);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#guide-result')).toBeVisible(); await expect(page.locator('#result')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#share-button').click();
  const href = await page.getByRole('link', { name: 'Xで投稿', exact: true }).getAttribute('href');
  expect(href).not.toContain('care'); expect(href).not.toContain(encodeURIComponent('誰かの変化を'));
  await page.keyboard.press('Escape');
  expect(requests.filter(value => value.includes('career-guide') || value.includes(encodeURIComponent('かなり当てはまる')))).toEqual([]);
});

test('reset clears rendered result and only the guide snapshot after confirmation', async ({ page }) => {
  await start(page); await finish(page); await page.locator('#guide-save-control').click();
  await page.evaluate(key => localStorage.setItem(key, 'keep-workbook'), STORAGE_KEY);
  await page.locator('#guide-reset').click(); await page.locator('#confirm-cancel').click();
  await expect(page.locator('#guide-result')).toBeVisible();
  await page.locator('#guide-reset').click(); await page.locator('#confirm-ok').click();
  await expect(page.locator('#guide-welcome')).toBeVisible();
  await expect(page.locator('#guide-axes')).toBeEmpty(); await expect(page.locator('#guide-copy-text')).toHaveValue('');
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('keep-workbook');
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('#guide-result')).toBeHidden();
});

for (const width of [390, 768, 1440]) test(`guide welcome, choices and results fit ${width}px and support keyboard operation`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(path);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#guide-start').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#guide-question-title')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#guide-answers button').first()).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#guide-count')).toHaveText('02 / 12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await finish(page, supportAnswers.slice(1));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#about-button').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#about-dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#about-button')).toBeFocused();
});

test('opening the three fictional clue cards never changes answers or saving', async ({ page }) => {
  await start(page); await choose(page, 'no'); await page.locator('#guide-save-control').click();
  await page.locator('#home-button').click();
  const snapshot = await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY);
  const cards = page.locator('.guide-preview-card');
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await cards.nth(i).focus(); await page.keyboard.press('Enter');
    await expect(cards.nth(i)).toHaveAttribute('aria-expanded', 'true');
    await expect(cards.nth(i).locator('.guide-preview-content')).toBeVisible();
    await expect(page.locator('.guide-preview-card[aria-expanded=true]')).toHaveCount(1);
  }
  await expect(page.locator('.guide-fiction-label')).toHaveText('架空の見本');
  expect(await page.evaluate(key => localStorage.getItem(key), GUIDE_STORAGE_KEY)).toBe(snapshot);
  await page.locator('#guide-start').click(); await expect(page.locator('#guide-count')).toHaveText('02 / 12');
});

test('the passport counts unsure and negative answers equally and follows back and reload', async ({ page }) => {
  await start(page); await choose(page, 'unknown'); await choose(page, 'no');
  await expect(page.locator('#guide-collected-count')).toHaveText('2 / 12');
  await expect(page.locator('#guide-collection [data-axis=care]')).toHaveAttribute('data-count', '1');
  await expect(page.locator('#guide-collection [data-axis=improve]')).toHaveAttribute('data-count', '1');
  await expect(page.locator('#guide-journey .is-done')).toHaveCount(2);
  await page.locator('#guide-back').click(); await expect(page.locator('#guide-collected-count')).toHaveText('1 / 12');
  await expect(page.locator('#guide-collection [data-axis=improve]')).toHaveAttribute('data-count', '0');
  await page.locator('#guide-save-control').click(); await page.reload();
  await expect(page.locator('#guide-collected-count')).toHaveText('1 / 12');
  await expect(page.locator('#guide-journey [aria-current=step]')).toHaveAttribute('aria-label', '質問2 回答中');
});

test('rapid clicks collect one answer and a pending transition cannot reopen an abandoned screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await start(page);
  await page.locator('#guide-answers [data-answer=yes]').dblclick({ delay: 60 });
  await expect(page.locator('#guide-count')).toHaveText('02 / 12');
  await expect(page.locator('#guide-collected-count')).toHaveText('1 / 12');
  await expect(page.locator('#guide-answers [data-answer=yes]')).toBeEnabled();
  await page.evaluate(() => { document.querySelector('#guide-answers [data-answer=no]').click(); document.querySelector('#home-button').click(); });
  await page.waitForTimeout(350);
  await expect(page.locator('#guide-welcome')).toBeVisible(); await expect(page.locator('#guide-welcome-title')).toBeFocused();
  await page.locator('#guide-start').click(); await expect(page.locator('#guide-count')).toHaveText('03 / 12');
  await page.evaluate(() => { document.querySelector('#guide-answers [data-answer=unknown]').click(); document.querySelector('#about-button').click(); });
  await page.waitForTimeout(350);
  expect(await page.locator('#about-dialog').evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#home-button').click(); await page.locator('#guide-start').click();
  await page.evaluate(() => { document.querySelector('#guide-answers [data-answer=no]').click(); document.querySelector('#home-button').click(); document.querySelector('#reflection-button').click(); });
  await page.waitForTimeout(350); await expect(page.locator('#reflection')).toBeVisible(); await expect(page.locator('#guide')).toBeHidden();
});

test('reduced motion skips the reveal while result exploration and print keep complete information', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page); await finish(page, ['no', 'yes', 'yes', 'no', 'no', 'maybe', 'yes', 'maybe', 'maybe', 'no', 'no', 'no']);
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest('#guide')).length)).toBe(0);
  await page.locator('[data-guide-jump=guide-industries-title]').click();
  await expect(page.locator('#guide-industries-title')).toBeFocused();
  const more = page.locator('.guide-industry-more').first();
  await expect(more).not.toHaveAttribute('open', '');
  await more.locator('summary').first().focus(); await page.keyboard.press('Enter');
  await expect(more.locator('.guide-industry-check')).toBeVisible();
  const check = await more.locator('.guide-industry-check').textContent();
  await expect(page.locator('#guide-copy-text')).toHaveValue(new RegExp(check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const secondary = page.locator('.guide-other-evidence').first();
  expect(await secondary.count()).toBe(1);
  const evidence = await secondary.locator('p').first().textContent();
  expect(await page.locator('#guide-copy-text').inputValue()).toContain(evidence);
  expect(await page.locator('#guide-copy-text').inputValue()).toContain(await more.locator('.guide-job-link').getAttribute('href'));
  await more.locator('summary').first().click();
  await page.emulateMedia({ media: 'print' });
  await expect(more.locator('.guide-industry-check')).toBeVisible();
  await expect(page.locator('.guide-result-nav')).toBeHidden();
  await page.emulateMedia({ media: 'screen' }); await expect(more).not.toHaveAttribute('open', '');
});

test('printing during the result entrance keeps the clue cards fully legible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(path); await page.locator('#guide-example').click();
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.target?.classList.contains('guide-axis-card')) { animation.pause(); animation.currentTime = 30; }
    }
    window.addEventListener('beforeprint', () => { window.printedCardOpacity = getComputedStyle(document.querySelector('.guide-axis-card')).opacity; });
  });
  const pdf = await page.pdf(); expect(pdf.length).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.printedCardOpacity)).toBe('1');
  await expect(page.locator('#guide-demo')).toBeVisible();
});
