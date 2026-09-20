import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は file:// でページを開くが、このアプリはESモジュールと fetch を使うので
   file:// では動かない（day-008 と同じ事情）。振り付けの中でHTTPサーバーを立てて開き直す。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

async function open(page) {
  // 公開しているスクリーンショットが暗い配色なので、動画も揃える
  await page.emulateMedia({ colorScheme: 'dark' });
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
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
}

/* ⚠️ この振り付けは「助走」を含めて撮る。開いた直後は入力欄が空で、国会会議録APIの応答も
   数秒かかる。**その間がいちばん退屈な絵**なので、結果が出そろってから見せ始める。
   Playwrightの録画はページを作った瞬間から止められないので、仕上げで頭を切り落とす
   （tools/trim-demo.mjs）。1コマ目は必ず「年別のグラフが出ている」状態にする。 */
export default async function (page, h) {
  await open(page);

  /* 助走：ここは全部切り落とす。ヤングケアラーは2021年に政策課題として立ち上がっており、
     棒の形そのものが説明になるので題材に選んでいる。 */
  await page.fill('#q', 'ヤングケアラー');
  await page.fill('#from', '2018');
  await page.fill('#to', '2026');
  await page.click('#go');
  await page.waitForSelector('#cards .card', { timeout: 45_000 });
  await page.waitForFunction(() => document.querySelectorAll('.ministry').length > 0);

  // ①推移を見せる。ここが1コマ目になる
  await h.scrollTo('#sec-year', 300);
  await h.pause(3_400);

  // ②いちばん多い年を押すと、その年の答弁だけに絞られる
  await page.click('.bar:nth-child(5)'); // 2022年
  await h.pause(2_600);

  // ③どの省庁が答えてきたか
  await h.scrollTo('#sec-ministry', 800);
  await h.pause(3_000);

  // ④実際の答弁を読ませる。出典リンクと引用コピーが見える位置まで下ろす
  await h.scrollTo('#sec-list', 900);
  await h.pause(4_200);
  await h.scrollTo('#cards .card:nth-child(2)', 800);
  await h.pause(3_000);
}
