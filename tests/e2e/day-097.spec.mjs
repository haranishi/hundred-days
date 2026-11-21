import { test, expect } from '@playwright/test';

/* さばき場（Day097）。形・時間・手順・採点の正しさは day-097-sabakiba/tests の単体試験が持つ。
   ここでは、実ブラウザで「魚をえらぶ→3Dで手順を最後まで進める→左利き・透視・視点・練習→安全→3Dが使えない端末→スマホの指」を、
   本番と同じCSP・外部通信0で確かめる。開発サーバーで流すときは DAY097_BASE=/ を付ける（tools/playwright.dev.config.mjs）。 */

const base = process.env.DAY097_BASE ?? '/day-097-sabakiba/';
const SPECIES = ['aji', 'iwashi', 'saba', 'sanma', 'tai', 'hirame', 'kisu', 'katsuo'];
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const READY = { timeout: 90_000 };

async function open(page, hash = '', query = 'debug=1') {
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  await page.goto(`${base}?${query}${hash}`);
  const origin = new URL(page.url()).origin;
  // 自分の配信元以外へ出た通信（data:・blob: は除く）
  const externals = () => requests.filter((u) => !/^(data:|blob:|about:)/.test(u) && new URL(u).origin !== origin);
  return { errors, externals };
}
const ready3d = (page) => expect(page.locator('body')).toHaveAttribute('data-ready', 'true', READY);
const cards = (page) => page.locator('[data-testid^="species-card-"]');

test('試験用フックなし（利用者が開く経路）: 入口→アジを選ぶ→始める→3Dが出て、エラー0・外部通信0・フックは公開されない', async ({ page }) => {
  test.setTimeout(150_000);
  const { errors, externals } = await open(page, '', '');
  await expect(cards(page)).toHaveCount(8);
  await page.getByTestId('species-card-aji').first().click();
  await page.getByTestId('btn-start').click();
  await ready3d(page);
  await expect(page.getByTestId('step-title')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__sabaki)).toBe('undefined');
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('step-counter')).toContainText('2 /');
  expect(errors).toEqual([]);
  expect(externals()).toEqual([]);
});

