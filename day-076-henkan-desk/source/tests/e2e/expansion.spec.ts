import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { parse as parseYaml } from 'yaml';

type Downloaded = { filename: string; bytes: Buffer };
async function saveResult(page: Page, extension: string): Promise<Downloaded> {
  await expect(page.locator('.result-row.succeeded')).toHaveCount(1);
  await expect(page.locator('.result-row.failed')).toHaveCount(0);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.length).toBeGreaterThan(0);
  return { filename: download.suggestedFilename(), bytes };
}
async function choosePdf(page: Page, operation: string) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'PDFツール' }).click();
  await page.getByLabel('変換ツール').selectOption(`pdf-${operation}`);
}
async function selectPdf(page: Page) {
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles({ name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: await syntheticPdf() });
  await expect(page.getByText('このPDFは 3 ページです。')).toBeVisible();
}
async function syntheticPdf(widths = [300, 310, 320]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [index, width] of widths.entries()) {
    const page = doc.addPage([width, 400]);
    page.drawText(`Page ${index + 1}`, { x: 20, y: 350, size: 20, font, color: rgb(0.1, 0.2, 0.7) });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
async function pageWidths(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages().map(page => page.getWidth());
}
function watchUploads(page: Page) {
  const requests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') requests.push(request.url()); });
  return requests;
}

type DataExample = { operation: string; extension: string; check: (text: string) => void };
const dataExamples: DataExample[] = [
  { operation: 'csv-json', extension: 'json', check: text => expect(JSON.parse(text)).toEqual([{ name: '佐藤', score: '85' }, { name: '鈴木', score: '92' }]) },
  { operation: 'json-csv', extension: 'csv', check: text => expect(text).toBe('name,score\r\n佐藤,85\r\n鈴木,92') },
  { operation: 'csv-tsv', extension: 'tsv', check: text => expect(text).toBe('name\tscore\r\n佐藤\t85\r\n鈴木\t92') },
  { operation: 'tsv-csv', extension: 'csv', check: text => expect(text).toBe('name,score\r\n佐藤,85\r\n鈴木,92') },
  { operation: 'json-pretty', extension: 'json', check: text => { expect(text).toContain('\n  "name":'); expect(JSON.parse(text)).toEqual({ name: 'へんかんデスク', tools: ['PDF', '画像', 'データ'] }); } },
  { operation: 'json-minify', extension: 'json', check: text => expect(text).toBe('{"name":"へんかんデスク","ready":true}') },
  { operation: 'json-yaml', extension: 'yaml', check: text => expect(parseYaml(text)).toEqual({ name: 'へんかんデスク', ready: true }) },
  { operation: 'yaml-json', extension: 'json', check: text => expect(JSON.parse(text)).toEqual({ name: 'へんかんデスク', ready: true, tools: ['PDF', '画像'] }) },
  { operation: 'markdown-html', extension: 'html', check: text => { expect(text).toContain('<!doctype html>'); expect(text).toContain('<h1>こんにちは</h1>'); expect(text).toContain('<strong>かんたん変換</strong>'); expect(text).not.toContain('<script'); } },
  { operation: 'html-text', extension: 'txt', check: text => { expect(text.replace(/\n/g, '')).toBe('こんにちは文章を取り出します。'); expect(text).toContain('\n'); } },
  { operation: 'base64-encode', extension: 'txt', check: text => expect(Buffer.from(text, 'base64').toString('utf8')).toBe('こんにちは、世界！') },
  { operation: 'base64-decode', extension: 'txt', check: text => expect(text).toBe('こんにちは') },
  { operation: 'url-encode', extension: 'txt', check: text => expect(text).toBe(encodeURIComponent('検索する言葉 & 画像')) },
  { operation: 'url-decode', extension: 'txt', check: text => expect(text).toBe('こんにちは') },
];
for (const example of dataExamples) {
  test(`integrated data sample saves correct ${example.operation} content`, async ({ page }) => {
    const uploads = watchUploads(page);
    await page.goto('/');
    await page.getByRole('tab', { name: 'テキスト・データ変換' }).click();
    await expect(page.getByLabel('変換ツール').locator('option')).toHaveCount(14);
    await page.getByLabel('変換ツール').selectOption(`data-${example.operation}`);
    await page.getByRole('button', { name: 'サンプルを試す', exact: true }).click();
    await expect(page.getByLabel('変換するテキスト', { exact: true })).not.toHaveValue('');
    await page.getByRole('button', { name: '変換する', exact: true }).click();
    const saved = await saveResult(page, example.extension);
    expect(saved.filename).toBe(`input.${example.extension}`);
    example.check(saved.bytes.toString('utf8'));
    expect(uploads).toEqual([]);
  });
}

test('integrated images PDF obeys reordered inputs and saves one combined result', async ({ page }) => {
  const uploads = watchUploads(page);
  await choosePdf(page, 'images-pdf');
  const imageData = await page.evaluate(() => [[320, 160, '#e44848'], [640, 240, '#315cf5']].map(([width, height, color]) => {
    const canvas = document.createElement('canvas'); canvas.width = Number(width); canvas.height = Number(height);
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = String(color); ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }));
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles(imageData.map((data, index) => ({ name: index ? 'blue.png' : 'red.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') })));
  await page.getByRole('button', { name: 'blue.pngを上へ', exact: true }).click();
  await expect(page.locator('.source-list .file-description strong')).toHaveText(['blue.png', 'red.png']);
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'pdf');
  expect(saved.filename).toBe('images.pdf');
  expect(await pageWidths(saved.bytes)).toEqual([480, 240]);
  expect((await PDFDocument.load(saved.bytes)).getPages().map(page => page.getHeight())).toEqual([180, 120]);
  await expect(page.locator('.result-actions')).toContainText('2 / 2件');
  expect(uploads).toEqual([]);
});

