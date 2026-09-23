import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/markdown; charset=utf-8' };
let base;
// ESモジュールとvendorのthree.jsを読むので file:// では開けない。ミニサーバーを立てて開き直す。
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
async function begin(page) {
  await page.goto(await server(), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__day047?.state() === 'ready', null, { timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700); // 開始画面を一瞬見せてから押す
  await page.locator('#start').click();
  const box = await page.locator('#scene').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.62);
  await page.mouse.down();
}
// 押し続けると光速の99.999%まで約49秒。録画は等速で撮り、仕上げで走る部分だけ3倍に早回しする（結果画面は等速）。
export default async function demo(page, h) {
  await begin(page);
  await page.waitForFunction(() => window.__day047.state() === 'result', null, { timeout: 90000 });
  await page.mouse.up();
  await h.pause(2500);
}
export const shotScroll = 0;
// スクショは「世界が変わったあと」を撮る。開始直後だと牧場のままで、この作品の射程が写らない。
export async function shotSetup(page) {
  await begin(page);
  await page.waitForFunction(() => window.__day047.snapshot().speed >= 120000, null, { timeout: 90000 });
  await page.mouse.up();
}