test('入口: 8種のカードが並び、方法と初心者向けで絞り込める', async ({ page }) => {
  const { errors } = await open(page);
  await expect(cards(page)).toHaveCount(8);
  await page.getByTestId('filter-method-tebiraki').click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByTestId('filter-method-all').click();
  await page.getByTestId('filter-beginner').click();
  await expect(cards(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('ガイド: アジの15手順を次へで最後まで進み、3Dが出て、できた画面へ着く（外部通信0・CSP違反0）', async ({ page }) => {
  test.setTimeout(180_000);
  const { errors, externals } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  await expect(page.locator('#stage canvas')).toHaveCount(1);
  const stats = await page.evaluate(() => window.__sabaki.stats());
  expect(stats.triangles).toBeGreaterThan(5000);
  expect(stats.stepCount).toBe(15);
  for (let i = 1; i < 15; i++) {
    await expect(page.getByTestId('step-counter')).toContainText(`${i} / 15`);
    await page.getByTestId('btn-next').click();
  }
  await expect(page.getByTestId('step-counter')).toContainText('15 / 15');
  await page.getByTestId('btn-next').click();
  await expect(page).toHaveURL(/#\/done\/aji/);
  expect(errors).toEqual([]);
  expect(externals()).toEqual([]);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});

test('左利き・透視・視点・キー操作が効く', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  const place = page.locator('.place-text');
  await expect(place).toContainText('左');
  await page.getByTestId('toggle-left').click();
  await expect(place).toContainText('右');
  await page.getByTestId('toggle-left').click();
  await expect(place).toContainText('左');
  await page.getByTestId('toggle-xray').click();
  expect(await page.evaluate(() => window.__sabaki.state().xray)).toBe(true);
  const view0 = await page.evaluate(() => window.__sabaki.state().view);
  await page.getByTestId('toggle-view').click();
  expect(await page.evaluate(() => window.__sabaki.state().view)).not.toBe(view0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('step-counter')).toContainText('2 / 15');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('step-counter')).toContainText('1 / 15');
  await page.keyboard.press('x');
  expect(await page.evaluate(() => window.__sabaki.state().xray)).toBe(false);
  expect(errors).toEqual([]);
});

test('手順の一覧シートから好きな手順へ移れる（選ぶと閉じる）', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  await page.getByTestId('btn-steps').click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet).toBeVisible();
  await page.getByTestId('step-item-7').click();
  await expect(page.getByTestId('step-counter')).toContainText('7 / 15');
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('なぞって練習: 切りのある手順で練習を始め、なぞると採点が出る', async ({ page }) => {
  test.setTimeout(240_000);
  const { errors } = await open(page, '#/fish/aji/4');
  await ready3d(page);
  await page.getByTestId('btn-practice').click();
  await expect(page.getByTestId('practice-panel')).toBeVisible();
  // 練習は、「ここから」の丸（線の始点）から押し始める。線の位置は、試験用フックが画面の座標で返す。
  const guide = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__sabaki.practiceGuide();
  });
  expect(guide.points.length).toBeGreaterThan(1);
  await page.mouse.move(guide.start.x, guide.start.y);
  await page.mouse.down();
  // 動かす回数は少なく（遅いCIでは1回ごとの描画に数秒かかる）。線の上の点を間引いて、終点までたどる。
  const last = guide.points.length - 1;
  for (const [i, p] of guide.points.entries()) if (i % 5 === 0 || i === last) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  await expect(page.getByTestId('practice-result')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('さばく前に: 8項目と公的機関の出典リンクが読める', async ({ page }) => {
  const { errors } = await open(page, '#/safety');
  await expect(page.locator('main details')).toHaveCount(8);
  const links = page.locator('main a[href^="https://"]');
  expect(await links.count()).toBeGreaterThanOrEqual(12);
  for (const rel of await links.evaluateAll((as) => as.map((a) => a.rel))) expect(rel).toContain('noopener');
  expect(errors).toEqual([]);
});

test('3Dが使えない端末（?gl=off）では、文章だけの手順で最後まで読める', async ({ page }) => {
  const { errors } = await open(page, '#/fish/aji/1', 'debug=1&gl=off');
  await expect(page.locator('body')).toHaveAttribute('data-gl', 'off');
  await expect(page.locator('ol li').first()).toBeVisible();
  expect(await page.locator('ol > li').count()).toBeGreaterThanOrEqual(15);
  expect(errors).toEqual([]);
});

test('壊れた保存データがあっても起動する', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sabakiba.v1', '{bad json'));
  const { errors } = await open(page);
  await expect(cards(page)).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('動きを減らす設定では、自動再生しない', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const { errors } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  expect(await page.evaluate(() => window.__sabaki.state().playing)).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});

for (const id of SPECIES) {
  test(`${id}: 3Dが出て、最初・中ほど・最後の手順へ飛べる（エラー0）`, async ({ page }) => {
    test.setTimeout(150_000);
    const { errors, externals } = await open(page, `#/fish/${id}/1`);
    await ready3d(page);
    const n = await page.evaluate(() => window.__sabaki.stats().stepCount);
    expect(n).toBeGreaterThanOrEqual(10);
    for (const step of [0, Math.floor(n / 2), n - 1]) await page.evaluate(([sp, s]) => window.__sabaki.goto(sp, s, 1), [id, step]);
    expect(errors).toEqual([]);
    expect(externals()).toEqual([]);
  });
}

test.describe('スマホ（390×844・指）', () => {
  test.use(phone);
  test('入口とガイドが横にはみ出さず、「次へ」は大きく、指でタップして進める', async ({ page }) => {
    test.setTimeout(150_000);
    const { errors } = await open(page);
    await expect(cards(page)).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => { location.hash = '#/fish/aji/1'; });
    await ready3d(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const next = page.getByTestId('btn-next');
    const box = await next.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await next.tap();
    await expect(page.getByTestId('step-counter')).toContainText('2 / 15');
    expect(errors).toEqual([]);
  });
});

// ---- なぞって練習：見える線のとおりに点が取れる・始点を外すと知らせる（体験の採点で0点だった所） ----


async function enterPractice(page) {
  await page.getByTestId('btn-practice').click();
  await expect(page.locator('.practice-status')).toHaveText('「ここから」の丸から、朱色の線に沿って、一筆でなぞります。');
  // 練習に切り替わった後の盤の寸法とカメラで位置を読みます。
  const guide = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__sabaki.practiceGuide();
  });
  expect(guide).toBeTruthy();
  expect(guide.points.length).toBeGreaterThan(1);
  return guide;
}

async function traceGuide(page, { start, points }) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = distances.at(-1), duration = 1500;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // 実際に経過した時間から進む距離を決め、描画が遅いフレームでも一筆の速さを保ちます。
  const began = performance.now();
  let segment = 1;
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 20));
    const elapsed = Math.min(duration, performance.now() - began);
    const arc = total * elapsed / duration;
    while (segment < points.length - 1 && distances[segment] <= arc) segment++;
    const a = points[segment - 1], b = points[segment];
    const length = distances[segment] - distances[segment - 1];
    const u = length ? (arc - distances[segment - 1]) / length : 1;
    await page.mouse.move(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
    if (elapsed === duration) break;
  }
  await page.mouse.up();
}

