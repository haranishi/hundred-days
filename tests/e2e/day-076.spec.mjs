import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile as readBytes } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const DIR = 'day-076-henkan-desk';
const BASE = `/${DIR}/`;
const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8');
const rule = headers.split(`/${DIR}/*`)[1]?.split(/\n(?=\S)/)[0] || '';
const csp = rule.match(/Content-Security-Policy:\s*([^\n]+)/)?.[1];
const observations = new WeakMap();

test.use({ reducedMotion: 'reduce', acceptDownloads: true });
test.beforeEach(async ({ page, context, baseURL }) => {
  expect(csp, 'Day76の生成CSPがない').toBeTruthy();
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain("'unsafe-eval'");
  const record = { posts: [], external: [], api: [], errors: [], policy: [], fonts: [] };
  observations.set(page, record);
  const origin = new URL(baseURL).origin;
  page.on('request', request => {
    const url = request.url();
    if (request.method() === 'POST') record.posts.push(url);
    if (!url.startsWith(`${origin}/`) && !/^(?:data|blob):/.test(url)) record.external.push(url);
    if (new URL(url).pathname.startsWith('/api/')) record.api.push(url);
    if (url.includes('/pdf-assets/standard_fonts/') && url.endsWith('.ttf')) record.fonts.push(url);
  });
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /content.security.policy|violates.*directive/i.test(message.text())) record.policy.push(message.text());
  });
  await page.addInitScript(() => {
    window.__day076Policy = [];
    document.addEventListener('securitypolicyviolation', event => window.__day076Policy.push(event.effectiveDirective));
  });
  // serve-dist does not interpret _headers. Exercise the actual generated policy,
  // including same-origin Worker scripts, rather than merely inspecting its text.
  await context.route(`**${BASE}**`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
});
test.afterEach(async ({ page }) => {
  const record = observations.get(page);
  expect(record.posts, '入力のPOST送信がある').toEqual([]);
  expect(record.external, '外部オリジンへの自動取得がある').toEqual([]);
  expect(record.api, '静的公開版でAPIに接続している').toEqual([]);
  expect(record.errors).toEqual([]);
  expect(record.policy).toEqual([]);
  if (!page.isClosed()) expect(await page.evaluate(() => window.__day076Policy || [])).toEqual([]);
});

function fixturePdf(labels = ['Page 1', 'Page 2', 'Page 3']) {
  // Entirely authored ASCII PDF; no third-party document or build dependency.
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
  const kids = labels.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${labels.length} >>`);
  const font = 3 + labels.length * 2;
  labels.forEach((label, index) => {
    const pageId = 3 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${300 + index * 10} 400] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    const content = `BT /F1 24 Tf 30 320 Td (${label}) Tj ET\n`;
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { result += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
function zipEntries(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  const count = bytes.readUInt16LE(end + 10), result = new Map();
  let at = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
    const method = bytes.readUInt16LE(at + 10), length = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const local = bytes.readUInt32LE(at + 42);
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + length);
    expect([0, 8]).toContain(method);
    result.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    at += 46 + nameLength + extra + comment;
  }
  return result;
}
async function save(page, extension) {
  await expect(page.locator('.result-row.succeeded')).toHaveCount(1);
  await expect(page.locator('.result-row.failed')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  return readBytes(await download.path());
}
async function choosePdf(page, operation) {
  await page.getByRole('tab', { name: 'PDFツール', exact: true }).click();
  await page.getByLabel('変換ツール', { exact: true }).selectOption(`pdf-${operation}`);
}
async function uploadPdf(page, bytes = fixturePdf(), name = 'authored.pdf') {
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles({ name, mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByText(/このPDFは \d+ ページです。/)).toBeVisible();
  await expect(page.locator('.convert-button')).toBeEnabled();
}
async function textOfPdf(page, bytes, pages = '') {
  await choosePdf(page, 'text');
  await uploadPdf(page, bytes);
  await page.getByLabel('対象ページ', { exact: true }).fill(pages);
  await page.locator('.convert-button').click();
  return (await save(page, 'txt')).toString('utf8');
}

test('Day76の公開版は端末内24ツールだけで、利用案内と配布フォントを読める', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('.header-note')).toHaveText('24のツールを、ひとつの場所に。');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: '文書を変換' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /変換サーバー/ })).toHaveCount(0);
  await choosePdf(page, 'merge');
  await expect(page.getByLabel('変換ツール').locator('option')).toHaveCount(9);
  const legal = page.getByRole('link', { name: '利用規約・プライバシー', exact: true });
  await expect(legal).toHaveAttribute('href', `${BASE}legal.html`);
  await legal.click();
  await expect(page).toHaveURL(new RegExp(`${BASE}legal\\.html$`));
  await expect(page.locator('body')).toContainText(/利用規約|プライバシー/);
  await page.goto(BASE);
  await page.getByRole('link', { name: 'ライセンス', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}licenses/$`));
  await expect(page.locator('body')).toContainText(/ライセンス|license/i);
  const font = await page.request.get(`${BASE}pdf-assets/standard_fonts/LiberationSans-Regular.ttf`);
  expect(font.ok()).toBe(true);
  expect((await font.body()).readUInt32BE(0)).toBe(0x00010000);
  const license = await page.request.get(`${BASE}pdf-assets/standard_fonts/LICENSE_OFL`);
  expect(license.ok()).toBe(true);
  expect(await license.text()).toMatch(/SIL OPEN FONT LICENSE/i);
});

