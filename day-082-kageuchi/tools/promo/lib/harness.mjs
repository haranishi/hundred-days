// 紹介動画の撮影の土台：配信物（day-082-kageuchi/ の index.html と assets/）を小さな静的サーバーで配り、
// GPU のブラウザ（source/tools/lib/shoot.mjs の openBrowser・assertGpu）で開き、ページの時計を「仮の時計」に差し替える。
// 仮の時計：requestAnimationFrame と performance.now を横取りし、こちらが 1/60 秒ずつ進めたときだけゲームの1コマが回る。
// こうすると撮影（スクショ）に時間がかかっても、ゲームの中の時間は録画の 30fps とぴったり合う。ゲームのソースは変えない。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGpu, openBrowser } from '../../../source/tools/lib/shoot.mjs';

export const PROMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DAY = path.resolve(PROMO, '..', '..');
export const OUT = path.join(PROMO, 'output');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
};

/** 配信物だけを配る静的サーバー（source/ と tools/ は配らない）。ポートは 4880〜4899。 */
export async function startServer(port = Number(process.env.PROMO_PORT ?? 4880)) {
  if (port < 4880 || port > 4899) throw new Error(`ポートは 4880〜4899（いま ${port}）`);
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://x');
      let p = decodeURIComponent(u.pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(DAY, path.normalize(p));
      const rel = path.relative(DAY, file);
      if (rel.startsWith('..') || /^(source|tools)\b/.test(rel)) throw new Error('forbidden');
      await stat(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

/** ページより先に読み込む：仮の時計。__vclock.on() までは本物の時計で動く（起動とシェーダーの先作りは本物の時間で待つ）。 */
const VCLOCK = () => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let virtual = false;
  let vt = 0;
  let q = [];
  window.requestAnimationFrame = (cb) => {
    if (virtual) {
      q.push(cb);
      return q.length;
    }
    return realRaf((t) => (virtual ? q.push(cb) : cb(t)));
  };
  performance.now = () => (virtual ? vt : realNow());
  window.__vclock = {
    on() {
      vt = realNow();
      virtual = true;
    },
    /** ms だけ進めて、待っている rAF を1回まわす。 */
    tick(ms) {
      vt += ms;
      const run = q;
      q = [];
      for (const cb of run) cb(vt);
      return run.length;
    },
    get t() {
      return vt;
    },
  };
};

/** 撮影のときに足す CSS（配信物は変えず、このページの中だけで隠す）。 */
export const BASE_CSS = `
  #share, footer#share { display: none !important; }
  html, body { cursor: none !important; }
`;

/**
 * ブラウザを開いて遊びのページを用意する。
 * query：URL 引数。viewport：窓の大きさ。返り値の page で __game・__autopilot を使い、frame() で1コマ（1/30 秒）進める。
 */
export async function openGame({ server, query, viewport, dpr = 1, css = '' }) {
  const { browser, name, reason } = await openBrowser();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
    await context.addInitScript(VCLOCK);
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${server.url}/?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 120_000 });
    const appError = await page.evaluate(() => window.__appError ?? null);
    if (appError) throw new Error(`起動に失敗: ${appError}`);
    const gpu = await assertGpu(page);
    await page.waitForFunction(() => window.__viewReady === true || typeof window.__appError === 'string', null, { timeout: 180_000 });
    await page.addStyleTag({ content: BASE_CSS + css });
    await page.evaluate(() => window.__vclock.on());
    /** 1/60 秒を2回まわして、録画の1コマ（1/30 秒）を進める。 */
    const frame = (n = 1) =>
      page.evaluate((k) => {
        for (let i = 0; i < k * 2; i++) window.__vclock.tick(1000 / 60);
      }, n);
    return { browser, page, frame, errors, gpu, browserName: name, reason };
  } catch (e) {
    await browser.close();
    throw e;
  }
}
