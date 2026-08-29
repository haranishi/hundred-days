import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const APP = "/day-023-magtrace/";
const API = "**/api/day-023/trend*";
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../apps/day-023-magtrace/tests/fixtures/${name}`, import.meta.url), "utf8"));
const EXACT = fixture("trend-exact.json");
const COUNTS = fixture("trend-counts.json");
const EMPTY = fixture("trend-empty.json");
const consoleErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    const text = message.text();
    // テスト9で意図的に返す502だけは、ブラウザ自身が出す既知の通信エラーなので除外する。
    if (message.type() === "error" && !(text.startsWith("Failed to load resource") && text.includes("502"))) errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), "コンソールエラーが発生した").toEqual([]);
});

const serve = (page, payload = EXACT, status = 200) => page.route(API, (route) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(payload) }));
const open = async (page, payload = EXACT) => {
  await serve(page, payload);
  await page.goto(APP);
  await expect(page.locator("#view-home")).toBeVisible();
};
const search = async (page, query = "推し活") => {
  await page.locator("#q").fill(query);
  await page.getByRole("button", { name: "雑誌の流れを見る" }).first().click();
  await expect(page.locator("#analysis-content")).toBeVisible();
};

test("1 ホームに主要要素、4テーマ、きょうの一語が出る", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("雑誌の見出しから");
  await expect(page.locator("#q")).toBeVisible();
  await expect(page.getByRole("button", { name: "雑誌の流れを見る" }).first()).toBeVisible();
  await expect(page.locator(".theme-card")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "きょうの一語" })).toBeVisible();
});

test("2 検索すると分析ビュー、q付きURL、分析タイトルになる", async ({ page }) => {
  await open(page);
  await search(page);
  await expect(page).toHaveURL(/\?q=%E6%8E%A8%E3%81%97%E6%B4%BB$/);
  await expect(page).toHaveTitle("「推し活」の雑誌トレンド | MAGTRACE");
  await expect(page.locator("#view-analysis")).toBeVisible();
});

test("3 今回の発見と数字3つが応答どおりに出る", async ({ page }) => {
  await open(page);
  await search(page);
  await expect(page.locator("#finding-lead")).toHaveText(EXACT.analysis.finding.lead);
  await expect(page.locator("#stat-total")).toHaveText("154件");
  await expect(page.locator("#stat-peak")).toHaveText("2024年（45件）");
  await expect(page.locator("#stat-jump")).toHaveText("2024年");
});

test("4 SVGと注釈を表示し、30行の表と往復できる", async ({ page }) => {
  await open(page);
  await search(page);
  await expect(page.locator('svg[role="img"]')).toBeVisible();
  await expect(page.locator("#trend-title")).toHaveText(EXACT.analysis.headline);
  await page.getByRole("button", { name: "表で見る" }).click();
  await expect(page.locator("#years-body tr")).toHaveCount(30);
  await page.getByRole("button", { name: "グラフに戻す" }).click();
  await expect(page.locator('svg[role="img"]')).toBeVisible();
});

test("5 手がかりと年別代表記事に安全なNDLリンクが出る", async ({ page }) => {
  await open(page);
  await search(page);
  await expect(page.locator(".clue-card")).toHaveCount(2);
  await expect(page.locator(".record-group")).toHaveCount(2);
  const links = page.locator(".record a");
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\/ndlsearch\.ndl\.go\.jp\/books\//);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("6 q付きURLを直接開け、戻るとホームになる", async ({ page }) => {
  await serve(page);
  await page.goto(`${APP}?q=${encodeURIComponent("推し活")}`);
  await expect(page.locator("#analysis-content")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#view-home")).toBeVisible();
  await expect(page).toHaveTitle("MAGTRACE");
});

test("7 例えば、テーマ、きょうの一語から検索できる", async ({ page }) => {
  await open(page);
  await page.locator('[data-search="サウナ"]').first().click();
  await expect(page.locator("#analysis-content")).toBeVisible();
  await page.goBack();
  await page.locator('.theme-card [data-search="防災"]').click();
  await expect(page.locator("#analysis-content")).toBeVisible();
  await page.goBack();
  await page.locator("#today-link").click();
  await expect(page.locator("#analysis-content")).toBeVisible();
});

test("8 0件で候補と検索条件変更を出し、ホーム検索欄へフォーカスする", async ({ page }) => {
  await open(page, EMPTY);
  await page.locator("#q").fill("該当なし");
  await page.getByRole("button", { name: "雑誌の流れを見る" }).first().click();
  await expect(page.locator("#state-label")).toHaveText("0 RESULTS");
  await expect(page.locator("#loading-live")).toBeHidden();
  await expect(page.locator("#state-actions .chips button")).toHaveCount(5);
  await page.getByRole("button", { name: "検索条件を変える" }).click();
  await expect(page.locator("#q")).toBeFocused();
});

test("9 502で入力を保持し、再試行の2回目で成功する", async ({ page }) => {
  let requests = 0;
  await page.route(API, (route) => {
    requests += 1;
    route.fulfill(requests === 1 ? { status: 502, contentType: "application/json", body: JSON.stringify({ error: "upstream_unavailable" }) } : { status: 200, contentType: "application/json", body: JSON.stringify(EXACT) });
  });
  await page.goto(APP);
  await page.locator("#q").fill("推し活");
  await page.getByRole("button", { name: "雑誌の流れを見る" }).first().click();
  await expect(page.locator("#state-label")).toHaveText("API ERROR");
  await expect(page.locator("#loading-live")).toBeHidden();
  await expect(page.locator("#q-again")).toHaveValue("推し活");
  await page.getByRole("button", { name: "もう一度試す" }).click();
  await expect(page.locator("#analysis-content")).toBeVisible();
  expect(requests).toBe(2);
});

test("10 古い取得日時だけ保存済みバッジを出す", async ({ page }) => {
  await open(page, { ...EXACT, fetchedAt: "2020-01-01T00:00:00.000Z" });
  await search(page);
  await expect(page.locator("#cached-badge")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await serve(page, { ...EXACT, fetchedAt: new Date().toISOString() });
  await page.locator("#q-again").fill("推し活");
  await page.locator("#again-form").getByRole("button", { name: "雑誌の流れを見る" }).click();
  await expect(page.locator("#cached-badge")).toBeHidden();
});

test("11 partial応答は注記を出し、欠損年を—にする", async ({ page }) => {
  const partial = structuredClone(COUNTS);
  partial.partial = true;
  partial.years.find(({ year }) => year === 2000).count = null;
  await open(page, partial);
  await search(page, "生成AI");
  await expect(page.locator("#partial-note")).toBeVisible();
  await page.getByRole("button", { name: "表で見る" }).click();
  await expect(page.locator("#years-body tr").filter({ hasText: "2000" })).toContainText("—");
});

test("12 最近の言葉を再読込後も表示し、消せる", async ({ page }) => {
  await open(page);
  await search(page);
  await page.reload();
  await expect(page.locator("#analysis-content")).toBeVisible();
  await expect(page.locator("#recent-list")).toContainText("推し活");
  await page.getByRole("button", { name: "消す" }).click();
  await expect(page.locator("#recent-section")).toBeHidden();
});

test("13 遅い応答中はスケルトンと読み上げ文言が出てボタンが無効", async ({ page }) => {
  await page.route(API, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EXACT) });
  });
  await page.goto(APP);
  await page.locator("#q").fill("推し活");
  await page.getByRole("button", { name: "雑誌の流れを見る" }).first().click();
  await expect(page.locator("#skeletons")).toBeVisible();
  await expect(page.locator("#loading-live")).toHaveText("検索結果を読み込み中");
  await expect(page.locator("#again-form .search-submit")).toBeDisabled();
  await expect(page.locator("#analysis-content")).toBeVisible();
});

test("14 390、768、1200px幅で横スクロールがない", async ({ page }) => {
  await open(page);
  await search(page);
  for (const width of [390, 768, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
  }
});

test("15 分析ビューにもshareは1つだけある", async ({ page }) => {
  await open(page);
  await search(page);
  await expect(page.locator("#share")).toHaveCount(1);
  await expect(page.locator("#share")).toBeVisible();
});

test("16 390px幅ではSVG座標系と表示幅が等倍になる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page);
  await search(page);
  const widths = await page.locator('svg[role="img"]').evaluate((svg) => ({
    viewBox: svg.viewBox.baseVal.width,
    rendered: svg.getBoundingClientRect().width,
  }));
  expect(Math.abs(widths.viewBox - widths.rendered)).toBeLessThanOrEqual(2);
});
