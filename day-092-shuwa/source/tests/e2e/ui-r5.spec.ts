import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COURSES } from '../../src/course/course';
import { createDefaultProgress } from '../../src/store/schema';
import type { Progress } from '../../src/store/schema';
import { createSession } from '../../src/engine/session';
import type { Exercise } from '../../src/engine/lesson';
import { getItem } from '../../src/content';
import { mirrorText } from '../../src/content/mirror';
import { SESSION_KEY } from '../../src/store/session';
import type { SavedSession } from '../../src/store/session';
import { guardPointerLock } from './pointerlock';

const lesson = COURSES[0]!.units[0]!.lessons[0]!;
const ids = ['kana-a', 'kana-i', 'kana-u', 'kana-e'];
const end: Exercise = { id: 'end', kind: 'intro', itemId: 'kana-i' };
const choice: Exercise = { id: 'choice', kind: 'signToLabel', itemId: 'kana-a', options: ids, correctAnswer: 'kana-a' };
const label: Exercise = { ...choice, id: 'label', kind: 'labelToSign' };
async function setup(page: Page, exercises?: Exercise[], change?: (state: Progress) => void) {
  const state = createDefaultProgress(); state.settings.onboarded = true;
  state.settings.sound = false; state.settings.vibration = false; change?.(state);
  const snapshot: SavedSession | null = exercises ? { version: 1, lessonId: lesson.id, route: `#/lesson/${lesson.id}`,
    session: createSession(exercises), exercises, value: null, started: Date.now(), cameraSuccess: false, matchedWithCamera: false, wordNoticeShown: false } : null;
  await page.addInitScript(({ state, snapshot, key }) => {
    if (sessionStorage.getItem('r5-seeded')) return;
    localStorage.setItem('tekotoba:v1', JSON.stringify(state));
    if (snapshot) localStorage.setItem(key, JSON.stringify(snapshot));
    sessionStorage.setItem('r5-seeded', 'yes');
  }, { state, snapshot, key: SESSION_KEY });
  if (snapshot) {
    await page.goto(`./${snapshot.route}`);
    await page.getByRole('button', { name: /^続きから/ }).click();
  }
}
test.beforeEach(async ({ page }) => { await guardPointerLock(page); await page.setViewportSize({ width: 390, height: 844 }); });

test('手の札は描画待ちでも完成後でも同じ寸法で、選択の枠とチェックが見える', async ({ page }) => {
  await setup(page, [label, end]);
  const cards = page.locator('.choices .choice');
  const before = await cards.evaluateAll(cards => cards.map(card => ({ top: card.getBoundingClientRect().top, height: card.getBoundingClientRect().height })));
  for (const text of await page.locator('.thumbnail--fallback').allTextContents()) expect(text).toBe('');
  await expect(page.locator('.thumbnail--fallback')).toHaveCount(0);
  const after = await cards.evaluateAll(cards => cards.map(card => ({ top: card.getBoundingClientRect().top, height: card.getBoundingClientRect().height })));
  expect(after).toEqual(before);
  await cards.first().click();
  await expect(cards.first().locator('.choice__selected-mark')).toBeVisible();
  expect(await cards.first().evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('3px');
  // 枠の色は短い時間をかけて変わるので、変わり終わるのを待つ
  await expect.poll(() => cards.first().evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(76, 95, 213)');
  const image = (await cards.first().locator('.thumbnail').boundingBox())!;
  expect(image.width).toBe(140); expect(image.height).toBe(140);
});

test('完成のアニメーション中も、0ms間隔で次のペアを選べる', async ({ page }) => {
  const pairs: Exercise = { id: 'pairs', kind: 'pairs', itemIds: ids, signOrder: ids, labelOrder: ids };
  await setup(page, [pairs, end]);
  await page.locator('.pairs').evaluate(element => {
    const columns = [...element.querySelectorAll('.pairs__column')];
    for (let index = 0; index < 4; index++) {
      for (const column of columns) column.querySelectorAll<HTMLButtonElement>('button')[index]!.click();
    }
  });
  await expect(page.locator('.feedback h2')).toHaveText('正解！');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SESSION_KEY);
  expect(saved.value.hadMismatch).toBe(false); expect(saved.value.matched).toHaveLength(4);
});

test('あいさつの注意書きと2行の選択肢でも、同形式の次問へ移ると位置が動かない', async ({ page }) => {
  const words = ['word-ohayou', 'word-konnichiwa', 'word-konbanwa', 'word-arigatou'];
  const first: Exercise = { ...choice, id: 'word1', itemId: words[0]!, options: words, correctAnswer: words[0]! };
  await setup(page, [first, { ...first, id: 'word2', itemId: words[1]!, correctAnswer: words[1]! }, end]);
  const before = await page.locator('.choices').boundingBox();
  const heights = await page.locator('.choices button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  await page.locator('.sign-info').click();
  expect((await page.locator('.choices').boundingBox())!.y).toBe(before!.y);
  await page.locator(`[data-option="${words[0]}"]`).click(); await page.getByRole('button', { name: 'チェック', exact: true }).click();
  await page.getByRole('button', { name: 'つづける', exact: true }).click();
  expect((await page.locator('.choices').boundingBox())!.y).toBe(before!.y);
});

test('2件のペアの取り違えを帯の中で最後まで読め、小さな手を拡大できる', async ({ page }) => {
  const pairs: Exercise = { id: 'pairs', kind: 'pairs', itemIds: ids, signOrder: ids, labelOrder: ids };
  await setup(page, [pairs, end]);
  await page.locator('.pairs').evaluate(element => {
    const sign = element.querySelectorAll<HTMLButtonElement>('.pairs__column:first-child button');
    const label = element.querySelectorAll<HTMLButtonElement>('.pairs__column:last-child button');
    sign[0]!.click(); label[1]!.click(); sign[2]!.click(); label[3]!.click();
    for (let i = 0; i < 4; i++) { sign[i]!.click(); label[i]!.click(); }
  });
  await expect(page.locator('.feedback')).toBeVisible();
  await expect(page.locator('.feedback__detail')).toContainText('あの手＝あ、いの手＝い');
  await expect(page.locator('.feedback__detail')).toContainText('うの手＝う、えの手＝え');
  await page.locator('.feedback__detail').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const last = (await page.locator('.feedback__difference').last().boundingBox())!;
  const continueButton = (await page.getByRole('button', { name: 'つづける', exact: true }).boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(continueButton.y);
  await page.locator('.feedback__enlarge').first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog').locator('.hand-view')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'とじる', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.feedback__enlarge').first().click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'レッスンをやめますか？' })).toHaveCount(0);
});

