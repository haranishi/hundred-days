import { test, expect, type Page } from '@playwright/test';
async function selectImage(page: Page) {
  const base64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d')!; x.fillStyle = '#315cf5'; x.fillRect(0,0,320,480); x.fillStyle = '#f6aa46'; x.fillRect(320,0,320,480); x.fillStyle = '#ffffff'; x.fillRect(260,180,120,120); return c.toDataURL('image/png').split(',')[1]; });
  await page.getByLabel('変換するファイル', { exact: true }).setInputFiles({ name: 'テスト画像.png', mimeType: 'image/png', buffer: Buffer.from(base64,'base64') });
  await expect(page.getByLabel('比率とサイズ変更後のプレビュー')).toBeVisible();
}
test('ratio presets, custom padding, true WebP download and local-only images', async ({page}) => {
  const uploads: string[] = []; page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()); });
  await page.goto('/'); await selectImage(page);
  await page.getByRole('button',{name:'16:9',exact:true}).click();
  await expect(page.locator('.preview-label')).toContainText('640 × 360');
  await page.getByRole('button',{name:'変換する',exact:true}).click();
  await expect(page.locator('.result-description')).toContainText('640 × 360');
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button',{name:'保存',exact:true}).click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('テスト画像.webp'); const path = await download.path();
  const {readFile} = await import('node:fs/promises'); const bytes = await readFile(path!); expect(bytes.subarray(0,4).toString()).toBe('RIFF'); expect(bytes.subarray(8,12).toString()).toBe('WEBP');
  await page.getByRole('button',{name:'自由入力',exact:true}).click(); await page.getByLabel('自由比率の幅').fill('7'); await page.getByLabel('自由比率の高さ').fill('11');
  await page.getByRole('button',{name:'余白を足す',exact:true}).click(); await page.getByRole('group',{name:'出力形式'}).getByRole('button',{name:'PNG',exact:false}).click();
  await expect(page.getByText('表示中の結果は前回の設定です。',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'変換する',exact:true}).click(); await expect(page.locator('.result-meta')).toContainText('PNG');
  const dimensions = await page.locator('.result-meta').innerText(); const match = dimensions.match(/(\d+) × (\d+)/); expect(Number(match![1])*11).toBe(Number(match![2])*7);
  expect(uploads).toEqual([]);
});
test('invalid custom ratios disable conversion and allow correction', async ({page}) => {
  await page.goto('/'); await selectImage(page); await page.getByRole('button',{name:'自由入力',exact:true}).click();
  await page.getByLabel('自由比率の幅').fill('0'); await expect(page.getByRole('button',{name:'変換する',exact:true})).toBeDisabled(); await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('自由比率の幅').fill('4'); await page.getByLabel('自由比率の高さ').fill('5'); await expect(page.getByRole('button',{name:'変換する',exact:true})).toBeEnabled();
});
test('Word needs explicit consent and unavailable Word does not block images', async ({page}) => {
  await page.route('**/api/v1/capabilities', route => route.fulfill({json:{wordPdf:'available'}}));
  await page.goto('/'); await page.getByRole('tab',{name:'文書を変換'}).click(); await page.getByLabel('変換するファイル',{exact:true}).setInputFiles({name:'test.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('not a real document')});
  await expect(page.getByRole('button',{name:'PDFに変換する'})).toBeDisabled();
  await page.getByRole('checkbox',{name:'文書を変換サーバーへ送ることに同意します'}).check(); await expect(page.getByRole('button',{name:'PDFに変換する'})).toBeEnabled();
  await page.unroute('**/api/v1/capabilities'); await page.route('**/api/v1/capabilities', route => route.fulfill({json:{wordPdf:'unavailable'}}));
  await page.getByRole('tab',{name:'画像を変換'}).click(); await selectImage(page); await expect(page.getByRole('button',{name:'変換する',exact:true})).toBeEnabled();
});
test('layouts fit narrow, tablet and desktop sizes and share no file data', async ({page}) => {
  await page.goto('/');
  for (const width of [320,390,768,1440]) { await page.setViewportSize({width,height:950}); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.setViewportSize({width:390,height:844}); await page.getByText('共有',{exact:true}).click();
  const share = page.getByRole('link',{name:'Xで紹介'}); const href = await share.getAttribute('href'); expect(href).not.toContain('テスト画像'); expect(href).toContain('url=');
});

test('one image that cannot fit the ratio does not block a valid batch item', async ({page}) => {
  await page.goto('/');
  const images=await page.evaluate(()=>[1,640].map(width=>{const c=document.createElement('canvas');c.width=width;c.height=width===1?1:480;const x=c.getContext('2d')!;x.fillStyle='#315cf5';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];}));
  await page.getByLabel('変換するファイル',{exact:true}).setInputFiles(images.map((bytes,i)=>({name:i?'normal.png':'tiny.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')})));
  await expect(page.getByLabel('比率とサイズ変更後のプレビュー')).toBeVisible();
  await page.getByRole('button',{name:'16:9',exact:true}).click();
  await expect(page.getByRole('button',{name:'2枚を変換する'})).toBeEnabled();
  await page.getByRole('button',{name:'2枚を変換する'}).click();
  await expect(page.locator('.result-row.failed')).toHaveCount(1);
  await expect(page.locator('.result-row.succeeded')).toHaveCount(1);
  await expect(page.locator('.result-row.succeeded')).toContainText('640 × 360');
});
