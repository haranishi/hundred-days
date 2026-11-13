import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getItem, VOCAB } from '../../src/content';
import { COURSES } from '../../src/course/course';
import { createDefaultProgress } from '../../src/store/schema';
import { buildLesson } from '../../src/engine/lesson';
import type { Exercise } from '../../src/engine/lesson';
import { mulberry32 } from '../../src/engine/rng';
import { createSession, answer, next } from '../../src/engine/session';
import { guardPointerLock } from './pointerlock';

const seed = 1794542400000;
test.beforeEach(async ({ page }) => {
  await guardPointerLock(page);
  // 乱数の種だけ固定する。タイマー・Dateコンストラクタは実時間のまま。
  await page.addInitScript(value => { Date.now = () => value; }, seed);
});
async function onboard(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'はじめる', exact: true }).click();
  await page.getByRole('button', { name: '右手 おすすめ' }).click();
  await page.getByRole('button', { name: '1レッスン 10経験値 おすすめ' }).click();
  await page.getByRole('button', { name: /指文字 おすすめ/ }).click();
}
async function selectAnswer(page: Page, exercise: Exercise, wrong: boolean) {
  if (exercise.kind === 'intro' || exercise.kind === 'tryIt') return;
  if (exercise.kind === 'pairs') {
    for (const id of exercise.itemIds) {
      await page.getByRole('group', { name: '手の列', exact: true }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true }).click();
      await page.getByRole('group', { name: '文字の列', exact: true }).getByRole('button', { name: getItem(id)!.label, exact: true }).click();
      await expectPairToRemain(page, id);
    }
  } else if (exercise.kind === 'spellWord') {
    for (const id of exercise.correctAnswer) await page.getByRole('group', { name: '綴る手の選択肢' }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true }).click();
  } else if ('correctAnswer' in exercise) {
    const id = wrong ? exercise.options.find(id => id !== exercise.correctAnswer)! : exercise.correctAnswer;
    const name = exercise.kind === 'readFingerspelling' ? id : exercise.kind === 'labelToSign' ? getItem(id)!.describe.viewer : exercise.kind === 'wordMeaning' ? getItem(id)!.meaning ?? getItem(id)!.label : getItem(id)!.label;
    await page.getByRole('button', { name, exact: true }).click();
  }
}

test('初回→1回まちがえて完了→次が開く→再読み込みでも記録が残る', async ({ page }) => {
  const lesson = COURSES[0]!.units[0]!.lessons[0]!;
  let session = createSession(buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(seed), cameraEnabled: false, items: getItem, vocab: VOCAB }));
  await onboard(page);
  await expect(page).toHaveURL(new RegExp(`#/lesson/${lesson.id}$`));
  let madeMistake = false;
  let attempts = 0;
  while (session.current && attempts++ < 40) {
    const exercise = session.current;
    if (exercise.kind === 'intro') {
      await expect(page.getByRole('heading', { name: getItem(exercise.itemId)!.label, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'おぼえた', exact: true }).click();
      session = next(answer(session, exercise.id, true));
      continue;
    }
    const wrong = !madeMistake && exercise.kind === 'signToLabel' && exercise.options.length > 1;
    await selectAnswer(page, exercise, wrong);
    if (exercise.kind !== 'pairs') await page.getByRole('button', { name: exercise.kind === 'tryIt' ? 'できた' : 'チェック', exact: true }).click();
    await expect(page.getByRole('heading', { name: wrong ? 'おしい！' : exercise.kind === 'tryIt' ? 'できたね！' : '正解！', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'つづける', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'つづける', exact: true }).click();
    session = next(answer(session, exercise.id, !wrong));
    if (wrong) madeMistake = true;
  }
  expect(madeMistake).toBe(true);
  expect(session.current).toBeNull();
  await expect(page.getByRole('heading', { name: 'レッスン完了！' })).toBeVisible();
  await expect(page.getByLabel('10経験値を獲得')).toBeVisible();
  await page.getByRole('button', { name: 'つづける', exact: true }).click();
  const nextLesson = COURSES[0]!.units[0]!.lessons[1]!;
  await expect(page.getByRole('button', { name: `${nextLesson.title}（スタート）`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: `${lesson.title}（完了）`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `${nextLesson.title}（スタート）`, exact: true })).toBeVisible();
});

test('Escで終了確認し、紹介済みの項目は再読み込み後も残す', async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole('button', { name: 'おぼえた' })).toBeVisible();
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'レッスンをやめますか？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'やめる', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tekotoba:v1')!));
  expect(saved.items['kana-a'].box).toBe(0);
  expect(saved.lessons).toEqual({});
  expect(saved.xpByDay).toEqual({});
});

test('360pxと横画面で横にはみ出さず、主ボタンが画面内にある', async ({ page }) => {
  await onboard(page);
  for (const viewport of [{ width: 360, height: 780 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    const bounds = await page.getByRole('button', { name: 'おぼえた' }).boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  }
});

async function expectPairToRemain(page: Page, id: string) {
  const matched = page.getByRole('group', { name: '手の列', exact: true }).getByRole('button', { name: `手の${getItem(id)!.label}、ペア完成`, exact: true });
  await expect(matched).toBeVisible(); await expect(matched).toBeDisabled();
  await expect(matched.locator('.choice__mark')).toHaveText('✓');
}