for (const width of [390, 768, 1280]) test(`${width}px：紹介の順序・説明の最初の行・再生列の中心`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await setup(page, [{ id: 'intro', kind: 'intro', itemId: 'kana-a' }, end]);
  await expect(page.locator('.hand-view')).toHaveAttribute('data-status', 'ready');
  const title = (await page.locator('.sign-label').boundingBox())!;
  const hand = (await page.locator('.hand-view__stage').boundingBox())!;
  const paragraph = (await page.locator('.description > p').first().boundingBox())!;
  const footer = (await page.locator('.lesson__footer').boundingBox())!;
  expect(hand.y).toBeGreaterThan(title.y + title.height);
  expect(paragraph.y + 28).toBeLessThan(footer.y);
  if (width >= 900) expect(paragraph.x).toBeGreaterThan(hand.x + hand.width);
  else expect(paragraph.y).toBeGreaterThan(hand.y + hand.height);
  const controls = page.locator('.hand-view__actions');
  const replay = (await controls.getByRole('button', { name: 'もう一度', exact: true }).boundingBox())!;
  const slow = (await controls.getByRole('button', { name: 'ゆっくり', exact: true }).boundingBox())!;
  const view = (await page.locator('.hand-view__switch').boundingBox())!;
  expect(Math.abs((replay.x + slow.x + slow.width) / 2 - (view.x + view.width / 2))).toBeLessThan(2);
  expect(replay.height).toBeGreaterThanOrEqual(44);
});

test('復習0件では灰色の無効ボタンを出さず、苦手を主ボタンにする', async ({ page }) => {
  await setup(page, undefined, state => { state.items['kana-a'] = { box: 1, due: '2099-12-31', introducedAt: '2026-11-13', correct: 1, wrong: 1 }; });
  await page.goto('./#/review');
  await expect(page.locator('.review-empty')).toHaveText('今日の復習はありません（次回 12月31日）');
  await expect(page.getByRole('button', { name: '復習をはじめる' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '苦手を練習', exact: true })).toHaveClass('button');
});

test('深い道すじでも上の目標・連続の案内と現在地が同時に見える', async ({ page }) => {
  await setup(page, undefined, state => {
    COURSES[0]!.units.slice(0, 3).forEach(unit => unit.lessons.forEach(lesson => { state.lessons[lesson.id] = 1; }));
    const today = new Date(); const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    state.streak = { current: 1, longest: 1, lastDate: date };
  });
  await page.goto('./#/');
  await expect(page.locator('.streak-prompt')).toHaveText('今日1レッスンで2日連続');
  for (const selector of ['.topbar__streak', '.topbar__goal', '.streak-prompt', '.lesson-node--current']) {
    const box = (await page.locator(selector).first().boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThan(780);
  }
  const heading = (await page.locator('.path__heading').boundingBox())!;
  const node = (await page.locator('.lesson-node--current').first().boundingBox())!;
  expect(node.y).toBeGreaterThanOrEqual(heading.y + heading.height);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = (await page.locator('.path__footer').boundingBox())!;
  const tabs = (await page.locator('.bottom-tabs').boundingBox())!;
  expect(tabs.y - last.y - last.height).toBeLessThan(100);
});

test('図鑑の長い札名は1行＋補足で、出典の見える注記は一覧に1回', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await setup(page); await page.goto('./#/dict');
  const names = page.locator('.catalog-label--long');
  expect(await names.count()).toBeGreaterThan(0);
  for (const label of await names.all()) {
    expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await label.evaluate(element => getComputedStyle(element).fontSize)).toBe('18px');
  }
  await page.getByRole('button', { name: 'あいさつ', exact: true }).click();
  for (const label of await page.locator('.catalog-label--long').all()) {
    expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.goto('./#/dict/kana-a');
  await expect(page.locator('.source-list .external-link')).toHaveCount(await page.locator('.source-list a').count());
  await expect(page.getByText('リンクは新しいタブで開きます。', { exact: true })).toHaveCount(1);
});


