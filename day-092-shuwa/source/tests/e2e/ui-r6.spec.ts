import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COURSES } from '../../src/course/course';
import { createDefaultProgress } from '../../src/store/schema';
import { createSession } from '../../src/engine/session';
import type { Exercise } from '../../src/engine/lesson';
import { SESSION_KEY } from '../../src/store/session';
import type { SavedSession } from '../../src/store/session';
import { guardPointerLock } from './pointerlock';

const lesson = COURSES[0]!.units[0]!.lessons[0]!;
const ids = ['kana-a', 'kana-i', 'kana-u', 'kana-e'];
const choice: Exercise = { id: 'r6-choice', kind: 'signToLabel', itemId: 'kana-a', options: ids, correctAnswer: 'kana-a' };
const end: Exercise = { id: 'r6-end', kind: 'intro', itemId: 'kana-i' };
let setupId = 0;
async function setup(page: Page, exercise?: Exercise, completedFirst = false) {
  const state = createDefaultProgress(); state.settings.onboarded = true;
  if (completedFirst) state.lessons[lesson.id] = 1;
  state.settings.sound = false; state.settings.vibration = false; state.settings.camera = false;
  await page.goto('./');
  const exercises = exercise ? [exercise, end] : [];
  const snapshot: SavedSession | null = exercise ? { version: 1, lessonId: lesson.id, route: `#/lesson/${lesson.id}`,
    session: createSession(exercises), exercises, value: null, started: Date.now(), cameraSuccess: false, matchedWithCamera: false, wordNoticeShown: false } : null;
  await page.addInitScript(({ state, snapshot, key, marker }) => {
    if (sessionStorage.getItem(marker)) return;
    localStorage.clear(); localStorage.setItem('tekotoba:v1', JSON.stringify(state));
    if (snapshot) localStorage.setItem(key, JSON.stringify(snapshot));
    sessionStorage.setItem(marker, 'yes');
  }, { state, snapshot, key: SESSION_KEY, marker: `r6-seeded-${++setupId}` });
  await page.reload();
  if (snapshot) {
    await page.goto(`./${snapshot.route}`);
    await page.getByRole('button', { name: /^続きから/ }).click();
  } else {
    // 最初の読み込み（記録なし）で案内の住所 #/welcome に移っているので、道すじへ戻してから測る
    await page.goto('./#/'); await expect(page.locator('.path')).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
}
test.beforeEach(async ({ page }) => { await guardPointerLock(page); });

for (const width of [360, 390, 768, 1280]) {
  test(`${width}px：ペアの両列は88pxでそろい、全成立後も札とチェックが残る`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page, { id: 'r6-pairs', kind: 'pairs', itemIds: ids, signOrder: ids, labelOrder: ids });
    const initial = await page.locator('.pair-choice').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { y: box.y, height: box.height };
    }));
    for (let i = 0; i < 4; i++) { expect(initial[i]).toEqual(initial[i + 4]); expect(initial[i]!.height).toBe(88); }
    const hand = (await page.locator('.pair-choice .thumbnail').first().boundingBox())!; expect(hand.height).toBe(75);
    await page.locator('.pairs').evaluate(element => {
      const columns = element.querySelectorAll('.pairs__column');
      for (let i = 0; i < 4; i++) for (const column of columns) column.querySelectorAll<HTMLButtonElement>('button')[i]!.click();
    });
    await expect(page.locator('.pair-choice--matched')).toHaveCount(8);
    await expect(page.locator('.pair-choice .choice__mark')).toHaveCount(8);
    await expect(page.locator('.pair-choice--flash')).toHaveCount(0);
    for (const card of await page.locator('.pair-choice').all()) { await expect(card).toBeVisible(); await expect(card).toBeDisabled(); }
    await expect(page.locator('.feedback__title p')).toHaveText('手と文字のペアを、全部そろえられたね！');
  });
}

test('1280px：紹介・やってみよう・手→文字・文字→手・読む問題で幅と×をそろえる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const exercises: Exercise[] = [{ id: 'r6-intro', kind: 'intro', itemId: 'kana-a' },
    { id: 'r6-try', kind: 'tryIt', itemId: 'kana-a' }, choice, { ...choice, id: 'r6-label', kind: 'labelToSign' },
    { id: 'r6-read', kind: 'readFingerspelling', word: { kana: 'あい', meaning: '' }, sequence: ['kana-a', 'kana-i'], options: ['あい', 'いう'], correctAnswer: 'あい' }];
  let closeX: number | undefined;
  for (const exercise of exercises) {
    // 前のレッスンの状態とルートガードを解除してから、次の固定出題を準備。
    await page.goto('about:blank');
    await setup(page, exercise);
    expect((await page.locator('.app').boundingBox())!.width).toBe(1000);
    const x = (await page.getByRole('button', { name: 'レッスンをやめる', exact: true }).boundingBox())!.x;
    if (closeX !== undefined) expect(x).toBe(closeX); closeX = x;
    const layout = page.locator('.lesson__content .sign-detail-layout');
    expect(await layout.evaluate(element => getComputedStyle(element).display)).toBe('grid');
    const left = (await layout.locator(':scope > *').nth(0).boundingBox())!;
    const right = (await layout.locator(':scope > *').nth(1).boundingBox())!;
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    if (exercise.kind === 'tryIt') {
      const description = (await page.locator('.description').boundingBox())!;
      const footer = (await page.locator('.lesson__footer').boundingBox())!;
      expect(description.y + description.height).toBeLessThanOrEqual(footer.y);
    }
  }
});

