import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* record-demo.mjs は file:// でページを開くが、このアプリは ESモジュール＋fetch（サンプル写真の
   読み込み）を使うので file:// では動かない。振り付け内でローカルHTTPサーバーを立てて開き直す
   （day-008・day-009・day-010と同じ作法）。
   ここは画像も配るので、MIME に .jpg を足してある。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
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

/** 空の画面を、ちゃんと動く状態で開き直す。 */
async function open(page) {
  const base = await ensureServer();
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector('#app[data-state="empty"]');
}

/** 同梱のサンプル写真を読ませて結果の画面まで進める。 */
async function loadSample(page) {
  await page.click("#sample");
  await page.waitForSelector('#app[data-state="result"]');
  // 本体写真と埋め込みサムネイルはどちらも blob。画が入る前に撮ると空の枠が写る
  await page.waitForFunction(
    () => [...document.querySelectorAll("#compare img")].every((img) => img.complete && img.naturalWidth > 0),
    null,
    { timeout: 10_000 },
  );
}

/* 一覧ページのサムネイルになる絵。空のドロップゾーンだと何のアプリか分からないので、
   結果が出ている状態で撮る。スクロールはしない：1200×750の1画面に、アプリ名と
   判定（撮った場所が残っています）と実際に出てきた緯度・経度がちょうど収まる（実測）。 */
export const shotScroll = 0;

export async function shotSetup(page) {
  await open(page);
  await loadSample(page);
  await page.waitForTimeout(400);
}

/* 見せたいのは1点。「切り落としたはずの表札が、埋め込みサムネイルにだけ残っている」。
   そこへ行き着くまでに、消す対象（座標・カメラ本体のシリアル番号）を読める速さで通る。

   ⚠️ 録画の頭は必ず ffmpeg の signalstats(YAVG) で測ってから切る。目分量で切らない。
   2026-08-18の実測（Playwright 1.62・このMac）では、言われていた「白フレーム0.4〜0.56秒」は
   1フレームも入らなかった。代わりに切る必要があったのは別物で、record-demo.mjs が振り付けを
   呼ぶ前に file:// で開いている壊れた画面（data-copy の文言が空のまま）が、先頭1フレームだけ
   残る。YAVG は 219.645（file://）→ 218.25（このサーバー）で、白（yuv420p limited の 235）
   とは別の値なので、白だけを探すと見落とす。切り方は録ったあとで：

     ffmpeg -y -ss 0.04 -i demo-raw.mp4 -an -map_metadata -1 \
       -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -r 25 -movflags +faststart demo.mp4

   （-map_metadata -1 が要る。record-demo.mjs 側の変換には付いていない） */
export default async function (page, h) {
  // ① 空の画面。何を置く場所なのかを一瞬だけ見せる
  await open(page);
  await h.pause(1_500);

  // ② サンプルを読ませる。判定（撮った場所が残っています）と緯度・経度が、そのまま1画面に入る
  await loadSample(page);
  await h.pause(3_400);

  // ③ カメラ本体のシリアル番号。「同じカメラで撮った他の写真と結びつけられます」まで読ませる
  await h.scrollTo(".group[data-level='person']", 850);
  await h.pause(2_800);

  // ④ ここが見せ場。本体からは切り落とした表札が、埋め込みサムネイルには残っている。
  //    住所（みどり町 3-14-2）が読める大きさで、いちばん長く止める
  await h.scrollTo("#compare", 900);
  await h.pause(4_600);

  // ⑤ 消して保存する。押した瞬間にダウンロードが走る（Playwrightは受け取って捨てるだけ）
  await page.click("#download");
  await h.pause(300);

  // ⑥ 保存したバイト列をアプリ自身で読み直した結果。Exif：なし／ICCプロファイル：残しています
  await h.scrollTo("#verify", 850);
  await h.pause(3_200);
}