test.describe('幅390pxのアジ手順4・なぞって練習', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${base}?debug=1&freeze=1#/fish/aji/4`);
    await ready3d(page);
    await page.evaluate(() => window.__sabaki.goto('aji', 3, 0.5));
  });

  test('朱色の線を一筆でなぞると、一致度と線のカバーが高く、始点を外したときの60点止まりにならない', async ({ page }) => {
    await traceGuide(page, await enterPractice(page));
    const result = page.getByTestId('practice-result');
    await expect(result).toBeVisible();
    // なめらかさは、ソフトウェア描画の遅れでマウスの刻みが乱れると下がる（実機の指では起きない）。
    // 一致度とカバーは位置だけで決まるので、ここではそれを見る。ぴったり引いた点数の下限は単体試験が持つ。
    const metrics = await result.locator('.result-metrics').innerText();
    const pct = (label) => Number(new RegExp(label + '\\s*(\\d+)%').exec(metrics)?.[1]);
    expect(pct('一致度')).toBeGreaterThanOrEqual(90);
    // カバーが85%以上＝両端（0.85）に届いた採点。ソフトウェア描画の遅れで刻みが粗いと、93%前後になる。
    expect(pct('線のカバー')).toBeGreaterThanOrEqual(85);
    expect(Number(await result.locator('.result-score strong').textContent())).toBeGreaterThanOrEqual(75);
  });

  test('始点の60px横で押すと「ここから」の丸を案内し、そのまま線へ動かしても採点しません', async ({ page }) => {
    const { start, end } = await enterPractice(page);
    const status = page.locator('.practice-status');
    await page.mouse.move(start.x + 60, start.y);
    await page.mouse.down();
    await expect(status).toHaveText('線の始まり（「ここから」の丸）に触れてから、そのまま引きます。');
    await page.mouse.move(start.x, start.y);
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
    await expect(page.getByTestId('practice-result')).toHaveCount(0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(status).toContainText('なぞっています');
    await page.mouse.up();
  });

  test('手の印と札は練習中に隠れ、ガイドに戻ると再表示します', async ({ page }) => {
    const pins = page.locator('.fish-pin--hand:visible'), tags = page.locator('.fish-tag--hand:visible');
    await expect(tags.first()).toBeVisible();
    await enterPractice(page);
    await expect(pins).toHaveCount(0); await expect(tags).toHaveCount(0);
    await page.getByTestId('btn-practice-exit').click();
    await expect(pins.first()).toBeVisible(); await expect(tags.first()).toBeVisible();
    expect(await page.evaluate(() => window.__sabaki.practiceGuide())).toBeNull();
  });

  test('魚の輪郭の外にある始点の3px上からも一筆を始められます', async ({ page }) => {
    const { start, points } = await enterPractice(page);
    await page.mouse.move(start.x, start.y - 3);
    await page.mouse.down();
    await expect(page.locator('.practice-status')).toContainText('なぞっています');
    const next = points[Math.floor(points.length / 2)];
    await page.mouse.move(next.x, next.y);
    await page.mouse.up();
    await expect(page.getByTestId('practice-result')).toBeVisible();
  });
});