test('integrated PDF merge obeys file reordering and saves one combined PDF', async ({ page }) => {
  await choosePdf(page, 'merge');
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles([
    { name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: await syntheticPdf() },
    { name: 'last.pdf', mimeType: 'application/pdf', buffer: await syntheticPdf([420]) },
  ]);
  await page.getByRole('button', { name: 'last.pdfを上へ', exact: true }).click();
  await expect(page.locator('.source-list .file-description strong')).toHaveText(['last.pdf', 'three-pages.pdf']);
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'pdf');
  expect(saved.filename).toBe('merged.pdf');
  expect(await pageWidths(saved.bytes)).toEqual([420, 300, 310, 320]);
  await expect(page.locator('.result-actions')).toContainText('2 / 2件');
});

test('integrated PDF extraction saves the requested pages in order', async ({ page }) => {
  await choosePdf(page, 'extract'); await selectPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('3,1');
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'pdf');
  expect(saved.filename).toBe('three-pages-extract.pdf');
  expect(await pageWidths(saved.bytes)).toEqual([320, 300]);
});

test('integrated PDF split saves selected one-page PDFs in ZIP', async ({ page }) => {
  await choosePdf(page, 'split'); await selectPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('1,3');
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'zip');
  const entries = unzipSync(saved.bytes);
  expect(Object.keys(entries)).toEqual(['page-001.pdf', 'page-003.pdf']);
  expect(await pageWidths(entries['page-001.pdf']!)).toEqual([300]);
  expect(await pageWidths(entries['page-003.pdf']!)).toEqual([320]);
});

test('integrated PDF reorder validates then saves the new page order', async ({ page }) => {
  await choosePdf(page, 'reorder'); await selectPdf(page);
  await page.getByLabel('新しいページ順', { exact: true }).fill('1,1,3');
  await expect(page.locator('.convert-button')).toBeDisabled();
  await page.getByLabel('新しいページ順', { exact: true }).fill('3,1,2');
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'pdf');
  expect(await pageWidths(saved.bytes)).toEqual([320, 300, 310]);
});

test('integrated PDF rotation changes only the selected page', async ({ page }) => {
  await choosePdf(page, 'rotate'); await selectPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('2');
  await page.getByLabel('回転する角度', { exact: true }).selectOption('90');
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'pdf');
  const pages = (await PDFDocument.load(saved.bytes)).getPages();
  expect(pages.map(page => page.getRotation().angle)).toEqual([0, 90, 0]);
  expect(pages.map(page => page.getWidth())).toEqual([300, 310, 320]);
});

