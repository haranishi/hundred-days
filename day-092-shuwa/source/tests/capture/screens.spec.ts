/**
 * 採点用の画面の撮影。乱数の種を固定し、出題を同じ順で再現して正しく答えながら撮る。
 * 撮る前に、CSS の動き（getAnimations）が終わるのを待ち、マウスを画面の外へ動かす（ホバーの色を写さない）。
 * 全面撮影は1枚の合成画像なので、画面に固定した帯（下のタブ・上の帯）が途中に焼き込まれる。
 * 全面の画像では固定の要素を隠し、固定の要素の見え方は同じ画面の「最初の表示」（-top）で見る（見た目の採点 第1周の指摘）。
 */
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { getItem, VOCAB } from '../../src/content';
import { COURSES } from '../../src/course/course';
import { createDefaultProgress } from '../../src/store/schema';
import { buildLesson } from '../../src/engine/lesson';
import type { Exercise } from '../../src/engine/lesson';
import { mulberry32 } from '../../src/engine/rng';
import { createSession, answer, next } from '../../src/engine/session';
import { guardPointerLock } from '../e2e/pointerlock';

const OUT = process.env.OUT ?? 'test-results/capture';
const seed = 1794542400000;

async function settle(page: Page, extra = 600) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), undefined, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(extra);
}

async function shot(page: Page, project: string, name: string, fullPage = false) {
  const dir = `${OUT}/${project}`;
  mkdirSync(dir, { recursive: true });
  await page.mouse.move(1, 1).catch(() => {});
  await settle(page);
  if (!fullPage) { await page.screenshot({ path: `${dir}/${name}.png` }); return; }
  await page.screenshot({ path: `${dir}/${name}-top.png` });
  const hidden = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => getComputedStyle(el).position === 'fixed');
    els.forEach((el) => { el.dataset.captureHidden = el.style.visibility; el.style.visibility = 'hidden'; });
    return els.length;
  });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  if (hidden) {
    await page.evaluate(() => document.querySelectorAll<HTMLElement>('[data-capture-hidden]').forEach((el) => {
      el.style.visibility = el.dataset.captureHidden ?? '';
      delete el.dataset.captureHidden;
    }));
  }
}

const handButton = (page: Page, id: string) => page.getByRole('group', { name: '手の列', exact: true }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true });
const labelButton = (page: Page, id: string) => page.getByRole('group', { name: '文字の列', exact: true }).getByRole('button', { name: getItem(id)!.label, exact: true });

async function matchPair(page: Page, id: string) {
  await handButton(page, id).click();
  await labelButton(page, id).click();
  await handButton(page, id).waitFor({ state: 'hidden' });
}

async function answerOf(page: Page, exercise: Exercise) {
  if (exercise.kind === 'pairs') {
    for (const id of exercise.itemIds) await matchPair(page, id);
  } else if (exercise.kind === 'spellWord') {
    for (const id of exercise.correctAnswer) await page.getByRole('group', { name: '綴る手の選択肢' }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true }).click();
  } else if ('correctAnswer' in exercise) {
    const id = exercise.correctAnswer;
    const name = exercise.kind === 'readFingerspelling' ? id : exercise.kind === 'labelToSign' ? getItem(id)!.describe.viewer : exercise.kind === 'wordMeaning' ? getItem(id)!.meaning ?? getItem(id)!.label : getItem(id)!.label;
    await page.getByRole('button', { name, exact: true }).click();
  }
}

/** 帯が出てから「つづける」を押す（帯が出て0.4秒は受け付けない作りなので待つ） */
async function proceed(page: Page) {
  const button = page.getByRole('button', { name: 'つづける', exact: true });
  await button.waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await button.click();
}

