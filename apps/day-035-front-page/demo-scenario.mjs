import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。ES モジュールと中継のパスが file:// では動かないため。
   貼るのは自分の過去作3本。中継の戻り値は各 meta.json から組み立てるので、
   本番で同じURLを貼ったときと同じ見出し・同じリード文になる。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const appsDir = dirname(appDir);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8'
};

const SOURCES = [
  { dir: 'day-034-tide-now', photo: 'screenshot.webp' },
  { dir: 'day-033-did-it-shake', photo: null },
  { dir: 'day-032-laundry-dry', photo: null }
];

async function buildArticles() {
  const entries = [];
  for (const source of SOURCES) {
    const meta = JSON.parse(await readFile(join(appsDir, source.dir, 'meta.json'), 'utf8'));
    const url = `https://hundred-days.pages.dev/${source.dir}/`;
    entries.push([url, {
      body: {
        title: meta.title,
        lead: meta.description,
        image: source.photo ? `${url}${source.photo}` : null,
        site: '100 DAYS / 100 APPS',
        publishedAt: `${meta.finishedAt}T09:00:00+09:00`,
        canonical: url,
        host: 'hundred-days.pages.dev'
      },
      photo: source.photo ? join(appsDir, source.dir, source.photo) : null
    }]);
  }
  return new Map(entries);
}

async function serve() {
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
  return `http://127.0.0.1:${server.address().port}/`;
}

async function routeRelay(page, articles) {
  await page.route('**/api/day-035/page*', async (route) => {
    const url = new URL(route.request().url()).searchParams.get('url');
    const entry = articles.get(url);
    if (!entry) {
      await route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"upstream_unavailable"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entry.body) });
  });
  await page.route('**/api/day-035/image*', async (route) => {
    const src = new URL(route.request().url()).searchParams.get('src');
    const entry = [...articles.values()].find((item) => item.body.image === src);
    if (!entry?.photo) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/webp', body: await readFile(entry.photo) });
  });
}

export default async function (page, h) {
  const articles = await buildArticles();
  const baseUrl = await serve();
  await routeRelay(page, articles);
  await page.addInitScript(() => localStorage.removeItem('day-035-front-page'));
  await page.goto(baseUrl, { waitUntil: 'load' });
  await h.pause(250);

  const urls = [...articles.keys()];
  for (const [index, url] of urls.entries()) {
    if (index > 0) {
      await page.click('#more');
      await h.pause(320);
    }
    await page.fill('#url', '');
    await page.type('#url', url, { delay: 12 });
    await h.pause(200);
    await page.click('#submit');
    await page.waitForSelector('#app[data-state="ready"]');
    // 状態が変わるとフォームが隠れて位置がずれる。紙面を画面に入れ直す
    await h.scrollTo('#paper', 500);
    await h.pause(index === urls.length - 1 ? 2800 : 2300);
  }

  await h.scrollTo('#list', 700);
  await h.pause(1500);
  await h.scrollTo('#paper', 700);
  await h.pause(1800);
}

/* 一覧カードとOGPに使う静止画。中継を差し替えて、2本ぶんの紙面を組んでから撮る */
export async function shotSetup(page) {
  const articles = await buildArticles();
  const baseUrl = await serve();
  await routeRelay(page, articles);
  await page.addInitScript(() => localStorage.removeItem('day-035-front-page'));
  await page.goto(baseUrl, { waitUntil: 'load' });
  const urls = [...articles.keys()].slice(0, 2);
  for (const [index, url] of urls.entries()) {
    if (index > 0) await page.click('#more');
    await page.fill('#url', url);
    await page.click('#submit');
    await page.waitForSelector('#app[data-state="ready"]');
  }
  await page.waitForTimeout(600);
}
