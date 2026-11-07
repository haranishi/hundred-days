import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeState, exampleState, settlementText } from '../../day-085-warikan/lib/model.js';

const path = '/day-085-warikan/';
const key = 'day085-warikan-v1';
const load = (page) => page.goto(path);
const sample = async (page) => { await load(page); await page.getByRole('button', { name: /4人旅行の見本/ }).click(); };
const yes = async (page, name) => page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
async function member(page, name) {
  await page.getByRole('textbox', { name: 'メンバーの名前', exact: true }).fill(name);
  await page.locator('#member-form').getByRole('button', { name: /追加/ }).click();
}
async function payment(page, label, amount) {
  await page.getByLabel('金額', { exact: true }).fill(amount);
  await page.getByLabel('支払いの内容').fill(label);
  await page.getByRole('button', { name: /支払いを追加/ }).click();
}

test('first visit explains the next action, validates names and completes an integer-yen settlement', async ({ page }) => {
  await load(page); await expect(page.locator('#amount')).toBeDisabled();
  await expect(page.locator('#copy-result')).toBeDisabled();
  await member(page, 'あおい'); await member(page, 'はる'); await member(page, 'りん');
  await member(page, 'あおい'); await expect(page.locator('#member-error')).toContainText('同じ名前');
  await expect(page.locator('#members > li')).toHaveCount(3);
  await payment(page, '電車代', '１，００１');
  await expect(page.locator('#total')).toHaveText('¥1,001'); await expect(page.locator('.transfer')).toHaveCount(2);
  await expect(page.locator('.transfer-value')).toHaveText(['¥333', '¥334']);
  await page.locator('.breakdown summary').click();
  await expect(page.locator('.balance-table tbody tr').first()).toContainText('334円');
  await expect(page.locator('#copy-result')).toBeEnabled();
  await page.reload(); await expect(page.locator('#expenses > li')).toHaveCount(1); await expect(page.locator('#total')).toHaveText('¥1,001');
});
test('input errors and an empty beneficiary selection preserve existing payments', async ({ page }) => {
  await sample(page); const initial = await page.locator('#total').innerText();
  await page.locator('#amount').fill('1e3'); await page.locator('#expense-label').fill('食事'); await page.locator('#save-expense').click();
  await expect(page.locator('#expense-error')).toContainText('整数'); await expect(page.locator('#copy-result')).toBeDisabled();
  await page.locator('#amount').fill('100');
  for (const checkbox of await page.locator('#participants input').all()) await checkbox.uncheck();
  await page.locator('#save-expense').click(); await expect(page.locator('#expense-error')).toContainText('対象者');
  await expect(page.locator('#total')).toHaveText(initial); await expect(page.locator('#expenses > li')).toHaveCount(4);
  await page.locator('#cancel-expense').click(); await yes(page, 'やめる'); await expect(page.locator('#amount')).toHaveValue('100');
  await page.locator('#cancel-expense').click(); await yes(page, '取り消す'); await expect(page.locator('#copy-result')).toBeEnabled();
});
test('subset payments, editing, cancellation and deletion recompute the receipt', async ({ page }) => {
  await sample(page); await expect(page.locator('#total')).toHaveText('¥46,000'); await expect(page.locator('.transfer')).toHaveCount(3);
  await page.getByRole('button', { name: '宿泊代を編集', exact: true }).click();
  await page.locator('#amount').fill('20000'); await page.getByRole('button', { name: '支払いを更新', exact: true }).click();
  await expect(page.locator('#total')).toHaveText('¥42,000'); await expect(page.locator('#expenses > li')).toHaveCount(4);
  await page.getByRole('button', { name: '夜ごはんを削除', exact: true }).click(); await yes(page, 'やめる');
  await expect(page.locator('#expenses > li')).toHaveCount(4);
  await page.getByRole('button', { name: '夜ごはんを削除', exact: true }).click(); await yes(page, '削除する');
  await expect(page.locator('#total')).toHaveText('¥34,000'); await expect(page.locator('#expenses > li')).toHaveCount(3);
  await page.locator('#payer').selectOption('b');
  for (const checkbox of await page.locator('#participants input').all()) await checkbox.uncheck();
  await page.locator('#participants').getByLabel('ゆう', { exact: true }).check();
  await payment(page, '代わりに購入', '1000'); await expect(page.locator('#total')).toHaveText('¥35,000');
  await expect(page.locator('#expenses > li').last()).toContainText('はるが立て替え · ゆうで割り勘');
});
test('renaming updates payments, referenced members cannot be removed and new members can', async ({ page }) => {
  await sample(page); await page.getByRole('button', { name: 'あおいの名前を変更', exact: true }).click();
  await page.locator('#rename-name').fill('あお'); await page.getByRole('button', { name: '変更する', exact: true }).click();
  await expect(page.locator('#expenses')).toContainText('あおが立て替え');
  await page.getByRole('button', { name: 'あおを削除', exact: true }).click(); await expect(page.locator('#notice')).toContainText('先に支払い');
  await member(page, '追加の人'); await page.getByRole('button', { name: '追加の人を削除', exact: true }).click(); await expect(page.locator('#members > li')).toHaveCount(4);
});
test('equal shares show no-transfer state, and reset cancellation retains saved data', async ({ page }) => {
  await load(page); await member(page, 'A'); await member(page, 'B');
  await payment(page, 'コーヒーA', '100'); await page.locator('#payer').selectOption({ label: 'B' }); await payment(page, 'コーヒーB', '100');
  await expect(page.locator('.settled')).toContainText('送金は0回'); await expect(page.locator('#copy-result')).toBeEnabled();
  await page.getByRole('button', { name: '最初から', exact: true }).click(); await yes(page, 'やめる'); await page.reload();
  await expect(page.locator('#total')).toHaveText('¥200');
  await page.getByRole('button', { name: '最初から', exact: true }).click(); await yes(page, '消して始める');
  await expect(page.locator('#members > li')).toHaveCount(0); await page.reload(); await expect(page.locator('#expenses > li')).toHaveCount(0);
});
test('copy produces accurate LINE text and a data URL; generic sharing omits personal data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await sample(page);
  await page.locator('#copy-result').click(); await expect(page.locator('#notice')).toContainText('精算文をコピーしました');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(settlementText(exampleState()));
  await page.locator('#copy-state').click(); const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toBe('https://rairakku.com/100days/day-085-warikan/' + encodeState(exampleState()));
  const shared = page.locator('.share');
  expect(await shared.getByRole('link', { name: 'Xで投稿' }).getAttribute('href')).not.toContain('%23v1');
  await shared.getByRole('button', { name: 'リンクをコピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://rairakku.com/100days/day-085-warikan/');
});
test('shared data requires consent, cancellation preserves saved state and import is a snapshot', async ({ page }) => {
  await load(page); await member(page, '元の名前');
  const hash = encodeState(exampleState()); await page.goto(path + hash);
  await expect(page.getByRole('dialog')).toContainText('4人・支払い4件'); await yes(page, 'やめる');
  await expect(page.locator('#members')).toContainText('元の名前'); expect(page.url()).not.toContain('#v1');
  await page.goto(path + hash); await yes(page, 'この精算を開く');
  await expect(page.locator('#total')).toHaveText('¥46,000'); await expect(page.locator('#notice')).toContainText('共有時点のコピー');
  await page.reload(); await expect(page.locator('#total')).toHaveText('¥46,000');
});
test('broken shared links do not overwrite saved input', async ({ page }) => {
  await sample(page); await page.goto(path + '#v1=invalid');
  await expect(page.locator('#notice')).toContainText('共有URLを読み込めませんでした'); await expect(page.locator('#total')).toHaveText('¥46,000');
});
test('unavailable clipboard exposes selectable manual-copy content', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    document.execCommand = () => false;
  });
  await sample(page); await page.locator('#copy-result').click();
  await expect(page.locator('#manual-copy')).toBeVisible(); await expect(page.locator('#copy-text')).toHaveValue(settlementText(exampleState()));
});
test('storage denied and corrupt storage report failure while calculations remain usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked'); } }));
  await sample(page); await expect(page.locator('#save-status')).toContainText('保存できません');
  await expect(page.locator('#total')).toHaveText('¥46,000'); await expect(page.locator('#copy-result')).toBeEnabled();
});
test('corrupted storage is not modified merely by opening the page', async ({ page }) => {
  await page.addInitScript(({ key }) => localStorage.setItem(key, '{broken'), { key }); await load(page);
  await expect(page.locator('#notice')).toContainText('保存データを読み込めません');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('{broken');
  await member(page, 'A'); await expect(page.locator('#members > li')).toHaveCount(1);
});
test('another tab cannot silently overwrite current work', async ({ page, context }) => {
  await sample(page); const other = await context.newPage(); await other.goto(path); await member(other, '別タブ');
  await expect(page.locator('#save-status')).toContainText('保存を停止');
  await member(page, '今のタブ'); await expect(page.locator('#members')).toContainText('今のタブ');
  const saved = JSON.parse(await other.evaluate((key) => localStorage.getItem(key), key));
  expect(saved.members.map((member) => member.name)).toContain('別タブ'); expect(saved.members.map((member) => member.name)).not.toContain('今のタブ');
});
test('all DOM output handles script-like text literally', async ({ page }) => {
  await load(page); await member(page, '<img src=x>'); await member(page, 'B'); await payment(page, '<svg onload=alert(1)>', '100');
  await expect(page.locator('#members')).toContainText('<img src=x>'); await expect(page.locator('#expenses')).toContainText('<svg onload=alert(1)>');
  await expect(page.locator('#members img, #expenses svg')).toHaveCount(0);
});
test('keyboard users can start, enter members and create a payment', async ({ page }) => {
  await load(page); await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: '入力へ進む' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#member-name')).toBeFocused();
  await page.keyboard.type('A'); await page.keyboard.press('Enter'); await page.keyboard.type('B'); await page.keyboard.press('Enter');
  await page.locator('#amount').focus(); await page.keyboard.type('100'); await page.keyboard.press('Tab'); await page.keyboard.type('Train');
  await page.keyboard.press('Enter'); await expect(page.locator('#total')).toHaveText('¥100'); await expect(page.locator('#amount')).toBeFocused();
});
test('production CSP permits the app; input and URL fragments never enter network requests', async ({ page, context }) => {
  const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8');
  const block = headers.split('/day-085-warikan/*')[1].split('\n\n')[0];
  const csp = block.split('\n').find((line) => line.includes('Content-Security-Policy:')).split('Content-Security-Policy:')[1].trim();
  const requests = [], errors = [];
  page.on('request', (request) => requests.push(request.url())); page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/day-085-warikan/**', async (route) => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } }); });
  await sample(page); await page.getByRole('button', { name: 'あおいの名前を変更', exact: true }).click();
  await page.locator('#rename-name').fill('PRIVATE-8505'); await page.getByRole('button', { name: '変更する', exact: true }).click();
  expect(errors).toEqual([]); expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(true);
  expect(requests.join('\n')).not.toContain('PRIVATE-8505'); expect(requests.join('\n')).not.toContain('#v1');
});

test('maximum total and long names fit at narrow widths, and limits prevent accidental extra records', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const members = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `${i}あいうえおかきくけこさしすせそたちつ` }));
    localStorage.setItem(key, JSON.stringify({ version: 1, members, expenses: Array.from({ length: 100 }, (_, i) => ({ id: `e${i}`, label: '旅行', payerId: 'p0', amount: 1000000000, participantIds: members.map((member) => member.id) })) }));
  }, { key });
  await load(page); await expect(page.locator('#total')).toHaveText('¥100,000,000,000');
  await expect(page.locator('#member-form button')).toBeDisabled(); await expect(page.locator('#save-expense')).toBeDisabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px`).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: '旅行を編集', exact: true }).first().click(); await expect(page.locator('#save-expense')).toBeEnabled();
  await page.getByRole('button', { name: '支払いを更新', exact: true }).click(); await expect(page.locator('#expense-count')).toHaveText('100件');
});

for (const width of [390, 768, 1440]) {
  test(`receipt and controls are usable without horizontal overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await sample(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const controls = await page.locator('button:visible, .participant:visible').evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, height: element.getBoundingClientRect().height })));
    for (const control of controls) expect(control.height, control.text).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`day085-${width}.png`), fullPage: true });
    await page.locator('#result').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`day085-${width}-viewport.png`) });
  });
}
