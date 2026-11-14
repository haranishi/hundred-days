import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { createDefaultProgress } from '../../src/store/schema';
import type { Progress } from '../../src/store/schema';
import { getItem } from '../../src/content';
import { introduceItem } from '../../src/engine/srs';
import { guardPointerLock } from './pointerlock';

async function seed(page: Page, state = createDefaultProgress()) {
  state.settings.onboarded = true; state.settings.sound = false; state.settings.vibration = false;
  await page.addInitScript(value => { if (!localStorage.getItem('tekotoba:v1')) localStorage.setItem('tekotoba:v1', JSON.stringify(value)); }, state);
}
const stateOf = (page: Page): Promise<Progress> => page.evaluate(() => JSON.parse(localStorage.getItem('tekotoba:v1')!));
const upload = (page: Page, value: string) => page.getByLabel('記録を読み込むファイル').setInputFiles({ name: 'record.json', mimeType: 'application/json', buffer: Buffer.from(value) });
test.beforeEach(async ({ page }) => { await guardPointerLock(page); });

test('復習→5経験値→結果→記録→再読み込み', async ({ page }) => {
  const state = createDefaultProgress();
  state.items['kana-a'] = introduceItem('2020-01-01');
  await seed(page, state); await page.goto('./#/review');
  await page.getByRole('button', { name: '復習をはじめる', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '主な画面' })).toHaveCount(0);
  await page.getByRole('button', { name: getItem('kana-a')!.describe.viewer, exact: true }).click();
  await page.getByRole('button', { name: 'チェック', exact: true }).click();
  await page.getByRole('button', { name: 'つづける', exact: true }).click();
  await expect(page.getByRole('heading', { name: '復習完了！' })).toBeVisible();
  await expect(page.getByLabel('5経験値を獲得')).toBeVisible();
  await page.getByRole('link', { name: '記録', exact: true }).click(); await page.reload();
  const saved = await stateOf(page);
  expect(Object.values(saved.xpByDay).reduce((sum, amount) => sum + amount, 0)).toBe(5);
  expect(saved.items['kana-a']!.correct).toBe(1);
});

test('苦手を練習の直リンクと中断確認', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
  }
  const state = createDefaultProgress(); state.items['kana-i'] = { ...introduceItem('2020-01-01'), wrong: 3 };
  await seed(page, state); await page.goto('./#/practice/weak');
  await page.getByRole('button', { name: 'レッスンをやめる' }).click();
  const dialog = page.getByRole('dialog', { name: 'レッスンをやめますか？' });
  await dialog.getByRole('button', { name: 'つづける', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'やめる', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/); expect((await stateOf(page)).xpByDay).toEqual({});
});

