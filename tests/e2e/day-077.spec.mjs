import { expect, test } from '@playwright/test';
import { ITEMS } from '../../day-077-hoan-swiper/lib/items.js';

const base = '/day-077-hoan-swiper/';
const itemByName = new Map(ITEMS.map((item) => [item.name, item]));

const pageErrors = new WeakMap();
const externalRequests = new WeakMap();

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page, baseURL }) => {
  const errors = [];
  const external = [];
  pageErrors.set(page, errors);
  externalRequests.set(page, external);

  page.on('pageerror', (error) => errors.push(error.message));
  const origin = new URL(baseURL).origin;
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(`${origin}/`) && !/^(data|blob):/.test(url)) {
      external.push(url);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(externalRequests.get(page)).toEqual([]);
});

test('初期表示でスタート画面が表示され、1問練習チュートリアル・X線透視・シフト開始から3方向仕分けが動く', async ({ page }) => {
  await page.goto(base);

  await expect(page.locator('.brand-title')).toHaveText('保安検査スワイパー');
  await expect(page.locator('#start-overlay')).toBeVisible();
  await expect(page.locator('#btn-start-shift')).toBeVisible();
  await expect(page.locator('#btn-start-tutorial')).toBeVisible();

  // 1問練習チュートリアルを起動し、X線透視とコーチバナーを確認
  await page.locator('#btn-start-tutorial').click();
  await expect(page.locator('#start-overlay')).toBeHidden();
  await expect(page.locator('#coach-banner')).toBeVisible();
  await expect(page.locator('#coach-step-badge')).toContainText('おためし練習');
  await expect(page.locator('#coach-text')).toContainText('モバイルバッテリー');
  await expect(page.locator('#item-name')).toHaveText('モバイルバッテリー');
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#xray-telemetry')).toBeVisible();

  // 練習問題を左（機内持ち込み）へ仕分けてクリア
  await page.locator('.conveyor-middle [data-action="carry_on"]').click();
  await expect(page.locator('#feedback-banner')).toHaveClass(/is-correct/);
  await expect(page.locator('#feedback-badge')).toContainText('練習クリア');
  await expect(page.locator('#coach-step-badge')).toContainText('第1問ガイド');

  // X線透視ボタンのON/OFF切り替えを確認
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#btn-xray-toggle').click();
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#xray-telemetry')).toBeVisible();
  await page.locator('#btn-xray-toggle').click();
  await expect(page.locator('#btn-xray-toggle')).toHaveAttribute('aria-pressed', 'false');

  // 本番1問目の品名を読み取り、正解の方向へ仕分ける
  const firstName = (await page.locator('#item-name').textContent()).trim();
  const firstItem = itemByName.get(firstName);
  expect(firstItem, `Unknown item: ${firstName}`).toBeTruthy();

  const correctAction = firstItem.allowed[0];
  await page.locator(`#inspection-stage .conveyor-middle [data-action="${correctAction}"], #inspection-stage .zone-top-wrap [data-action="${correctAction}"]`).first().click();

  await expect(page.locator('#feedback-banner')).toHaveClass(/is-correct/);
  await expect(page.locator('#feedback-badge')).toContainText('正解');
  await expect(page.locator('#hud-combo')).toHaveText('×1');

  // 2問目をキーボードでわざと誤答させる
  const secondName = (await page.locator('#item-name').textContent()).trim();
  const secondItem = itemByName.get(secondName);
  expect(secondItem).toBeTruthy();

  const wrongAction = ['carry_on', 'checked', 'prohibited'].find((a) => !secondItem.allowed.includes(a));
  const keyMap = { carry_on: 'ArrowLeft', checked: 'ArrowUp', prohibited: 'ArrowRight' };
  await page.keyboard.press(keyMap[wrongAction]);

  await expect(page.locator('#feedback-banner')).toHaveClass(/is-wrong/);
  await expect(page.locator('#feedback-badge')).toContainText('ミス');
  await expect(page.locator('#hud-combo')).toHaveText('×0');
});

test('厳選10問・研修シフトを完走するとリザルト・復習リスト・自己ベストが更新される', async ({ page }) => {
  await page.goto(base);

  await page.locator('#mode-training').click();
  await expect(page.locator('#hud-progress-label')).toHaveText('PROGRESS');
  await expect(page.locator('#hud-timer')).toHaveText('1 / 10');

  for (let i = 0; i < 10; i += 1) {
    const name = (await page.locator('#item-name').textContent()).trim();
    const item = itemByName.get(name);
    expect(item).toBeTruthy();
    // 1問目だけわざと間違え、残り9問は正解させる
    const action =
      i === 0
        ? ['carry_on', 'checked', 'prohibited'].find((a) => !item.allowed.includes(a))
        : item.allowed[0];
    const keyMap = { carry_on: 'ArrowLeft', checked: 'ArrowUp', prohibited: 'ArrowRight' };
    await page.keyboard.press(keyMap[action]);
  }

  await expect(page.locator('#result-panel')).toBeVisible();
  await expect(page.locator('#result-grade')).toHaveText('A');
  await expect(page.locator('#result-accuracy')).toContainText('9 / 10 (90%)');
  await expect(page.locator('#best-training-score')).toHaveText('9');
  await expect(page.locator('#review-heading')).toContainText('今回まちがえた荷物（1件）');
  await expect(page.locator('.review-item-card.is-mistake')).toHaveCount(1);

  // リロードしても自己ベストが保持されていること
  await page.reload();
  await expect(page.locator('#best-training-score')).toHaveText('9');
});

test('手荷物ルール早見図鑑タブでカテゴリ絞り込み・検索・公式リンク集が機能する', async ({ page }) => {
  await page.goto(base);

  await page.locator('#tab-catalog').click();
  await expect(page.locator('#panel-catalog')).toBeVisible();
  await expect(page.locator('.catalog-card')).toHaveCount(36);

  // カテゴリ「電池・電子機器」で絞り込み
  await page.locator('.cat-chip', { hasText: '電池・電子機器' }).click();
  const batteryCount = await page.locator('.catalog-card').count();
  expect(batteryCount).toBeGreaterThanOrEqual(6);
  expect(batteryCount).toBeLessThan(36);

  // 「すべて」に戻してキーワード「ヘアアイロン」で検索
  await page.locator('.cat-chip', { hasText: 'すべて' }).click();
  await page.locator('#catalog-search').fill('ヘアアイロン');
  await expect(page.locator('.catalog-card')).toHaveCount(3);

  // 公式リンクが安全属性付きで配置されていること
  const officialLinks = page.locator('.official-link-card');
  await expect(officialLinks).toHaveCount(6);
  for (let i = 0; i < 6; i += 1) {
    await expect(officialLinks.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(officialLinks.nth(i)).toHaveAttribute('target', '_blank');
  }
});

test('3原則ガイドダイアログの開閉、効果音トグル、4画面幅での横スクロール溢れゼロを満たす', async ({ page }) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
  }

  // ガイドダイアログの開閉
  await page.locator('#guide-open-btn').click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await page.locator('#guide-ok-btn').click();
  await expect(page.locator('#guide-dialog')).toBeHidden();

  // 効果音トグルの切り替え
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
});
