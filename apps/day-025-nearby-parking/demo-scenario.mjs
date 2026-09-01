/* デモ動画の振り付け。

   このアプリは中継API（functions/api/day-025/）越しに実データを取るので、
   file:// でも素の静的サーバーでも動かない。**録画の前に wrangler を起こしておくこと**：

     npm run build
     npx wrangler pages dev dist --port 8788

   そのうえで
     PLAYWRIGHT=<playwrightのindex.jsのパス> node scripts/record-demo.mjs --day 25
     node apps/day-025-nearby-parking/tools/render-demo-audio.mjs

   録画は頭から撮り、仕上げで頭を切り落とす（1コマ目は「動いているところ」にする決まり）。
   切る位置は tools/render-demo-audio.mjs がキューから決める。 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8788/day-025-nearby-parking/";
const CUES = join(tmpdir(), "day-025-demo-cues.json");

const TELOP_CSS = `
#demo-telop{position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:16px 26px 22px;
  background:linear-gradient(to top,rgba(16,42,67,.95) 74%,rgba(16,42,67,0));
  color:#fff;font-weight:700;font-size:26px;line-height:1.45;
  opacity:0;transition:opacity .4s ease;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.35)}
#demo-telop.is-on{opacity:1}
#demo-telop small{display:block;font-size:17px;font-weight:600;opacity:.85;margin-top:6px}
`;

export default async function (page, h) {
  const response = await page.goto(BASE, { waitUntil: "load" }).catch(() => null);
  if (!response || !response.ok()) {
    throw new Error(`${BASE} が開けません。先に npx wrangler pages dev dist --port 8788 を起こしてください`);
  }

  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 39.7176, longitude: 140.1305 }); // 秋田駅
  await page.addStyleTag({ content: TELOP_CSS });
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "demo-telop";
    document.body.append(el);
  });

  const start = Date.now();
  const cues = [];
  const at = (label) => cues.push({ label, t: (Date.now() - start) / 1000 });
  const telop = (main, sub = "") => page.evaluate(([m, s]) => {
    const el = document.getElementById("demo-telop");
    el.replaceChildren(document.createTextNode(m));
    if (s) { const small = document.createElement("small"); small.textContent = s; el.append(small); }
    el.classList.add("is-on");
  }, [main, sub]);
  const telopOff = () => page.evaluate(() => document.getElementById("demo-telop").classList.remove("is-on"));
  const top = () => page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));

  // ── 現在地から探す（ここまでが助走。仕上げで切り落とす）
  await h.pause(600);
  await page.getByRole("button", { name: "現在地", exact: true }).click();
  await page.locator(".parking-card").first().waitFor({ timeout: 60000 });
  // 地図タイルが本当に描けるまで待つ。ここが早いと、頭を切ったあとの1コマ目が
  // 「マーカーだけ浮いた白い地図」になる（実際に一度そうなった）
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".maplibregl-canvas");
    if (!canvas) return false;
    const ctx = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return Boolean(ctx);
  }, { timeout: 30000 }).catch(() => {});
  await h.pause(4200);
  at("results"); // ★ここから本編。頭はここで切る（1コマ目を動いている絵にする決まり）

  await telop("近い順に、地図とリストへ同時に。");
  await h.pause(2600);
  await telopOff();
  await h.pause(300);

  // ── 絞ると地図が読めるようになる（見せ場）
  await h.scrollTo(".filters");
  await h.pause(600);
  await telop("有料・無料・不明で、絞れる。", "推測で埋めずに3つに分ける");
  await page.locator(".filter-tabs button").nth(1).click();
  await h.pause(1500);
  await top();
  await h.pause(1200);
  at("filtered");
  await h.pause(1600);
  await telopOff();
  await h.pause(300);

  // ── 選ぶと地図の同じ場所が光る
  await h.scrollTo("#results");
  await h.pause(600);
  await page.locator(".parking-card .card-main").nth(1).click();
  await h.pause(400);
  await top();
  await h.pause(900);
  await telop("選ぶと、地図の同じ場所が光る。");
  at("selected");
  await h.pause(2400);
  await telopOff();
  await h.pause(300);

  // ── ルート
  await h.scrollTo("#results");
  await h.pause(700);
  await telop("あとはワンタップで、案内へ。", "Googleマップのルートに抜ける");
  await page.locator(".parking-card").nth(1).hover();
  await h.pause(2400);
  await telopOff();
  await h.pause(300);

  // ── ダークに切り替えて締め
  await top();
  await h.pause(600);
  await page.click("#theme-toggle");
  await h.pause(1000);
  await telop("ちかくの駐車場", "OpenStreetMapのデータで、登録なし・無料");
  at("outro");
  await h.pause(2600);
  await telopOff();
  await h.pause(500);
  at("end"); // 動画の頭にある助走の長さを、末尾から逆算するために要る

  writeFileSync(CUES, JSON.stringify({ cues, recordedAt: new Date().toISOString() }, null, 2));
}

/* 一覧用スクショは、結果が出て地図にマーカーが乗り切った状態を撮る */
export async function shotSetup(page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 39.7176, longitude: 140.1305 });
  await page.getByRole("button", { name: "現在地", exact: true }).click();
  await page.locator(".parking-card").first().waitFor({ timeout: 60000 });
  await page.locator(".filter-tabs button").nth(1).click(); // 有料だけにして地図を読める状態に
  await page.waitForTimeout(2500); // タイルとマーカーが乗り切るまで
}
