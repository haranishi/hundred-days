// デモ動画とスクショの振り付け。
// ESモジュールのアプリは file:// では読めないので、ここでミニHTTPサーバーを立てて開き直す。
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
let base;
async function server() {
  if (base) return base;
  const http = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res
        .writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
        .end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  });
  await new Promise(done => http.listen(0, '127.0.0.1', done));
  http.unref();
  return (base = `http://127.0.0.1:${http.address().port}/`);
}

// 自動操縦にどの面を何ミリ秒まかせるか。動画の見え方そのものなので、変えるときは録り直す。
// tools/render-demo-audio.mjs も同じ表を読んで、録画なしで音を組み直せるようにしている。
export const SEGMENTS = [
  // 1面目は餅を拾って「ちび → なまはげ」に変わるところが写る。
  { id: '1-1', ms: 7600 },
  // 里は家並みの屋根を渡る面。自動操縦がミスしないので、遊び方がそのまま伝わる。
  { id: '4-1', ms: 9600 },
];

// 録画で鳴った音の書き出し先。tools/render-demo-audio.mjs がここを読む。
export const CUES_FILE = join(tmpdir(), 'day-046-demo-cues.json');

// 遊びの画だけを写す。説明文や共有欄は録画中だけ畳む。
const FOCUS = `
  #controls, #save-note, footer, main > .note { display: none !important; }
  main { padding-bottom: 8px; }
`;

async function play(page, id) {
  await page.evaluate(level => window.__day046.begin(level), id);
  await page.evaluate(() => window.__day046.autopilot(true));
}

async function open(page) {
  await page.goto(`${await server()}`, { waitUntil: 'load' });
  await page.addStyleTag({ content: FOCUS });
  await page.evaluate(() => window.__day046.unlockAll());
}

export default async function demo(page, h) {
  await open(page);
  // 1面目が始まる直前から記録する。以後 at は「この瞬間からの秒」になる。
  await page.evaluate(() => window.__day046.recordEvents(true));
  for (const { id, ms } of SEGMENTS) {
    await play(page, id);
    await h.pause(ms);
  }
  const cues = await page.evaluate(() => ({
    secondsAtEnd: window.__day046.recordedSeconds(),
    events: window.__day046.events(),
  }));
  await writeFile(CUES_FILE, JSON.stringify(cues));
}

export const shotScroll = 0;

// スクショは里の場面。世界が一目で分かるところを選ぶ。
export async function shotSetup(page) {
  await open(page);
  await play(page, '4-1');
  await page.waitForFunction(() => window.__day046.snapshot().x > 300, null, { timeout: 20000 });
  await page.evaluate(() => window.__day046.autopilot(false));
  await page.evaluate(() => window.__day046.setInput({ left: false, right: false, jump: false }));
  await page.waitForTimeout(400);
}