test('図鑑→詳細→指文字再生で収録外を飛ばし、左手と動きを減らす設定を使う', async ({ page }) => {
  const state = createDefaultProgress(); state.settings.dominant = 'left'; state.settings.reduceMotion = true;
  await seed(page, state); await page.goto('./#/dict');
  await page.locator('a[href="#/dict/kana-a"]').click();
  await expect(page.getByRole('heading', { name: '自分で作るときのコツ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '確信度' })).toBeVisible();
  await page.getByRole('link', { name: '〈 図鑑へ' }).click();
  await page.getByRole('link', { name: /ことばを指文字で再生/ }).click();
  await page.getByLabel('再生することば').fill('アイ漢'); await page.getByRole('button', { name: '指文字で再生', exact: true }).click();
  await expect(page.getByText('『漢』は指文字が無いので飛ばします')).toBeVisible();
  // 再生は0.9秒ごとに次の文字へ自動で進む。重い環境で確認が遅れると先へ進んでいることがあるので、
  // 押した直後に最初に「いまの文字」になった字を、ページの中で記録して確かめる（時間に左右されない）
  const firstStepAfter = async (name: string) => {
    await page.evaluate(() => {
      const w = window as unknown as { __steps: string[]; __obs?: MutationObserver };
      w.__steps = []; w.__obs?.disconnect();
      w.__obs = new MutationObserver(() => {
        const current = document.querySelector('.spell-character[aria-current="step"]')?.textContent ?? '';
        if (current && w.__steps.at(-1) !== current) w.__steps.push(current);
      });
      w.__obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-current'], childList: true });
    });
    await page.getByRole('button', { name, exact: true }).click();
    // 押す前から同じ字だった（自動送りが先に来ていた）時は表示が変わらないので、そのときは今の字を読む
    await page.waitForFunction(() => (window as unknown as { __steps: string[] }).__steps.length > 0, undefined, { timeout: 1000 }).catch(() => {});
    return page.evaluate(() => (window as unknown as { __steps: string[] }).__steps[0]
      ?? document.querySelector('.spell-character[aria-current="step"]')?.textContent ?? '');
  };
  expect(await firstStepAfter('い')).toBe('い');
  expect(await firstStepAfter('はじめから')).toBe('あ');
});

test('書き出し→不正な読み込み→確認取消→置き換え→全削除', async ({ page }) => {
  await seed(page); await page.goto('./#/settings');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '記録を書き出す' }).click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toMatch(/^tekotoba-progress-\d{8}\.json$/);
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as Progress;
  expect(exported.version).toBe(1);
  await upload(page, '{ broken'); await expect(page.getByRole('status').filter({ hasText: 'JSON形式を読み取れません' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  exported.xpByDay = { '2026-11-12': 50 };
  await upload(page, JSON.stringify(exported));
  const dialog = page.getByRole('dialog', { name: 'いまの記録を置き換えます' });
  await dialog.getByRole('button', { name: 'やめる', exact: true }).click(); expect((await stateOf(page)).xpByDay).toEqual({});
  await upload(page, JSON.stringify(exported)); await dialog.getByRole('button', { name: '置き換える' }).click();
  await page.reload(); expect((await stateOf(page)).xpByDay).toEqual(exported.xpByDay);
  await page.getByRole('button', { name: 'すべて消す', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'やめる' }).click(); expect((await stateOf(page)).xpByDay).toEqual(exported.xpByDay);
  await page.getByRole('button', { name: 'すべて消す', exact: true }).click(); await page.getByRole('button', { name: '消して最初から' }).click();
  await expect(page.getByRole('heading', { name: 'てことば', exact: true })).toBeVisible(); await page.reload();
  expect((await stateOf(page)).settings.onboarded).toBe(false);
});

test('360pxと横画面で各画面がはみ出さず、押せる領域は44px以上', async ({ page }) => {
  await seed(page);
  for (const viewport of [{ width: 360, height: 780 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const hash of ['review', 'dict', 'dict/kana-a', 'spell', 'me', 'settings', 'about']) {
      await page.goto(`./#/${hash}`); await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // ラベルの中の入力（設定のスイッチなど）は、行のどこを押しても切り替わるので、押せる領域はラベルの大きさで測る
      const small = await page.locator('main a, main button, main input, main select').evaluateAll(elements => elements.filter(element => {
        const visible = element.getBoundingClientRect(); if (visible.width === 0 || visible.height === 0) return false;
        const box = (element instanceof HTMLInputElement && element.closest('label')) ? element.closest('label')!.getBoundingClientRect() : visible;
        return box.width < 44 || box.height < 44;
      }).map(element => element.textContent || element.getAttribute('aria-label') || element.outerHTML.slice(0, 80)));
      expect(small).toEqual([]);
      for (const field of await page.locator('main select, main .text-input').all()) {
        expect(await field.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
        expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      }
    }
  }
});

test('キーボードで設定と共有を操作でき、各画面に重大なアクセシビリティ違反がない', async ({ page }) => {
  await seed(page); await page.goto('./#/settings');
  await page.getByLabel('利き手').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
  await expect(page.getByLabel('1日の目標')).toBeFocused();
  await page.getByRole('button', { name: 'すべて消す', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'すべて消す', exact: true })).toBeFocused();
  for (const hash of ['review', 'dict', 'spell', 'me', 'settings', 'about']) {
    await page.goto(`./#/${hash}`); const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
  }
  await page.goto('./#/me'); await page.getByRole('button', { name: '記録をシェア' }).click();
  await expect(page.getByRole('dialog')).toContainText('てことばで手話を0日続けています');
  await expect(page.getByRole('link', { name: 'Xで共有' })).toHaveAttribute('target', '_blank');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '記録をシェア' })).toBeFocused();
});

test('PWAの事前保存後はオフラインで再読み込み・図鑑・復習完了まで使える', async ({ page, context }) => {
  const state = createDefaultProgress(); state.items['kana-a'] = introduceItem('2020-01-01');
  await seed(page, state); await page.goto('./#/about');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json());
  expect(manifest.start_url).toBe('./'); expect(manifest.scope).toBe('./'); expect(manifest.icons).toHaveLength(3);
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat());
  expect(urls.some(url => url.includes('/mediapipe/'))).toBe(false);
  expect(urls.some(url => url.includes('/assets/runtime-'))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload(); await expect(page.getByRole('heading', { name: 'このアプリについて', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '図鑑', exact: true }).click(); await page.locator('a[href="#/dict/kana-a"]').click();
    await expect(page.getByRole('heading', { name: '自分で作るときのコツ' })).toBeVisible();
    await page.getByRole('link', { name: '復習', exact: true }).click(); await page.getByRole('button', { name: '復習をはじめる' }).click();
    await page.getByRole('button', { name: getItem('kana-a')!.describe.viewer, exact: true }).click();
    await page.getByRole('button', { name: 'チェック', exact: true }).click(); await page.getByRole('button', { name: 'つづける', exact: true }).click();
    await expect(page.getByRole('heading', { name: '復習完了！' })).toBeVisible();
  } finally { await context.setOffline(false); }
});

for (const interval of [0, 100, 500]) test(`回答間隔${interval}msと低速CPUでも復習の経験値を二重加算しない`, async ({ page, context, browserName }) => {
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
  }
  const state = createDefaultProgress(); state.items['kana-a'] = introduceItem('2020-01-01');
  await seed(page, state); await page.goto('./#/review');
  await page.getByRole('button', { name: '復習をはじめる' }).click();
  await page.getByRole('button', { name: getItem('kana-a')!.describe.viewer, exact: true }).click();
  if (interval) await page.waitForTimeout(interval);
  await page.getByRole('button', { name: 'チェック', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  if (interval) await page.waitForTimeout(interval);
  await page.getByRole('button', { name: 'つづける', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  if (interval < 400) await expect(page.locator('.feedback')).toBeVisible();
  if (interval < 400) await page.getByRole('button', { name: 'つづける', exact: true }).click();
  await expect(page.getByRole('heading', { name: '復習完了！' })).toBeVisible();
  const saved = await stateOf(page); expect(Object.values(saved.xpByDay)).toEqual([5]); expect(saved.items['kana-a']!.correct).toBe(1);
});