test('integrated PDF optimization preserves all pages without increasing file size', async ({ page }) => {
  await choosePdf(page, 'optimize'); await selectPdf(page);
  const original = await syntheticPdf();
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'pdf');
  expect(saved.filename).toBe('three-pages-optimized.pdf');
  expect(await pageWidths(saved.bytes)).toEqual([300, 310, 320]);
  expect(saved.bytes.length).toBeLessThanOrEqual(original.length);
});

test('integrated PDF text extraction saves real text from selected pages', async ({ page }) => {
  const uploads = watchUploads(page);
  await choosePdf(page, 'text'); await selectPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('2-3');
  await page.locator('.convert-button').click();
  const saved = await saveResult(page, 'txt');
  expect(saved.filename).toBe('three-pages.txt');
  const text = saved.bytes.toString('utf8');
  expect(text).toContain('Page 2'); expect(text).toContain('Page 3'); expect(text).not.toContain('Page 1');
  expect(text).toContain('--- 2ページ ---');
  expect(uploads).toEqual([]);
});

test('integrated PDF rasterization saves actual PNG and JPG pages inside ZIPs', async ({ page }) => {
  const uploads = watchUploads(page);
  await choosePdf(page, 'pdf-images'); await selectPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('2-3');
  await page.getByLabel('画像の倍率', { exact: true }).selectOption('1');
  await page.locator('.convert-button').click();
  const png = unzipSync((await saveResult(page, 'zip')).bytes);
  expect(Object.keys(png)).toEqual(['page-002.png', 'page-003.png']);
  for (const [index, name] of Object.keys(png).entries()) {
    const bytes = Buffer.from(png[name]!);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBe(310 + index * 10); expect(bytes.readUInt32BE(20)).toBe(400);
  }
  await page.getByLabel('画像の形式', { exact: true }).selectOption('jpeg');
  await page.locator('.convert-button').click();
  const jpg = unzipSync((await saveResult(page, 'zip')).bytes);
  expect(Object.keys(jpg)).toEqual(['page-002.jpg', 'page-003.jpg']);
  for (const bytes of Object.values(jpg)) expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
  expect(uploads).toEqual([]);
});

async function inlineImagePdf(edge:number){
  const doc=await PDFDocument.create(),page=doc.addPage([100,100]);
  const before=Buffer.from(`q 100 0 0 100 0 0 cm BI /W ${edge} /H ${edge} /CS /G /BPC 1 ID\n`),after=Buffer.from('\nEI Q');
  const content=Buffer.concat([before,Buffer.alloc(Math.ceil(edge/8)*edge),after]);
  page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(content)));
  return Buffer.from(await doc.save());
}
test('production PDF rendering rejects excessive inline images and preserves normal content',async({page})=>{
  await choosePdf(page,'pdf-images');
  await page.getByLabel('画像の倍率',{exact:true}).selectOption('1');
  await page.getByLabel('変換するファイル',{exact:true}).setInputFiles({name:'too-large.pdf',mimeType:'application/pdf',buffer:await inlineImagePdf(5000)});
  await expect(page.locator('.convert-button')).toBeEnabled();await page.locator('.convert-button').click();
  await expect(page.locator('.result-row.failed')).toContainText('大きすぎる画像');
  await expect(page.getByRole('button',{name:'保存',exact:true})).toHaveCount(0);
  await page.getByLabel('変換するファイル',{exact:true}).setInputFiles({name:'normal.pdf',mimeType:'application/pdf',buffer:await inlineImagePdf(4000)});
  await expect(page.locator('.convert-button')).toBeEnabled();await page.locator('.convert-button').click();
  const entries=unzipSync((await saveResult(page,'zip')).bytes);
  const pixel=await page.evaluate(async(bytes)=>{const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);image.close();return [...context.getImageData(50,50,1,1).data];},[...entries['page-001.png']!]);
  expect(pixel).toEqual([0,0,0,255]);
});