test('主な画面を撮る', async ({ page }, info) => {
  const p = info.project.name;
  await guardPointerLock(page);
  await page.addInitScript((value) => { Date.now = () => value; }, seed);
  await page.goto('./');
  await shot(page, p, '01-welcome');
  await page.getByRole('button', { name: 'はじめる', exact: true }).click();
  await shot(page, p, '02-onboarding-hand');
  await page.getByRole('button', { name: '右手 おすすめ' }).click();
  await shot(page, p, '02b-onboarding-goal');
  await page.getByRole('button', { name: '1レッスン 10経験値 おすすめ' }).click();
  await shot(page, p, '03-onboarding-course');
  await page.getByRole('button', { name: /指文字 おすすめ/ }).click();

  const lesson = COURSES[0]!.units[0]!.lessons[0]!;
  let session = createSession(buildLesson(lesson, createDefaultProgress(), { rng: mulberry32(seed), cameraEnabled: true, items: getItem, vocab: VOCAB }));
  const seen = new Set<string>();
  let wrongShown = false;
  for (let i = 0; session.current && i < 40; i++) {
    const ex = session.current;
    if (ex.kind === 'intro') {
      if (!seen.has('intro')) { await page.waitForTimeout(2200); await shot(page, p, '04-lesson-intro'); seen.add('intro'); }
      await page.getByRole('button', { name: 'おぼえた', exact: true }).click();
      session = next(answer(session, ex.id, true));
      continue;
    }
    if (ex.kind === 'tryIt') {
      if (!seen.has('tryIt')) { await page.waitForTimeout(1500); await shot(page, p, '09-lesson-tryit'); seen.add('tryIt'); }
      await page.getByRole('button', { name: 'できた', exact: true }).click();
      await proceed(page);
      session = next(answer(session, ex.id, true));
      continue;
    }
    const wrong = !wrongShown && ex.kind === 'signToLabel' && 'options' in ex && ex.options.length > 1;
    if (wrong && 'options' in ex) {
      await page.getByRole('button', { name: getItem(ex.options.find((o) => o !== ex.correctAnswer)!)!.label, exact: true }).click();
    } else if (ex.kind === 'pairs' && !seen.has('pairs')) {
      // 1組目の手を選んだ所・1組そろえた所を撮ってから、残りをそろえる
      const [first, ...rest] = ex.itemIds;
      await handButton(page, first!).click();
      await shot(page, p, '05-lesson-pairs-picking');
      await labelButton(page, first!).click();
      await shot(page, p, '05-lesson-pairs-one-matched', false);
      await handButton(page, first!).waitFor({ state: 'hidden' });
      for (const id of rest) await matchPair(page, id);
    } else {
      await answerOf(page, ex);
    }
    if (!seen.has(ex.kind) && ex.kind !== 'pairs') await shot(page, p, `05-lesson-${ex.kind}-selected`);
    const check = page.getByRole('button', { name: 'チェック', exact: true });
    if (ex.kind !== 'pairs' && await check.isEnabled().catch(() => false)) await check.click();
    await page.getByRole('button', { name: 'つづける', exact: true }).waitFor({ timeout: 8000 });
    if (!seen.has(ex.kind) || wrong) await shot(page, p, `06-lesson-${ex.kind}-${wrong ? 'wrong' : 'correct'}`);
    seen.add(ex.kind);
    await proceed(page);
    session = next(answer(session, ex.id, !wrong));
    if (wrong) wrongShown = true;
  }
  await page.waitForTimeout(1500);
  await shot(page, p, '10-result');
  await proceed(page);
  await shot(page, p, '11-path', true);
  for (const [hash, name, full] of [['review', '12-review', false], ['dict', '13-dict', true], ['dict/kana-a', '14-dict-detail', true], ['spell', '15-spell', false], ['me', '16-records', true], ['settings', '17-settings', true], ['about', '18-about', true]] as const) {
    await page.goto(`./#/${hash}`);
    if (hash === 'spell') {
      await shot(page, p, '15a-spell-before');
      await page.getByLabel('再生することば').fill('あいう');
      await page.getByRole('button', { name: '指文字で再生', exact: true }).click();
      await page.waitForTimeout(1200);
    }
    await shot(page, p, name, full);
  }
});
