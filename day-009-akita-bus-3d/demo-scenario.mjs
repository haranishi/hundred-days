import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// record-demo.mjs は file:// でページを開くが、このアプリはESモジュール＋fetchを使うため
// file:// ではCORSで動かない。振り付け内でローカルHTTPサーバーを立てて開き直す。
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

/* バスの位置は中継API（Cloudflare Pages Functions）から取る。ローカルの静的サーバーには
   その関数が無いので、横取りしないと必ず「取得できませんでした」の画面になる。
   加えて実測は深夜0〜4台まで落ちるため、実データで撮ると路線網だけの真っ暗な絵になる。
   ここでは平日日中の実態（同時走行25台）をユニットテストと同じ固定データから流し込む。 */
const API_PATTERN = "**/api/day-009/vehicles";
let fixture = null;

/* アプリは「その事業者の運行時間外に届いた位置」を走行中に数えない（lib/service.js）。
   撮影した時刻がたまたま深夜だと、固定データの25台も全部そこで落ちて、
   0台の真っ暗な絵が録れてしまう。ページの時計ごと運行時間帯へ固定して開く。
   日曜17:01＝両事業者とも運行中で、固定データの送信時刻とも揃えてある。 */
const DEMO_NOW = new Date("2026-08-16T17:01:20+09:00");

async function runningPayload() {
  fixture ??= JSON.parse(await readFile(join(appDir, "tests/fixtures/vehicles-running.json"), "utf8"));
  // 固定データの送信時刻は過去の一点なので、そのまま返すと「9時間前の位置」と表示される。
  // ページに見せている時刻（DEMO_NOW）の直前へ寄せ直す
  const now = Math.floor(DEMO_NOW.getTime() / 1000);
  return {
    ...fixture,
    updatedAt: DEMO_NOW.toISOString(),
    vehicles: fixture.vehicles.map((vehicle, index) => ({ ...vehicle, ts: now - 12 - (index % 9) })),
    sources: fixture.sources.map((source) => ({ ...source, feedTs: now - 8 })),
  };
}

async function prepareRunning(page) {
  const base = await ensureServer();
  await page.clock.setFixedTime(DEMO_NOW);
  await page.route(API_PATTERN, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(await runningPayload()),
    }));
  await page.goto(base, { waitUntil: "load" });
}

/* 開いた直後は路線網（618本）を描いている途中で、バスも20秒ぶんの補間を走らせている。
   落ち着くのを待ってから、自動回転を止めて視点を初期値（県全体）に戻し、毎回同じ構図にする。 */
async function settleView(page) {
  await page.waitForSelector("#bus-list-wrap:not([hidden])");
  await page.waitForTimeout(2_500);
  await page.getByRole("button", { name: "自動回転" }).click();
  await page.locator("#scene").press("r");
  await page.waitForTimeout(1_500);
}

export async function shotSetup(page) {
  await prepareRunning(page);
  await settleView(page);
  // #scene にキーを送るとブラウザがそこへフォーカスを合わせて少しスクロールする。
  // サムネイルにはアプリ名の入ったヘッダーごと入れたいので、撮る前に先頭へ戻す
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

export const shotScroll = 0;

export default async function (page, h) {
  await prepareRunning(page);
  // 県全体の路線網に25台が乗り、自動回転でゆっくり回っているところから始める
  await h.pause(4_200);
  await page.click("#zoom-city");
  await h.pause(3_600);
  // 一覧から1台選ぶ → 地図へ戻って、選んだ車体が光っているのを見せる
  await h.scrollTo("#bus-list", 800);
  await page.click(".bus-item");
  await h.pause(2_600);
  await h.scrollTop(900);
  await h.pause(2_400);
  await page.click("#reset-view");
  await h.pause(2_800);
}
