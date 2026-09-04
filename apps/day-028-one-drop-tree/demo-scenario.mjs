import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は最初に file:// で開くためESモジュールを読めない。
   振り付け内でこのアプリを配信するミニHTTPサーバーへ開き直す。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

// count 日ぶんの日付。最後の日は 2026-09-04 の lastOffset 日前（既定は昨日）
const daysThrough = (count, lastOffset = 1) => Array.from({ length: count }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8, 4 - lastOffset - (count - 1 - index)));
  return date.toISOString().slice(0, 10);
});

async function prepare(page, count, lastOffset = 1) {
  await page.clock.setFixedTime(new Date('2026-09-04T09:00:00+09:00'));
  await page.addInitScript(({ wateredDays }) => {
    localStorage.setItem('day028.tree.v1', JSON.stringify({
      v: 1,
      seed: 280904,
      plantedOn: wateredDays[0],
      wateredDays,
      updatedAt: '2026-09-03T00:00:00.000Z'
    }));
  }, { wateredDays: daysThrough(count, lastOffset) });
  await page.goto(await ensureServer(), { waitUntil: 'load' });
  await page.waitForSelector('#water');
}

export default async function demo(page, h) {
  /* 6日ぶりのしおれた木から始める。水をあげると葉が持ち上がり、今日のぶんが伸びる＝
     「育つ」と「枯れない」の両方が15秒で伝わる。頭は tools/trim-demo.mjs で切り、1コマ目をしずくが落ちる途中にする。 */
  await prepare(page, 12, 6);
  await h.pause(1400);
  await page.click('#water');
  await page.waitForFunction(() => document.getElementById('app').dataset.growing === 'false');
  await h.pause(2000);
  await page.click('#save');
  await page.waitForFunction(() => document.getElementById('message').textContent === '保存しました');
  await h.pause(1400);
  await page.click('#replay');
  await page.waitForFunction(() => document.getElementById('app').dataset.replaying === 'false');
  await h.pause(1600);
  await h.scrollTo('.about-card', 900);
  await h.pause(1300);
  await h.scrollTop();
  await page.hover('#water');
  await h.pause(2600);
}

export const shotScroll = 0;
export async function shotSetup(page) {
  await page.setViewportSize({ width: 1200, height: 750 });
  await prepare(page, 26);
  await page.evaluate(() => window.scrollTo(0, 0));
}
