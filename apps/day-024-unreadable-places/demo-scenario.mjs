import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// record-demo.mjs は file:// でページを開くが、このアプリはESモジュール＋fetchで
// 出題データを読むため file:// では動かない。振り付け内でローカルHTTPサーバーを立てて開き直す
// （day-008 が前例）。
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

/** いま出ている地名の読みを、同梱データから引く（画面には伏せてある） */
async function romajiOfActive(page, block) {
  return page.evaluate(async ({ block }) => {
    const { primaryRomaji } = await import("./lib/romaji.js");
    const data = await (await fetch("./assets/places.json")).json();
    const list = block === "all" ? Object.values(data.places).flat() : data.places[block];
    const kanji = document.getElementById("kanji").textContent;
    const found = list.find((x) => x.k === kanji);
    return found ? primaryRomaji(found.r) : "";
  }, { block });
}

async function startTohoku(page) {
  const base = await ensureServer();
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector("#state-select:not([hidden])", { timeout: 15000 });
  await page.click('.blocks__item[data-id="tohoku"]');
  await page.click("#start");
  await page.waitForSelector("#state-play:not([hidden])");
}

/* 一覧に出す1枚。空の盤面ではなく「遊んでいる最中」を写す。
   1問打ち切って点を乗せてから、次の地名が中ほどまで来て読みが2文字だけ開いた瞬間を狙う。
   ここが伝わらないと、ただの漢字クイズに見える。 */
export async function shotSetup(page) {
  await startTohoku(page);

  const romaji = await romajiOfActive(page, "tohoku");
  await page.click("#keys");
  for (const ch of romaji) await page.keyboard.press(ch);
  await page.waitForFunction(() => Number(document.getElementById("score").textContent) > 0);

  /* 次の地名が「向かってきている最中」で、読みが一部だけ開いた瞬間を待つ。
     弾けている最中（burst）は字が2.1倍に拡大して枠で切れるので、必ず incoming に戻ってから撮る */
  await page.waitForFunction(
    () => {
      const phase = document.getElementById("target").dataset.phase;
      const reading = document.getElementById("reading").textContent;
      // 奥にいるうちは薄すぎて一覧のサムネで読めないので、半分まで近づくのも待つ
      const depth = Number(document.getElementById("target").style.getPropertyValue("--depth"));
      return phase === "incoming" && depth >= 0.5 && reading.includes("○") && !/^○+$/.test(reading);
    },
    null,
    { timeout: 15000 }
  );
}

export const shotScroll = 0;

/* デモ動画（540×960の縦・仕上げで頭を切って15〜20秒）。
   狙いは4つを順に見せること。①伏せたまま打ち切って弾ける（満点）
   ②打ち間違えると地名が揺れて警告が出て、打ち切れても入る点が低い
   ③開示を待ってから打つ ④読めないので降参して、正解と「なぜ読めないか」が出る。
   1コマ目がXのサムネになるので、頭は tools/trim-demo.mjs で 1.5 秒切り落とす。
   1.5秒の位置は「地名が大きく・1文字目が開き・ローマ字が見えている」ところ。振り付けを
   変えたらここも測り直すこと（0.6秒だと地名が薄くてサムネとして弱かった）。 */

/** いま向かってきているものを、既定の書き方で打ち切る */
async function typeActive(page) {
  const romaji = await romajiOfActive(page, "tohoku");
  for (const ch of romaji) await page.keyboard.press(ch, { delay: 55 });
  await page.waitForFunction(
    () => document.getElementById("target").dataset.phase !== "incoming",
    null,
    { timeout: 10000 }
  );
}

/** 次の地名が向かってくる（弾け・正解表示が終わる）まで待つ */
async function waitIncoming(page) {
  await page.waitForFunction(
    () => document.getElementById("target").dataset.phase === "incoming",
    null,
    { timeout: 12000 }
  );
}

/** いまの読みに絶対に入っていないキー。押すと地名が揺れて警告が出る */
async function wrongKeyFor(page) {
  const romaji = await romajiOfActive(page, "tohoku");
  return "qwertyuiop".split("").find((k) => !romaji.includes(k)) ?? "q";
}

/** 次の地名が向かってきて、読みが一部だけ開くまで待つ */
async function waitPartlyOpen(page) {
  await page.waitForFunction(
    () => {
      const phase = document.getElementById("target").dataset.phase;
      const r = document.getElementById("reading").textContent;
      return phase === "incoming" && r.includes("○") && !/^○+$/.test(r);
    },
    null,
    { timeout: 12000 }
  );
}

export default async function (page, h) {
  await startTohoku(page);
  // 盤面を画面の真ん中に置く。ここを外すと、動画の半分が説明文と共有ボタンになる
  await h.scrollTo(".field", 500);
  await page.click("#keys");
  await h.pause(400);

  // ① 知っている人の速さ。伏せたまま打ち切って満点
  await typeActive(page);
  await h.pause(950);

  /* ② 打ち間違い。地名が揺れて「その打鍵はこの読みに入っていません」が出る。
     押してほしかったキーは出ない（読みが漏れる）。打ち切れても、①より入る点は低い。 */
  await waitIncoming(page);
  const wrong = await wrongKeyFor(page);
  await page.keyboard.press(wrong);
  await h.pause(800);
  await page.keyboard.press(wrong);
  await h.pause(1000);
  await typeActive(page);
  await h.pause(1300);

  // ③ 読めないので開示を待ってから打つ。点は減るが進める
  await waitPartlyOpen(page);
  await h.pause(1600);
  await typeActive(page);
  await h.pause(1000);

  // ④ 降参して、正解となぜ読めないかを見せる。ここがこのアプリの持ち帰り
  await waitIncoming(page);
  await h.pause(2100);
  await page.click("#giveup");
  await h.pause(3200);
}