test('あいさつの誤答でも、両方の手が固定寸法で説明からはみ出さず、再出題を知らせる', async ({ page }) => {
  const word: Exercise = { ...choice, id: 'word', itemId: 'word-ohayou', options: ['word-ohayou', 'word-konbanwa'], correctAnswer: 'word-ohayou' };
  await setup(page, [word, end]);
  await page.locator('[data-option="word-konbanwa"]').click(); await page.getByRole('button', { name: 'チェック', exact: true }).click();
  await expect(page.locator('.feedback__retry')).toHaveText('まちがえた問題を最後にもう一度出します');
  const thumbnails = page.locator('.feedback__item .thumbnail');
  const before = await thumbnails.evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  expect(before).toEqual([{ width: 56, height: 56 }, { width: 56, height: 56 }]);
  await expect(page.locator('.feedback .thumbnail--fallback')).toHaveCount(0);
  expect(await thumbnails.evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })))).toEqual(before);
  await expect(page.locator('.feedback__comparison').nth(1)).toContainText('あなたの答え：こんばんは');
  const detail = page.locator('.feedback__detail');
  expect(await detail.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'つづける', exact: true }).click();
  await expect(page.locator('.lesson__header')).toContainText('2 / 3');
});

test('綴る答えは100px以上で中央に並び、使用済みの札を薄くしても繰り返し使える', async ({ page }) => {
  await setup(page, [{ id: 'spell', kind: 'spellWord', word: { kana: 'ああ', meaning: '' }, options: ids, correctAnswer: ['kana-a', 'kana-a'] }, end]);
  const first = page.locator('.spell-choices .choice').first(); await first.click();
  await expect(first).toHaveClass(/choice--used/);
  await expect(page.locator('.spell-slot--filled .choice__selected-mark')).toHaveCount(1);
  const slots = await page.locator('.spell-slot').all();
  for (const slot of slots) {
    const box = (await slot.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(100); expect(box.height).toBeGreaterThanOrEqual(100);
  }
  await expect(first).toBeEnabled(); await first.click();
  await expect(page.locator('.spell-slot--filled')).toHaveCount(2);
  await page.getByRole('button', { name: 'チェック', exact: true }).click();
  await expect(page.locator('.feedback h2')).toHaveText('正解！');
});

test('左手の図鑑詳細は説明を反転し、設定は丸いスイッチと赤枠の削除ボタン', async ({ page }) => {
  await setup(page, undefined, state => { state.settings.dominant = 'left'; }); await page.goto('./#/dict/kana-a');
  const paragraphs = page.locator('.sign-detail-layout .prose p');
  await expect(paragraphs.nth(0)).toHaveText(mirrorText(getItem('kana-a')!.describe.viewer, 'left'));
  await expect(paragraphs.nth(1)).toHaveText(mirrorText(getItem('kana-a')!.describe.self, 'left'));
  await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: '効果音', exact: true });
  expect(await toggle.evaluate(element => getComputedStyle(element).appearance)).toBe('none');
  await toggle.check(); await expect(toggle).toBeChecked();
  const deleting = page.getByRole('button', { name: 'すべて消す', exact: true });
  expect(await deleting.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(167, 45, 45)');
  await deleting.click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'やめる', exact: true }).click();
  await expect(page.getByRole('switch', { name: '効果音', exact: true })).toBeChecked();
});

test('初回案内のおすすめは、選択枠ではなく小札だけで示す', async ({ page }) => {
  await page.goto('./#/welcome'); await page.getByRole('button', { name: 'はじめる' }).click();
  for (const next of ['右手', '1レッスン']) {
    await expect(page.locator('.choice--selected')).toHaveCount(0);
    const recommendation = page.locator('.choice').filter({ has: page.locator('.badge') });
    expect(await recommendation.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(227, 229, 240)');
    await page.getByRole('button', { name: new RegExp(next) }).click();
  }
  await expect(page.locator('.choice--selected')).toHaveCount(0);
});
