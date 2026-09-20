/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）。
   地図（経路と予報円）→ 現在地（千代田区）の答え → 3時間ごとの帯 → 地図で予報円との位置関係 →
   確率が高い地域 → 市区町村名で八丈町、の順に見せる。

   気象庁への通信は tests/fixtures の実応答（2026-09-18 15時／18時45分の発表）に差し替える。
   台風が去ると本物の発表は「台風はありません」に変わり、同じ画は二度と撮れないため。
   差し替えているのは実際の発表そのものなので、映る数字は本物と同じ。
   「いま」も 2026-09-18 21:00 に固定する（帯の「いま」の印が毎回同じ位置に出る）。

   1コマ目は「動いている途中」にしたいので、頭の空白は tools/trim-demo.mjs で切り落とす。 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const fixtures = join(appDir, 'tests', 'fixtures');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 東京駅。千代田区（気象庁の区分では２３区西部）に当たる */
const TOKYO_STATION = { latitude: 35.6812, longitude: 139.7671 };
/* 帯の「いま」の印を毎回同じ位置に出すための基準時刻 */
const NOW = new Date('2026-09-18T21:00:00+09:00');

/* 差し替える気象庁のURL。e2e（tests/e2e/day-042.spec.mjs）と同じ対応表 */
const DATA = 'https://www.jma.go.jp/bosai/typhoon/data/';
const FIXTURES = {
  [`${DATA}targetTc.json`]: 'bosai-typhoon-targetTc-20260918.json',
  [`${DATA}TC2630/specifications.json`]: 'bosai-TC2630-specifications-20260918.json',
  [`${DATA}TC2630/probabilityTimeseries.json`]: 'bosai-TC2630-probabilityTimeseries-20260918.json',
  [`${DATA}TC2630/probabilityThrough.json`]: 'bosai-TC2630-probabilityThrough-20260918.json',
  [`${DATA}TC2630/forecast.json`]: 'bosai-TC2630-forecast-20260918.json',
};

/* 録画スクリプトは file:// で開くが、ESモジュールと fetch は file:// では動かないので
   ミニHTTPサーバーへ開き直す（Day 039〜041 と同じ） */
async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' })
        .end(await readFile(join(appDir, path)));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  return `http://127.0.0.1:${server.address().port}/`;
}

/* 気象庁だけ固定資料で答え、ほかの外部ホストは断つ。ローカルの同梱データはそのまま通す */
const stubJma = (page) => page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
  const name = FIXTURES[url.href];
  if (!name) return route.abort();
  return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: readFileSync(join(fixtures, name)) });
});

/* 撮影の下ごしらえ。時計と通信の差し替えは goto より前に済ませる */
async function setup(page) {
  await page.clock.install({ time: NOW });
  await stubJma(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(TOKYO_STATION);
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
}

/* 送り先を、上からの位置で指定して滑らかに動かす。scrollIntoView だと止まって見える。
   selector が null なら先頭へ戻る */
const panTo = (page, selector, offset, ms) =>
  page.evaluate(([sel, off, span]) => new Promise((done) => {
    const target = sel ? document.querySelector(sel) : null;
    const from = window.scrollY;
    const to = target ? target.getBoundingClientRect().top + window.scrollY - off : 0;
    const t0 = performance.now();
    const ease = (x) => (x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / span);
      window.scrollTo(0, from + (to - from) * ease(k));
      k < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [selector, offset, ms]);

export default async function (page, h) {
  await setup(page);
  await h.pause(1500);                              // 現況カードと地図が描き切るまで

  await panTo(page, '#map-area', 24, 1200);         // 経路と予報円
  await h.pause(1200);

  await panTo(page, null, 0, 600);                  // 先頭へ戻る
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
  await page.waitForSelector('#answer-text');
  await h.pause(2400);                              // 千代田区の答え（trim後の頭はこのあたり）

  await panTo(page, '#band-area', 24, 1500);        // 3時間ごとの帯
  await h.pause(2000);

  await panTo(page, '#map-area', 24, 1500);         // 千代田区の印と予報円の位置関係
  await h.pause(2400);

  await panTo(page, '#top-areas', 24, 1500);        // 確率が高い地域
  await h.pause(2000);

  await panTo(page, null, 0, 800);                  // 先頭へ戻って街を変える
  /* 「八丈」は同梱の1805件の中で八丈町だけに当たるので、候補は出ずにそのまま決まる */
  await page.locator('#town-input').pressSequentially('八丈', { delay: 120 });
  await page.locator('#search-town').click();
  await page.waitForFunction(() => document.getElementById('answer-text')?.textContent.includes('78%'));
  await h.pause(2400);                              // 答えが 78% に書き換わったところ
}

/* 一覧用スクショ（1200×750）は、千代田区の答えが出ている状態で撮る。
   1200幅では見出し（0〜約230px）・場所を決める欄・答えの3行が頭から750pxに収まるので、
   スクロールは動かさない */
export const shotScroll = 0;
export async function shotSetup(page) {
  await setup(page);
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
  await page.waitForSelector('#answer-text');
  await page.waitForTimeout(1200);                  // 地図と帯が描き切るまで
}
