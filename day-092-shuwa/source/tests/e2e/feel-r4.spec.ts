import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COURSES } from '../../src/course/course';
import { createDefaultProgress } from '../../src/store/schema';
import { createSession } from '../../src/engine/session';
import type { Exercise } from '../../src/engine/lesson';
import type { SavedSession } from '../../src/store/session';
import { SESSION_KEY } from '../../src/store/session';
import { getItem } from '../../src/content';
import { guardPointerLock } from './pointerlock';

const lesson = COURSES[0]!.units[0]!.lessons[0]!;
const kana = ['kana-a', 'kana-i', 'kana-u', 'kana-e'];
const words = ['word-ohayou', 'word-konnichiwa', 'word-konbanwa', 'word-arigatou'];
const choice: Exercise = { id: 'choice', kind: 'signToLabel', itemId: kana[0]!, options: kana, correctAnswer: kana[0]! };
const end: Exercise = { id: 'end', kind: 'intro', itemId: 'kana-i' };
async function seed(page: Page, exercises: Exercise[], wordNoticeShown = true) {
  const progress = createDefaultProgress();
  progress.settings.onboarded = true; progress.settings.sound = false; progress.settings.vibration = false;
  const snapshot: SavedSession = { version: 1, lessonId: lesson.id, route: `#/lesson/${lesson.id}`,
    session: createSession(exercises), exercises, value: null, started: Date.now(), cameraSuccess: false, matchedWithCamera: false, wordNoticeShown };
  await page.addInitScript(({ progress, snapshot, key }) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tekotoba:v1', JSON.stringify(progress)); localStorage.setItem(key, JSON.stringify(snapshot));
      sessionStorage.setItem('seeded', 'yes');
    }
  }, { progress, snapshot, key: SESSION_KEY });
  await page.goto(`./#/lesson/${lesson.id}`);
  await page.getByRole('button', { name: /^続きから/ }).click();
}
test.beforeEach(async ({ page }) => { await guardPointerLock(page); await page.setViewportSize({ width: 390, height: 844 }); });

const layouts: Exercise[] = [
  choice,
  { ...choice, id: 'number', itemId: 'num-1', options: ['num-1', 'num-2', 'num-3', 'num-4'], correctAnswer: 'num-1' },
  { ...choice, id: 'word-sign', itemId: words[0]!, options: words, correctAnswer: words[0]! },
  { ...choice, id: 'label', kind: 'labelToSign' },
  { ...choice, id: 'word-label', kind: 'labelToSign', itemId: words[0]!, options: words, correctAnswer: words[0]! },
  { ...choice, id: 'meaning', kind: 'wordMeaning', itemId: words[0]!, options: words, correctAnswer: words[0]! },
  { id: 'read', kind: 'readFingerspelling', word: { kana: 'あい', meaning: '愛' }, sequence: ['kana-a', 'kana-i'], options: ['あい', 'あう', 'いう', 'うえ'], correctAnswer: 'あい' },
  { id: 'spell', kind: 'spellWord', word: { kana: 'あい', meaning: '愛' }, correctAnswer: ['kana-a', 'kana-i'], options: kana },
  { id: 'pairs', kind: 'pairs', itemIds: kana, signOrder: kana, labelOrder: [...kana].reverse() },
];
for (const exercise of layouts) test(`390×844：${exercise.id}の全札が固定ボタンより上で見える`, async ({ page }) => {
  await seed(page, [exercise, end], false);
  const cards = page.locator('.lesson__content .choices .choice, .pairs .pair-choice');
  await expect(cards).toHaveCount(exercise.kind === 'pairs' ? 8 : 4);
  await expect(page.locator('.choices .thumbnail--fallback, .pairs .thumbnail--fallback')).toHaveCount(0);
  const content = await page.locator('.lesson__content').boundingBox();
  const footer = await page.locator('.lesson__footer').boundingBox();
  for (const card of await cards.all()) {
    const box = (await card.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(content!.y);
    expect(box.y + box.height).toBeLessThanOrEqual(footer!.y);
  }
  expect(await page.locator('.lesson__content').evaluate(element => element.scrollTop)).toBe(0);
});

for (const kind of ['choice', 'self'] as const) for (const delay of [0, 90, 250, 399, 400, 500]) {
  test(`${kind}：回答から${delay}msの二度押し`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-13T00:00:00Z') });
    await seed(page, [kind === 'self' ? { id: 'self', kind: 'tryIt', itemId: 'kana-a' } : choice, end]);
    await page.clock.pauseAt(new Date('2026-11-13T00:01:00Z'));
    if (kind === 'choice') await page.locator('[data-option="kana-a"]').click();
    await page.getByRole('button', { name: kind === 'self' ? 'できた' : 'チェック', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator('.feedback')).toBeVisible();
    await page.clock.runFor(delay);
    const next = page.getByRole('button', { name: 'つづける', exact: true });
    expect(await next.isDisabled()).toBe(delay < 400);
    await next.evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator('.feedback')).toHaveCount(delay < 400 ? 1 : 0);
  });
}

