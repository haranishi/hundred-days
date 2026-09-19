// 架空の入力例で、状況 → 内訳 → 資料 → メモの順に実画面を撮る。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
export async function setup(page) {
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const target = resolve(root, `.${path}`);
      if (!target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const body = await readFile(target);
      response.writeHead(200, { 'content-type': MIME[extname(target)] || 'application/octet-stream' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  server.unref();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('html[data-ready="true"]');
  return server;
}

export async function sampleSituation(page) {
  await page.locator('#stage').selectOption('after');
  await page.locator('#tenure').selectOption('3to6');
  await page.locator('#payment').selectOption('unpaid');
  await page.locator('#invoice').fill('120000');
  await page.locator('#deposit').fill('60000');
}

export async function sampleBreakdown(page) {
  await page.locator('#charge-cleaning').check();
  await page.locator('#amount-cleaning').fill('40000');
  await page.locator('#charge-wall').check();
  await page.locator('#amount-wall').fill('80000');
  await page.locator('[data-concern="contract"]').check();
  await page.locator('[data-concern="deposit"]').check();
}

export async function sampleDocuments(page) {
  await page.locator('[name="doc-contract"][value="have"]').check();
  await page.locator('[name="doc-invoice"][value="have"]').check();
  await page.locator('[name="doc-entry"][value="missing"]').check();
  await page.locator('[name="doc-exit"][value="have"]').check();
}

export async function shotSetup(page) {
  await setup(page);
  // 一覧画像は入力前の実画面。メモと入力欄の関係が同時に見える。
  await page.evaluate(() => window.scrollTo(0, 0));
}

export default async function (page, h) {
  await setup(page);
  await sampleSituation(page);
  await page.evaluate(() => {
    const label = document.createElement('span');
    label.textContent = '入力例・架空の金額';
    label.style.cssText = 'position:fixed;top:12px;right:16px;z-index:10;background:#fffefa;color:#253e35;padding:6px 10px;border:1px solid #7b8c80;border-radius:5px;font:12px sans-serif;pointer-events:none';
    document.body.append(label); window.scrollTo(0, 0);
  });
  await h.scrollTo('#invoice', 1600);
  await h.pause(800);
  await page.locator('#next').click();
  await page.locator('#charge-cleaning').check(); await page.locator('#amount-cleaning').fill('40000');
  await h.pause(700);
  await page.locator('#charge-wall').check(); await page.locator('#amount-wall').fill('80000');
  await h.pause(900);
  await page.locator('[data-concern="contract"]').check(); await page.locator('[data-concern="deposit"]').check();
  await h.pause(900);
  await page.locator('#next').click();
  await sampleDocuments(page); await h.pause(1100);
  await page.locator('#next').click(); await h.pause(2200);
  await h.scrollTo('#memo-questions', 1400); await h.pause(2200);
  await h.scrollTo('.export-area', 1200); await h.pause(1700);
}
