import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Day082「影討ち」（three.js の3D）。CI はGPUが無く、既定の表示（写真の質感と後処理）はシェーダーの先作りだけで
   手元でも30秒を超える。遊びの流れは仮の表示（?view=greybox。手元で約2秒）で確かめ、既定の表示は質感の読み込みまでを見る。
   URL の引数（view・autostart・god・speed・seed）は day-082-kageuchi/source/README.md の表にある、ゲームが元から持つもの */
const path = '/day-082-kageuchi/';
const canonical = `${(process.env.HD_CANONICAL_BASE || 'https://rairakku.com/100days').replace(/\/+$/, '')}${path}`;

// 本番と同じCSPを当てて開く（serve-dist はヘッダーを付けないので、dist/_headers の値をこのDayの応答に足す）
async function watch(page, context, baseURL) {
  const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8');
  const block = headers.slice(headers.indexOf(`${path}*`)).split(/\n(?=\S)/)[0];
  const csp = block.match(/Content-Security-Policy:\s*(.*)/)?.[1];
  expect(csp, 'dist/_headers に Day082 のCSPが無い').toBeTruthy();
  await context.route(`**${path}**`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  const seen = { errors: [], external: [], failures: [], textures: [] };
  const origin = new URL(baseURL).origin;
  page.on('console', (message) => { if (message.type() === 'error') seen.errors.push(message.text()); });
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) seen.external.push(request.url());
  });
  page.on('response', (response) => {
    const { pathname } = new URL(response.url());
    if (response.status() >= 400) seen.failures.push(`${response.status()} ${pathname}`);
    if (pathname.endsWith('.jpg') && response.ok()) seen.textures.push(pathname);
  });
  return seen;
}

async function boot(page, query) {
  await page.goto(path + query);
  await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
}

const screen = (page, name, timeout = 15_000) => page.waitForFunction((s) => window.__state?.screen === s, name, { timeout });

test('Day82をタイトルから本能寺の潜入まで進め、Wキーで歩くと位置が変わる（外部通信・エラー無し）', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const seen = await watch(page, context, baseURL);
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page, '?view=greybox&seed=3');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  // 共有欄はタイトルでは見え、遊ぶ画面では操作の表示に重ならないよう隠れる
  await expect(page.locator('#share .share')).toBeVisible();

  await page.getByTestId('btn-start').click();
  await screen(page, 'select');
  await expect(page.getByTestId('stage-okehazama')).toBeDisabled();
  await page.getByTestId('stage-honnoji').click();
  await screen(page, 'briefing');
  await page.getByTestId('btn-begin').click();
  await screen(page, 'play');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.locator('#share .share')).toBeHidden();

  const before = await page.evaluate(() => window.__state.player);
  const t0 = await page.evaluate(() => window.__state.t);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((t) => window.__state.t >= t, t0 + 1, { timeout: 30_000, polling: 50 });
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__state.player);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.2);

  expect(seen.errors).toEqual([]);
  expect(seen.external).toEqual([]);
  expect(seen.failures).toEqual([]);
});

test('Day82で信長を討つと、炎上の演出を経て結果画面に位が出て、共有欄が戻る', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const seen = await watch(page, context, baseURL);
  await boot(page, '?view=greybox&autostart=1&god=1&speed=4&seed=1');
  await screen(page, 'play');
  await page.evaluate(() => window.__game.win());
  await screen(page, 'finale', 20_000);
  await screen(page, 'result', 60_000);
  const result = page.getByTestId('screen-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('織田信長を討ち取った');
  await expect(page.locator('#share .share')).toBeVisible();
  const x = await page.locator('#share').getByRole('link', { name: 'Xで投稿' }).getAttribute('href');
  expect(decodeURIComponent(x)).toContain('影討ち');
  expect(seen.errors).toEqual([]);
  expect(seen.external).toEqual([]);
  expect(seen.failures).toEqual([]);
});

/* 既定の表示はシェーダーの先作りが重く、ページを閉じたあともブラウザのGPUプロセスで作りかけの処理が続く。
   同じブラウザで次に開く3Dのページ（shared-share の Day 082 など）がそれを待たされて時間切れになったので、
   このテストだけ専用のブラウザを起こし、終わったらプロセスごと閉じる */
test('Day82の既定の表示は、写真の質感8枚を自分のフォルダから読み、CSPにも止められない', async ({ playwright, baseURL }) => {
  test.setTimeout(120_000);
  const browser = await playwright.chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const seen = await watch(page, context, baseURL);
    await page.goto(path);
    // 起動の完了（シェーダーの先作り）までは待たない。質感は起動の途中で読み終わる
    await expect.poll(() => new Set(seen.textures).size, { timeout: 90_000 }).toBe(8);
    expect(seen.textures.every((one) => one.startsWith(`${path}assets/`))).toBe(true);
    expect(seen.errors).toEqual([]);
    expect(seen.external).toEqual([]);
    expect(seen.failures).toEqual([]);
  } finally {
    await browser.close();
  }
});
