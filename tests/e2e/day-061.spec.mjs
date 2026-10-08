import { test, expect } from '@playwright/test';
const PATH = '/day-061-kumimae/';
const field = (page, key) => page.locator(`[data-field="${key}"]`);
async function category(page, value) { await page.getByLabel('入力する部品', { exact: true }).selectOption(value); }
async function open(page) { await page.goto(PATH); await expect(page.getByRole('heading', { name: /組む前に、\s*サイズを確かめる。/ })).toBeVisible(); }

test('架空例の模式図と明示した未確認が表示され、外部データを取得しない', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url()); });
  await open(page);
  await expect(page.getByTestId('manual-diagram')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('manual-results')).toContainText('未確認');
  await expect(page.locator('.manual-examples')).toContainText('実製品の仕様ではありません');
  await page.getByLabel('分解して見る').check();
  await page.getByRole('button', { name: '視点を戻す' }).click();
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('GPU長の不足、取消、規格不一致、未入力を区別する', async ({ page }) => {
  await open(page); await category(page, 'gpu');
  await field(page, 'gpu_length').fill('400');
  await expect(page.getByTestId('manual-results')).toContainText('40mm');
  await expect(page.getByTestId('manual-results').locator('[data-severity="error"]')).toHaveCount(1);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(field(page, 'gpu_length')).toHaveValue('300');
  await category(page, 'cpu'); await field(page, 'cpu_socket').selectOption('LGA1700');
  await expect(page.getByTestId('manual-results').locator('[data-severity="error"]')).toHaveCount(1);
  await category(page, 'gpu'); await field(page, 'gpu_length').fill('');
  await expect(page.getByTestId('manual-results')).toContainText('未入力');
  await expect(page.getByTestId('manual-diagram')).toHaveAttribute('data-ready', 'false');
});

test('価格の0円・不正値・永続化と、電力未入力の下限表示', async ({ page }) => {
  await open(page); await category(page, 'cpu');
  await field(page, 'price_cpu').fill('0');
  await expect(page.locator('.manual-summary')).toContainText('1/8');
  await field(page, 'price_cpu').fill('-1');
  await expect(field(page, 'price_cpu')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.manual-summary')).toContainText('価格未入力');
  await field(page, 'price_cpu').fill('32000');
  await field(page, 'cpu_max_power').fill('');
  await expect(page.locator('.manual-summary')).toContainText('≥');
  await page.reload(); await category(page, 'cpu');
  await expect(field(page, 'price_cpu')).toHaveValue('32000');
  await expect(field(page, 'cpu_max_power')).toHaveValue('');
  await expect(page.locator('.manual-summary')).toContainText('32,000');
});

test('仕様リンクを別端末で復元し、価格はメモだけへ含める', async ({ page, browser }) => {
  await open(page); await category(page, 'gpu');
  await field(page, 'gpu_length').fill('310'); await field(page, 'price_gpu').fill('48000');
  await page.getByRole('button', { name: '構成を共有・保存', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'この構成を共有・保存' });
  await expect(dialog.getByLabel('構成メモ', { exact: false })).toHaveValue(/48,000/);
  const url = new URL(await dialog.getByLabel('仕様リンク', { exact: true }).inputValue());
  expect(url.origin).toBe('https://hundred-days.pages.dev');
  const context = await browser.newContext(); const other = await context.newPage();
  await other.goto(new URL(PATH + url.hash, page.url()).href); await category(other, 'gpu');
  await expect(field(other, 'gpu_length')).toHaveValue('310');
  await expect(field(other, 'price_gpu')).toHaveValue('');
  await expect(other.locator('.manual-notice')).toContainText('共有された仕様');
  await context.close();
});

test('クリップボード拒否でも手動コピーでき、実際にPNGを保存できる', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true }));
  await open(page); await expect(page.getByTestId('manual-diagram')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '構成を共有・保存', exact: true }).click();
  await page.getByRole('button', { name: '構成メモをコピー', exact: true }).click();
  await expect(page.locator('.manual-share-feedback')).toContainText('コピーできません');
  await expect(page.getByRole('dialog').getByRole('textbox').last()).toBeVisible();
  const promised = page.waitForEvent('download');
  await page.getByRole('button', { name: '3D画像を保存', exact: true }).click();
  const download = await promised; expect(download.suggestedFilename()).toBe('kumimae.png');
  expect(await download.failure()).toBeNull();
});

test('保存拒否・壊れた共有リンクでも入力を継続できる', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  await page.goto(PATH + '#spec=broken');
  await expect(page.locator('.manual-warning').first()).toContainText('保存できません');
  await expect(page.locator('.manual-notice')).toContainText('共有リンクを読み込めません');
  await field(page, 'case_width').fill('250'); await expect(field(page, 'case_width')).toHaveValue('250');
});

test('WebGLが使えない端末でも仕様の入力と判定は使える', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return String(kind).includes('webgl') ? null : original.call(this, kind, ...args); }; });
  await open(page); await expect(page.getByTestId('manual-diagram')).toContainText('3Dを表示できません');
  await category(page, 'gpu'); await field(page, 'gpu_length').fill('400');
  await expect(page.getByTestId('manual-results')).toContainText('40mm');
});

for (const width of [390, 768, 1440]) test(`${width}pxで入力・共有が重ならずキーボードで使える`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await open(page);
  await page.getByRole('link', { name: '寸法を入力する' }).click();
  const select = page.getByLabel('入力する部品', { exact: true }); await select.focus(); await expect(select).toBeFocused(); await select.selectOption('motherboard');
  const slots = field(page, 'board_memory_slots'); await slots.focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('3'); await expect(slots).toHaveValue('3');
  await page.getByRole('button', { name: '構成を共有・保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'この構成を共有・保存' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'この構成を共有・保存' })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('公開物に開発用データがなく、画面から利用条件を読める', async ({ page, request }) => {
  await open(page);
  for (const file of ['source/src/domain/manual.ts', 'source/research/parts-data/cpu.json', 'models/model.glb', 'tests/release.test.mjs']) expect((await request.get(PATH + file)).status()).toBe(404);
  await page.getByRole('link', { name: 'データと利用条件', exact: true }).click();
  await expect(page.getByRole('heading', { name: '入力値と作例' })).toBeVisible();
  const notices = await request.get(PATH + 'legal/THIRD_PARTY_NOTICES.txt');
  expect(notices.ok()).toBe(true); expect(await notices.text()).toContain('Permission is hereby granted');
});
