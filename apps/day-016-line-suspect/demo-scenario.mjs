import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は file:// でページを開くが、このアプリはESモジュールを使うので file:// では動かない。
   振り付けの中でローカルHTTPサーバーを立てて開き直す（day-008 と同じ手）。

   さらに、上流には繋がない。本物で録ると回線の当たり外れがそのまま映像になって、
   撮り直すたび内容が変わる。ここでは「下りだけ遅く、通信中に遅延が跳ね、夜だけ落ちる回線」を
   作って、このアプリがいちばん言いたいことが映るようにしている。 */

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
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

// 1本あたりの見かけの速さ。下りは4本・上りは2本並列なので、合計で下り25Mbps／上り100Mbpsになる
const DOWN_PER_STREAM = 6.25e6;
const UP_PER_STREAM = 85e6; // Playwrightのroute処理は並列に流れないので、狙いの合計100Mbpsに対して高めに置く
const LOADED_EXTRA_MS = 180; // 通信中だけ往復が遅くなる＝バッファブロートの再現

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function stubNetwork(page) {
  let inflight = 0;
  await page.route('**/speed.cloudflare.com/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'cf-meta-ip',
      'cf-meta-ip': '2400:4053:0:0:0:0:0:1'
    };

    if (url.pathname === '/__up') {
      inflight += 1;
      await sleep((Number(route.request().postDataBuffer()?.length ?? 1e6) * 8) / UP_PER_STREAM * 1000);
      inflight -= 1;
      return route.fulfill({ status: 200, body: '', headers });
    }

    const bytes = Number(url.searchParams.get('bytes') ?? 0);
    if (bytes === 0) {
      // 往復時間の測定。何かが流れている最中だけ遅くする
      await sleep(8 + (inflight > 0 ? LOADED_EXTRA_MS : 0));
      return route.fulfill({ status: 200, body: '', headers });
    }
    inflight += 1;
    await sleep((bytes * 8) / DOWN_PER_STREAM * 1000);
    inflight -= 1;
    return route.fulfill({ status: 200, body: Buffer.alloc(bytes), headers });
  });
}

/** 「昼は出るのに夜だけ落ちる」履歴。時間帯の判定が出る状態を作る */
function historyFixture() {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const at = (hour, dl, ul) => ({
    t: midnight.getTime() + hour * 3600_000,
    dl, ul, li: 24, ld: 40, lu: 52, jit: 5, grade: 'B', v6: true, eco: false
  });
  return [at(3, 158, 112), at(7, 166, 128), at(12, 149, 96), at(16, 141, 87), at(21, 24, 79), at(22, 19, 74)];
}

async function prepare(page) {
  const base = await ensureServer();
  await stubNetwork(page);
  await page.addInitScript((items) => {
    window.localStorage.setItem('day016.history.v1', JSON.stringify({ v: 1, items }));
  }, historyFixture());
  await page.goto(base, { waitUntil: 'load' });
}

export default async function (page, h) {
  await prepare(page);
  // 頭は仕上げで切り落とす前提。1コマ目が「測定バーが動いているところ」になるよう、すぐ押す
  await h.pause(150);
  await page.click('#start');
  await page.waitForSelector('#result:not([hidden])', { timeout: 20_000 });
  await h.pause(2500);          // 診断を読む間
  await h.scrollTo('.numbers');
  await h.pause(2400);          // 数値ひとつずつに評価と「できること」が付いている
  await page.click('#scales-details summary');
  await h.scrollTo('#scale-tables');
  await h.pause(2800);          // 目安表（どの数字がどれくらいなら何ができるか）
  await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' }));
  await h.pause(2000);
  await h.scrollTo('#history');
  await h.pause(2200);          // 夜だけ落ちている表
  await h.scrollTop();
  await h.pause(600);
}

// スクショは「診断が出ている状態」を撮る。開いた直後の空の画面では何のアプリか伝わらない
export const shotScroll = 430;
export async function shotSetup(page) {
  await prepare(page);
  await page.click('#start');
  await page.waitForSelector('#result:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(400);
}
