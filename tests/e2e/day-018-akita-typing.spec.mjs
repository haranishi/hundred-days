import { expect, test } from '@playwright/test';

/* 外部通信なし・保存なしのブラウザ完結アプリ。上流モックは不要。
   このアプリの中心は「表示どおりに打てば食べたことになる」と「4状態が全部ある」の2つなので、
   そこが壊れたら落ちるようにしてある。 */
const PAGE = '/day-018-akita-typing/';

/** 開始ボタンから対戦中になるまで（カウント3・2・1 で約2.1秒かかる） */
async function startGame(page) {
  await page.click('#start');
  await expect(page.locator('#state-countdown')).toBeVisible();
  await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
}

/** いま画面に出ている「まだ打っていないローマ字」 */
async function remaining(page) {
  const next = await page.locator('#romaji-next').innerText();
  const rest = await page.locator('#romaji-rest').innerText();
  return next + rest;
}

test('開いた直後はコース選択で、レーンはまだ出ていない', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page).toHaveTitle('秋田の飯は、打てた分だけ');
  await expect(page.locator('#state-empty')).toBeVisible();
  await expect(page.locator('#game')).toBeHidden();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#state-error')).toBeHidden();
  // コースは3つあり、真ん中が既定で選ばれている
  await expect(page.locator('#course-list .course')).toHaveCount(3);
  await expect(page.locator('#course-standard')).toBeChecked();
  // 何が流れてくるのかが読まなくても分かるように、実物の絵を先に見せる
  const hero = page.locator('.hero');
  await expect(hero).toBeVisible();
  await expect(hero).toHaveJSProperty('naturalWidth', 1400);
  await expect(hero).not.toHaveAttribute('alt', '');
  // コースごとに何が変わるかが選ぶ前に分かる
  await expect(page.locator('#course-list .course__hint')).toHaveCount(3);
});

test('お手軽は短い料理だけが流れてくる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=3`);
  // ラジオ本体は見た目のために隠してあるので、人と同じくラベルを押す
  await page.click('label[for="course-light"]');
  await expect(page.locator('#course-light')).toBeChecked();
  await startGame(page);
  await expect(page.locator('#target-amount')).toHaveText('¥700');

  // 皿が入れ替わる間ずっと、9打を超える料理が出ないこと
  for (let i = 0; i < 6; i += 1) {
    const rest = await remaining(page);
    expect(rest.length, `9打を超える料理が出た: ${rest}`).toBeLessThanOrEqual(9);
    for (const key of rest) await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }
});

test('はじめると開始前カウントを挟んで対戦が始まる', async ({ page }) => {
  await page.goto(PAGE);
  await startGame(page);
  await expect(page.locator('#state-empty')).toBeHidden();
  await expect(page.locator('#eaten')).toHaveText('¥0');
  await expect(page.locator('#target-amount')).toHaveText('¥3,000');
  // 皿が出ていて、打つ料理が決まっている
  await expect(page.locator('.plate')).not.toHaveCount(0);
  await expect(page.locator('#target-name')).not.toHaveText('—');
  await expect(await remaining(page)).not.toBe('');
});

test('表示どおりに打つと食べたことになり、会計が増える', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  const rest = await remaining(page);
  for (const key of rest) await page.keyboard.press(key);

  await expect(page.locator('#eaten')).not.toHaveText('¥0');
});

test('打った分は色を変えて残り、次に押すキーが枠で示される', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  const before = await remaining(page);
  await page.keyboard.press(before[0]);

  await expect(page.locator('#romaji-done')).toHaveText(before[0]);
  await expect(page.locator('#romaji-next')).toHaveText(before[1]);
});

test('間違ったキーを押しても進行は止まらない（打ち直しを強制しない）', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  const rest = await remaining(page);
  const wrong = rest[0] === 'z' ? 'q' : 'z';
  await page.keyboard.press(wrong);

  // ミスしても位置は戻らず、進んでもいない
  await expect(page.locator('#romaji-done')).toHaveText('');
  await expect(await remaining(page)).toBe(rest);

  // 正しいキーで続けられる
  await page.keyboard.press(rest[0]);
  await expect(page.locator('#romaji-done')).toHaveText(rest[0]);
});

test('日本語入力がONのときは不正入力として警告が出る', async ({ page }) => {
  await page.goto(PAGE);
  await startGame(page);
  await expect(page.locator('#invalid')).toBeHidden();

  await page.evaluate(() => {
    window.dispatchEvent(new CompositionEvent('compositionstart'));
  });
  await expect(page.locator('#invalid')).toBeVisible();

  // 半角英数に戻して打てば警告は消える
  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);
  await expect(page.locator('#invalid')).toBeHidden();
});

test('料理データを読み込めないときはエラー状態になる', async ({ page }) => {
  await page.goto(`${PAGE}?force=error`);
  await expect(page.locator('#state-error')).toBeVisible();
  await expect(page.locator('#state-empty')).toBeHidden();
  await expect(page.locator('#game')).toBeHidden();
  await expect(page.locator('#error-detail')).not.toBeEmpty();
  await expect(page.locator('#reload')).toBeVisible();
});

