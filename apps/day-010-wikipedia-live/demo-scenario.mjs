import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* record-demo.mjs は file:// でページを開くが、このアプリはESモジュールを使うので
   file:// では読み込みそのものが失敗する。振り付け内でローカルHTTPサーバーを立てて開き直す
   （day-008・day-009と同じ作法）。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

/* データは横取りせず、本物のEventStreamsにつないだまま撮る。
   作り物の記事名を並べた動画にすると、このアプリの主張（本当にいま書き換わっている）が嘘になる。
   そのぶん中身は毎回変わるので、撮ったあとに必ずコマを目視すること。 */
async function openLive(page) {
  const base = await ensureServer();
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector('#link-state[data-state="live"]', { timeout: 15_000 });
  await page.waitForFunction(() => window.__day010?.stats.countries > 0, null, { timeout: 15_000 });
}

export async function shotSetup(page) {
  await openLive(page);

  /* 日本語版の編集は5〜6秒に1件。一覧が4件たまるまで待つ。
     ただしボットが一括作業をしている時間帯に当たると、4件とも同じ要約のボット編集で埋まる。
     一覧ページのサムネイルになる絵なので、人の編集が2件以上入るまで待ち直す。 */
  await page.waitForFunction(
    () => {
      const cards = [...document.querySelectorAll(".edit")];
      const humans = cards.filter((card) => ![...card.querySelectorAll(".badge")].some((badge) => badge.textContent === "ボット"));
      return cards.length >= 4 && humans.length >= 2;
    },
    null,
    { timeout: 90_000 },
  );

  // 水面にも記事名が出ている瞬間を撮る。次の1件が届いてから、粒が落ちきるぶんだけ待つ
  const before = await page.locator(".edit").count();
  await page.waitForFunction((count) => document.querySelectorAll(".edit").length > count, before, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3_000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

export const shotScroll = 0;

/* 動画は無音で録れる（Playwrightは音を録らない）。あとから合成音を重ねるために、
   日本語版の編集が画面に出た時刻を書き出しておく。
   録画の開始時刻はこちらから触れないので、基準は「振り付けの終わり」＝動画の末尾にそろえる。 */
const AUDIO_CUES = join(tmpdir(), "day-010-audio-cues.json");

function watchJaEdits(page) {
  const marks = [];
  let known = 0;
  const timer = setInterval(async () => {
    try {
      const items = await page.$$eval(".edit", (nodes) =>
        nodes.map((node) => Number(node.dataset.delta ?? 0)));
      if (items.length > known) {
        for (let i = 0; i < items.length - known; i += 1) marks.push({ at: Date.now(), delta: items[i] });
        known = items.length;
      }
    } catch {
      // ページ遷移中などは読めない。次の周期で拾い直す
    }
  }, 120);

  return async () => {
    clearInterval(timer);
    const endedAt = Date.now();
    // 動画の末尾からさかのぼった秒数として持たせる
    const cues = marks.map((mark) => ({ fromEnd: (endedAt - mark.at) / 1000, delta: mark.delta }));
    await writeFile(AUDIO_CUES, JSON.stringify({ endedAt, cues }, null, 2));
  };
}

/* 尺は15〜20秒に収める。日本語版の編集は5〜6秒に1件しか来ないので、
   待ち時間は「上の画面を見せている間」に寄せて、待つためだけの秒数を作らない。 */
export default async function (page, h) {
  await openLive(page);
  const stopWatching = watchJaEdits(page);
  // 地図にピンが立ち始めるところを見せる（座標の問い合わせは2.5秒ごとなので少し待つ）
  await page.waitForFunction(() => window.__day010.stats.marks >= 3, null, { timeout: 14_000 }).catch(() => {});
  await h.pause(2_400);
  /* 一覧へ下りる前に、読ませるカードを2件そろえる。1件だけの状態で下りると
     「日本語版が読める」という主張が1件の例で終わってしまう（17秒で1件しか来ない回がある）。 */
  await page
    .waitForFunction(() => document.querySelectorAll(".edit").length >= 2, null, { timeout: 12_000 })
    .catch(() => {});
  await h.scrollTo("#feed-list", 800);
  await h.pause(2_800);
  // 一時停止で読める状態にする（このアプリで唯一の「操作」）
  await page.click("#pause-toggle");
  await h.pause(1_800);
  await page.click("#pause-toggle");
  await h.pause(1_000);
  await h.scrollTop(800);
  await h.pause(2_000);
  await stopWatching();
}