test('再読込から帯を復元し、番号が進み、再出題の札の順序が変わる', async ({ page }) => {
  await seed(page, [choice, end]);
  const order = await page.locator('.choices button').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-option')));
  await page.locator('[data-option="kana-i"]').click(); await page.getByRole('button', { name: 'チェック', exact: true }).click();
  for (const [index, id] of ['kana-a', 'kana-i'].entries()) {
    const row = page.locator('.feedback__comparison').nth(index);
    await expect(row).toContainText(`${index ? 'あなたの答え' : '正解'}：${getItem(id)!.label}`);
    await expect(row.locator('img')).toHaveAttribute('alt', getItem(id)!.describe.viewer);
  }
  await page.reload(); await page.getByRole('button', { name: '続きから（1/2）' }).click();
  await expect(page.locator('.feedback__comparison').nth(1)).toContainText('あなたの答え：い');
  await page.getByRole('button', { name: 'つづける', exact: true }).click(); await expect(page.locator('.lesson__header')).toContainText('2 / 3');
  await page.getByRole('button', { name: 'おぼえた' }).click(); await expect(page.locator('.retry-badge')).toHaveText('もう一度');
  const retry = await page.locator('.choices button').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-option')));
  expect(retry).not.toEqual(order); expect([...retry].sort()).toEqual([...order].sort());
  await page.getByRole('button', { name: 'レッスンをやめる' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'やめる', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBeNull();
});

test('結果のつづけるが最初から見え、道すじの目標と現在地が見える', async ({ page }) => {
  await seed(page, [choice]); await page.locator('[data-option="kana-a"]').click();
  await page.getByRole('button', { name: 'チェック', exact: true }).click(); await page.getByRole('button', { name: 'つづける', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'レッスン完了！' })).toBeVisible();
  const button = (await page.getByRole('button', { name: 'つづける', exact: true }).boundingBox())!;
  const tabs = (await page.locator('.bottom-tabs').boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(0); expect(button.y + button.height).toBeLessThanOrEqual(tabs.y);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('button', { name: 'つづける', exact: true }).click();
  // 道すじは、書体の読み込みが終わった後にもう一度だけ位置を合わせ直す（文字の高さが変わるため）。落ち着くまで待って測る
  await expect.poll(async () => { const box = (await page.locator('.lesson-node--current').boundingBox())!; return box.y + box.height; }).toBeLessThan(780);
  const node = (await page.locator('.lesson-node--current').boundingBox())!;
  const heading = (await page.locator('.path__heading').boundingBox())!;
  expect(node.y).toBeGreaterThanOrEqual(heading.y + heading.height);
  const topbar = (await page.locator('.topbar').boundingBox())!;
  expect(topbar.y).toBe(0);
});

test('指文字の再生で入力のフォーカスを外し、手を表示して再生操作を1組にする', async ({ page }) => {
  const progress = createDefaultProgress(); progress.settings.onboarded = true;
  await page.addInitScript(state => localStorage.setItem('tekotoba:v1', JSON.stringify(state)), progress);
  await page.goto('./#/spell'); await page.getByLabel('再生することば').fill('あい');
  await page.getByRole('button', { name: '指文字で再生', exact: true }).click();
  await expect(page.getByLabel('再生することば')).not.toBeFocused();
  const hand = (await page.locator('.hand-view__stage').boundingBox())!;
  const tabs = (await page.locator('.bottom-tabs').boundingBox())!;
  expect(hand.y).toBeGreaterThanOrEqual(0); expect(hand.y + hand.height).toBeLessThanOrEqual(tabs.y);
  await expect(page.locator('.hand-view__actions').getByRole('button', { name: 'もう一度', exact: true })).toHaveCount(0);
  await expect(page.locator('.hand-view__actions').getByRole('button', { name: 'ゆっくり', exact: true })).toHaveCount(0);
  await expect(page.locator('.playback')).toHaveCount(1);
});
