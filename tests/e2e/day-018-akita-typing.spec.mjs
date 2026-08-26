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

  /* 走行時間を超えて放置しても、打ちかけの皿は的から外れない。
     （つかんでいる間も、手を付けていない他の皿は流れて逃す＝時間の緊張は残る）
     バッジはそのラウンドの最初のつかみでだけ出るので、ここでは見えている。 */
  await page.waitForTimeout(6500);
  await expect(page.locator('#target-name')).toHaveText(name);
  await expect(page.locator('#held-badge')).toBeVisible();

  /* つかんでいる皿はレーンの左端に「つかみ中スロット」として残る。
     以前は opacity:0 で消していたので、プレイヤーが構造的に触れない皿にだけ警告が付いていた。
     名前だけ隠して絵と枠は残す形にしたので、実際に見えていることまで確かめる。 */
  const held = page.locator('.plate[data-held="true"]');
  await expect(held).toHaveCount(1);
  await expect(held).toBeVisible();
  expect(await held.evaluate((n) => getComputedStyle(n).opacity)).toBe('1');

  // 残りを打てば食べられる
  for (const key of rest.slice(1)) await page.keyboard.press(key);
  await expect(page.locator('#eaten')).not.toHaveText('¥0');
});

/* ---------------------------------------------------------------- 皿を選ぶ

   このゲームで唯一「プレイヤーが決めること」。的は自動で左端に固定されるが、
   語の1打目なら、ほかの皿に出ている先頭キーを押してそちらから打ち始められる。 */

/** いま打っている語の「次のキー」と衝突しない札を1つ返す（押したら選び直しになる札） */
async function otherKey(page) {
  const next = await page.locator('#romaji-next').innerText();
  const keys = await page.locator('.plate[data-takeable="true"] .plate__key').allInnerTexts();
  const key = keys.find((k) => k && k !== next);
  expect(key, `選び直せる札が無い（出ている札: ${keys.join(',')} ／ 次のキー: ${next}）`).toBeTruthy();
  return key;
}

test('語の1打目なら、ほかの皿に出ている先頭キーでそちらから打ち始められる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  // 選べる相手が並ぶまで待つ（1枚しか出ていないうちは選択の余地がない）
  await expect
    .poll(() => page.locator('.plate[data-takeable="true"]').count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(3);

  const before = await page.locator('#target-name').innerText();
  const key = await otherKey(page);

  await page.keyboard.press(key);
  /* 料理名も打鍵行も一斉に入れ替わるので、入れ替わったことが見える合図を出す。
     合図は一定時間で消えるので、消える前にいちばん先に見る */
  await expect(page.locator('#target')).toHaveAttribute('data-switch', 'true');
  await expect(page.locator('#target-name')).not.toHaveText(before);
  // 押したキーはそのまま移った先の1打目になる（同じキーを2度押させない）
  await expect(page.locator('#romaji-done')).toHaveText(key);
});

test('語の途中でほかの皿の札を押しても移らない（打ちかけの語が消えない）', async ({ page }) => {
  /* 語中でも移れた頃は、隣のキーへの指ズレが「移る」として発火して、
     打ちかけの語が無言で全部消えていた。ここは打ち間違いとして扱う。 */
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  await expect
    .poll(() => page.locator('.plate[data-takeable="true"]').count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(3);

  const before = await page.locator('#target-name').innerText();
  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);
  await expect(page.locator('#romaji-done')).toHaveText(rest[0]);

  const key = await otherKey(page);
  await page.keyboard.press(key);

  await expect(page.locator('#target-name')).toHaveText(before);
  await expect(page.locator('#romaji-done')).toHaveText(rest[0]);
  await expect(page.locator('#target')).not.toHaveAttribute('data-switch', 'true');
});

