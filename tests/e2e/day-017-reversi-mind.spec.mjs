import { expect, test } from '@playwright/test';

/* 外部通信なし・保存なしのブラウザ完結アプリ。上流モックは不要。
   このアプリの中心は「AIの評価値が盤に重なる」「読みが深まると数字が動く」の2つなので、
   そこが壊れたら落ちるようにしてある。 */
const PAGE = '/day-017-reversi-mind/';

/** 盤の座標（a1 など）から DOM の index を出す */
const idx = (coord) => {
  const col = 'abcdefgh'.indexOf(coord[0]);
  const row = Number(coord[1]) - 1;
  return row * 8 + col;
};

const cell = (page, coord) => page.locator(`.cell[data-index="${idx(coord)}"]`);

test('開いた直後は対局前の状態で、盤はまだ出ていない', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page).toHaveTitle('AIの読みが見えるリバーシ');
  await expect(page.locator('#state-empty')).toBeVisible();
  await expect(page.locator('#game')).toBeHidden();
  await expect(page.locator('#start')).toBeVisible();
});

test('対局を始めると初期配置4石とあなたの番が出る', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#state-empty')).toBeHidden();
  await expect(page.locator('#score-black')).toHaveText('2');
  await expect(page.locator('#score-white')).toHaveText('2');
  await expect(page.locator('#status')).toHaveText('あなたの番です');
  // 初期配置：d5 と e4 が黒、d4 と e5 が白
  await expect(cell(page, 'd5').locator('.cell__disc--black')).toBeVisible();
  await expect(cell(page, 'e4').locator('.cell__disc--black')).toBeVisible();
  await expect(cell(page, 'd4').locator('.cell__disc--white')).toBeVisible();
  await expect(cell(page, 'e5').locator('.cell__disc--white')).toBeVisible();
});

test('自分の番でも合法手に評価値が重なって出る（4か所ちょうど）', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  // 黒の初手は d3・c4・f5・e6 の4つだけ
  await expect(page.locator('.cell__score')).toHaveCount(4);
  for (const coord of ['d3', 'c4', 'f5', 'e6']) {
    await expect(cell(page, coord).locator('.cell__score')).toBeVisible();
  }
  // 初手は盤が左右対称なので4手とも同点＝最善の枠も4つ付く。
  // ここを1つに絞ると「同点なのに1つだけ最善に見せる」嘘になるので、同点は同点のまま出す
  await expect(page.locator('.cell--best')).toHaveCount(4);
});

test('読みの表示をオフにすると数字が消え、オンで戻る', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await expect(page.locator('.cell__score')).toHaveCount(4);
  await page.uncheck('#toggle-mind');
  await expect(page.locator('.cell__score')).toHaveCount(0);
  await page.check('#toggle-mind');
  await expect(page.locator('.cell__score')).toHaveCount(4);
});

test('打てないマスを押すと理由つきで断られ、盤は動かない', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await expect(page.locator('#invalid')).toBeHidden();

  // 石があるマス
  await cell(page, 'd4').click();
  await expect(page.locator('#invalid')).toBeVisible();
  await expect(page.locator('#invalid')).toContainText('すでに石が置かれています');

  // 挟めない空きマス
  await cell(page, 'a1').click();
  await expect(page.locator('#invalid')).toContainText('挟める場所だけに打てます');

  // 盤は初期のまま
  await expect(page.locator('#score-black')).toHaveText('2');
  await expect(page.locator('#score-white')).toHaveText('2');
});

test('打つとAIが読み始め、読みの深さが1から4まで進んでから着手する', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await cell(page, 'd3').click();

  // 状態②：読込中
  await expect(page.locator('#thinking')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('AIが読んでいます');
  await expect(page.locator('#depth-label')).toHaveText('1');
  // 深さが最後まで進む
  await expect(page.locator('#depth-label')).toHaveText('4', { timeout: 15_000 });

  // 着手が終わると読込中が消えて自分の番に戻る
  await expect(page.locator('#thinking')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('#status')).toHaveText('あなたの番です', { timeout: 15_000 });
  // 黒3 + 白3（黒がd3で1枚返し、白が1枚返す）
  await expect(page.locator('#score-black')).toHaveText('3');
  await expect(page.locator('#score-white')).toHaveText('3');
});

test('AIの着手には座標・点数・読みの深さと日本語の理由が付く', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await cell(page, 'd3').click();
  const explain = page.locator('#explain');
  await expect(explain.locator('.explain__head')).toContainText('AIは', { timeout: 15_000 });
  await expect(explain.locator('.explain__head')).toContainText('4手先まで読んで');
  await expect(explain.locator('.explain__list li').first()).not.toHaveText('');
});

test('AIが読んでいる間、盤の評価値はAIの候補手のぶんだけ出る', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await cell(page, 'd3').click();
  await expect(page.locator('#depth-label')).toHaveText('2', { timeout: 15_000 });
  // 白の候補手に数字が出ており、最善手は必ず1つ
  await expect(page.locator('.cell__score').first()).toBeVisible();
  await expect(page.locator('.cell--best')).toHaveCount(1);
});

test('最初からを押すと初期配置に戻る', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#start');
  await cell(page, 'd3').click();
  await expect(page.locator('#status')).toHaveText('あなたの番です', { timeout: 15_000 });
  await page.click('#reset');
  await expect(page.locator('#score-black')).toHaveText('2');
  await expect(page.locator('#score-white')).toHaveText('2');
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#invalid')).toBeHidden();
});

test('商標の断りがフッターに出ている', async ({ page }) => {
  await page.goto(PAGE);
  // 「オセロ」を名乗らないことと、その理由が読める形で置いてあること
  await expect(page.locator('.site-foot')).toContainText('登録商標');
  await expect(page.locator('.site-foot')).toContainText('リバーシ');
});
