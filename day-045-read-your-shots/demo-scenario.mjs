import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
let base;
async function server() {
  if (base) return base;
  const http = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }).end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
  });
  await new Promise(done => http.listen(0, '127.0.0.1', done)); http.unref();
  return base = `http://127.0.0.1:${http.address().port}/`;
}
async function start(page, record = false) {
  await page.goto(`${await server()}?seed=20260921#auto`, { waitUntil: 'load' });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__day045?.state() === 'playing');
  if (record) await page.evaluate(() => window.__day045.recordEvents(true));
  if (record) await page.locator('.hud').evaluate(hud => hud.scrollIntoView({ block: 'start', behavior: 'instant' }));
  else await page.evaluate(() => window.scrollTo(0, 0));
}
export default async function demo(page, h) {
  // 読込・開始前の録画部分は書き出し時に除き、最初の実プレイ画面を1コマ目にする。
  await start(page, true);
  await h.pause(18000);
  const cues = await page.evaluate(() => ({ secondsAtEnd: window.__day045.seconds(), events: window.__day045.events() }));
  await writeFile(join(tmpdir(), 'day-045-demo-cues.json'), JSON.stringify(cues));
}
export const shotScroll = 0;
// スクショは「育ったあと」を写す。開始直後だとレベルもアイテムも出ておらず、いまの遊びが伝わらない。
export async function shotSetup(page) {
  await start(page);
  await page.waitForFunction(() => window.__day045.snapshot().level >= 8, null, { timeout: 90000 });
  // アイテムが落ちている瞬間を待つ。出なければレベルだけで撮る。
  await page.waitForFunction(() => window.__day045.snapshot().items.length > 0, null, { timeout: 20000 }).catch(() => {});
}