test('つかみ中でも、走行中の皿どうしが重ならない', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await page.click('label[for="course-heavy"]');
  await startGame(page);

  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);
  // つかみ中スロットができるまで（大食いは走行4.8秒）
  await expect(page.locator('.plate[data-held="true"]')).toHaveCount(1, { timeout: 8000 });

  const gaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.plate[data-state="riding"]:not([data-held="true"])')]
      .map((n) => n.getBoundingClientRect())
      .sort((a, b) => a.left - b.left);
    const between = [];
    for (let i = 1; i < boxes.length; i += 1) between.push(Math.round(boxes[i].left - boxes[i - 1].right));
    return { count: boxes.length, between };
  });
  expect(gaps.count, '走行中の皿が2枚以上出ていない').toBeGreaterThan(1);
  for (const gap of gaps.between) {
    expect(gap, `走行中の皿が ${-gap}px 重なっている`).toBeGreaterThanOrEqual(0);
  }
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

test('レーンの皿に料理の絵が出て、どれも実際に読み込めている', async ({ page }) => {
  /* 絵は「レーンの皿」だけに出す。打鍵行（レーンの直下）からは外した——
     1皿につき1度しか見ない絵が、1文字ごとに見る打鍵行を画面の外へ押し出していたため。 */
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  await page.waitForTimeout(3000);

  const plates = page.locator('.plate');
  await expect(plates.first()).toBeVisible();
  const images = page.locator('.plate .plate__img');
  expect(await images.count()).toBeGreaterThan(0);

  // 読み込みに失敗した絵は取り除かれる実装なので、残っている＝読めている
  for (let i = 0; i < await images.count(); i += 1) {
    await expect(images.nth(i)).toHaveJSProperty('complete', true);
    expect(await images.nth(i).evaluate((n) => n.naturalWidth)).toBeGreaterThan(0);
  }

  // 打鍵行に絵は無い（皿1枚につき1度しか読まないものを、ここに置かない）
  await expect(page.locator('#target img')).toHaveCount(0);
});

test('漢字の料理は名前の上にふりがなが乗り、皿からはみ出さない', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await page.click('label[for="course-heavy"]');
  await startGame(page);

  // 20品のうち漢字を含むのは5品。速いコースなら数秒で回ってくる
  const ruby = page.locator('.plate__name ruby').first();
  await expect(ruby).toBeVisible({ timeout: 20_000 });
  await expect(ruby.locator('rt')).not.toBeEmpty();

  // ふりがなが乗ると行が高くなる。皿の高さに収まっているかを実測で見る
  const fits = await page.locator('.plate').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return [...node.children]
      /* つかみ中の皿の名前は visibility で消してあるので、ここでも高さを持って数えられる
         （場所を取ったまま隠さないと、その皿だけ値段の位置が上へずれる）。
         出していない先頭キーの札だけが display:none ＝ 大きさ0で外れる。 */
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.height > 0)
      .every((rect) => rect.top >= box.top - 2 && rect.bottom <= box.bottom + 2);
  }));
  expect(fits.length).toBeGreaterThan(0);
  for (const fit of fits) expect(fit, '皿の中身がはみ出している').toBe(true);
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

/* ---------------------------------------------------------------- 1画面に収まっているか

   このアプリの設計は「打つところはレーンのすぐ下に固定する」。目線がレーンと文字の間を
   往復すると打てなくなるため。名目だけになっていないかを、実際の座標で押さえる。 */

test('スマホでソフトキーボードが出ていても、打つローマ字が画面に入っている', async ({ page }) => {
  // iPhone縦780pxからソフトキーボード336pxを引いた高さ。ここに打鍵行が入らないと打てない
  await page.setViewportSize({ width: 375, height: 444 });
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  await page.locator('#keys').focus();

  const bottom = await page.locator('.target__romaji').evaluate((n) => n.getBoundingClientRect().bottom);
  expect(bottom, `打つローマ字が画面の外（bottom=${Math.round(bottom)}）`).toBeLessThanOrEqual(444);
});

test('レーンの下端から打鍵行までが近い（目線が往復しない）', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  const gap = await page.evaluate(() => {
    const lane = document.getElementById('lane').getBoundingClientRect();
    const romaji = document.querySelector('.target__romaji').getBoundingClientRect();
    return romaji.top - lane.bottom;
  });
  expect(gap, `レーンから打鍵行まで ${Math.round(gap)}px 離れている`).toBeLessThanOrEqual(120);
  expect(gap).toBeGreaterThan(0);
});

