import { test, expect } from '@playwright/test';
import { EXAMPLE, STORAGE_KEY } from '../../day-072-jibun-note/lib/model.js';

const path = '/day-072-jibun-note/';
async function openReflection(page) {
  await page.goto(path);
  await page.locator('#reflection-button').click();
}
async function openWork(page) {
  await openReflection(page);
  await page.locator('label[for="context-work"]').click();
  await page.getByRole('button', { name: '振り返りをはじめる' }).click();
}
async function fillStep(page, fields) {
  for (const field of fields) await page.locator('#field-' + field).fill(EXAMPLE[field]);
  await page.locator('#next-button').click();
}
async function complete(page) {
  await openWork(page);
  await fillStep(page, ['title', 'situation']);
  await fillStep(page, ['challenge', 'action']);
  await fillStep(page, ['result']);
  await page.getByRole('button', { name: '相手の話を聞いた', exact: true }).click();
  await page.getByRole('button', { name: 'やり方を工夫した', exact: true }).click();
  await page.getByRole('button', { name: '誰かの役に立つ', exact: true }).click();
  await page.locator('#field-reason').fill(EXAMPLE.reason);
  await page.locator('#next-button').click();
  await expect(page.locator('#result')).toBeVisible();
}

test('guided experience reaches evidence-backed results, then edits without losing answers', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await complete(page);
  await expect(page.locator('#strengths-list')).toContainText('相手を理解しようとする姿勢');
  await expect(page.locator('#strengths-list')).toContainText('改善する力');
  await expect(page.locator('#story-list')).toContainText(EXAMPLE.action);
  await expect(page.locator('#questions-list')).toContainText('この仕事は、誰のどんな困りごとを解決しますか？');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.getByRole('button', { name: '回答を見直す' }).click();
  await expect(page.locator('#field-title')).toHaveValue(EXAMPLE.title);
  await page.locator('#field-title').fill('新しい経験の見出し');
  await page.locator('#next-button').click();
  await expect(page.locator('#field-action')).toHaveValue(EXAMPLE.action);
  expect(errors).toEqual([]);
});

test('empty answers show a useful error and focus the missing field', async ({ page }) => {
  await openWork(page);
  await page.locator('#next-button').click();
  await expect(page.locator('#title-error')).toBeVisible();
  await expect(page.locator('#field-title')).toBeFocused();
  await page.locator('#field-title').fill('見出し');
  await page.locator('#next-button').click();
  await expect(page.locator('#field-situation')).toBeFocused();
  await expect(page.locator('#steps button[aria-current="step"]')).toContainText('場面');
});

test('choice limit is explained and a selected option can be changed', async ({ page }) => {
  await openReflection(page); await page.getByRole('button', { name: '見本で試す' }).click();
  for (let i = 0; i < 3; i++) await page.locator('#next-button').click();
  await page.getByRole('button', { name: '段取りを考えた', exact: true }).click();
  await expect(page.locator('#behaviors-error')).toContainText('2つまで');
  await page.getByRole('button', { name: '相手の話を聞いた', exact: true }).click();
  await page.getByRole('button', { name: '段取りを考えた', exact: true }).click();
  await expect(page.getByRole('button', { name: '段取りを考えた', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#behaviors-error')).toBeEmpty();
});

test('saving is opt-in, resumes exact text, and disabling deletes only this app', async ({ page }) => {
  await openWork(page); await page.locator('#field-title').fill('保存する途中の経験');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.evaluate(() => localStorage.setItem('other-app', 'untouched'));
  await page.locator('.save-switch').click();
  await page.reload();
  await page.locator('#reflection-button').click();
  await expect(page.locator('#field-title')).toHaveValue('保存する途中の経験');
  await expect(page.locator('#save-toggle')).toBeChecked();
  await page.locator('.save-switch').click();
  await expect(page.locator('#field-title')).toHaveValue('保存する途中の経験');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('other-app'))).toBe('untouched');
});

test('denied storage preserves entered text and reports the real status', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('denied', 'QuotaExceededError'); }; });
  await openWork(page); await page.locator('#field-title').fill('消えてはいけない入力');
  await page.locator('.save-switch').click();
  await expect(page.locator('#save-toggle')).not.toBeChecked();
  await expect(page.locator('#storage-status')).toContainText('保存できませんでした');
  await expect(page.locator('#field-title')).toHaveValue('消えてはいけない入力');
});

test('corrupt saved content does not prevent starting or expose raw saved data', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken-data'), STORAGE_KEY);
  await openReflection(page);
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#storage-status')).toContainText('読み込めません');
  await expect(page.locator('body')).not.toContainText('{broken-data');
  await page.locator('label[for="context-life"]').click();
  await page.getByRole('button', { name: '振り返りをはじめる' }).click();
  await expect(page.locator('#work')).toBeVisible();
});

test('a second tab pauses saving instead of overwriting its newer content', async ({ page, context }) => {
  await openWork(page); await page.locator('#field-title').fill('最初のタブ');
  await page.locator('.save-switch').click();
  const second = await context.newPage(); await openReflection(second);
  await second.locator('#field-title').fill('別のタブの新しい回答');
  await expect(page.locator('#storage-status')).toContainText('別のタブで保存内容が変わりました');
  await page.locator('#field-title').fill('最初のタブの未保存の回答');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).data.title, STORAGE_KEY)).toBe('別のタブの新しい回答');
  await page.locator('.save-switch').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).data.title, STORAGE_KEY)).toBe('別のタブの新しい回答');
  await second.close();
});