test('Day76の本番CSPで4:5画像をWebPへ変換し、実体と寸法を保存できる', async ({ page }) => {
  await page.goto(BASE);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); context.fillStyle = '#315cf5'; context.fillRect(0, 0, 640, 480);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles({ name: 'authored.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByLabel('比率とサイズ変更後のプレビュー')).toBeVisible();
  await page.getByRole('button', { name: '4:5', exact: true }).click();
  await page.getByRole('button', { name: '変換する', exact: true }).click();
  const bytes = await save(page, 'webp');
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  const dimensions = await page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/webp' }));
    const result = [bitmap.width, bitmap.height]; bitmap.close(); return result;
  }, [...bytes]);
  expect(dimensions).toEqual([384, 480]);
});

test('Day76のCSVサンプルをJSON保存でき、不正JSONを修正して再実行できる', async ({ page }) => {
  await page.goto(BASE); await page.getByRole('tab', { name: 'テキスト・データ変換' }).click();
  await expect(page.getByLabel('変換ツール').locator('option')).toHaveCount(14);
  await page.getByRole('button', { name: 'サンプルを試す', exact: true }).click();
  await page.getByRole('button', { name: '変換する', exact: true }).click();
  expect(JSON.parse((await save(page, 'json')).toString('utf8'))).toEqual([{ name: '佐藤', score: '85' }, { name: '鈴木', score: '92' }]);
  await page.getByLabel('変換ツール').selectOption('data-json-pretty');
  await page.getByLabel('変換するテキスト', { exact: true }).fill('{broken: true}');
  await page.getByRole('button', { name: '変換する', exact: true }).click();
  await expect(page.locator('.result-row.failed')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
  await page.getByLabel('変換するテキスト', { exact: true }).fill('{"日本語":"修正できた","ready":true}');
  await page.getByRole('button', { name: '変換する', exact: true }).click();
  expect(JSON.parse((await save(page, 'json')).toString('utf8'))).toEqual({ 日本語: '修正できた', ready: true });
});

test('Day76の入力HTMLに外部画像やscriptがあっても取得・実行しない', async ({ page }) => {
  await page.goto(BASE); await page.getByRole('tab', { name: 'テキスト・データ変換' }).click();
  await page.getByLabel('変換ツール').selectOption('data-markdown-html');
  await page.getByLabel('変換するテキスト', { exact: true }).fill('# Authored\n\n<img src="https://example.invalid/input-only.png"><script>window.__day076InputExecuted=true</script>');
  await page.getByRole('button', { name: '変換する', exact: true }).click();
  const html = (await save(page, 'html')).toString('utf8');
  expect(html).toContain('<h1>Authored</h1>'); expect(html).not.toContain('<script'); expect(html).not.toContain('<img');
  expect(await page.evaluate(() => window.__day076InputExecuted)).toBeUndefined();
});

test('Day76のPDF画像化は本番CSPとHelvetica代替フォントでPNG/JPGのZIPを保存できる', async ({ page }) => {
  await page.goto(BASE); await choosePdf(page, 'pdf-images'); await uploadPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('2-3');
  await page.getByLabel('画像の倍率', { exact: true }).selectOption('1');
  await page.locator('.convert-button').click();
  const pngs = zipEntries(await save(page, 'zip'));
  expect([...pngs.keys()]).toEqual(['page-002.png', 'page-003.png']);
  for (const [index, bytes] of [...pngs.values()].entries()) {
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([310 + index * 10, 400]);
  }
  const darkPixels = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(20, 45, 200, 55); let count = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] < 150 && data[index + 1] < 150 && data[index + 2] < 150) count++;
    return count;
  }, [...pngs.values().next().value]);
  expect(darkPixels, 'Helveticaの本文が白紙になっている').toBeGreaterThan(50);
  await page.getByLabel('画像の形式', { exact: true }).selectOption('jpeg'); await page.locator('.convert-button').click();
  const jpgs = zipEntries(await save(page, 'zip'));
  expect([...jpgs.keys()]).toEqual(['page-002.jpg', 'page-003.jpg']);
  for (const bytes of jpgs.values()) expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
  await test.info().attach('pdf-font-requests', { body: Buffer.from(JSON.stringify(observations.get(page).fonts.map(url => new URL(url).pathname))), contentType: 'application/json' });
});