test('対戦中はゲーム以外を畳み、結果画面で戻ってくる', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=7&duration=5`);
  await expect(page.locator('.tagline')).toBeVisible();
  await expect(page.locator('#share')).toBeVisible();

  await startGame(page);
  // 見出しは畳む（h1だけ残す）。シェア欄はDOMごと消さず、対戦中だけ隠す
  await expect(page.locator('.tagline')).toBeHidden();
  await expect(page.locator('#share')).toBeHidden();
  await expect(page.locator('.site-head h1')).toBeVisible();

  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('#share')).toBeVisible();
});

/* ---------------------------------------------------------------- レーンの状態表示

   レーンの中だけは明るい地なので、明るい色（琥珀・赤）では状態を出せない。
   ここが崩れると、速く読む必要がある側だけが読めない画面に戻る。 */

test('レーンの合図が地色に対して3:1以上ある', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await page.click('label[for="course-heavy"]');
  await startGame(page);
  // 消えかけの皿が出るまで待つ（大食いは走行4.8秒・警告は残り2.2秒から）
  await expect(page.locator('.plate[data-expiring="true"]').first()).toBeVisible({ timeout: 10_000 });

  const measured = await page.evaluate(() => {
    const parse = (value) => {
      const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
      const scale = value.startsWith('color(') ? 255 : 1;
      return numbers.slice(0, 3).map((one) => one * scale);
    };
    const channel = (value) => {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    const ratio = (one, other) => (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);

    /* レーンはグラデーションなので backgroundColor は透明のまま。
       色の停止点を全部拾って、いちばん条件の悪いところで判定する。 */
    const stops = getComputedStyle(document.getElementById('lane')).backgroundImage.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) ?? [];
    const grounds = stops.map(parse);
    const worstOnLane = (rgb) => Math.min(...grounds.map((ground) => ratio(luminance(rgb), luminance(ground))));

    const plain = document.querySelector('.plate:not([data-active="true"]):not([data-expiring="true"])');
    const plainStyle = getComputedStyle(plain);
    const active = document.querySelector('.plate[data-active="true"]');
    const expiring = document.querySelector('.plate[data-expiring="true"]');
    const ringsOf = (node) => (getComputedStyle(node).boxShadow.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) ?? []).map(parse);

    return {
      stops: grounds.length,
      borderOnLane: worstOnLane(parse(plainStyle.borderTopColor)),
      borderOnPlate: ratio(luminance(parse(plainStyle.borderTopColor)), luminance(parse(plainStyle.backgroundColor))),
      activeRing: Math.max(...ringsOf(active).map(worstOnLane)),
      expiringBorder: worstOnLane(parse(getComputedStyle(expiring).borderTopColor)),
      defaultBorderColor: plainStyle.borderTopColor,
      expiringBorderColor: getComputedStyle(expiring).borderTopColor
    };
  });

  expect(measured.stops).toBeGreaterThan(0);
  /* 皿の面（#fffaf0）とレーン（白木）の差は1.34:1しかなく、面では境目を作れない。
     境目を作っているのは濃い縁なので、見るのは「縁と地色」「縁と面」。 */
  expect(measured.borderOnLane, '皿の縁とレーン').toBeGreaterThanOrEqual(3);
  expect(measured.borderOnPlate, '皿の縁と皿の面').toBeGreaterThanOrEqual(3);
  expect(measured.activeRing, '選択中のリングとレーン').toBeGreaterThanOrEqual(3);
  expect(measured.expiringBorder, '消えかけの縁とレーン').toBeGreaterThanOrEqual(3);
  // 消えかけは既定とはっきり別の色にする（形が同じなら色でしか分からない）
  expect(measured.expiringBorderColor).not.toBe(measured.defaultBorderColor);
});

test('動きを減らす設定でも、消えかけの皿の警告は残る', async ({ page }) => {
  /* 以前は赤の点滅で警告していたので、prefers-reduced-motion を入れている人には
     警告が1つも出なかった（animation:none で消えるため）。静的な色に変えてある。 */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${PAGE}?seed=7`);
  await page.click('label[for="course-heavy"]');
  await startGame(page);
  await expect(page.locator('.plate[data-expiring="true"]').first()).toBeVisible({ timeout: 10_000 });

  const colors = await page.evaluate(() => ({
    expiring: getComputedStyle(document.querySelector('.plate[data-expiring="true"]')).borderTopColor,
    plain: getComputedStyle(document.querySelector('.plate:not([data-expiring="true"])')).borderTopColor
  }));
  expect(colors.expiring).not.toBe(colors.plain);
});

