/**
 * カメラ判定の通し試験（Chromium の偽カメラ）。100日のサイトと同じ CSP を付けて、
 * 許可→読み込み→「手をカメラに写してください」まで動くこと、自サイト以外へ通信しないこと、
 * 離れたらカメラが止まることを確かめる。実際の手での精度は機械では確かめられない（本人の実機確認）。
 */
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

// 100日の scripts/build.mjs が Day092 に付ける予定の値（wasm の実行とカメラだけを足したもの）
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const seed = 1794542400000;

async function answerCorrectly(page: Page, exercise: Exercise) {
  if (exercise.kind === 'pairs') {
    for (const id of exercise.itemIds) {
      await page.getByRole('group', { name: '手の列', exact: true }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true }).click();
      await page.getByRole('group', { name: '文字の列', exact: true }).getByRole('button', { name: getItem(id)!.label, exact: true }).click();
      await expectPairToHide(page, id);
    }
  } else if (exercise.kind === 'spellWord') {
    for (const id of exercise.correctAnswer) await page.getByRole('group', { name: '綴る手の選択肢' }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true }).click();
  } else if ('correctAnswer' in exercise) {
    const id = exercise.correctAnswer;
    const name = exercise.kind === 'readFingerspelling' ? id : exercise.kind === 'labelToSign' ? getItem(id)!.describe.viewer : exercise.kind === 'wordMeaning' ? getItem(id)!.meaning ?? getItem(id)!.label : getItem(id)!.label;
    await page.getByRole('button', { name, exact: true }).click();
  }
  if (exercise.kind !== 'pairs') await page.getByRole('button', { name: 'チェック', exact: true }).click();
  await page.getByRole('button', { name: 'つづける', exact: true }).click();
}

for (const withCsp of [true, false]) test(`偽カメラで、許可→読み込み→手を写す案内まで動き、通信は自サイトだけ、離れるとカメラが止まる（CSP ${withCsp ? 'あり' : 'なし'}）`, async ({ page }) => {
  await guardPointerLock(page);
  const origins = new Set<string>();
  const violations: string[] = [];
  page.on('request', (r) => origins.add(new URL(r.url()).origin));
  page.on('console', (m) => { if (m.text().startsWith('CSP violation')) violations.push(m.text()); });
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if (withCsp && route.request().resourceType() === 'document') headers['content-security-policy'] = CSP;
    await route.fulfill({ response: res, headers });
  });
  const state = createDefaultProgress();
  state.settings.onboarded = true; state.settings.sound = false; state.settings.vibration = false;
  await page.addInitScript(([value, now]) => {
    Date.now = () => now as number;
    if (!localStorage.getItem('tekotoba:v1')) localStorage.setItem('tekotoba:v1', JSON.stringify(value));
    (window as unknown as { __streams: MediaStream[] }).__streams = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await original(c); (window as unknown as { __streams: MediaStream[] }).__streams.push(s); return s; };
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  }, [state, seed] as const);

  expect(state.settings.camera).toBe(true);
  const lesson = COURSES[0]!.units[0]!.lessons[0]!;
  let session = createSession(buildLesson(lesson, state, { rng: mulberry32(seed), cameraEnabled: true, items: getItem, vocab: VOCAB }));
  expect(session.queue.concat(session.current ? [session.current] : []).some((e) => e.kind === 'tryIt')).toBe(true);
  await page.goto(`./#/lesson/${lesson.id}`);
  for (let i = 0; session.current && session.current.kind !== 'tryIt' && i < 40; i++) {
    const exercise = session.current;
    if (exercise.kind === 'intro') await page.getByRole('button', { name: 'おぼえた', exact: true }).click();
    else await answerCorrectly(page, exercise);
    session = next(answer(session, exercise.id, true));
  }
  expect(session.current?.kind).toBe('tryIt');

  await page.getByRole('button', { name: 'カメラで確かめる', exact: true }).click();
  await expect(page.getByText(/端末の中で処理/)).toBeVisible();
  // MediaPipe の記録係は、1分ごとと終了時（離れた時）に Google へ送ろうとする。止める仕掛けが無いと、
  // CSP ありでは違反の記録、CSP なしでは googleapis.com への通信として、この試験に現れる（2026-11-13 に確認）
  await page.getByRole('button', { name: 'カメラを使う', exact: true }).click();
  await expect(page.getByText('手をカメラに写してください')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const live = await page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks().map((t) => t.readyState)));
  expect(live.length).toBeGreaterThan(0);
  expect(live.every((s) => s === 'live')).toBe(true);

  await page.getByRole('button', { name: 'レッスンをやめる' }).click();
  await page.getByRole('dialog', { name: 'レッスンをやめますか？' }).getByRole('button', { name: 'やめる', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks().map((t) => t.readyState)))).toEqual(live.map(() => 'ended'));

  expect([...origins].filter((o) => !o.startsWith('http://127.0.0.1'))).toEqual([]);
  expect(violations).toEqual([]);
});

async function expectPairToHide(page: Page, id: string) {
  await page.getByRole('group', { name: '手の列', exact: true }).getByRole('button', { name: getItem(id)!.describe.viewer, exact: true }).waitFor({ state: 'hidden' });
}