test('Day76のPDF文字抽出は指定したページの本文をUTF-8で保存できる', async ({ page }) => {
  await page.goto(BASE);
  const text = await textOfPdf(page, fixturePdf(), '2-3');
  expect(text).toContain('Page 2'); expect(text).toContain('Page 3'); expect(text).not.toContain('Page 1');
  expect(text).toContain('--- 2ページ ---');
});

test('Day76のPDF結合・抽出は入力順と指定ページを保存結果へ反映する', async ({ page }) => {
  await page.goto(BASE); await choosePdf(page, 'merge');
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles([
    { name: 'three.pdf', mimeType: 'application/pdf', buffer: fixturePdf() },
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: fixturePdf(['First authored page']) },
  ]);
  await page.getByRole('button', { name: 'first.pdfを上へ', exact: true }).click();
  await page.locator('.convert-button').click();
  const merged = await save(page, 'pdf'); expect(merged.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.locator('.result-actions')).toContainText('2 / 2件');
  const mergedText = await textOfPdf(page, merged);
  expect(mergedText.indexOf('First authored page')).toBeLessThan(mergedText.indexOf('Page 1'));
  expect(mergedText).toContain('Page 3');
  await choosePdf(page, 'extract'); await uploadPdf(page);
  await page.getByLabel('対象ページ', { exact: true }).fill('3,1'); await page.locator('.convert-button').click();
  const extracted = await save(page, 'pdf'); expect(extracted.subarray(0, 5).toString()).toBe('%PDF-');
  const extractedText = await textOfPdf(page, extracted);
  expect(extractedText.indexOf('Page 3')).toBeLessThan(extractedText.indexOf('Page 1')); expect(extractedText).not.toContain('Page 2');
});

test('Day76は390/768/1440pxで主要カテゴリを切り替えても横に溢れない', async ({ page }) => {
  await page.goto(BASE);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const name of ['画像を変換', 'PDFツール', 'テキスト・データ変換']) {
      await page.getByRole('tab', { name, exact: true }).click();
      if (name === 'テキスト・データ変換') await page.getByRole('button', { name: 'サンプルを試す', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px ${name}`).toBeLessThanOrEqual(1);
    }
  }
});
