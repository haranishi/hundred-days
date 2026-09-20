import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は最初に file:// で開くため、ESモジュールと fetch（同梱JSON）が動かない。
   振り付け内でこのアプリを配信するミニHTTPサーバーへ開き直す（Day 028 と同じ）。
   地図タイル・カメラ画像は実ネットワークから読む。中継API（Windy）は無いので 404＝未設定として扱われる。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png'
};
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

// タリン市の交差点カメラ（静止画・毎分更新）。画がはっきりしていて、デモでも見栄えが安定する
const TALLINN_CAMERA = 'n8244685419';
// 「映像」だけに絞った状態で種 58 を入れ直すと、ロッテルダム港のコンテナ埠頭のライブ配信（YouTube）に当たる（2026-09-06 実測）
const DEMO_SEED = 58;

async function ready(page) {
  await page.waitForSelector('#map[data-ready="true"]', { timeout: 30_000 });
  // 件数の文言はチップで絞っているときだけ出る。データが揃った印はパネル側の data-loaded を見る
  await page.waitForSelector('#panel[data-loaded="true"]', { timeout: 30_000 });
  // 世界図のクラスタ円が描かれるまで（データ約1.8MBの読込後）
  await page.waitForFunction(() => globalThis.__cameraMap?.queryRenderedFeatures({ layers: ['camera-clusters'] }).length > 0, null, { timeout: 30_000 }).catch(() => {});
}

export default async function demo(page, h) {
  /* 「どこかの窓を開く」は乱択。録画のたびに違うカメラ（読み込みの遅い提供元もある）になるので、
     Math.random を種付きの擬似乱数に差し替えて再現できるようにする。ボタンは本当に押している。 */
  await page.addInitScript(() => {
    globalThis.__E2E__ = true;
    let state = 1;
    // 地図ライブラリも Math.random を使うので、押す直前に種を入れ直せるようにしておく
    globalThis.__seedReset = (seed) => { state = seed >>> 0; };
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  });
  await page.goto(await ensureServer(), { waitUntil: 'load' });
  await ready(page);
  await h.pause(1600);

  // 検索→候補→選択。静止画のカメラが開き、国・向き・現地時刻が出る
  await page.click('#camera-search');
  await page.type('#camera-search', 'Tallinn', { delay: 90 });
  await page.waitForSelector('#search-results [role="option"]');
  await h.pause(700);
  await page.click(`#search-results [role="option"][data-camera-id="${TALLINN_CAMERA}"], #search-results [role="option"]`);
  await page.waitForFunction(() => { const img = document.querySelector('.viewer img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 20_000 }).catch(() => {});
  await h.pause(2200);

  // 詳細（国・向き・区分・現地時刻）まで下へ
  await page.evaluate(() => document.querySelector('.panel-content')?.scrollTo({ top: 420, behavior: 'smooth' }));
  await h.pause(1800);
  await page.evaluate(() => document.querySelector('.panel-content')?.scrollTo({ top: 0, behavior: 'smooth' }));
  await h.pause(600);

  // いったん閉じて、種別を「映像」だけに絞ってから「どこかの窓を開く」：知らない土地のライブ配信へ飛ぶ
  await page.getByRole('button', { name: '詳細を閉じる' }).click();
  await h.pause(500);
  await page.getByRole('button', { name: '画像', exact: true }).click();
  await h.pause(500);
  await page.getByRole('button', { name: 'リンク', exact: true }).click();
  await h.pause(900);
  await page.evaluate((seed) => globalThis.__seedReset(seed), DEMO_SEED);
  await page.getByRole('button', { name: 'どこかの窓を開く' }).click();
  await page.waitForFunction(() => document.querySelector('.viewer iframe'), null, { timeout: 15_000 }).catch(() => {});
  await h.pause(4200);
}

export const shotScroll = 0;
export async function shotSetup(page) {
  await page.setViewportSize({ width: 1200, height: 750 });
  await page.addInitScript(() => { globalThis.__E2E__ = true; });
  await page.goto(`${await ensureServer()}#cam=${TALLINN_CAMERA}`, { waitUntil: 'load' });
  await ready(page);
  await page.waitForFunction(() => { const img = document.querySelector('.viewer img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