test('時間切れで結果が出て、つまずいた打鍵が並ぶ', async ({ page }) => {
  // ?duration= で1回の長さを縮められる（既定は60秒）。結果画面まで待つためだけに使う
  await page.goto(`${PAGE}?seed=7&duration=6`);
  await startGame(page);

  // わざと1回間違えてから、表示どおりに打つ
  const rest = await remaining(page);
  await page.keyboard.press(rest[0] === 'z' ? 'q' : 'z');
  for (const key of rest) await page.keyboard.press(key);

  await expect(page.locator('#result')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#game')).toBeHidden();
  await expect(page.locator('#verdict')).not.toBeEmpty();
  await expect(page.locator('#stat-eaten')).not.toHaveText('—');
  // ミスを1回したので、つまずいた打鍵が1つは並ぶ
  await expect(page.locator('#stumble-list .stumble')).toHaveCount(1);
  await expect(page.locator('#stumble-empty')).toBeHidden();

  // 結果画面にはどのコースを遊んだかが出る
  await expect(page.locator('#result-course')).toContainText('おすすめ');

  // 「もう一度」は同じコースへ直行する（コース選択に戻らない）
  await page.click('#again');
  await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#state-empty')).toBeHidden();
});

test('結果画面はEnterだけで同じコースを再開できる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=6`);
  await startGame(page);
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });

  // タイピングゲームなので、手をキーボードから離させない
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#result')).toBeHidden();
});

test('コースを変えるボタンでコース選択に戻れる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=6`);
  await startGame(page);
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  await page.click('#change-course');
  await expect(page.locator('#state-empty')).toBeVisible();
});

test('打ちかけの料理は流れ切っても取り上げられない', async ({ page }) => {
  // 大食いは走行4.8秒。1文字だけ打って放置しても、同じ料理を打ち続けられる
  await page.goto(`${PAGE}?seed=7`);
  await page.click('label[for="course-heavy"]');
  await startGame(page);

  const name = await page.locator('#target-name').innerText();
  const rest = await remaining(page);
  // まだ何も打っていないうちは「つかみ中」を出さない
  await expect(page.locator('#held-badge')).toBeHidden();
  await page.keyboard.press(rest[0]);

  // 走行時間を超えて放置しても、打ちかけの皿は的から外れない。
  // （つかんでいる間も、手を付けていない他の皿は流れて逃す＝時間の緊張は残る）
  await page.waitForTimeout(6500);
  await expect(page.locator('#target-name')).toHaveText(name);
  await expect(page.locator('.plate[data-held="true"]')).toHaveCount(1);
  await expect(page.locator('#held-badge')).toBeVisible();

  // 残りを打てば食べられる
  for (const key of rest.slice(1)) await page.keyboard.press(key);
  await expect(page.locator('#eaten')).not.toHaveText('¥0');
});

test('1文字も打っていない料理は逃し、その数が画面に出る', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await page.click('label[for="course-heavy"]');
  await startGame(page);

  // 何も打たずに待つと、逃した皿のカウンタが出てくる
  await expect(page.locator('#missed-count')).toBeHidden();
  await expect(page.locator('#missed-count')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('#missed')).not.toHaveText('0');
});

test('ソフトキーボードからの入力でも打てる（スマホで無反応にならない）', async ({ page }) => {
  // Androidの予測入力などは keydown に文字を載せてこない。
  // insertText は beforeinput だけを起こすので、その経路が生きているかを見る
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  await page.locator('#keys').focus();
  const rest = await remaining(page);
  for (const key of rest) await page.keyboard.insertText(key);

  await expect(page.locator('#eaten')).not.toHaveText('¥0');
  // 入力欄に文字が残らない（残ると次の入力がずれる）
  await expect(page.locator('#keys')).toHaveValue('');
});

test('物理キーとソフトキーの二重入力にならない', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);
  // 1打ぶんしか進んでいないこと（beforeinput でも数えると2打進んでしまう）
  await expect(page.locator('#romaji-done')).toHaveText(rest[0]);
  await expect(page.locator('#romaji-next')).toHaveText(rest[1]);
});

test('皿と中央に料理の絵が出て、どれも実際に読み込めている', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  await page.waitForTimeout(3000);

  // レーンの皿すべてに絵が付いている
  const plates = page.locator('.plate');
  await expect(plates.first()).toBeVisible();
  const images = page.locator('.plate .plate__img');
  expect(await images.count()).toBeGreaterThan(0);

  // 読み込みに失敗した絵は取り除かれる実装なので、残っている＝読めている
  for (let i = 0; i < await images.count(); i += 1) {
    await expect(images.nth(i)).toHaveJSProperty('complete', true);
    expect(await images.nth(i).evaluate((n) => n.naturalWidth)).toBeGreaterThan(0);
  }

  // 中央にも大きく出る
  const target = page.locator('#target-img');
  await expect(target).toBeVisible();
  expect(await target.evaluate((n) => n.naturalWidth)).toBeGreaterThan(0);
});

test('通信を1本もしない', async ({ page }) => {
  const external = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== 'http://127.0.0.1:4173') external.push(req.url());
  });
  await page.goto(PAGE);
  await startGame(page);
  expect(external).toEqual([]);
});