/* ---------------------------------------------------------------- キーボードと読み上げ */

test('結果が出たらフォーカスが判定へ移る', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=5`);
  await startGame(page);
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });

  // 押したボタンが hidden 配下に入ると、フォーカスは BODY に落ちて読み上げも位置を失う
  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(focused).toBe('verdict');
});

test('Escで対戦を中断してコース選択に戻れる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#state-empty')).toBeVisible();
  await expect(page.locator('#game')).toBeHidden();
  // 中断後もそのまま始め直せる
  await page.click('#start');
  await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
});

test('開始画面はEnterだけでも始められる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await expect(page.locator('#state-empty')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#state-countdown')).toBeVisible();
  await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
});

test('対戦中にTabを押してもフッターの共有リンクへ抜けない', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    const inFooter = await page.evaluate(() => Boolean(document.activeElement?.closest('.site-foot')));
    expect(inFooter, 'フッターへフォーカスが抜けた').toBe(false);
  }
});

/* ---------------------------------------------------------------- 元が取れるペース */

test('達成率のバーは0から始まり、1皿食べると伸びる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);

  const width = () => page.locator('#meter-fill').evaluate((n) => n.getBoundingClientRect().width);
  expect(await width()).toBe(0);
  // 遅れているうちは「元まであと¥X」が出る
  await expect(page.locator('#pace-note')).toContainText('元まであと');

  const rest = await remaining(page);
  for (const key of rest) await page.keyboard.press(key);
  await expect(page.locator('#eaten')).not.toHaveText('¥0');
  // 幅は .12s かけて伸びるので、伸び切るのを待ってから測る
  await expect.poll(width, { timeout: 3000, message: '1皿食べてもバーが伸びていない' }).toBeGreaterThan(0);

  // 残り時間はバーではなく数字で出す（満タンの琥珀色を達成率と読み違えないように）
  await expect(page.locator('#time-left')).toContainText('のこり');
});

/* ---------------------------------------------------------------- 開始画面 */

test('はじめるボタンが折り返しの上にある', async ({ page }) => {
  /* 主流サイズだけ見ていたので、360x640（656px）と320x568（677px）で
     はじめる が画面の外に出ていたことに気付けなかった。両方とも対象に入れる */
  for (const size of [
    { width: 375, height: 780 }, { width: 1440, height: 800 },
    { width: 360, height: 640 }, { width: 320, height: 568 }
  ]) {
    await page.setViewportSize(size);
    await page.goto(PAGE);
    await expect(page.locator('#start')).toBeVisible();
    const bottom = await page.locator('#start').evaluate((n) => n.getBoundingClientRect().bottom);
    expect(bottom, `${size.width}x${size.height} で はじめる が折り返しの下（bottom=${Math.round(bottom)}）`)
      .toBeLessThanOrEqual(size.height);
  }
});

/* ---------------------------------------------------------------- スマホの入口

   打鍵の口はレーンに重ねた透明な入力欄で、そこからフォーカスが外れると
   ソフトキーボードが閉じる＝打てなくなる。戻り方が画面に出ているかを見る。 */

/** iPhone 12 相当のタッチ端末 */
async function touchPage(browser, baseURL, size = { width: 390, height: 664 }) {
  const context = await browser.newContext({ baseURL, viewport: size, hasTouch: true, isMobile: true });
  return { context, page: await context.newPage() };
}

test('スマホの実寸でも はじめる が折り返しの上にあり、コース3択がL字に折れない', async ({ browser, baseURL }) => {
  /* 上の折り返しテストは desktop の context なので、縦スクロールバーが15px取る。
     390を渡しても中身は375px幅で組まれ、いちばん台数の多い帯（385〜478px）を素通りしていた。
     isMobile のスクロールバーは重ねて出るので、ここでは実寸そのままの幅で組まれる。 */
  for (const size of [{ width: 390, height: 664 }, { width: 412, height: 714 }]) {
    const { context, page } = await touchPage(browser, baseURL, size);
    await page.goto(PAGE);
    await expect(page.locator('#start')).toBeVisible();

    const bottom = await page.locator('#start').evaluate((n) => n.getBoundingClientRect().bottom);
    expect(bottom, `${size.width}x${size.height} で はじめる が折り返しの下（bottom=${Math.round(bottom)}）`)
      .toBeLessThanOrEqual(size.height);

    /* 3択が2+1のL字に折れると1セットに見えない。1行（3列）か1列（3行）のどちらかにする */
    const rows = await page.locator('#course-list .course').evaluateAll(
      (nodes) => new Set(nodes.map((n) => Math.round(n.getBoundingClientRect().top))).size
    );
    expect(rows, `${size.width}px でコース3択が${rows}段のL字に折れている`).not.toBe(2);
    await context.close();
  }
});

test('スマホで音を切り替えても、打鍵の口からフォーカスが外れない', async ({ browser, baseURL }) => {
  /* 対戦中に押せて画面がそのまま残るボタンはこれだけ。押した瞬間にキーボードが閉じると、
     案内は1打目で消えたあと（旧仕様）で、代わりの案内は Ctrl+M だけ＝スマホには Ctrl が無い */
  const { context, page } = await touchPage(browser, baseURL);
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  await page.locator('#keys').focus();
  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);

  await page.tap('#sound-toggle');
  await expect(page.locator('#sound-toggle')).toHaveText('音なし');
  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(focused, '音を切り替えたら打鍵の入力欄からフォーカスが外れた').toBe('keys');
  await context.close();
});

test('スマホの案内が皿の下に隠れず、1行で収まる', async ({ browser, baseURL }) => {
  const { context, page } = await touchPage(browser, baseURL, { width: 375, height: 667 });
  await page.goto(`${PAGE}?seed=7`);
  await startGame(page);
  const hint = page.locator('#tap-hint');
  await expect(hint).toBeVisible();

  /* 1打受け取ったら消えるが、そのあとフォーカスが外れたら出し直す。
     ここが出ないと、対戦中に音を切り替えてキーボードが閉じたとき戻し方が画面から消える */
  await page.locator('#keys').focus();
  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);
  await expect(hint).toBeHidden();
  await page.locator('#keys').blur();
  await expect(hint).toBeVisible();

  const measured = await page.evaluate(() => {
    const node = document.getElementById('tap-hint');
    const plate = document.querySelector('.plate');
    // いちばん上に来る皿は「つかみ中スロット」。その状態のz-indexも含めて比べる
    const before = plate.dataset.held;
    plate.dataset.held = 'true';
    const heldZ = Number(getComputedStyle(plate).zIndex) || 0;
    plate.dataset.held = before;
    const plates = [...document.querySelectorAll('.plate')].map((n) => Number(getComputedStyle(n).zIndex) || 0);
    return {
      hintZ: Number(getComputedStyle(node).zIndex) || 0,
      topPlateZ: Math.max(heldZ, ...plates),
      height: Math.round(node.getBoundingClientRect().height)
    };
  });
  /* elementFromPoint では確かめない——案内は pointer-events:none なので、
     直っていても皿が返る（重なり順の証明にならない） */
  expect(measured.hintZ, '案内が皿の下に潜っている').toBeGreaterThan(measured.topPlateZ);
  expect(measured.height, '案内が2行に折り返してレーンを塞いでいる').toBeLessThan(30);
  await context.close();
});

/* ---------------------------------------------------------------- ためし打ち */

test('ためし打ちで、その速さに合うコースが選ばれる', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7`);
  // 打つ前は既定（おすすめ）のまま。ためし打ちは飛ばせる
  await expect(page.locator('#course-standard')).toBeChecked();
  await expect(page.locator('#tryout')).toBeVisible();
  await expect(page.locator('#tryout-name')).not.toBeEmpty();

  const word = await page.locator('#tryout-rest').innerText();
  expect(word.length, 'ためし打ちの語が出ていない').toBeGreaterThan(0);

  /* 人の指の速さで打つ。一気に流し込むと1打50msより速くなり、
     「スマホの予測入力が1語まるごと差し込んだ」ときと同じ扱い（測らない）になる */
  await page.locator('#tryout').focus();
  for (const key of word) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }

  // 打った分は色を変えて残り、打ち切ると測った速さに合うコースが選ばれる
  await expect(page.locator('#tryout-done')).toHaveText(word);
  await expect(page.locator('#tryout-rest')).toHaveText('');
  await expect(page.locator('#tryout-note')).toContainText('打/秒');
  /* どのコースになるかは実際の打鍵速度しだいなので、値では固定しない
     （実測値で分岐するテストはCIで不安定になる）。3つのいずれかであることだけ見る */
  const checked = await page.locator('input[name="course"]:checked').getAttribute('id');
  expect(['course-light', 'course-standard', 'course-heavy']).toContain(checked);
  // 入力欄に文字は残らない
  await expect(page.locator('#tryout')).toHaveValue('');
});

