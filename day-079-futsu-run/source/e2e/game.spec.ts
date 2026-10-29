import { test, expect } from "@playwright/test";
import { QUESTIONS } from "../src/lib/game";

test("continuous runner: seven gates, free lane changes, automatic next, fixed share and OGP", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "あなたの普通、何％？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "7問完走", exact: true }).click();
  await page.getByRole("button", { name: "みんなと走る", exact: true }).click();
  await expect(page.locator(".race-viewport")).toHaveAttribute(
    "data-stage",
    "countdown",
  );
  await expect(page.locator(".race-countdown")).toBeVisible();
  for (let i = 0; i < 7; i++) {
    await expect(page.locator(".race-viewport")).toHaveAttribute(
      "data-question",
      String(i + 1),
    );
    await expect(
      page.getByRole("heading", { name: QUESTIONS.daily[i].text, exact: true }),
    ).toBeVisible();
    const left = page.getByRole("button", {
      name: `左のゲート：${QUESTIONS.daily[i].options[0]}`,
      exact: true,
    });
    await expect(left).toBeEnabled();
    if (i === 0) {
      await expect(left.locator(".race-choice-symbol")).toHaveText("はい");
      await page
        .getByRole("button", {
          name: `右のゲート：${QUESTIONS.daily[i].options[1]}`,
          exact: true,
        })
        .click();
      await expect(page.locator(".race-viewport")).toHaveAttribute(
        "data-stage",
        "approach",
      );
      await page.keyboard.press("ArrowLeft");
    } else await left.click();
    await expect(left).toHaveAttribute("aria-pressed", "true");
    if (i >= 2)
      await expect(left.locator(".race-choice-symbol")).toHaveText("A");
    await expect(
      page.getByRole("region", { name: "ゲートの通過結果" }),
    ).toBeVisible({ timeout: 12000 });
    if (i === 0) {
      await expect(page.locator(".race-live-announcement")).toContainText(
        "割合は68%",
      );
      await expect(
        page.getByText("同じ選択は", { exact: false }),
      ).toContainText("68%");
      await page.screenshot({
        path: ".agent-harness/runs/ui-v5/reveal-390.png",
      });
    }
    expect(
      await page
        .getByRole("button", { name: "次の分かれ道へ", exact: true })
        .count(),
    ).toBe(0);
  }
  await expect(page).toHaveURL(/result\/demo\?data=/, { timeout: 10000 });
  await expect(page.locator(".result-score")).toHaveText("54％");
  await page
    .locator(".result-card")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({
    path: ".agent-harness/runs/ui-v5/result-390.png",
    fullPage: true,
  });
  const sharedUrl = page.url();
  await page.getByRole("link", { name: "結果をシェア", exact: true }).click();
  await expect(page).toHaveURL(/#result-share$/);
  await page
    .getByRole("button", { name: "リンクをコピー", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "結果のリンクをコピーしました",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    sharedUrl,
  );
  await page.reload();
  await expect(page.locator(".result-score")).toHaveText("54％");
  const fresh = await browser.newContext();
  const friend = await fresh.newPage();
  await friend.goto(sharedUrl);
  await expect(friend.locator(".result-score")).toHaveText("54％");
  const og = await friend
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  const ogUrl = new URL(og!);
  const response = await friend.request.get(ogUrl.pathname + ogUrl.search);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect(errors).toEqual([]);
  await fresh.close();
});

test("minority crossing tumbles then automatically shows a partial result", async ({
  page,
}) => {
  await page.goto("/?category=money");
  await expect(page.locator(".category-money")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "みんなと走る", exact: true }).click();
  const left = page.getByRole("button", {
    name: `左のゲート：${QUESTIONS.money[0].options[0]}`,
    exact: true,
  });
  await expect(left).toBeEnabled();
  await left.click();
  await expect(page.locator(".race-viewport")).toHaveAttribute(
    "data-stage",
    "fall",
    { timeout: 12000 },
  );
  await page.screenshot({ path: ".agent-harness/runs/ui-v5/fall-390.png" });
  await expect(page).toHaveURL(/result\/demo\?data=/, { timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: "その違いが、あなたらしさ。" }),
  ).toBeVisible();
  await expect(page.locator(".result-score")).toHaveText("28％");
  await expect(
    page.getByRole("link", { name: "同じ7問にチャレンジ" }),
  ).toHaveAttribute("href", "/?category=money");
});

