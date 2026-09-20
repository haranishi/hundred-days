/* デモ動画とスクショの振り付け。

   record-demo.mjs は file:// でページを開くが、このアプリはESモジュールなので
   file:// では読み込めない。ここでローカルHTTPサーバーを立てて開き直す（day-008と同じ手）。

   遊びは自動で打たせる。打点ちょうど（±35ms）を人の手で連発するのは無理で、
   撮り直しに時間を取られるため。開発用の口（dev=）は URL に付けたときだけ開く。 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
};

let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

/** 音の時計を見ながら、打点ちょうどで押し続ける。 */
async function autoPlay(page) {
  await page.evaluate(() => {
    const api = window.__day012;
    const done = new Set();
    const step = () => {
      if (api.state() === 'result') return;
      const now = api.songSeconds();
      for (const time of api.noteTimes()) {
        if (done.has(time)) continue;
        if (now >= time) {
          api.press(performance.now());
          done.add(time);
        }
      }
      requestAnimationFrame(step);
    };
    step();
  });
}

export default async function (page, h) {
  const base = await ensureServer();
  await page.goto(`${base}#dev=demo`, { waitUntil: 'load' });
  await h.pause(1600);

  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.waitForFunction(() => document.getElementById('app').dataset.state === 'playing', null, { timeout: 10_000 });
  await autoPlay(page);

  await page.waitForFunction(() => document.getElementById('app').dataset.state === 'result', null, { timeout: 20_000 });
  await h.pause(1800);

  /* 音は録れないので、あとから同じ音符データで合成して重ねる（tools/render-demo-audio.mjs）。
     位置合わせに要るのは「曲の頭が、振り付けの終わりから何秒前か」だけ。
     それは終了時点の songSeconds() そのもの。 */
  const songStartFromEnd = await page.evaluate(() => window.__day012.songSeconds());
  await writeFile(
    join(tmpdir(), 'day-012-demo-cues.json'),
    JSON.stringify({ chart: 'demo', songStartFromEnd }, null, 2)
  );
}

/** スクショは、砲弾が飛んでいる最中を撮る。 */
export async function shotSetup(page) {
  const base = await ensureServer();
  await page.goto(`${base}#dev=on`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.waitForFunction(() => document.getElementById('app').dataset.state === 'playing', null, { timeout: 10_000 });
  await autoPlay(page);
  // 本編の拍26で当てた直後（判定は0.7秒だけ出る）。その頃、次の砲弾が中ほどまで来ている
  await page.waitForFunction(() => window.__day012.songSeconds() >= 15.05, null, { timeout: 25_000 });
}
