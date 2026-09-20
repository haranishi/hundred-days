import { test, expect } from '@playwright/test';
import { emptyData, encodeDraft, STORAGE_KEY } from '../../day-043-moveout-consult/lib/model.js';

const APP = '/day-043-moveout-consult/';
const ready = async (page) => {
  await page.goto(APP);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
};
const next = (page) => page.locator('#next').click();
const stubClipboard = (page) => page.addInitScript(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
});
test.beforeEach(async ({ page }) => { page.on('dialog', (dialog) => dialog.accept()); });

test('最初に用途と任意入力がわかり、未回答でもメモを作れる', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('退去費用、相談の準備');
  await expect(page.locator('#remember')).not.toBeChecked();
  await next(page); await next(page); await next(page);
  await expect(page.locator('#memo-heading')).toBeFocused();
  await expect(page.locator('#memo-invoice')).toHaveText('不明・未入力');
  await expect(page.locator('#memo-documents')).toContainText('未確認');
  expect(errors).toEqual([]);
});

test('3段階の情報がメモとコピーに反映され、敷金を勝手に相殺しない', async ({ page }) => {
  await stubClipboard(page); await ready(page);
  await page.locator('#stage').selectOption('after'); await page.locator('#tenure').selectOption('3to6');
  await page.locator('#payment').selectOption('unpaid'); await page.locator('#invoice').fill('１２０，０００');
  await page.locator('#deposit').fill('60000'); await next(page);
  await page.locator('#charge-cleaning').check(); await page.locator('#amount-cleaning').fill('40000');
  await page.locator('#charge-wall').check(); await page.locator('#amount-wall').fill('80000');
  await page.locator('[data-concern="contract"]').check(); await next(page);
  await page.locator('[name="doc-contract"][value="have"]').check();
  await page.locator('[name="doc-entry"][value="missing"]').check(); await next(page);
  await expect(page.locator('#memo-invoice')).toHaveText('120,000円');
  await expect(page.locator('#memo-deposit')).toHaveText('60,000円');
  await expect(page.locator('#memo-subtotal')).toContainText('120,000円');
  await expect(page.locator('#comparison')).toBeHidden();
  await page.locator('#copy-memo').click();
  const copied = await page.evaluate(() => window.copied);
  expect(copied).toContain('退去済み'); expect(copied).toContain('ない：入居時の写真');
  expect(copied).toContain('請求書に書かれた金額：120,000円'); expect(copied).toContain('契約書や特約');
  expect(copied).toContain('通話料'); await expect(page.locator('#export-status')).toContainText('コピーしました');
});

test('入力に戻る・手順移動でも値が残る', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('0'); await next(page);
  await page.locator('#charge-key').check(); await page.locator('#amount-key').fill('10000'); await next(page);
  await page.locator('#back').click(); await expect(page.locator('#amount-key')).toHaveValue('10000');
  await page.locator('#back').click(); await expect(page.locator('#invoice')).toHaveValue('0');
  await expect(page.locator('#memo-invoice')).toHaveText('0円');
});

test('不正金額はその場に説明し、出力前に入力欄へ戻す', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('-100'); await next(page);
  await expect(page.locator('#invoice')).toBeFocused(); await expect(page.locator('#invoice')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#form-error')).toContainText('空欄');
  await page.locator('#invoice').fill(''); await next(page);
  await page.locator('#charge-wall').check(); await page.locator('#amount-wall').fill('1e5');
  await page.locator('#back').click(); await page.locator('#download-memo').click();
  await expect(page.locator('#amount-wall')).toBeFocused(); await expect(page.locator('#step-title')).toContainText('費用');
  await page.locator('#amount-wall').fill(''); await next(page); await expect(page.locator('#step-title')).toContainText('資料');
});

test('内訳の一部が不明なら、部分合計であることを示す', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('100000'); await next(page);
  await page.locator('#charge-wall').check(); await page.locator('#amount-wall').fill('50000'); await page.locator('#charge-floor').check();
  await expect(page.locator('#memo-subtotal')).toHaveText('わかる分の小計 50,000円（金額不明 1項目）');
  await expect(page.locator('#comparison')).toBeHidden();
  await page.locator('#amount-floor').fill('0'); await expect(page.locator('#comparison')).toBeVisible();
  await page.locator('#charge-floor').uncheck(); await expect(page.locator('#memo-charges')).not.toContainText('フローリング');
  await page.locator('#charge-floor').check(); await expect(page.locator('#amount-floor')).toHaveValue('0');
});

test('下書きは選んだときだけ保存し、リロードで復元する', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('81234');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.locator('#remember').check(); await expect(page.locator('#storage-status')).toContainText('保存しました');
  await page.reload(); await expect(page.locator('#invoice')).toHaveValue('81234');
  await expect(page.locator('#remember')).toBeChecked(); await expect(page.locator('#storage-status')).toContainText('読み込みました');
  await page.locator('#remember').uncheck(); expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(page.locator('#invoice')).toHaveValue('81234');
});

test('保存容量・保存権限のエラーを成功と表示しない', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('denied', 'QuotaExceededError'); }; });
  await ready(page); await page.locator('#invoice').fill('30000'); await page.locator('#remember').check();
  await expect(page.locator('#storage-status')).toContainText('保存できません');
  await expect(page.locator('#invoice')).toHaveValue('30000');
});

test('壊れた保存内容でも空のフォームと相談先を表示する', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{"version":0}'), STORAGE_KEY);
  await ready(page); await expect(page.locator('#storage-status')).toContainText('読み込めません');
  await expect(page.locator('#invoice')).toHaveValue(''); await expect(page.locator('a[href="tel:188"]')).toBeVisible();
});

