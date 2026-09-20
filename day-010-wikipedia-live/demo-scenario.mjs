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

  // 地図に記事名のラベルが出ている瞬間を撮る。次の1件が届いてから、波紋が広がりきるぶんだけ待つ
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
  /* 一覧は10件で打ち止めなので、カードの件数では新着を数えられない（11件目以降は増えない）。
     止まらずに増える日本語版のカウンタを見て、増えたぶんだけ一覧の先頭からバイト増減を取る。 */
  let known = null;
  const timer = setInterval(async () => {
    try {
      const now = await page.evaluate(() => ({
        ja: window.__day010.stats.ja,
        deltas: [...document.querySelectorAll(".edit")].map((node) => Number(node.dataset.delta ?? 0)),
      }));
      if (known === null) {
        known = now.ja;
        return;
      }
      const added = Math.min(now.ja - known, now.deltas.length);
      for (let i = added - 1; i >= 0; i -= 1) marks.push({ at: Date.now(), delta: now.deltas[i] });
      if (now.ja > known) known = now.ja;
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

/* ⚠️ この振り付けは「助走」を含めて30〜40秒を撮る。開いた直後は地図が空・数字が0で、
   自動再生の最初の2秒がいちばん退屈な絵になるため、ピンがたまるまで待ってから見せ始める。
   Playwrightの録画はページを作った瞬間から止められないので、**仕上げで頭を切り落とす**。
   末尾（＝振り付けの終わり）を基準に20秒だけ残し、そこへ合成音を重ねて demo-with-audio.mp4 にする。

   尺は切り出したあとで15〜20秒。日本語版の編集は5〜6秒に1件しか来ないので、
   待ち時間は助走に寄せて、見せている間に「待つためだけの秒数」を作らない。 */
export default async function (page, h) {
  await openLive(page);

  /* 助走の前半：ピンが数本立つまで。ここまでは確実に切り落とす。 */
  await page
    .waitForFunction(() => window.__day010.stats.marks >= 6, null, { timeout: 40_000 })
    .catch(() => {});

  /* 音が鳴る状態にしてから撮る（音そのものは録れないので、後から同じ合成音を重ねる）。
     音のキューは残す20秒に入りうる時点から拾い始める。助走の後半は「地図にピンが増えていく」
     絵で、見せ場と区別がつかないので、切り出した窓に入っても構わない。 */
  await page.click("#sound-toggle");
  const stopWatching = watchJaEdits(page);

  /* 助走の後半：読ませるカードが3件そろうまで。 */
  await page
    .waitForFunction(
      () => window.__day010.stats.marks >= 14 && document.querySelectorAll(".edit").length >= 3,
      null,
      { timeout: 40_000 },
    )
    .catch(() => {});

  // ①地図・大きい数字・いちばん書き換わっている国を見せる
  await h.pause(4_200);
  // ②日本語版の一覧まで下りて、記事名と直した内容を読ませる
  await h.scrollTo("#feed-list", 900);
  await h.pause(3_400);
  /* ③一時停止で読める状態にする（このアプリで唯一の「操作」）。
     ⚠️ page.click は押す要素を画面内へ入れるので、見出しにあるこのボタンを押すと自動で先頭へ戻る。
     一時停止の絵は一覧ではなく地図の画面で写る。 */
  await page.click("#pause-toggle");
  await h.pause(2_400);
  await page.click("#pause-toggle");
  await h.pause(1_200);
  // ④地図へ戻る。助走のぶんピンが増えているので、集中している地域が濃く見える
  await h.scrollTop(900);
  await h.pause(3_000);
  await stopWatching();
}
