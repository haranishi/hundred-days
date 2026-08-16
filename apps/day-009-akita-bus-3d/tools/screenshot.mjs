/* UI採点用のスクリーンショットを撮る。実データではなく固定データを注入する。

   夜間は実測が0〜4台しかなく、実データで撮ると「空の画面」を採点することになるため、
   平日日中の実態（同時走行25台）とピーク（43台）を tests/fixtures から流し込む。

   使い方:
     PLAYWRIGHT=/path/to/playwright/index.js node apps/day-009-akita-bus-3d/tools/screenshot.mjs --out <dir>

   dist/ を配信しているサーバー（node scripts/serve-dist.mjs）が無ければ自分で起動する。 */

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const PAGE_PATH = "/day-009-akita-bus-3d/";
const API_PATTERN = "**/api/day-009/vehicles";

const options = { out: resolve(repoRoot, "shots"), base: "http://127.0.0.1:4173" };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]?.replace(/^--/, "");
  const value = process.argv[index + 1];
  if (key === "out") options.out = resolve(value);
  else if (key === "base") options.base = value;
  else throw new Error("使い方: node tools/screenshot.mjs [--out <dir>] [--base <url>]");
}

// このリポジトリは依存パッケージを増やさないので、Playwrightは別プロジェクトのものを借りる
const playwrightPath = process.env.PLAYWRIGHT ?? resolve(repoRoot, "node_modules/playwright/index.js");
const playwright = await import(pathToFileURL(playwrightPath).href);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error(`Playwrightを読み込めませんでした（${playwrightPath}）`);

const fixture = async (name) => JSON.parse(await readFile(resolve(appDir, "tests/fixtures", name), "utf8"));

// フィクスチャの送信時刻は固定値なので、「1年前の位置」と表示されないよう撮影時刻に寄せる
function freshen(payload) {
  const now = Math.floor(Date.now() / 1000);
  return {
    ...payload,
    updatedAt: new Date().toISOString(),
    vehicles: payload.vehicles.map((vehicle, index) => ({ ...vehicle, ts: now - 12 - (index % 9) })),
    sources: payload.sources.map((source) => ({ ...source, feedTs: now - 8 })),
  };
}

async function ensureServer() {
  const alive = await fetch(options.base, { method: "HEAD" }).then(() => true).catch(() => false);
  if (alive) return null;
  const server = spawn("node", ["scripts/serve-dist.mjs"], { cwd: repoRoot, stdio: "ignore" });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (await fetch(options.base, { method: "HEAD" }).then(() => true).catch(() => false)) return server;
  }
  server.kill();
  throw new Error(`${options.base} を起動できませんでした（先に npm run build を実行したか確認）`);
}

const SHOTS = [
  { name: "running-390", data: "vehicles-running.json", width: 390, height: 844 },
  { name: "running-768", data: "vehicles-running.json", width: 768, height: 1024 },
  { name: "running-1440", data: "vehicles-running.json", width: 1440, height: 900 },
  { name: "empty-390", data: "vehicles-empty.json", width: 390, height: 844 },
  { name: "empty-768", data: "vehicles-empty.json", width: 768, height: 1024 },
  { name: "empty-1440", data: "vehicles-empty.json", width: 1440, height: 900 },
  // 平日8時台のピーク。台数が増えても画面が破綻しないかを見る
  { name: "peak-1440", data: "vehicles-peak.json", width: 1440, height: 900 },
  // バスを選んだ状態。詳細パネルと選択中の車体の見え方を見る
  { name: "selected-1440", data: "vehicles-running.json", width: 1440, height: 900, select: true },
];

const server = await ensureServer();
await mkdir(options.out, { recursive: true });
const browser = await chromium.launch();

try {
  for (const shot of SHOTS) {
    const payload = await fixture(shot.data);
    // 狭い幅の1枚は「スマホで見た画面」を採点するためのもの。タッチ端末として開かないと
    // 入力装置ごとの出し分け（指で回す／ホイールで拡大）がマウス側のまま写る
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      hasTouch: shot.width < 560,
    });
    await page.route(API_PATTERN, (route) =>
      route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(freshen(payload)) }));
    await page.goto(`${options.base}${PAGE_PATH}`, { waitUntil: "load" });

    await page.waitForTimeout(2_500);

    /* 狭い画面は縦に長いので1枚に全部入れる。ただし screenshot({ fullPage: true }) は
       撮影中にChromiumのデバイス設定を上書きし、タッチ端末のエミュレーションを解除してしまう
       ＝画面は正しいのに、写真だけマウス向けの文言（ホイールで拡大）になる。
       先にビューポートを中身の高さまで広げてから普通に撮れば、エミュレーションが保たれる */
    const wholePage = shot.width < 980;
    if (wholePage) {
      await page.setViewportSize({
        width: shot.width,
        height: await page.evaluate(() => document.documentElement.scrollHeight),
      });
      await page.waitForTimeout(800);
    }

    // 3Dが動き出してから撮る。自動回転を止めて視点を初期値へ戻し、構図を毎回そろえる
    await page.getByRole("button", { name: "自動回転" }).click();
    await page.locator("#scene").press("r");
    if (shot.select) await page.locator(".bus-item").first().click();
    await page.waitForTimeout(1_500);

    const stats = await page.evaluate(() => ({ ...window.__day009.stats }));
    const file = resolve(options.out, `${shot.name}.png`);
    await page.screenshot({ path: file });
    console.log(
      `${shot.name.padEnd(16)} ${file}\n`
      + `  バス${String(stats.buses).padStart(3)}台 / fps ${String(stats.fps).padStart(5)}`
      + ` / 路線網の描き直し ${stats.networkMs.toFixed(2)}ms (${stats.networkDetail})`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