test('端末保存へのアクセス自体が拒否されても入力・出力できる', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
  await stubClipboard(page); await ready(page); await page.locator('#invoice').fill('15000');
  await page.locator('#copy-memo').click(); expect(await page.evaluate(() => window.copied)).toContain('15,000円');
});

test('全消去のキャンセル・確定と、他アプリの保存を消さないこと', async ({ page }) => {
  await ready(page); await page.evaluate(() => localStorage.setItem('unrelated-test-key', 'keep'));
  await page.locator('#invoice').fill('67890'); await page.locator('#remember').check();
  await page.locator('#reset').click(); await expect(page.locator('#cancel-reset')).toBeFocused();
  await page.locator('#cancel-reset').click(); await expect(page.locator('#invoice')).toHaveValue('67890');
  await page.locator('#reset').click(); await page.locator('#confirm-reset').click();
  await expect(page.locator('#invoice')).toHaveValue(''); await expect(page.locator('#remember')).not.toBeChecked();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-test-key'))).toBe('keep');
});

test('端末の下書きを消せないときも画面は消去し、保存データの残存を知らせる', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('76543'); await page.locator('#remember').check();
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new DOMException('denied', 'SecurityError'); }; });
  await page.locator('#remember').click(); await expect(page.locator('#remember')).toBeChecked();
  await expect(page.locator('#storage-status')).toContainText('削除できません');
  await page.locator('#reset').click(); await page.locator('#confirm-reset').click();
  await expect(page.locator('#invoice')).toHaveValue(''); await expect(page.locator('#storage-status')).toContainText('次に開いたとき戻る可能性');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('76543');
});

test('コピー失敗には別の保存方法を示す', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('blocked'); } } });
    document.execCommand = () => false;
  });
  await ready(page); await page.locator('#copy-memo').click();
  await expect(page.locator('#export-status')).toContainText('コピーできません'); await expect(page.locator('#export-status')).toContainText('テキスト保存');
});

test('日本語テキストファイルとして保存する', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('54321');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#download-memo').click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('退去費用の相談メモ.txt');
  const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8'); expect(text).toContain('54,321円'); expect(text).toContain('参考情報の確認日');
});

test('印刷ではフォームを隠してメモと出典だけを残す', async ({ page }) => {
  await ready(page); await page.locator('#invoice').fill('99887');
  await page.evaluate(() => { window.print = () => { window.printCalled = true; }; });
  await page.locator('#print-memo').click(); expect(await page.evaluate(() => window.printCalled)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#editor')).toBeHidden(); await expect(page.locator('.export-area')).toBeHidden();
  await expect(page.locator('#memo')).toBeVisible(); await expect(page.locator('#memo-invoice')).toHaveText('99,887円');
  await expect(page.locator('.print-sources')).toBeVisible(); await expect(page.locator('#share')).toBeHidden();
});

test('フォーム操作は外部通信やURLへの入力埋め込みを発生させない', async ({ page }) => {
  const external = []; page.on('request', (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await ready(page); await page.locator('#invoice').fill('876543'); await page.locator('#remember').check(); await next(page);
  await page.locator('#charge-wall').check(); await page.locator('[data-concern="deposit"]').check();
  expect(external).toEqual([]); expect(page.url()).not.toContain('876543');
  const x = await page.locator('.share__row a').first().getAttribute('href');
  expect(x).not.toContain('876543'); expect(decodeURIComponent(x)).toContain('退去費用、相談の準備');
  expect(await page.locator('input[type="file"]').count()).toBe(0);
});

test('端末の共有シートにも固定のアプリ紹介だけを渡す', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: async (value) => { window.shared = value; } }); });
  await ready(page); await page.locator('#invoice').fill('736521'); await page.getByRole('button', { name: '共有…', exact: true }).click();
  const shared = await page.evaluate(() => window.shared); expect(shared.url).toBe('https://hundred-days.pages.dev/day-043-moveout-consult/');
  expect(JSON.stringify(shared)).not.toContain('736521');
});

test('キーボードで開始・選択・手順移動し、ダイアログを閉じられる', async ({ page }) => {
  await ready(page); await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter'); await page.locator('#stage').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.locator('#next').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#step-title')).toBeFocused();
  await page.locator('#charge-cleaning').focus(); await page.keyboard.press('Space'); await expect(page.locator('#amount-cleaning')).toBeVisible();
  await page.locator('#reset').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#reset')).toBeFocused();
});

for (const width of [390, 768, 1440]) {
  test(`${width}pxでフォーム・メモ・共有が横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await ready(page);
    for (let step = 0; step < 3; step++) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (step === 1) { await page.locator('#charge-cleaning').check(); await page.locator('#amount-cleaning').fill('999999999'); }
      await next(page);
    }
    await expect(page.locator('#memo')).toBeVisible();
    const heights = await page.locator('.button, .steps button, .share__button').evaluateAll((buttons) => buttons.filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
  });
}

test('JavaScriptがなくても相談先と説明を読める', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto(baseURL + APP); await expect(page.locator('noscript .notice')).toContainText('JavaScript');
  await expect(page.locator('a[href="tel:188"]')).toBeVisible(); await context.close();
});

test('保存した下書きに不正金額があっても出力時に検出する', async ({ page }) => {
  const data = emptyData(); data.charges.wall = { selected: true, amount: '-5' };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, encodeDraft(data)]);
  await ready(page); await page.locator('#copy-memo').click();
  await expect(page.locator('#amount-wall')).toBeFocused(); await expect(page.locator('#amount-wall')).toHaveAttribute('aria-invalid', 'true');
});