test('ためし打ちは、入力欄をクリックしなくても打ち始められる', async ({ page }) => {
  // タイピングゲームなので「まず入力欄をクリックしてください」を挟まない
  await page.goto(`${PAGE}?seed=7`);
  await expect(page.locator('#tryout-rest')).not.toBeEmpty();
  const word = await page.locator('#tryout-rest').innerText();

  await page.keyboard.press(word[0]);
  await page.keyboard.press(word[1]);
  await expect(page.locator('#tryout-done')).toHaveText(word.slice(0, 2));
  await expect(page.locator('#tryout-rest')).toHaveText(word.slice(2));
});

/* ---------------------------------------------------------------- 音

   headless Chromium は --mute-audio 付きなので、実際の音量は測れない。
   測れるのは「音のグラフが正しい条件で立ち上がったか」だけ。 */

/** AudioContext が何回作られたかを数える */
async function countAudio(page) {
  await page.addInitScript(() => {
    window.__audioCount = 0;
    const Real = window.AudioContext || window.webkitAudioContext;
    class Counted extends Real {
      constructor(...args) {
        super(...args);
        window.__audioCount += 1;
        window.__audio = this;
      }
    }
    window.AudioContext = Counted;
    window.webkitAudioContext = Counted;
  });
}

test('開いただけでは音を作らない（鳴らす権利を握らない）', async ({ page }) => {
  await countAudio(page);
  await page.goto(`${PAGE}?seed=7`);
  await expect(page.locator('#state-empty')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__audioCount)).toBe(0);
});