test('reset requires confirmation and preserves other applications storage', async ({ page }) => {
  await openWork(page); await page.locator('#field-title').fill('残したい経験');
  await page.locator('.save-switch').click();
  await page.evaluate(() => localStorage.setItem('other-app', 'untouched'));
  await page.getByRole('button', { name: '入力をすべて消す' }).click();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#field-title')).toHaveValue('残したい経験');
  await page.getByRole('button', { name: '入力をすべて消す' }).click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#welcome')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('other-app'))).toBe('untouched');
});

test('a failed deletion is reported truthfully while the in-memory form can restart', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.removeItem = () => { throw new DOMException('denied', 'SecurityError'); }; });
  await openWork(page); await page.locator('#field-title').fill('入力中の経験');
  await page.locator('.save-switch').click();
  await page.getByRole('button', { name: '入力をすべて消す' }).click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#storage-status')).toContainText('保存内容は削除できません');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();
});

test('a tab that never enabled saving cannot silently overwrite a different saved draft', async ({ page, context }) => {
  await openWork(page); await page.locator('#field-title').fill('未保存のタブA');
  const second = await context.newPage(); await openWork(second);
  await second.locator('#field-title').fill('保存するタブB');
  await second.locator('.save-switch').click();
  await page.locator('.save-switch').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).data.title, STORAGE_KEY)).toBe('保存するタブB');
  await second.close();
});

test('reset clears rendered answers and print does not reveal a previous report', async ({ page }) => {
  await complete(page);
  const privateTitle = '初期化で消す、私だけの経験072';
  await page.getByRole('button', { name: '回答を見直す' }).click();
  await page.locator('#field-title').fill(privateTitle);
  for (let step = 0; step < 4; step++) await page.locator('#next-button').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#result')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: '回答を見直す' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#result')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: '入力をすべて消す' }).click();
  await page.locator('#confirm-ok').click();
  expect(await page.locator('body').textContent()).not.toContain(privateTitle);
  await expect(page.locator('#copy-text')).toHaveValue('');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#result')).toBeHidden();
});

test('usage example shows the outcome and shares the protected example-start flow', async ({ page }) => {
  await openReflection(page);
  await page.getByRole('link', { name: '就活での使い方を、具体例で見る' }).click();
  await expect(page.locator('#usage-examples')).toBeInViewport();
  await expect(page.locator('#usage-strengths')).toContainText('相手を理解しようとする姿勢');
  await expect(page.locator('#usage-values')).toContainText('誰かの役に立つ');
  await expect(page.locator('#usage-question')).toContainText('この仕事は、誰のどんな困りごとを解決しますか？');
  await page.locator('#usage-example-button').click();
  await expect(page.locator('#field-title')).toHaveValue(EXAMPLE.title);
  await expect(page.locator('#demo-banner')).toBeVisible();
  await page.locator('#field-title').fill('自分で書き直した経験');
  await page.locator('#home-button').click();
  await page.locator('#reflection-button').click();
  await page.locator('#usage-example-button').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await page.locator('#start-button').click();
  await expect(page.locator('#field-title')).toHaveValue('自分で書き直した経験');
});

test('example replacement is confirmed and examples stay labeled in exported text', async ({ page }) => {
  await openWork(page); await page.locator('#field-title').fill('私の経験');
  await page.locator('#home-button').click();
  await page.locator('#reflection-button').click();
  await page.getByRole('button', { name: '見本で試す' }).click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#demo-banner')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.locator('#next-button').click();
  await expect(page.locator('#result-demo')).toBeVisible();
  await expect(page.locator('#copy-text')).toHaveValue(/^【架空の見本】/);
});

test('copy failure exposes selectable complete text and txt downloads the same report', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('denied'); } } }));
  await complete(page);
  await page.getByRole('button', { name: 'まとめをコピー' }).click();
  await expect(page.locator('#manual-copy')).toBeVisible();
  await expect(page.locator('#copy-text')).toBeFocused();
  await expect(page.locator('#copy-text')).toHaveValue(new RegExp(EXAMPLE.title));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'テキスト保存', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('じぶんの手がかり.txt');
  const stream = await file.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe(await page.locator('#copy-text').inputValue());
});

test('user text stays text and never enters requests or the application share link', async ({ page }) => {
  const marker = 'LOCAL_ONLY_072_UNIQUE'; const requests = [];
  page.on('request', request => requests.push(request.url() + (request.postData() ?? '')));
  await complete(page);
  await page.getByRole('button', { name: '回答を見直す' }).click();
  const malicious = '<img src=x onerror="window.__injected=1">' + marker;
  await page.locator('#field-title').fill(malicious.slice(0, 64));
  await page.locator('#field-situation').fill(marker + '<script>window.__injected=1</script>');
  for (let i = 0; i < 4; i++) await page.locator('#next-button').click();
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  const href = await page.getByRole('link', { name: 'Xで投稿', exact: true }).getAttribute('href');
  expect(href).not.toContain(marker);
  expect(href).toContain(encodeURIComponent('じぶんの手がかり'));
  expect(requests.some(value => value.includes(marker))).toBe(false);
});

for (const width of [390, 768, 1440]) {
  test(`welcome, input and result fit ${width}px and have accessible inputs`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openReflection(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await complete(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '回答を見直す' }).click();
    await expect(page.getByLabel('経験に、短い見出しを付ける')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#about-button').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#about-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#about-button')).toBeFocused();
  });
}
