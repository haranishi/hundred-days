import { expect, test } from '@playwright/test';

/* 外部通信なし・保存なしのブラウザ完結アプリ。出題データは同梱のJSONを読むだけ。
   このアプリの中心は「読みを伏せてあること」と「4状態が全部あること」の2つなので、
   そこが壊れたら落ちるようにしてある。とくに
   『打ち間違えても正解のキーを画面に出さない』は、破れると遊びが成立しなくなる。 */
const PAGE = '/day-024-unreadable-places/';
const TITLE = '読めない地名が、向かってくる';

/* status が draft のあいだは dist に出ないので、そのときは飛ばす。
   serve-dist は無いパスに index.html を200で返すことがあるため、タイトルで見分ける */
test.beforeEach(async ({ page }) => {
  await page.goto(PAGE);
  test.skip((await page.title()) !== TITLE, 'まだ draft で dist に出ていない');
});

/* 地名は6秒で手前まで来る。出題データ（465KB）の取得とローマ字変換を
   始めたあとにやると、混んでいるときは取っている間に着弾して古い読みを打つことになる
   （E2E全体を流したときだけ落ちた）。開始前に読み込んで、盤面が出てからは引くだけにする。 */
async function primeLookup(page, block) {
  await page.evaluate(async ({ block }) => {
    const { primaryRomaji } = await import('./lib/romaji.js');
    const data = await (await fetch('./assets/places.json')).json();
    const list = block === 'all' ? Object.values(data.places).flat() : data.places[block];
    window.__lookup = (kanji) => {
      const found = list.find((x) => x.k === kanji);
      return found ? { kana: found.r, romaji: primaryRomaji(found.r) } : null;
    };
  }, { block });
}

/** 地方を選んで開始し、盤面が出るまで */
async function start(page, block = 'tohoku') {
  await expect(page.locator('#state-select')).toBeVisible({ timeout: 15_000 });
  await primeLookup(page, block);
  await page.click(`.blocks__item[data-id="${block}"]`);
  await page.click('#start');
  await expect(page.locator('#state-play')).toBeVisible();
  // 盤面が出ても、最初の描画（rAF）が回るまで地名は空。混んでいると読み取りが先に来る
  await expect(page.locator('#kanji')).not.toBeEmpty();
}

/** いま出ている地名の読みと打鍵（画面には伏せてある）。通信しないので速い */
async function activeAnswer(page) {
  const found = await page.evaluate(() => window.__lookup(document.getElementById('kanji').textContent));
  expect(found, 'いま出ている地名が出題データに見つからない').toBeTruthy();
  return found;
}

test('開いた直後は地方を選ぶ画面で、盤面も結果も出ていない', async ({ page }) => {
  await expect(page).toHaveTitle(TITLE);
  await expect(page.locator('#state-select')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#state-play')).toBeHidden();
  await expect(page.locator('#state-result')).toBeHidden();
  await expect(page.locator('#state-error')).toBeHidden();
  // 地方は全国＋8ブロック。それぞれ在庫の件数が付いている
  await expect(page.locator('.blocks__item')).toHaveCount(9);
  await expect(page.locator('.blocks__item[data-id="tohoku"] .blocks__count')).toContainText('件');
  // 選ぶまで始められない
  await expect(page.locator('#start')).toBeDisabled();
});

test('出典とデータの更新日を必ず出す', async ({ page }) => {
  await expect(page.locator('#source-note')).toContainText('郵便番号データ');
  await expect(page.locator('#source-note')).toContainText('日本郵便');
  await expect(page.locator('#source-note')).toContainText(/\d{4}-\d{2}-\d{2}/);
});

test('始めた直後、漢字は見えているが読みは伏せてある', async ({ page }) => {
  await start(page);
  await expect(page.locator('#kanji')).not.toBeEmpty();
  const reading = await page.locator('#reading').innerText();
  expect(reading).toMatch(/^○+$/);
  const answer = await activeAnswer(page);
  expect(answer.kana.length).toBeGreaterThan(0);
  expect(reading.length).toBe(answer.kana.length);
});

test('読みを打ち切ると弾けて点が入る', async ({ page }) => {
  await start(page);
  await page.click('.field');
  const answer = await activeAnswer(page);
  await page.keyboard.type(answer.romaji, { delay: 10 });
  await expect(page.locator('#score')).not.toHaveText('0');
  await expect(page.locator('#verdict')).toContainText('点');
});

test('わからないで降参すると、ライフが減って正解となぜ読めないかが出る', async ({ page }) => {
  await start(page);
  const answer = await activeAnswer(page);
  await expect(page.locator('#lives')).toHaveText('●●●');
  await page.click('#giveup');
  await expect(page.locator('#lives')).toHaveText('●●○');
  await expect(page.locator('#verdict')).toContainText(answer.kana);
  await expect(page.locator('#verdict')).toContainText('読む地名は全国で');
});

test('打ち間違えても、押してほしかったキーは画面に出さない', async ({ page }) => {
  await start(page);
  const answer = await activeAnswer(page);
  await page.click('.field');
  // 読みに絶対に含まれないキーを選んで打つ
  const wrong = 'qwertyuiop'.split('').find((k) => !answer.romaji.includes(k)) ?? 'q';
  await page.keyboard.press(wrong);
  await expect(page.locator('#invalid')).toBeVisible();
  const shown = await page.locator('#state-play').innerText();
  // 伏せ字が解かれていない＝答えが漏れていない
  expect(shown).not.toContain(answer.kana);
  await expect(page.locator('#reading')).toHaveText(/^○+$/);
});

test('出題データが取れないときはエラーになり、やり直せる', async ({ page }) => {
  await page.route('**/assets/places.json', (route) => route.abort());
  await page.goto(PAGE);
  await expect(page.locator('#state-error')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#error-detail')).not.toBeEmpty();
  await expect(page.locator('#state-select')).toBeHidden();
  // 通るようにしてから、もう一度読み込むで復帰する
  await page.unroute('**/assets/places.json');
  await page.click('#retry');
  await expect(page.locator('#state-select')).toBeVisible({ timeout: 15_000 });
});