for (const width of [390, 768, 1280]) test(`${width}px：誤答の帯の最後まで送り、ミニ札の文字がボタンに隠れない`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); await setup(page, choice);
  await page.locator('[data-option="kana-i"]').click(); await page.getByRole('button', { name: 'チェック', exact: true }).click();
  await expect(page.locator('.feedback__comparison').nth(0)).toContainText('正解：あ');
  await expect(page.locator('.feedback__comparison').nth(1)).toContainText('あなたの答え：い');
  await page.locator('.feedback__detail').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const footer = (await page.getByRole('button', { name: 'つづける', exact: true }).boundingBox())!;
  const caption = (await page.locator('.feedback__item figcaption').last().boundingBox())!;
  expect(caption.y + caption.height).toBeLessThanOrEqual(footer.y);
  await page.locator('.feedback__enlarge').first().click(); await expect(page.getByRole('dialog')).toBeVisible();
});

test('1280px：図鑑のタブ幅を本文にそろえ、再生列を覆わない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); await setup(page); await page.goto('./#/dict/kana-a');
  const tabs = (await page.locator('.bottom-tabs').boundingBox())!;
  expect(tabs.width).toBe((await page.locator('.app').boundingBox())!.width);
  const replay = (await page.getByRole('button', { name: 'もう一度', exact: true }).boundingBox())!;
  expect(replay.y + replay.height).toBeLessThanOrEqual(tabs.y);
  await expect(page.getByRole('heading', { name: '出典', exact: true })).toHaveCount(1);
  await expect(page.getByText('ろう者の監修は受けていません。', { exact: true })).toHaveCount(1);
});

test('スイッチは32pxの丸形、正解した選択札は緑の枠とチェックになる', async ({ page }) => {
  await setup(page, choice); await page.locator('[data-option="kana-a"]').click();
  await page.getByRole('button', { name: 'チェック', exact: true }).click();
  const correct = page.locator('[data-option="kana-a"]');
  await correct.hover();
  await expect.poll(() => correct.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(19, 138, 110)');
  await expect(correct.locator('.choice__mark')).toHaveText('✓');
  await page.goto('about:blank'); await setup(page); await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: '効果音', exact: true });
  expect(await toggle.evaluate(element => ({ height: getComputedStyle(element).height, radius: getComputedStyle(element).borderRadius, thumb: getComputedStyle(element, '::after').height })))
    .toEqual({ height: '32px', radius: '16px', thumb: '26px' });
  await toggle.check(); await expect(toggle).toBeChecked();
});

test('見出しの読み上げ名とリンク末尾の印を保つ', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 }); await setup(page); await page.goto('./#/about');
  await expect(page.getByRole('heading', { name: 'このアプリについて', exact: true })).toBeVisible();
  // 印の前の空白（読み上げない）のぶん、名前の間に空白が入ることがある
  const license = page.getByRole('link', { name: /^使った部品と許諾の一覧\s*（新しいタブで開きます）$/ });
  await license.scrollIntoViewIfNeeded(); await expect(license.locator('.readable-tail .external-link')).toBeVisible();
  for (const tail of await page.locator('.readable-tail').all()) expect(await tail.evaluate(element => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  expect(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
});


test('ユニット1の帯はコース切替の下に24px空け、4隅を隠さない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); await setup(page, undefined, true);
  const heading = (await page.locator('.path__heading').boundingBox())!;
  const card = (await page.locator('.unit-card').first().boundingBox())!;
  expect(card.y - heading.y - heading.height).toBeGreaterThanOrEqual(24);
  expect(await page.locator('.unit-card').first().evaluate(element => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(key => getComputedStyle(element).getPropertyValue(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)))))
    .toEqual(['20px', '20px', '20px', '20px']);
});

for (const width of [360, 390, 768, 1280]) test(`${width}px：日本語の本文を実際に折っても句読点が行頭、中黒が行末に出ない`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await setup(page); await page.goto('./#/about');
  await expect(page.getByRole('heading', { name: 'このアプリについて', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const lines = await page.locator('.about-screen .prose p').evaluateAll(paragraphs => paragraphs.flatMap(paragraph => {
    const rows = new Map<number, string>();
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const value = text.textContent ?? '';
      for (let index = 0; index < value.length; index++) {
        const range = document.createRange(); range.setStart(text, index); range.setEnd(text, index + 1);
        const box = range.getBoundingClientRect();
        if (box.width === 0) continue;
        const y = Math.round(box.top); rows.set(y, (rows.get(y) ?? '') + value[index]);
      }
    }
    return [...rows.values()].map(value => value.trim()).filter(Boolean);
  }));
  expect(lines.length).toBeGreaterThan(10);
  for (const line of lines) { expect(line).not.toMatch(/^[、。・）」』】]/u); expect(line).not.toMatch(/[・（「『【]$/u); }
});