test('はじめると音が立ち上がり、何回遊んでも1つのまま', async ({ page }) => {
  await countAudio(page);
  await page.goto(`${PAGE}?seed=7&duration=5`);
  await startGame(page);

  const state = await page.evaluate(() => ({
    count: window.__audioCount,
    running: window.__audio?.state,
    time: window.__audio?.currentTime
  }));
  expect(state.count).toBe(1);
  expect(state.running).toBe('running');
  expect(state.time).toBeGreaterThan(0);

  // 3ラウンド続けて遊んでも、AudioContext は作り直さない（端末の音の口は1つしかない）
  for (let round = 0; round < 2; round += 1) {
    await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
    await page.keyboard.press('Enter');
    await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
  }
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  expect(await page.evaluate(() => window.__audioCount)).toBe(1);
});

test('音なしを選んで始めると、音は一度も作られない', async ({ page }) => {
  await countAudio(page);
  await page.goto(`${PAGE}?seed=7`);
  // 押す前に選べる場所に置いてある（鳴ってから止める形にしない）
  await page.click('label[for="sound-off"]');
  await expect(page.locator('#sound-off')).toBeChecked();
  await startGame(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__audioCount)).toBe(0);
  // 対戦中も切り替えられる場所に常設してある
  await expect(page.locator('#sound-toggle')).toHaveText('音なし');
});