test("unselected gate holds; pause freezes time; hidden tab does not advance; late choice resumes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "みんなと走る", exact: true }).click();
  const viewport = page.locator(".race-viewport");
  await expect(
    page.getByRole("button", { name: "左のゲート：言う", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "ゲームを一時停止", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  const resume = modal.getByRole("button", {
    name: "走るのを再開",
    exact: true,
  });
  await expect(resume).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    modal.getByRole("button", { name: "トップへ戻る", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(resume).toBeFocused();
  const musicVolume = modal.getByRole("slider", {
    name: "BGMの音量",
    exact: true,
  });
  const effectsVolume = modal.getByRole("slider", {
    name: "足音・効果音の音量",
    exact: true,
  });
  await musicVolume.fill("35");
  await expect(musicVolume).toHaveValue("35");
  await expect(effectsVolume).toHaveValue("72");
  await effectsVolume.fill("80");
  await expect(effectsVolume).toHaveValue("80");
  await expect(musicVolume).toHaveValue("35");
  const paused = await viewport.getAttribute("data-progress");
  await page.waitForTimeout(600);
  expect(await viewport.getAttribute("data-progress")).toBe(paused);
  await page.getByRole("button", { name: "走るのを再開", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ゲームを一時停止", exact: true }),
  ).toBeFocused();
  const disableSound = page.getByRole("button", {
    name: "音をオフにする",
    exact: true,
  });
  const enableSound = page.getByRole("button", {
    name: "音をオンにする",
    exact: true,
  });
  await expect(disableSound).toHaveAttribute("aria-pressed", "true");
  await disableSound.click();
  await expect(enableSound).toHaveAttribute("aria-pressed", "false");
  await enableSound.click();
  await expect(disableSound).toHaveAttribute("aria-pressed", "true");
  await disableSound.click();
  await expect(enableSound).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    }),
  );
  const hidden = await viewport.getAttribute("data-progress");
  await page.waitForTimeout(600);
  expect(await viewport.getAttribute("data-progress")).toBe(hidden);
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).hidden;
  });
  await expect(viewport).toHaveAttribute("data-progress", "0.880", {
    timeout: 12000,
  });
  await page.waitForTimeout(600);
  await expect(viewport).toHaveAttribute("data-stage", "approach");
  await expect(viewport).toHaveAttribute("data-progress", "0.880");
  await page.screenshot({ path: ".agent-harness/runs/ui-v5/hold-390.png" });
  await page.keyboard.press("ArrowLeft");
  await expect(viewport).toHaveAttribute("data-stage", "reveal", {
    timeout: 4000,
  });
  await expect(viewport).toHaveAttribute("data-question", "2", {
    timeout: 4000,
  });
  await page.getByRole("button", { name: "ゲームを一時停止", exact: true }).click();
  await modal.getByRole("button", { name: "トップへ戻る", exact: true }).click();
  await page.getByRole("button", { name: "みんなと走る", exact: true }).click();
  await expect(enableSound).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "左のゲート：言う", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "ゲームを一時停止", exact: true }).click();
  await expect(musicVolume).toHaveValue("35");
  await expect(effectsVolume).toHaveValue("80");
});

test("responsive chase viewport, topic request unconfigured state, and invalid share links", async ({
  page,
}) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.agent-harness/runs/ui-v5/home-${width}.png`,
      fullPage: true,
    });
    await expect(
      page.getByText("お題の募集先は、ただいま準備中です。"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "みんなと走る", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "左のゲート：言う", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "ゲームを一時停止", exact: true })
      .click();
    await page
      .getByRole("button", { name: "走るのを再開", exact: true })
      .click();
    await page.screenshot({
      path: `.agent-harness/runs/ui-v5/run-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/result/demo?data=invalid");
  await expect(page.getByText("その結果は見つかりませんでした")).toBeVisible();
});
