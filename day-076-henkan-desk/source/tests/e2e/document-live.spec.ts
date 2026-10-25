import { test, expect } from '@playwright/test';
import { sampleDocx } from '../documents/fixtures';
test('a real Japanese DOCX converts to a downloadable PDF after consent', async ({ page }) => {
  test.skip(!process.env.E2E_DOCUMENTS, 'Requires the isolated local document engine.');
  await page.goto('/');
  await page.getByRole('tab', { name: '文書を変換' }).click();
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles({ name: '日本語の提出資料.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: sampleDocx({ embeddedImage: true, hyperlink: 'https://example.com/' }) });
  await expect(page.getByRole('button', { name: 'PDFに変換する' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '文書を変換サーバーへ送ることに同意します' }).check();
  await expect(page.getByRole('button', { name: 'PDFに変換する' })).toBeEnabled();
  await page.getByRole('button', { name: 'PDFに変換する' }).click();
  await expect(page.locator('.result-row.succeeded')).toContainText('日本語の提出資料.pdf');
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const download = await promise; expect(download.suggestedFilename()).toBe('日本語の提出資料.pdf');
  const { readFile } = await import('node:fs/promises'); const pdf = await readFile((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-'); expect(pdf.length).toBeGreaterThan(1000);
});

for (const kind of ['xlsx','pptx'] as const) {
  test(`a real Japanese ${kind.toUpperCase()} converts through the catalog and downloads as PDF`, async ({ page }) => {
    test.skip(!process.env.E2E_DOCUMENTS, 'Requires the isolated local document engine.');
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL(`../documents/fixtures/japanese.${kind}`, import.meta.url));
    const mime = kind === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    await page.goto('/');
    await page.getByRole('tab', { name: '文書を変換' }).click();
    await page.getByLabel('変換ツール', { exact: true }).selectOption(`${kind}-pdf`);
    await page.getByLabel('変換するファイル', { exact: true }).setInputFiles({ name: `日本語資料.${kind}`, mimeType: mime, buffer: source });
    await expect(page.getByRole('button', { name: 'PDFに変換する' })).toBeDisabled();
    await page.getByRole('checkbox', { name: '文書を変換サーバーへ送ることに同意します' }).check();
    await page.getByRole('button', { name: 'PDFに変換する' }).click();
    await expect(page.locator('.result-row.succeeded')).toContainText('日本語資料.pdf');
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '保存', exact: true }).click();
    const download = await pending; expect(download.suggestedFilename()).toBe('日本語資料.pdf');
    const bytes = await readFile((await download.path())!); expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
    const { PDFDocument } = await import('pdf-lib'); expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
}