test('クエリでも音を切れる（デモ収録と検証のため）', async ({ page }) => {
  await countAudio(page);
  await page.goto(`${PAGE}?seed=7&sound=off`);
  await expect(page.locator('#sound-off')).toBeChecked();
  await startGame(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__audioCount)).toBe(0);
});

/* ---------------------------------------------------------------- 結果画面 */

test('同じセッションで2回遊ぶと前回との差が出る', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=5`);
  await startGame(page);
  // 打鍵速度を測るために1打だけ入れておく
  await page.keyboard.press((await remaining(page))[0]);
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });

  // 1回目には比べる相手がいない。代わりに、自分の速さに合うコースを言う
  await expect(page.locator('#session-diff')).toBeHidden();
  await expect(page.locator('#advice')).toBeVisible();
  await expect(page.locator('#advice')).toContainText('打/秒');

  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('#session-diff')).toBeVisible();
  await expect(page.locator('#session-diff')).toContainText('前回より');
  await expect(page.locator('#session-diff')).toContainText('最高');
  // 助言は初回だけ（2回目からは自分で分かっている）
  await expect(page.locator('#advice')).toBeHidden();
});

test('結果画面は保存しないことを明記している', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=5`);
  await startGame(page);
  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  // セッション内の比較は「保存」ではない。閉じたら消えることを画面の契約として置く
  await expect(page.locator('#result')).toContainText('保存しません');
  await expect(page.locator('#result')).toContainText('ページを閉じたら消えます');
});

test('つまずいたキーは直前のキーとの2連接で出る', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=6`);
  await startGame(page);

  // 1打目を正しく打ってから、2打目でわざと間違える＝語中のミス
  const rest = await remaining(page);
  await page.keyboard.press(rest[0]);
  await page.keyboard.press(rest[1] === 'z' ? 'q' : 'z');

  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  const key = await page.locator('#stumble-list .stumble__key').first().innerText();
  expect(key.length, `単独キーのまま出ている: ${key}`).toBe(2);
  expect(key[0]).toBe(rest[0]);
  expect(key[1]).toBe(rest[1]);
});

test('食べた料理の豆知識が結果画面に出る', async ({ page }) => {
  await page.goto(`${PAGE}?seed=7&duration=6`);
  await startGame(page);
  const rest = await remaining(page);
  for (const key of rest) await page.keyboard.press(key);

  await expect(page.locator('#result')).toBeVisible({ timeout: 12_000 });
  // 対戦中の打鍵行から外した豆知識は、読む暇があるここへ移した（畳んであるので開いて見る）
  await expect(page.locator('#ate-list li')).not.toHaveCount(0);
  await expect(page.locator('#ate-list li').first()).toBeHidden();
  await page.click('.ate summary');
  await expect(page.locator('#ate-list li').first()).toBeVisible();
  await expect(page.locator('#ate-empty')).toBeHidden();
});

test('結果画面は「判定 → もう一度 → 詳細」の順で、再開の入口が折り返しの上にある', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=7&duration=7`);
  await startGame(page);
  // 実プレイ相当に打つ（食べた料理もつまずきも出ている状態で測る）
  const until = Date.now() + 6500;
  let i = 0;
  while (Date.now() < until) {
    const key = await page.locator('#romaji-next').innerText();
    if (!key) { await page.waitForTimeout(80); continue; }
    i += 1;
    await page.keyboard.press(i % 13 === 0 ? 'z' : key);
  }
  await expect(page.locator('#result')).toBeVisible({ timeout: 15_000 });

  const y = await page.evaluate(() => {
    const bottom = (s) => document.querySelector(s).getBoundingClientRect().bottom;
    return { verdict: bottom('#verdict'), again: bottom('#again'), stats: bottom('.stats'), stumbles: bottom('.stumbles') };
  });
  expect(y.again, `もう一度が折り返しの下（bottom=${Math.round(y.again)}）`).toBeLessThanOrEqual(900);
  expect(y.verdict).toBeLessThan(y.again);
  expect(y.again).toBeLessThan(y.stats);
  expect(y.stats).toBeLessThan(y.stumbles);
});
