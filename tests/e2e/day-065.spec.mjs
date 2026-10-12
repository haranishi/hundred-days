import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../../day-065-teikoku-gohan/lib/levels-data.js';
import { stepIcons } from '../../day-065-teikoku-gohan/lib/recipes.js';

/* Day 065 定刻ごはん。ルール・面データ・結果の文は day-065-teikoku-gohan/tests の単体テストが見る。
   ここでは公開ページとして、本番と同じCSPの下で開けること、面1をタップだけ・キーボードだけでクリアできること、
   失敗の原因と見本のダイヤ（★1まで）、焦げの文、画面幅ごとのはみ出しと押せる大きさ、共有の窓とOGP、
   動きを減らす設定で再生が飛ぶこと、最初の画面で地図が見えること・地図の固定・注文票・運行図の目盛り・一言の消え方、
   320px で分岐ボタンが重ならないことを確かめる。

   手元の配信（scripts/serve-dist.mjs）はヘッダーを付けないので、dist/_headers の CSP をそのまま当てる。
   status が draft の間は dist に入らない（検査のときだけ published にして build する）。 */

const DIR = 'day-065-teikoku-gohan';
const PATH = `/${DIR}/`;
const PUBLIC_URL = `https://hundred-days.pages.dev/${DIR}/`;
const headers = readFileSync('dist/_headers', 'utf8');
const policy = (headers.split(`\n/${DIR}/*\n`)[1] ?? '').split('\n')[0].trim().replace('Content-Security-Policy: ', '');

test.beforeAll(() => {
  expect(policy, `dist/_headers に ${DIR} が無い（meta.json を published にして npm run build したか）`).toContain("script-src 'self'");
});

async function open(page) {
  const errors = [];
  const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // CSPに止められた読み込みは例外にならないことがあるので、違反の知らせそのものを集める
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  // 手元の配信サーバー以外への通信は、すべて止めて記録する
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:')) return route.fallback();
    outside.push(url);
    return route.abort();
  });
  await page.route(`**${PATH}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  await page.goto(PATH);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return { errors, outside };
}

async function expectClean(page, seen) {
  expect(seen.errors, 'コンソールのエラー・例外').toEqual([]);
  expect(seen.outside, '外への通信').toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations), 'CSP違反').toEqual([]);
  // 画面に出ている文字に、値の入れ忘れ（null・undefined・NaN・[object …]）が混ざっていない。
  // Element.append に null を渡すと「null」という文字になる（5周目に結果シートで実際に起きた）
  const shown = await page.evaluate(() => document.body.innerText);
  expect(shown.match(/\bnull\b|\bundefined\b|\bNaN\b|\[object /g), '画面に値の入れ忘れの文字（null・undefined など）が出ている').toBeNull();
}

// 「ステーキ」が「ひと口ステーキ」にも当たらないよう、「N番目に出る 」から始まる名前だけを拾う（面5には両方ある）
const pickTrain = (page, dish) => page.getByRole('button', { name: new RegExp(`^\\d+番目に出る ${dish}の列車。`) });

async function departAndSkip(page) {
  await page.getByRole('button', { name: '発車', exact: true }).click();
  await page.getByRole('button', { name: 'スキップ', exact: true }).click();
  await expect(page.locator('#result')).toBeVisible();
}

// 面1の正解：焼きにんじんの列車を選び、分岐を「焼く駅へ」に切り替える
async function solveLevel1ByTap(page) {
  await pickTrain(page, '焼きにんじん').click();
  const toCut = page.getByRole('button', { name: '分岐 切る駅へ', exact: true });
  await expect(toCut).toBeVisible();
  await toCut.click();
  await expect(page.getByRole('button', { name: '分岐 焼く駅へ', exact: true })).toBeVisible();
  await expect(page.locator('.car__steps-icons').first()).toHaveText('🔥');
}

test('本番と同じCSPで開き、エラー・CSP違反・外への通信が0件。面を開くと1番目の列車が選ばれ、分岐ボタンが出ている', async ({ page }) => {
  const seen = await open(page);
  await expect(page.getByRole('heading', { name: '定刻ごはん', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '100 DAYS / 065' })).toHaveAttribute('href', '../');
  await expect(page.locator('#level-chips .chip')).toHaveCount(6);
  await expect(page.locator('#stage-title')).toContainText('はじめの一皿');
  // 面を開いた直後から、出発順の1番目の列車が選ばれていて、分岐の切替ボタンが地図に出ている
  await expect(page.locator('.car__pick').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '分岐 切る駅へ', exact: true })).toBeVisible();
  // 全面を最初から開ける。どの面も開いた直後に1番目の列車が選ばれている
  for (const n of [6, 3]) {
    await page.getByRole('button', { name: new RegExp(`^面${n} `) }).click();
    await expect(page.locator('#stage-title')).toContainText(String(n));
    await expect(page.locator('.car__pick').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.switch').first()).toBeVisible();
  }
  // 面3：魚の進路を2つ目の分岐で配膳駅へ回すと、3つ目の分岐は進路から外れる。外れた分岐を押すと一言
  await page.getByRole('button', { name: '2つ目の分岐 焼く駅（近）へ', exact: true }).click();
  await expect(page.getByRole('button', { name: '2つ目の分岐 配膳駅へ', exact: true })).toBeVisible();
  await expect(page.locator('.switch')).toHaveCount(2);
  await page.locator('.hit[data-node="J3"]').click();
  await expect(page.locator('#toast')).toHaveText('この分岐は、いまの進路では通らない');
  // 面を切り替えると、一言はその場で消える。一言は2.8秒で自然にも消えるので、待たずに見る（待つ形だと消す処理が無くても通る）
  await page.getByRole('button', { name: /^面1 / }).click();
  expect(await page.locator('#toast').textContent(), '面を切り替えた直後に一言が残っている').toBe('');
  expect(await page.locator('#toast').getAttribute('class')).not.toContain('is-on');
  await expectClean(page, seen);
});

test('面1：列車をタップ→分岐をタップ→発車→スキップでクリア★3。結果を送る文と、リロード後も星が残る', async ({ page }) => {
  const seen = await open(page);
  await solveLevel1ByTap(page);
  await departAndSkip(page);
  await expect(page.locator('#result-title')).toContainText('星3つ');
  await expect(page.locator('.result__line')).toHaveText('完食！ 7分 最短ダイヤ！');
  await expect(page.locator('.ticket.is-ok .ticket__why')).toHaveText('7分');
  await expect(page.locator('.chart__svg')).toHaveAttribute('role', 'img');
  const send = page.getByRole('link', { name: 'Xで結果を送る' });
  const href = decodeURIComponent(await send.getAttribute('href'));
  expect(href).toContain('https://x.com/intent/post?text=');
  expect(href).toContain('定刻ごはん Day65｜面1「はじめの一皿」★3 7分で完食 #100日チャレンジ #個人開発');
  expect(href).toContain(`url=http://127.0.0.1:`);
  await expect(send).toHaveAttribute('rel', 'noopener noreferrer');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: '面1 はじめの一皿、星3つ' })).toBeVisible();
  // まだクリアしていない最初の面から始まる
  await expect(page.locator('#stage-title')).toContainText('ならんで待つ');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('teikokuGohan.v1')));
  expect(saved.levels.L1).toEqual({ stars: 3, best: 7, tries: 1, usedSample: false });
  await expectClean(page, seen);
});

test('面2：順番違いで失敗→原因の文→2回失敗で見本のダイヤ→反映（自動では発車しない）→発車→クリアは★1', async ({ page }) => {
  const seen = await open(page);
  await page.getByRole('button', { name: /^面2 / }).click();
  for (const dish of ['焼きにんじん', 'ステーキ']) {
    await pickTrain(page, dish).click();
    await page.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
  }
  // ▲▼で入れ替えても選択は保つ（ステーキを前へ→後ろへ戻す）
  await page.getByRole('button', { name: 'ステーキの列車を1つ前へ' }).click();
  await expect(page.locator('.car').first()).toHaveAttribute('data-train', 't2');
  await expect(pickTrain(page, 'ステーキ')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'ステーキの列車を1つ後ろへ' }).click();
  await expect(page.locator('.car').first()).toHaveAttribute('data-train', 't1');

  // 1回目：にんじんが先に焼く駅に入り、締切の早いステーキが手前で待たされて遅れる
  await departAndSkip(page);
  await expect(page.locator('#result-title')).toContainText('失敗');
  await expect(page.locator('.result__line')).toHaveText('2つの注文のうち1つが遅れた');
  await expect(page.locator('.result__row.is-ng .result__why')).toHaveText('ステーキが2分遅れ。🔥焼く駅の手前で『焼きにんじん』に2分待たされた。待たされなければ8分に着いた。');
  await expect(page.getByRole('button', { name: '見本のダイヤを見る' })).toHaveCount(0);

  // 2回目も同じ組み方で失敗すると、見本のダイヤが出せる。組み直すと出発順の1番目の列車が選ばれる
  await page.getByRole('button', { name: '組み直す' }).click();
  await expect(pickTrain(page, '焼きにんじん')).toHaveAttribute('aria-pressed', 'true');
  await departAndSkip(page);
  await page.getByRole('button', { name: '見本のダイヤを見る' }).click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.getByRole('button', { name: '発車', exact: true })).toBeVisible();
  await expect(page.locator('.car').first()).toHaveAttribute('data-train', 't2');
  await expect(page.locator('#sample-note')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText(/見本のダイヤを出した/);

  // 発車すると一言はその場で消え、結果の画面にも残らない（自然に消える2.8秒を待たずに見る）
  await page.getByRole('button', { name: '発車', exact: true }).click();
  expect(await page.locator('#toast').textContent(), '発車した直後に一言が残っている').toBe('');
  await page.getByRole('button', { name: 'スキップ', exact: true }).click();
  await expect(page.locator('#result')).toBeVisible();
  expect(await page.locator('#toast').getAttribute('class')).not.toContain('is-on');
  await expect(page.locator('#result-title')).toContainText('星1つ');
  await expect(page.locator('.result__line')).toHaveText('完食！ 10分 見本のダイヤなので★1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('teikokuGohan.v1')));
  expect(saved.levels.L2).toEqual({ stars: 1, best: 10, tries: 3, usedSample: true });
  // 面を切り替えて戻ると、失敗の数は0に戻る（見本のボタンは出ない）
  await page.getByRole('button', { name: /^面3 / }).click();
  await page.getByRole('button', { name: /^面2 / }).click();
  await expect(page.locator('#btn-sample-edit')).toBeHidden();
  await expectClean(page, seen);
});

test('面4：焦げる組み方で、焦げた駅・待たされた分・出口をふさいだ相手が文に出る。運行図に✖', async ({ page }) => {
  const seen = await open(page);
  await page.getByRole('button', { name: /^面4 / }).click();
  await pickTrain(page, 'ステーキ').click();
  await page.getByRole('button', { name: '分岐 焼く駅（3分）へ', exact: true }).click();
  await expect(page.getByRole('button', { name: '分岐 焼く駅（4分）へ', exact: true })).toBeVisible();
  await departAndSkip(page);
  await expect(page.locator('.result__line')).toHaveText('4つの注文のうち2つが失敗（焦げ1・工程違い1）');
  await expect(page.locator('.result__why').filter({ hasText: '焦げた' })).toHaveText('🔥焼く駅（3分）で、仕上がってから2分待たされて焦げた。出口を『焼き魚』の列車がふさいでいた。');
  await expect(page.locator('.ticket[data-train="t3"] .ticket__why')).toHaveText('焦げた');
  await expect(page.locator('.chart__burn')).toHaveCount(1);
  await page.getByText('運行図を文で読む').click();
  // 場所ごとの文（「🔥焼く（3分）：」で始まる行）。列車ごとの文にも同じ駅の名前が出るので、行の頭で絞る
  await expect(page.locator('.chart__text li').filter({ hasText: /^🔥焼く（3分）：/ })).toContainText('ゆで卵 6〜11分（その前に手前で2分待ち）（うち2分は先が空くのを待った）・11分に焦げた');
  await expectClean(page, seen);
});

const SIZES = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];

// 見えている「押せるもの」の大きさ（44px 未満を返す）
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll('a[href], button, summary, [role="button"], input, select')]
  .filter((el) => el.getClientRects().length > 0 && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
  .map((el) => {
    const r = el.getBoundingClientRect();
    return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  })
  .filter((t) => t.w < 43.5 || t.h < 43.5));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const size of SIZES) {
  test(`${size.width}×${size.height}：横にはみ出さず、押せるものは44px以上（編集・分岐・結果）`, async ({ page }) => {
    await page.setViewportSize(size);
    const seen = await open(page);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
    // 分岐の多い面3で、進路に分岐が3つある列車を選ぶ
    await page.getByRole('button', { name: /^面3 / }).click();
    await pickTrain(page, '焼きにんじん').click();
    await expect(page.locator('.switch')).toHaveCount(3);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
    await departAndSkip(page);
    await page.getByText('運行図を文で読む').click();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(await smallTargets(page)).toEqual([]);
    // 地図と運行図の文字は11px以上
    const tiny = await page.evaluate(() => {
      const out = [];
      for (const svg of document.querySelectorAll('#map-svg, .chart__svg')) {
        const vb = svg.viewBox.baseVal;
        const scale = svg.getBoundingClientRect().width / vb.width;
        for (const t of svg.querySelectorAll('text')) {
          if (!t.getClientRects().length || getComputedStyle(t).opacity === '0' || t.closest('.station-fx, .station-fx-text, .pop')) continue;
          const px = parseFloat(getComputedStyle(t).fontSize) * scale;
          if (px < 10.95) out.push(`${t.textContent} ${px.toFixed(1)}px`);
        }
      }
      return out;
    });
    expect(tiny).toEqual([]);
    await expectClean(page, seen);
  });
}

test('共有の窓とOGP：帯の「共有する」から共通のシェア欄が開き、canonical と og:image がある', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', PUBLIC_URL);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '定刻ごはん');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', PUBLIC_URL);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image).toContain(DIR);
  const shot = await page.request.get(image.replace('https://hundred-days.pages.dev', ''));
  expect(shot.ok(), `og:image が見つからない: ${image}`).toBe(true);

  const opener = page.getByRole('button', { name: 'このアプリを共有する', exact: true });
  await expect(opener).toBeVisible();
  await opener.click();
  const dialog = page.locator('#share-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.share')).toHaveCount(1);
  const x = dialog.getByRole('link', { name: 'Xで投稿' });
  const href = await x.getAttribute('href');
  expect(href).toContain('https://x.com/intent/post?');
  expect(href).toContain(encodeURIComponent(PUBLIC_URL));
  expect(decodeURIComponent(href)).toContain('定刻ごはん');
  for (const height of await dialog.locator('.share__button').evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height))) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth), '共有の窓の中身が横にはみ出している').toBeLessThanOrEqual(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await dialog.getByRole('button', { name: 'とじる' }).click();
  await expect(dialog).toBeHidden();
  // あそびかた（ルール6行。合流のきまりを含む）
  await page.getByRole('button', { name: 'あそびかた' }).click();
  await expect(page.locator('#howto-dialog li')).toHaveCount(6);
  await expect(page.locator('#howto-dialog li').nth(4)).toHaveText('同じ場所に同時に入りたい列車は、先に出発した列車が先に進む。');
  await page.locator('#howto-dialog').getByRole('button', { name: 'とじる' }).click();
  await expectClean(page, seen);
});

test('動きを減らす設定では再生せず、発車してすぐ結果が出る。音を消す設定は残る', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await open(page);
  // 音の切り替え（保存される）
  await page.getByRole('button', { name: '音を消す' }).click();
  await expect(page.getByRole('button', { name: '音を出す' })).toBeVisible();
  await solveLevel1ByTap(page);
  await page.getByRole('button', { name: '発車', exact: true }).click();
  // 再生しない：押した直後（待たずに）結果が出ていて、スキップと時計は出ない。
  // 待つ形にすると、面1の再生（約4秒）が終わって結果が出るのを待ててしまい、再生していても通る
  expect(await page.locator('#result').isVisible(), '押した直後に結果が出ている').toBe(true);
  expect(await page.locator('#btn-skip').isVisible(), 'スキップは出ない').toBe(false);
  expect(await page.locator('#clock').isVisible(), '時計は出ない').toBe(false);
  await expect(page.locator('.result__line')).toHaveText('完食！ 7分 最短ダイヤ！');
  await page.reload();
  await expect(page.getByRole('button', { name: '音を出す' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('teikokuGohan.v1')));
  expect(saved.muted).toBe(true);
  await expectClean(page, seen);
});

test('キーボードだけで面1をクリアできる（Tab・Enter・Space）', async ({ page }) => {
  const seen = await open(page);
  const focused = (selector) => page.evaluate((sel) => Boolean(document.activeElement?.matches(sel)), selector);
  async function tabTo(selector, { back = false, max = 40 } = {}) {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
      if (await focused(selector)) return;
    }
    throw new Error(`${selector} にフォーカスが届かない`);
  }
  // 面を開いた直後から1番目の列車が選ばれている。地図は注文票・編成より前にあるので、Tab で先に分岐ボタンへ届く
  await expect(pickTrain(page, '焼きにんじん')).toHaveAttribute('aria-pressed', 'true');
  await tabTo('.switch');
  await page.keyboard.press('Space');
  await expect(page.locator('.switch')).toHaveAttribute('aria-label', '分岐 焼く駅へ');
  expect(await focused('.switch'), '切り替えた後も同じ分岐ボタンにフォーカスが残る').toBe(true);
  await tabTo('#btn-depart');
  await page.keyboard.press('Enter');
  expect(await focused('#btn-skip'), '発車したらフォーカスはスキップへ').toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#result')).toBeVisible();
  expect(await focused('#result-title')).toBe(true);
  await expect(page.locator('.result__line')).toHaveText('完食！ 7分 最短ダイヤ！');
  await tabTo('#btn-next');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage-title')).toContainText('ならんで待つ');
  await expectClean(page, seen);
});

// ---------------------------------------------------------------- 最初の画面・地図の固定・注文票・運行図・分岐ボタンの間隔

const chipOf = (page, n) => page.getByRole('button', { name: new RegExp(`^面${n} `) });
const rectOf = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const b = el.getBoundingClientRect();
  return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
});
const positionOf = (page, selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).position);

for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`${size.width}×${size.height}：面1〜3を開いた直後に、地図の全体が帯にも発車ボタンにも隠れず見える`, async ({ page }) => {
    await page.setViewportSize(size);
    const seen = await open(page);
    for (const n of [1, 2, 3]) {
      if (n > 1) await chipOf(page, n).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const map = await rectOf(page, '#map');
      const band = await rectOf(page, '.band');
      const bar = await rectOf(page, '#actionbar');
      expect(map.top, `面${n}：地図の上端が帯の下にある`).toBeGreaterThanOrEqual(band.bottom - 0.5);
      expect(map.bottom, `面${n}：地図の下端が発車ボタンより上にある`).toBeLessThanOrEqual(bar.top + 0.5);
      await expect(page.locator('.switch').first()).toBeVisible();
    }
    await expectClean(page, seen);
  });
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${size.width}×${size.height}：編集中と再生中は地図が帯の下に固定され、最後の列車までタップできる。結果の間は固定しない`, async ({ page }) => {
    await page.setViewportSize(size);
    const seen = await open(page);
    await chipOf(page, 6).click();
    await pickTrain(page, '焼きにんじん').click();
    await expect(pickTrain(page, '焼きにんじん')).toHaveAttribute('aria-pressed', 'true');
    // 最後の列車を、編成の終わりまで送った位置（発車ボタンの上）にそろえてから測る
    await page.locator('.car').last().evaluate((el) => el.scrollIntoView({ block: 'end' }));
    const at = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const section = box(document.querySelector('.board__map'));
      const band = box(document.querySelector('.band'));
      const bar = box(document.querySelector('#actionbar'));
      const cars = [...document.querySelectorAll('.car')].map(box);
      const last = cars[cars.length - 1];
      return {
        scrolled: window.scrollY,
        position: getComputedStyle(document.querySelector('.board__map')).position,
        mapTop: section.top,
        bandHeight: band.height,
        bandPosition: getComputedStyle(document.querySelector('.band')).position,
        lastTop: last.top - section.bottom,
        lastBottom: bar.top - last.bottom,
        visibleCars: cars.filter((c) => c.top >= section.bottom - 0.5 && c.bottom <= bar.top + 0.5).length,
      };
    });
    expect(at.position).toBe('sticky');
    expect(at.scrolled, '最後の列車まで送るにはスクロールが要る（固定が効いているかを見る前提）').toBeGreaterThan(0);
    // 帯が固定のとき（高さ700px超）は帯のすぐ下、固定でないとき（小さなスマホ）は画面の上端に、地図が固定される
    expect(Math.abs(at.mapTop - (at.bandPosition === 'sticky' ? at.bandHeight : 0)), '地図は帯のすぐ下（帯が固定でないときは画面の上端）に固定されている').toBeLessThanOrEqual(1);
    expect(at.lastTop, '最後の列車は地図に隠れない').toBeGreaterThanOrEqual(-0.5);
    expect(at.lastBottom, '最後の列車は発車ボタンに隠れない').toBeGreaterThanOrEqual(-0.5);
    expect(at.visibleCars, '地図と発車ボタンの間に、列車カードが2両以上見える').toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: '発車', exact: true }).click();
    expect(await positionOf(page, '.board__map'), '再生中も固定').toBe('sticky');
    await page.getByRole('button', { name: 'スキップ', exact: true }).click();
    await expect(page.locator('#result')).toBeVisible();
    expect(await positionOf(page, '.board__map'), '結果シートの間は固定しない').toBe('static');
    await page.getByRole('button', { name: '組み直す' }).click();
    expect(await positionOf(page, '.board__map'), '組み直すとまた固定').toBe('sticky');
    await expectClean(page, seen);
  });
}

test('画面の高さが450px未満（844×390）では、地図も帯も固定しない', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const seen = await open(page);
  expect(await positionOf(page, '.board__map')).toBe('static');
  expect(await positionOf(page, '.band')).toBe('static');
  await expectClean(page, seen);
});

test('注文票は横に送らず、折り返して全部見える（スマホは2列。絵文字・料理名・工程・締切）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  await chipOf(page, 6).click();
  const info = await page.locator('#orders').evaluate((ul) => {
    const r = ul.getBoundingClientRect();
    const items = [...ul.children].map((li) => li.getBoundingClientRect());
    return {
      count: items.length,
      scroll: ul.scrollWidth - ul.clientWidth,
      inside: items.every((b) => b.left >= r.left - 0.5 && b.right <= r.right + 0.5),
      tops: items.map((b) => Math.round(b.top)),
      lefts: items.map((b) => Math.round(b.left)),
    };
  });
  expect(info.count).toBe(5);
  expect(info.scroll, '注文票の中で横に送らない').toBeLessThanOrEqual(0);
  expect(info.inside, '札が注文票の幅からはみ出さない').toBe(true);
  expect(info.tops[1], '1段目に2枚並ぶ').toBe(info.tops[0]);
  expect(info.lefts[1]).toBeGreaterThan(info.lefts[0]);
  expect(info.tops[2], '3枚目は次の段へ折り返す').toBeGreaterThan(info.tops[0]);
  const first = page.locator('.ticket').first();
  await expect(first.locator('.ticket__emoji')).toHaveText('🐟');
  await expect(first.locator('.ticket__dish')).toHaveText('お刺身');
  await expect(first.locator('.ticket__steps')).toContainText('🔪');
  await expect(first.locator('.ticket__due')).toContainText('〜11分');
  await expectClean(page, seen);
});

test('運行図：右端の「N分」と目盛りの数字が重ならない（320×568・面6・25分）', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const seen = await open(page);
  await chipOf(page, 6).click();
  await departAndSkip(page);
  const ticks = await page.locator('.chart__tick').evaluateAll((nodes) => nodes.map((n) => {
    const b = n.getBoundingClientRect();
    return { text: n.textContent, left: b.left, right: b.right };
  }));
  expect(ticks.at(-1).text).toBe('25分');
  for (let i = 1; i < ticks.length; i++) {
    expect(ticks[i].left, `「${ticks[i - 1].text}」と「${ticks[i].text}」が重なる`).toBeGreaterThanOrEqual(ticks[i - 1].right + 1);
  }
  await expectClean(page, seen);
});

test('320×568：全6面で、分岐ボタンの中心どうしが44px以上離れ、車庫の文字に重ならない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const seen = await open(page);
  // 円（中心・半径）と長方形が重なるか
  const measure = () => page.evaluate(() => {
    const out = [];
    const yard = document.querySelector('.yard__text').getBoundingClientRect();
    const hitsYard = (c, r) => Math.hypot(Math.max(yard.left - c.x, 0, c.x - yard.right), Math.max(yard.top - c.y, 0, c.y - yard.bottom)) < r;
    const centers = (selector) => [...document.querySelectorAll(selector)].map((el) => {
      const b = el.getBoundingClientRect();
      return { node: el.dataset.node, x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    // 見えている切替ボタン（44px）
    const shown = centers('.switch');
    // どの選び方でも重ならないよう、分岐の位置そのもの（地図上の分岐の円）も測る。ボタンはその中心に44pxで出る
    const branches = centers('.junction--branch');
    for (const [label, list] of [['ボタン', shown], ['分岐の位置', branches]]) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
          if (d < 44) out.push(`${label} ${list[i].node}-${list[j].node} ${d.toFixed(1)}px`);
        }
        if (hitsYard(list[i], 22)) out.push(`${label} ${list[i].node} が車庫の文字に重なる`);
      }
    }
    return out;
  });
  const problems = [];
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await chipOf(page, n).click();
    const ids = await page.locator('.car').evaluateAll((els) => els.map((e) => e.dataset.train));
    for (const id of ids) {
      await page.locator(`.car[data-train="${id}"] .car__pick`).click();
      for (const p of await measure()) problems.push(`面${n} ${id}: ${p}`);
    }
  }
  expect(problems).toEqual([]);
  await expectClean(page, seen);
});

// ---------------------------------------------------------------- 3周目：遅れの内訳・運行図の走行・分の札・遅れの合図・地図の高さ・ヒント

test('面3：遅れの理由の文に、待ちの内訳と「待たされなくても何分かかるか」が出る', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 3).click();
  await departAndSkip(page);
  await expect(page.locator('.result__row.tc-t3 .result__why')).toHaveText('ひと口ステーキが5分遅れ。🔥焼く駅（近）の手前で『ステーキ』に2分待たされた。ほかでも2分待った。待たされなくても14分かかる（締切13分）');
  await expectClean(page, seen);
});

test('運行図：どの列車も、出発から配膳まで帯・細い線・点線で途切れずにたどれる。凡例と文にも走行時間がある', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 3).click();
  await departAndSkip(page);
  const gaps = await page.locator('.chart__svg').evaluate((svg) => {
    const trains = new Set([...svg.querySelectorAll('.bar')].map((b) => [...b.classList].find((c) => c.startsWith('tc-'))));
    const out = {};
    for (const tc of trains) {
      const spans = [];
      for (const b of svg.querySelectorAll(`.bar.${tc}`)) spans.push([+b.getAttribute('x'), +b.getAttribute('x') + +b.getAttribute('width')]);
      for (const l of svg.querySelectorAll(`.run-line.${tc}, .wait-line.${tc}`)) {
        const x1 = +l.getAttribute('x1');
        const x2 = +l.getAttribute('x2');
        spans.push([Math.min(x1, x2), Math.max(x1, x2)]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      let end = spans[0][1];
      let breaks = 0;
      for (const [a, b] of spans.slice(1)) {
        if (a > end + 0.6) breaks += 1;
        end = Math.max(end, b);
      }
      out[tc] = { breaks, runLines: svg.querySelectorAll(`.run-line.${tc}`).length };
    }
    return out;
  });
  expect(Object.keys(gaps).length).toBe(4);
  for (const [tc, g] of Object.entries(gaps)) {
    expect(g.breaks, `${tc} の線が途中で切れている`).toBe(0);
    expect(g.runLines, `${tc} に走っている時間の細い線が無い`).toBeGreaterThan(0);
  }
  await expect(page.locator('.chart__legend')).toContainText('細い線＝走っている時間');
  await expect(page.locator('.chart__legend')).toContainText('帯（列車の色・出発番号）');
  await page.getByText('運行図を文で読む').click();
  await expect(page.locator('.chart__text li').filter({ hasText: 'お刺身：' }).first()).toContainText('出庫線 0〜1分 → 走る 1〜2分 → 🔪切る 2〜4分 → 走る 4〜7分 → 🔥焼く（近） 7〜10分');
  await expectClean(page, seen);
});

const TAG_SIZES = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];

for (const size of TAG_SIZES) {
  test(`${size.width}×${size.height}：分の札は2分以上の線路にだけ出て、分岐ボタン・駅の文字に重ならない（全6面）。切替ボタンは分岐の真上`, async ({ page }) => {
    await page.setViewportSize(size);
    const seen = await open(page);
    const problems = [];
    for (const level of LEVELS) {
      await chipOf(page, level.no).click();
      const want = level.edges.filter((e) => e.len >= 2).map((e) => e.id).sort();
      const got = (await page.locator('.len-tag').evaluateAll((els) => els.map((e) => e.dataset.edge))).sort();
      if (got.join() !== want.join()) problems.push(`面${level.no} 札の線路 ${got.join(',')} ≠ ${want.join(',')}`);
      for (const p of await page.evaluate(() => {
        const out = [];
        const rect = (el) => el.getBoundingClientRect();
        const tags = [...document.querySelectorAll('.len-tag__box')].map((el) => ({ edge: el.parentNode.dataset.edge, r: rect(el) }));
        const branches = [...document.querySelectorAll('.junction--branch')].map((el) => { const b = rect(el); return { node: el.dataset.node, x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        const texts = [...document.querySelectorAll('.station__text, .yard__text, .serve__text')].map(rect);
        const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        for (const t of tags) {
          for (const c of branches) {
            const d = Math.hypot(Math.max(t.r.left - c.x, 0, c.x - t.r.right), Math.max(t.r.top - c.y, 0, c.y - t.r.bottom));
            if (d < 22) out.push(`札 ${t.edge} が分岐 ${c.node} のボタンにかかる（${d.toFixed(1)}px）`);
          }
          for (const x of texts) if (hits(t.r, x)) out.push(`札 ${t.edge} が駅の文字にかかる`);
        }
        // 見えている切替ボタンの中心は、地図の分岐の円の中心と一致する（地図の高さを面ごとに変えても、位置がずれない）
        for (const btn of document.querySelectorAll('.switch')) {
          const b = rect(btn);
          const j = document.querySelector(`.junction[data-node="${btn.dataset.node}"]`).getBoundingClientRect();
          const dx = b.left + b.width / 2 - (j.left + j.width / 2);
          const dy = b.top + b.height / 2 - (j.top + j.height / 2);
          if (Math.hypot(dx, dy) > 1.5) out.push(`切替ボタン ${btn.dataset.node} が分岐からずれている（${dx.toFixed(1)}, ${dy.toFixed(1)}）`);
        }
        return out;
      })) problems.push(`面${level.no}: ${p}`);
    }
    expect(problems).toEqual([]);
    // 面3：遠い焼き場（下）の側に札があり、近い焼き場（上）の側には無い
    await chipOf(page, 3).click();
    await expect(page.locator('.len-tag[data-edge="e8"]')).toHaveCount(1);
    await expect(page.locator('.len-tag[data-edge="e9"]')).toHaveCount(1);
    await expect(page.locator('.len-tag[data-edge="e6"], .len-tag[data-edge="e7"]')).toHaveCount(0);
    await expect(page.locator('#legend-len')).toBeVisible();
    await chipOf(page, 1).click();
    await expect(page.locator('#legend-len')).toBeHidden();
    await expectClean(page, seen);
  });
}

test('再生中、締切を過ぎてまだ着いていない列車は、地図で赤い輪と「遅れ」。注文票の締切も赤くなる', async ({ page }) => {
  // 時計は止めておき、決めた分だけ進める（install だけだと実時間で進み、確認を待つ間に列車が着いてしまう）
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  await chipOf(page, 3).click();
  await page.getByRole('button', { name: '発車', exact: true }).click();
  const t3 = page.locator('.chip[data-train="t3"]');
  // 12.6分：締切（13分）の前は、まだ合図が無い
  await page.clock.runFor(6300);
  await expect(t3).not.toHaveClass(/is-late/);
  await expect(page.locator('.ticket[data-train="t3"]')).not.toHaveClass(/is-overdue/);
  // 15分：締切を過ぎて、まだ着いていない（着くのは18分）
  await page.clock.runFor(1200);
  await expect(t3).toHaveClass(/is-late/);
  await expect(t3.locator('.chip__late:visible')).toHaveText('遅れ');
  await expect(page.locator('.ticket[data-train="t3"]')).toHaveClass(/is-overdue/);
  // 焼きにんじんの締切は16分なので、まだ赤くない
  await expect(page.locator('.ticket[data-train="t4"]')).not.toHaveClass(/is-overdue/);
  await expectClean(page, seen);
});

test('地図の高さは面ごと：面1・2は線路の範囲に合わせて低く、面5は盤の高さのまま。ヒントの文', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  const viewBox = () => page.locator('#map-svg').getAttribute('viewBox');
  const ratio = async () => page.locator('#map').evaluate((m) => m.getBoundingClientRect().width / m.getBoundingClientRect().height);
  expect(await viewBox()).toBe('0 34 360 112');
  expect(await ratio()).toBeCloseTo(360 / 112, 1);
  await expect(page.locator('#stage-hint')).toHaveText('地図の分岐ボタンをタップして行き先を選び、「発車」。焼きにんじんは「焼く」だけ。');
  await chipOf(page, 2).click();
  expect(await viewBox()).toBe('0 34 360 112');
  await expect(page.locator('#stage-hint')).toHaveText('同じ焼き場に並ぶと、あとの列車は待たされる。どちらを先に出そう？');
  await chipOf(page, 5).click();
  expect(await viewBox()).toBe('0 0 360 240');
  expect(await ratio()).toBeCloseTo(1.5, 1);
  await expectClean(page, seen);
});

// ---------------------------------------------------------------- 4周目：カードの締切と工程・結果の帯・ジリジリ・呼び方・遅れの置き場所・番号・黄色の縁・元に戻す

test('390×844：面3〜6で、全カードが見える位置のまま、各カードに締切と注文の工程が読める。✔は通る駅が注文どおりのときだけ（✘は出さない）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  for (const n of [3, 4, 5, 6]) {
    await chipOf(page, n).click();
    const level = LEVELS[n - 1];
    // 最後のカードを発車ボタンのすぐ上まで送った位置（全カードが見えるはずの位置）で測る
    await page.locator('.car').last().evaluate((el) => el.scrollIntoView({ block: 'end' }));
    const cards = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const mapBottom = box(document.querySelector('.board__map')).bottom;
      const barTop = box(document.querySelector('#actionbar')).top;
      const shown = (r) => r.width > 0 && r.top >= mapBottom - 0.5 && r.bottom <= barTop + 0.5;
      return [...document.querySelectorAll('.car')].map((car) => ({
        train: car.dataset.train,
        card: shown(box(car)),
        due: car.querySelector('.car__due')?.textContent ?? null,
        dueShown: shown(box(car.querySelector('.car__due'))),
        order: car.querySelector('.car__order-icons')?.textContent ?? null,
        orderShown: shown(box(car.querySelector('.car__order-icons'))),
        steps: car.querySelector('.car__steps-icons').textContent,
        match: Boolean(car.querySelector('.car__match')),
        cross: car.textContent.includes('✘'),
      }));
    });
    expect(cards.length).toBe(level.trains.length);
    for (const c of cards) {
      const o = level.orders.find((x) => x.id === level.trains.find((t) => t.id === c.train).order);
      expect(c.card, `面${n} ${c.train}：カードが地図と発車ボタンのあいだに見える`).toBe(true);
      expect(c.dueShown && c.orderShown, `面${n} ${c.train}：締切と注文の工程が見える`).toBe(true);
      expect(c.due).toBe(`〜${o.due}分`);
      expect(c.order).toBe(stepIcons(o.steps));
      expect(c.match, `面${n} ${c.train}：✔は通る駅（${c.steps}）が注文（${c.order}）と同じときだけ`).toBe(c.steps === c.order);
      expect(c.cross).toBe(false);
    }
  }
  // 面3：お刺身は初め 🔪→🔥 を通る（✔なし）。2つ目の分岐を配膳駅へ回すと 🔪 だけになり ✔、戻すと消える
  await chipOf(page, 3).click();
  const fish = page.locator('.car[data-train="t1"]');
  await expect(fish.locator('.car__match')).toHaveCount(0);
  await page.getByRole('button', { name: '2つ目の分岐 焼く駅（近）へ', exact: true }).click();
  await expect(fish.locator('.car__steps-icons')).toHaveText('🔪');
  await expect(fish.locator('.car__match')).toHaveText('✔');
  await expect(fish.locator('.car__pick')).toHaveAttribute('aria-label', /締切11分。注文は切る。いまの進路で通る駅は切る（注文どおり）、道のり7分$/);
  await page.getByRole('button', { name: '2つ目の分岐 配膳駅へ', exact: true }).click();
  await expect(fish.locator('.car__match')).toHaveCount(0);
  await expectClean(page, seen);
});

// 画面の縦の位置が落ち着くまで待つ（結果を出すときのスクロールは、なめらかに動く）
async function settledScroll(page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === last) return y;
    last = y;
    await page.waitForTimeout(150);
  }
  return last;
}

test('390×844：結果の間は下の帯に「組み直す」（クリアなら「次の面へ」も）。押したあと・面を切り替えたあと、画面は一瞬で止まる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // scrollIntoView に渡した動かし方を記録する（短い距離のなめらかなスクロールは、試験用のブラウザでは一瞬で終わって見分けられないため）
  await page.addInitScript(() => {
    window.__scrolls = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(options) {
      window.__scrolls.push({ target: this.id || this.dataset.train || '', behavior: (options && typeof options === 'object' && options.behavior) || 'auto' });
      return original.call(this, options);
    };
  });
  const lastScroll = () => page.evaluate(() => window.__scrolls.at(-1));
  const seen = await open(page);
  // 失敗（面4の初期設定）：帯に組み直すだけ。結果シートの中には置かない（同じ名前のボタンを2つ作らない）
  await chipOf(page, 4).click();
  await departAndSkip(page);
  const rebuild = page.locator('#actionbar #btn-rebuild');
  await expect(rebuild).toBeVisible();
  await expect(page.locator('#btn-next')).toBeHidden();
  await expect(page.getByRole('button', { name: '組み直す' })).toHaveCount(1);
  const before = await settledScroll(page);
  const inView = await rebuild.evaluate((el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; });
  expect(inView, 'スクロールせずに押せる位置にある').toBe(true);
  // 押した直後と0.7秒後で、画面の位置が変わらない（なめらかに動かすと、この間も動き続ける）
  await rebuild.click();
  const y1 = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(700);
  const y2 = await page.evaluate(() => window.scrollY);
  expect(y1, '組み直すで編成の位置へ動く').not.toBe(before);
  expect(y2, '組み直したあと、画面が動き続けない').toBe(y1);
  expect(await lastScroll()).toEqual({ target: 't1', behavior: 'auto' });
  await expect(page.locator('#formation')).toBeVisible();
  // 面の切替でも同じ。面チップが帯の下に見えている位置（60px 下へ送った所）で押すと、面の題名が見える所へ動く
  await page.evaluate(() => window.scrollTo(0, 60));
  const c0 = await settledScroll(page);
  const chipTop = await chipOf(page, 5).evaluate((el) => el.getBoundingClientRect().top);
  expect(chipTop, '面チップが帯に隠れていない（押す前にスクロールさせない）').toBeGreaterThanOrEqual(44);
  await chipOf(page, 5).click();
  const c1 = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(700);
  expect(c1, '面を切り替えると、選んだ列車のカードが見える位置へ動く').not.toBe(c0);
  expect(await page.evaluate(() => window.scrollY), '面を切り替えたあと、画面が動き続けない').toBe(c1);
  expect(await lastScroll()).toEqual({ target: 't1', behavior: 'auto' });
  // クリア（面1）：帯に「組み直す」と「次の面へ」。次の面へで一瞬で移る
  await chipOf(page, 1).click();
  await solveLevel1ByTap(page);
  await departAndSkip(page);
  await expect(page.locator('#actionbar #btn-next')).toBeVisible();
  await expect(rebuild).toBeVisible();
  await settledScroll(page);
  await page.locator('#actionbar #btn-next').click();
  const n1 = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.scrollY), '次の面へのあと、画面が動き続けない').toBe(n1);
  expect(await lastScroll()).toEqual({ target: 'stage-title', behavior: 'auto' });
  await expect(page.locator('#stage-title')).toContainText('ならんで待つ');
  await expectClean(page, seen);
});

test('面6をクリアした結果では、帯に「次の面へ」が出ない', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 6).click();
  for (let i = 0; i < 2; i++) {
    await departAndSkip(page);
    await page.locator('#actionbar #btn-rebuild').click();
  }
  await page.locator('#btn-sample-edit').click();
  await departAndSkip(page);
  await expect(page.locator('.result__line')).toHaveText('完食！ 21分 見本のダイヤなので★1');
  await expect(page.locator('#actionbar #btn-rebuild')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeHidden();
  await expectClean(page, seen);
});

// 面4：ステーキを3分の焼く駅へ。卵が 9分に仕上がり、出口をふさがれて 11分に焦げる。煮物の列車は 14分に仕上がり 15分に出る（猶予の1分）
for (const speed of [1, 2]) {
  test(`${speed}倍：焦げる前の「ジリジリ」は実時間で1.2秒以上見える。「焦げた！」・時計・運行図の✖・文の分がそろう（面4）`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
    const seen = await open(page);
    await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
    await chipOf(page, 4).click();
    await pickTrain(page, 'ステーキ').click();
    await page.getByRole('button', { name: '分岐 焼く駅（3分）へ', exact: true }).click();
    // 駅の様子が変わるたびに、そのときの（偽の）時刻と時計の文字を記録する
    await page.evaluate(() => {
      window.__fx = [];
      const el = document.querySelector('.station-fx[data-node="G1"]');
      new MutationObserver(() => window.__fx.push({ at: performance.now(), cls: el.getAttribute('class'), clock: document.querySelector('#clock').textContent }))
        .observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    await page.getByRole('button', { name: '発車', exact: true }).click();
    if (speed === 2) await page.getByRole('button', { name: '2倍', exact: true }).click();
    await page.clock.runFor(12000);
    const log = await page.evaluate(() => window.__fx);
    const spans = [];
    let start = null;
    for (const r of log) {
      const on = r.cls.includes('is-sizzle');
      if (on && start === null) start = r.at;
      if (!on && start !== null) {
        spans.push(Math.round(r.at - start));
        start = null;
      }
    }
    // 卵の2分（焦げるまで）と、煮物の列車の1分。どちらも1.2秒以上（画面の1コマ＝約17msの誤差まで）
    expect(spans.length, `ジリジリの回数 ${JSON.stringify(spans)}`).toBe(2);
    for (const ms of spans) expect(ms, `ジリジリが見えた時間 ${JSON.stringify(spans)}`).toBeGreaterThanOrEqual(1183);
    const burn = log.find((r) => r.cls.includes('is-burning'));
    expect(burn.clock, '「焦げた！」が出た瞬間の時計').toBe('🕒 11分');
    // 2倍だと12秒の間に再生が終わっている
    if (await page.locator('#btn-skip').isVisible()) await page.getByRole('button', { name: 'スキップ', exact: true }).click();
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('.chart__burn')).toHaveAttribute('data-minute', '11');
    // 文：9分に仕上がって2分待たされた＝11分
    await expect(page.locator('.result__why').filter({ hasText: '焦げた' })).toHaveText('🔥焼く駅（3分）で、仕上がってから2分待たされて焦げた。出口を『焼き魚』の列車がふさいでいた。');
    await expectClean(page, seen);
  });
}

test('動きを減らす設定では、ジリジリを待たずにすぐ結果が出る', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await open(page);
  await chipOf(page, 4).click();
  await pickTrain(page, 'ステーキ').click();
  await page.getByRole('button', { name: '分岐 焼く駅（3分）へ', exact: true }).click();
  await page.getByRole('button', { name: '発車', exact: true }).click();
  expect(await page.locator('#result').isVisible(), '押した直後に結果が出ている').toBe(true);
  expect(await page.locator('.station-fx.is-sizzle, .station-fx-text.is-sizzle').count()).toBe(0);
  await expectClean(page, seen);
});

// 再生中の「遅れ」の文字と、ほかの物の重なり（画面の座標で）
const lateOverlaps = (page) => page.evaluate(() => {
  const out = [];
  const box = (el) => el.getBoundingClientRect();
  const hit = (a, b, pad = 1) => a.left < b.right - pad && b.left < a.right - pad && a.top < b.bottom - pad && b.top < a.bottom - pad;
  const map = box(document.querySelector('#map'));
  const names = [...document.querySelectorAll('.station__text, .yard__text, .serve__text')].map((el) => ({ what: `「${el.textContent}」`, r: box(el) }));
  const fxLabels = [...document.querySelectorAll('.station-fx-text.is-sizzle .fx__label--sizzle, .station-fx-text.is-burning .fx__label--burn')].map((el) => ({ what: `「${el.textContent}」`, r: box(el) }));
  const clock = document.querySelector('#clock');
  const labels = [...document.querySelectorAll('#map-svg .chip.is-late:not(.is-gone) .chip__late')];
  for (const el of labels) {
    const r = box(el);
    const mine = el.closest('.chip');
    const others = [...document.querySelectorAll('#map-svg .chip:not(.is-gone)')].filter((c) => c !== mine)
      .flatMap((c) => [{ what: `${c.dataset.train}の列車`, r: box(c.querySelector('.chip__disc')) }, { what: `${c.dataset.train}の番号`, r: box(c.querySelector('.chip__no-disc')) }]);
    const otherLabels = labels.filter((x) => x !== el).map((x) => ({ what: `${x.closest('.chip').dataset.train}の遅れ`, r: box(x) }));
    for (const o of [...names, ...fxLabels, ...others, ...otherLabels, ...(clock.hidden ? [] : [{ what: '時計', r: box(clock) }])]) {
      if (hit(r, o.r)) out.push(`${mine.dataset.train}の「遅れ」が${o.what}に重なる`);
    }
    if (r.left < map.left - 0.5 || r.right > map.right + 0.5 || r.top < map.top - 0.5 || r.bottom > map.bottom + 0.5) out.push(`${mine.dataset.train}の「遅れ」が地図の外`);
  }
  return { count: labels.length, problems: out };
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${size.width}×${size.height}：再生中の「遅れ」は、駅・車庫・配膳の名前、ほかの列車と番号、ほかの「遅れ」、時計に重ならない（面2・面3・面6）`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
    const seen = await open(page);
    await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
    const problems = [];
    let checked = 0;
    const play = async (n, minutes) => {
      await page.getByRole('button', { name: '発車', exact: true }).click();
      for (let m = 0; m < minutes * 4; m++) {
        await page.clock.runFor(125); // 1/4分ずつ
        const r = await lateOverlaps(page);
        checked += r.count;
        for (const p of r.problems) problems.push(`面${n} ${(m + 1) / 4}分: ${p}`);
      }
      await page.getByRole('button', { name: 'スキップ', exact: true }).click().catch(() => {});
      await page.locator('#actionbar #btn-rebuild').click();
    };
    // 面2：にんじんを先に、2両とも焼く駅へ（ステーキが遅れる）
    await chipOf(page, 2).click();
    for (const dish of ['焼きにんじん', 'ステーキ']) {
      await pickTrain(page, dish).click();
      await page.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
    }
    await play(2, 11);
    // 面3と面6：初期設定のまま（何両も遅れる）
    await chipOf(page, 3).click();
    await play(3, 21);
    await chipOf(page, 6).click();
    await play(6, 25);
    expect(checked, '遅れの文字を1つも確かめていない').toBeGreaterThan(20);
    expect(problems).toEqual([]);
    await expectClean(page, seen);
  });
}

for (const width of [390, 320]) {
  test(`${width}px：再生中の列車の丸に、出発の番号（編成のカードと同じ）が11px以上で付き、地図の外で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
    const seen = await open(page);
    await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
    await chipOf(page, 6).click();
    // 番号は列車の名前の順ではなく出発の順（ひと口ステーキを1番目にしてから発車）
    await page.getByRole('button', { name: 'ひと口ステーキの列車を1つ前へ', exact: true }).click();
    const order = await page.locator('.car').evaluateAll((els) => els.map((e) => e.dataset.train));
    expect(order[0]).toBe('t2');
    await page.getByRole('button', { name: '発車', exact: true }).click();
    for (const ms of [600, 1500, 2500]) {
      await page.clock.runFor(ms);
      const chips = await page.evaluate(() => {
        const svg = document.querySelector('#map-svg');
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        return [...document.querySelectorAll('#map-svg .chip:not(.is-gone)')].map((c) => {
          const t = c.querySelector('.chip__no-text');
          const disc = c.querySelector('.chip__no-disc').getBoundingClientRect();
          return { train: c.dataset.train, no: t.textContent, px: parseFloat(getComputedStyle(t).fontSize) * scale, shown: disc.width > 0 && disc.left >= svg.getBoundingClientRect().left - 0.5 };
        });
      });
      expect(chips.length).toBeGreaterThan(0);
      for (const c of chips) {
        expect(c.no, `${width}px ${c.train} の番号`).toBe(String(order.indexOf(c.train) + 1));
        expect(c.px, `${width}px ${c.train} の番号の大きさ`).toBeGreaterThanOrEqual(10.95);
        expect(c.shown, `${width}px ${c.train} の番号が地図の外で切れない`).toBe(true);
      }
    }
    await expectClean(page, seen);
  });
}

// 色の明るさの比（WCAG）
const contrast = (a, b) => {
  const lum = (rgb) => {
    const [r, g, bl] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const rgbOf = (s) => s.match(/\d+/g).slice(0, 3).map(Number);

test('黄色（5両目）の経路には濃い縁取りが付く（選んだとき・ほかを選んだとき・再生中）', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 6).click();
  const caseOf = (state) => page.locator(`.route__case.tc-t5.${state}`).evaluate((el) => {
    const cs = getComputedStyle(el);
    const route = el.nextElementSibling;
    return { stroke: cs.stroke, width: parseFloat(cs.strokeWidth), routeWidth: parseFloat(getComputedStyle(route).strokeWidth), routeClass: route.getAttribute('class') };
  });
  await pickTrain(page, '焼きにんじん').click();
  for (const state of ['route--on']) {
    const c = await caseOf(state);
    expect(c.stroke).not.toBe('none');
    expect(c.width).toBeGreaterThan(c.routeWidth);
    expect(c.routeClass).toContain('tc-t5');
    expect(contrast(rgbOf(c.stroke), [251, 236, 208]), '縁の色と地図の地の明るさの比').toBeGreaterThanOrEqual(3);
  }
  await pickTrain(page, 'お刺身').click();
  const off = await caseOf('route--off');
  expect(off.stroke).not.toBe('none');
  expect(off.width).toBeGreaterThan(off.routeWidth);
  // ほかの色には縁を付けない（黄色だけが薄かった）
  expect(await page.locator('.route__case.tc-t1').first().evaluate((el) => getComputedStyle(el).stroke)).toBe('none');
  await page.getByRole('button', { name: '発車', exact: true }).click();
  expect((await caseOf('route--off')).stroke).not.toBe('none');
  await expectClean(page, seen);
});

test('見本のダイヤを反映した直後の一言は、ふつうの一言と同じく約3秒で消える。押せる部品は付かず、「元に戻す」は編成の下の注意書きにある', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  await sampleOnLevel2(page);
  await expect(page.locator('#toast')).toHaveText('見本のダイヤを出した');
  // 一言に押せる部品を付けると、地図の上に長く居座り、注意書きの「元に戻す」と重複する
  await expect(page.locator('#toast').getByRole('button')).toHaveCount(0);
  await expect(page.locator('#sample-note').getByRole('button', { name: /元に戻す/ })).toBeVisible();
  await page.mouse.move(1, 1);
  await page.clock.runFor(3200);
  await expect(page.locator('#toast')).not.toHaveClass(/is-on/);
  // 一言が消えたあとも、注意書きの「元に戻す」は残る
  await expect(page.locator('#sample-note').getByRole('button', { name: /元に戻す/ })).toBeVisible();
  await expectClean(page, seen);
});

test('320×568：面3の見本の運行図で、行の名前は「近」「遠」と線路の長さで呼び、図の左端で切れない（上・下は使わない）', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const seen = await open(page);
  await chipOf(page, 3).click();
  for (let i = 0; i < 2; i++) {
    await departAndSkip(page);
    await page.locator('#actionbar #btn-rebuild').click();
  }
  await page.locator('#btn-sample-edit').click();
  await departAndSkip(page);
  const labels = await page.locator('.chart__svg').evaluate((svg) => {
    const left = svg.getBoundingClientRect().left;
    return [...svg.querySelectorAll('.chart__label')].map((t) => ({ text: t.textContent, inside: t.getBoundingClientRect().left >= left - 0.5 }));
  });
  expect(labels.map((l) => l.text)).toEqual(['出庫線', '🔪切る', '🔥焼く（近）', '🔥焼く（遠）', '配膳の手前（1分）', '配膳の手前（2分）']);
  for (const l of labels) expect(l.inside, `「${l.text}」が図の左端で切れる`).toBe(true);
  await expect(page.locator('#result')).not.toContainText('（上）');
  await expect(page.locator('#result')).not.toContainText('（下）');
  await expectClean(page, seen);
});

// ---------------------------------------------------------------- 5周目：元に戻すの置き場所・合流のきまり・待たせた相手・短い道・時間の失い先・カード・細部・キーボード

// 面2で、にんじん先・2両とも焼く駅へ、のまま2回失敗して見本を出す（時計は止めておく）
async function sampleOnLevel2(page) {
  await chipOf(page, 2).click();
  for (const dish of ['焼きにんじん', 'ステーキ']) {
    await pickTrain(page, dish).click();
    await page.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
  }
  for (let i = 0; i < 2; i++) {
    await departAndSkip(page);
    await page.locator('#actionbar #btn-rebuild').click();
  }
  await page.locator('#btn-sample-edit').click();
  await page.clock.runFor(50);
}

test('見本を出して15秒たっても、編成の下の注意書きの「元に戻す」で、見本を出す前の出発順と進路に戻る', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  await sampleOnLevel2(page);
  await expect(page.locator('.car').first()).toHaveAttribute('data-train', 't2');
  // 一言（10秒）が消えたあとも、注意書きの中に残る
  await page.mouse.move(1, 1);
  await page.clock.runFor(15000);
  await expect(page.locator('#toast')).not.toHaveClass(/is-on/);
  const undo = page.locator('#sample-note').getByRole('button', { name: /元に戻す/ });
  await expect(undo).toBeVisible();
  await undo.click();
  await page.clock.runFor(50);
  await expect(page.locator('.car').first()).toHaveAttribute('data-train', 't1');
  await expect(page.locator('.car[data-train="t1"] .car__steps-icons')).toHaveText('🔥');
  await expect(page.locator('.car[data-train="t2"] .car__steps-icons')).toHaveText('🔥');
  await expect(page.locator('#sample-note')).toBeHidden();
  // もう一度見本を出し、組み方を変えると「元に戻す」は消える（並べ替えて戻しても出てこない）
  await page.locator('#btn-sample-edit').click();
  await page.clock.runFor(50);
  await expect(undo).toBeVisible();
  await page.getByRole('button', { name: 'ステーキの列車を1つ後ろへ' }).click();
  await expect(page.locator('#sample-note')).toBeHidden();
  await page.getByRole('button', { name: 'ステーキの列車を1つ前へ' }).click();
  await expect(page.locator('#sample-note')).toBeVisible();
  await expect(undo).toHaveCount(0);
  // 発車したら消える（組み直しても出てこない）
  await expectClean(page, seen);
});

// 面5：ロースト→ステーキ→ひと口→お刺身、どれも工程どおりの進路にする
async function level5MergeOrder(page) {
  await chipOf(page, 5).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'ローストビーフの列車を1つ前へ' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'お刺身の列車を1つ後ろへ' }).click();
  await expect(page.locator('.car')).toHaveCount(4);
  expect(await page.locator('.car').evaluateAll((els) => els.map((e) => e.dataset.train))).toEqual(['t4', 't2', 't3', 't1']);
  // ローストビーフ：最初の分岐を2回（切る駅→分岐→下の焼く駅）。ステーキ：1回。お刺身：2つ目の分岐を1回（配膳へ）
  await pickTrain(page, 'ローストビーフ').click();
  for (let i = 0; i < 2; i++) await page.locator('.switch[data-node="J1"]').click();
  await pickTrain(page, 'ステーキ').click();
  await page.locator('.switch[data-node="J1"]').click();
  await pickTrain(page, 'お刺身').click();
  await page.locator('.switch[data-node="J2"]').click();
  for (const t of ['t4', 't2', 't3', 't1']) await expect(page.locator(`.car[data-train="${t}"] .car__match`)).toHaveCount(1);
}

test('合流のきまり：面5［ローストビーフ→ステーキ→ひと口ステーキ→お刺身］で、お刺身の文に待たせた2両の名前と分数が出る', async ({ page }) => {
  const seen = await open(page);
  await level5MergeOrder(page);
  await departAndSkip(page);
  await expect(page.locator('.result__row.tc-t1 .result__why')).toHaveText('お刺身が2分遅れ。配膳の手前で『ローストビーフ』に1分、『ひと口ステーキ』に1分待たされた（合計2分）。ほかでも1分待った。待たされなければ11分に着いた。');
  await expectClean(page, seen);
});

test('★1・★2のクリアには、時間をどこで失ったかが1行出る（面5で15分・★1）。★3と見本には出ない', async ({ page }) => {
  const seen = await open(page);
  await level5MergeOrder(page);
  // お刺身をひと口ステーキの前へ（ロースト→ステーキ→お刺身→ひと口）
  await page.getByRole('button', { name: 'お刺身の列車を1つ前へ' }).click();
  await departAndSkip(page);
  await expect(page.locator('.result__line')).toHaveText('完食！ 15分 あと2分で★★★');
  await expect(page.locator('.result__loss')).toHaveText('最短は13分。あと2分縮められる。いちばん待たされたのは『ひと口ステーキ』（🔪切る駅（近）の手前で1分）');
  // ★3（面1）には出ない
  await chipOf(page, 1).click();
  await solveLevel1ByTap(page);
  await departAndSkip(page);
  await expect(page.locator('.result__loss')).toHaveCount(0);
  await expectClean(page, seen);
});

test('編成のカード：通る駅の行に道のり。分岐を切り替えると変わる。組み直した直後は前回の結果の札が出て、発車・面の切替・見本で消える', async ({ page }) => {
  const seen = await open(page);
  // 面3：にんじんを遠い焼き場へ回すと、道のりが2分増える（焼き場への行きと帰りの線路が、それぞれ1分長い）
  await chipOf(page, 3).click();
  const carrot = page.locator('.car[data-train="t4"] .car__route');
  const before = Number((await carrot.textContent()).match(/\d+/)[0]);
  await pickTrain(page, '焼きにんじん').click();
  await page.getByRole('button', { name: '3つ目の分岐 焼く駅（近）へ', exact: true }).click();
  const after = Number((await carrot.textContent()).match(/\d+/)[0]);
  expect(after - before).toBe(2);
  // 面5のローストビーフは、発車前から道のり12分（下の焼く駅→切る駅）
  await chipOf(page, 5).click();
  await pickTrain(page, 'ローストビーフ').click();
  for (let i = 0; i < 2; i++) await page.locator('.switch[data-node="J1"]').click();
  await expect(page.locator('.car[data-train="t4"] .car__route')).toHaveText('道のり12分');
  // 面2：失敗→組み直すと、前回の札（成功は ✔ と着いた分、失敗は ✘ と理由）
  await chipOf(page, 2).click();
  for (const dish of ['焼きにんじん', 'ステーキ']) {
    await pickTrain(page, dish).click();
    await page.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
  }
  await departAndSkip(page);
  await page.locator('#actionbar #btn-rebuild').click();
  await expect(page.locator('.car[data-train="t1"] .car__prev')).toHaveText('前回 ✔ 7分');
  await expect(page.locator('.car[data-train="t2"] .car__prev')).toHaveText('前回 ✘ 2分遅れ');
  await expect(pickTrain(page, 'ステーキ')).toHaveAttribute('aria-label', /前回は失敗（2分遅れ）$/);
  // 発車すると消える
  await page.getByRole('button', { name: '発車', exact: true }).click();
  await expect(page.locator('.car__prev')).toHaveCount(0);
  await page.getByRole('button', { name: 'スキップ', exact: true }).click();
  await page.locator('#actionbar #btn-rebuild').click();
  await expect(page.locator('.car__prev')).toHaveCount(2);
  // 見本を出すと消える（2回失敗しているので出せる）
  await page.locator('#btn-sample-edit').click();
  await expect(page.locator('.car__prev')).toHaveCount(0);
  // 面を替えると消える
  await page.getByRole('button', { name: /元に戻す/ }).first().click();
  await departAndSkip(page);
  await page.locator('#actionbar #btn-rebuild').click();
  await expect(page.locator('.car__prev')).toHaveCount(2);
  await chipOf(page, 1).click();
  await chipOf(page, 2).click();
  await expect(page.locator('.car__prev')).toHaveCount(0);
  await expectClean(page, seen);
});

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`${size.width}×${size.height}：面を切り替えた直後は面の名前と指示文が見え、組み直した直後は選んでいるカードが固定した地図と下の帯のあいだに全部見える（面4〜6）`, async ({ page }) => {
    await page.setViewportSize(size);
    const seen = await open(page);
    const visible = () => page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const map = box(document.querySelector('.board__map'));
      const bar = box(document.querySelector('#actionbar'));
      const car = box(document.querySelector('.car.is-selected'));
      return { top: car.top - map.bottom, bottom: bar.top - car.bottom };
    });
    for (const n of [4, 5, 6]) {
      await chipOf(page, n).click();
      // 面を切り替えたら、新しい面の名前と指示文が見える所（いちばん上）へ戻る。1両目のカードは、スクロールして出す
      // （カードを先に見せると、面の名前と指示文が画面の外に出て、何をする面か分からなかった）
      const head = await page.evaluate(() => ({
        scrollY: window.scrollY,
        titleTop: document.querySelector('#stage-title').getBoundingClientRect().top,
        hintBottom: document.querySelector('#stage-hint').getBoundingClientRect().bottom,
        vh: window.innerHeight,
      }));
      expect(head.scrollY, `面${n} 切替：いちばん上へ戻る`).toBe(0);
      expect(head.titleTop, `面${n} 切替：面の名前が画面の中`).toBeGreaterThanOrEqual(0);
      expect(head.hintBottom, `面${n} 切替：指示文が画面の中`).toBeLessThanOrEqual(head.vh);
      await departAndSkip(page);
      await page.locator('#actionbar #btn-rebuild').click();
      const v = await visible();
      expect(v.top, `面${n} 組み直し：カードの上端が地図の下端より下`).toBeGreaterThanOrEqual(-0.5);
      expect(v.bottom, `面${n} 組み直し：カードの下端が帯の上端より上`).toBeGreaterThanOrEqual(-0.5);
    }
    await expectClean(page, seen);
  });
}

// 編成の見出し（「編成 上から順に出発（最短1分おき）」）が2行に折り返すと、1両目のカードが発車の帯の下へ落ちる（5周目に375×667で実際に起きた）
for (const width of [375, 320]) {
  test(`${width}px：編成の見出しは「上から順に出発（最短1分おき）」で、1行に収まる`, async ({ page }) => {
    await page.setViewportSize({ width, height: 667 });
    const seen = await open(page);
    const sub = page.locator('#formation-title .section-title__sub');
    await expect(sub).toHaveText('上から順に出発（最短1分おき）');
    const rects = await sub.evaluate((el) => el.getClientRects().length); // 折り返すと、行ごとに1つずつ増える
    expect(rects, '見出しが2行以上に折り返している').toBe(1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await expectClean(page, seen);
  });
}

test('375×667：面1・面2を開いた直後に、1両目のカードが固定した発車の帯の上に全部見える', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const seen = await open(page);
  for (const n of [1, 2]) {
    await chipOf(page, n).click();
    const m = await page.evaluate(() => {
      window.scrollTo(0, 0);
      const card = document.querySelector('.car').getBoundingClientRect();
      const bar = document.querySelector('#actionbar').getBoundingClientRect();
      return { cardBottom: card.bottom, barTop: bar.top };
    });
    expect(m.cardBottom, `面${n}：1両目のカードの下端が、発車の帯の上端より上にある`).toBeLessThanOrEqual(m.barTop + 0.5);
  }
  await expectClean(page, seen);
});

test('375×667：面3で、✔ の付いたカードも「道のり」が折り返さず、全カードの高さがそろう', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const seen = await open(page);
  await chipOf(page, 3).click();
  // ひと口ステーキは、初めから通る駅が注文どおり（✔）。✔ の分だけ幅が要る
  await expect(page.locator('.car[data-train="t3"] .car__match')).toHaveCount(1);
  const heights = await page.locator('.car').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size, `カードの高さがそろっていない：${heights.join(', ')}`).toBe(1);
  await expectClean(page, seen);
});

// 発車直後（0.4分）に、時計と車庫の上で待つ列車（丸と番号）が重ならない
for (const width of [390, 320]) {
  test(`${width}px：発車直後、地図の時計が車庫の上で待つ列車に重ならない（全6面）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
    const seen = await open(page);
    await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
    const problems = [];
    for (const level of LEVELS) {
      await chipOf(page, level.no).click();
      await page.getByRole('button', { name: '発車', exact: true }).click();
      for (const ms of [200, 600]) {
        await page.clock.runFor(ms - (ms === 600 ? 200 : 0));
        for (const p of await page.evaluate(() => {
          const clock = document.querySelector('#clock').getBoundingClientRect();
          const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          return [...document.querySelectorAll('#map-svg .chip:not(.is-gone)')].flatMap((c) => [c.querySelector('.chip__disc'), c.querySelector('.chip__no-disc')]
            .filter((el) => hit(el.getBoundingClientRect(), clock)).map(() => `${c.dataset.train} が時計に隠れる`));
        })) problems.push(`面${level.no}: ${p}`);
      }
      await page.getByRole('button', { name: 'スキップ', exact: true }).click();
      await page.locator('#actionbar #btn-rebuild').click();
    }
    expect(problems).toEqual([]);
    await expectClean(page, seen);
  });
}

// 列車の丸と番号の重なり（番号の丸が、ほかの列車の丸か番号に隠れていないか）
const badgeHidden = (page) => page.evaluate(() => {
  const out = [];
  const circle = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 }; };
  const chips = [...document.querySelectorAll('#map-svg .chip:not(.is-gone)')].filter((c) => !c.classList.contains('is-queued'));
  const all = [...document.querySelectorAll('#map-svg .chip:not(.is-gone)')];
  for (const c of chips) {
    const no = circle(c.querySelector('.chip__no-disc'));
    for (const o of all) {
      if (o === c) continue;
      for (const part of [o.querySelector('.chip__disc'), o.querySelector('.chip__no-disc')]) {
        const q = circle(part);
        if (Math.hypot(no.x - q.x, no.y - q.y) < no.r + q.r - 2.5) out.push(`${c.dataset.train}の番号に${o.dataset.train}が重なる`);
      }
    }
  }
  return out;
});

test('合流の手前で丸が重ならず、出発の番号が読める（面5・面6、再生中の各時刻）', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  const problems = [];
  const play = async (n, minutes) => {
    await page.getByRole('button', { name: '発車', exact: true }).click();
    for (let m = 0; m < minutes * 4; m++) {
      await page.clock.runFor(125);
      for (const p of await badgeHidden(page)) problems.push(`面${n} ${(m + 1) / 4}分: ${p}`);
    }
    await page.getByRole('button', { name: 'スキップ', exact: true }).click().catch(() => {});
    await page.locator('#actionbar #btn-rebuild').click();
  };
  await level5MergeOrder(page);
  await play(5, 15);
  await chipOf(page, 6).click();
  await play(6, 25);
  expect(problems).toEqual([]);
  await expectClean(page, seen);
});

test('「焦げた！」の文字は、焦げて駅を出ていく列車より手前に描かれる（面4・煮る2両を続けて）', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  await chipOf(page, 4).click();
  // 焼き魚を4分の焼く駅へ、ゆで卵・にんじんの煮物を煮る駅へ（煮物が12分に仕上がり、14分に焦げて出る）
  await pickTrain(page, '焼き魚').click();
  await page.locator('.switch[data-node="J1"]').click();
  for (const dish of ['ゆで卵', 'にんじんの煮物']) {
    await pickTrain(page, dish).click();
    for (let i = 0; i < 2; i++) await page.locator('.switch[data-node="J1"]').click();
  }
  await page.getByRole('button', { name: '発車', exact: true }).click();
  // 「焦げた！」が出るまで進め、出ている間（焦げた列車が駅を出て、文字の横を通る）に何度か確かめる
  const text = page.locator('.station-fx-text[data-node="M"]');
  for (let i = 0; i < 400 && !(await text.getAttribute('class')).includes('is-burning'); i++) await page.clock.runFor(50);
  await expect(text).toHaveClass(/is-burning/);
  const covered = [];
  let chipsNear = 0;
  for (let k = 0; k < 8; k++) {
    const r = await page.locator('.station-fx-text[data-node="M"] .fx__label--burn').evaluate((el) => {
      const b = el.getBoundingClientRect();
      const out = [];
      let near = 0;
      for (let i = 1; i <= 7; i++) {
        const x = b.left + (b.width * i) / 8;
        const y = b.top + b.height / 2;
        const top = document.elementFromPoint(x, y);
        if (!top || !top.closest('.station-fx-text')) out.push(`${Math.round(x)},${Math.round(y)}: ${top?.closest('.chip')?.dataset.train ?? top?.tagName}`);
        // 文字の下（同じ点）に列車の丸があるか（文字が上にあるから見えないだけで、重なってはいる）
        if (document.elementsFromPoint(x, y).some((e) => e.closest('#map-svg .chip'))) near += 1;
      }
      return { out, near };
    });
    covered.push(...r.out);
    chipsNear += r.near;
    await page.clock.runFor(60);
  }
  expect(chipsNear, '焦げた列車が文字の位置を通らなかった（確かめになっていない）').toBeGreaterThan(0);
  expect(covered, '「焦げた！」の上に列車が描かれている').toEqual([]);
  await expectClean(page, seen);
});

test('1440×900：面6で、下の発車の帯がどのカードにも地図にも重ならない（帯は地図の下）。面1でも地図に重ならない', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const seen = await open(page);
  for (const n of [6, 1, 5]) {
    await chipOf(page, n).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const r = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const bar = box(document.querySelector('.actionbar__inner'));
      return {
        cars: [...document.querySelectorAll('.car')].filter((c) => hit(box(c), bar)).map((c) => c.dataset.train),
        map: hit(box(document.querySelector('#map')), bar),
        inView: bar.bottom <= window.innerHeight,
      };
    });
    expect(r.cars, `面${n}：帯に重なるカード`).toEqual([]);
    expect(r.map, `面${n}：帯が地図に重なる`).toBe(false);
    expect(r.inView, `面${n}：発車ボタンがスクロールせずに見える`).toBe(true);
  }
  // 結果の間も、組み直す・次の面へは左の列の下で、スクロールせずに押せる
  await chipOf(page, 1).click();
  await solveLevel1ByTap(page);
  await departAndSkip(page);
  const inView = await page.locator('#actionbar #btn-next').evaluate((el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; });
  expect(inView).toBe(true);
  await expectClean(page, seen);
});

test('キーボード：カードで Enter を押して選んだあと、↓↑で隣のカードへ、Tab で地図の分岐ボタンへ進める（面2）', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 2).click();
  const focused = (selector) => page.evaluate((sel) => Boolean(document.activeElement?.matches(sel)), selector);
  await pickTrain(page, '焼きにんじん').focus();
  await page.keyboard.press('ArrowDown');
  expect(await focused('.car[data-train="t2"] .car__pick'), '↓で2番目のカードへ').toBe(true);
  await page.keyboard.press('Enter');
  await expect(pickTrain(page, 'ステーキ')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  expect(await focused('.switch'), 'Tab で地図の分岐ボタンへ').toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('.car[data-train="t2"] .car__steps-icons')).toHaveText('🔥');
  // 分岐ボタンから Tab で編成へ戻り、↑↓でカードを行き来できる
  await page.keyboard.press('Tab');
  expect(await focused('.car__pick'), '分岐ボタンの次は編成のカード').toBe(true);
  await page.keyboard.press('ArrowDown');
  expect(await focused('.car[data-train="t2"] .car__pick')).toBe(true);
  await page.keyboard.press('ArrowUp');
  expect(await focused('.car[data-train="t1"] .car__pick')).toBe(true);
  // 選んでいないカードでの Tab はふつうの順（▼へ）
  await page.keyboard.press('Tab');
  expect(await focused('.car[data-train="t1"] .car__move')).toBe(true);
  await expectClean(page, seen);
});

test('キーボード：Tab を地図へ送るのは、Enter/Space で選んだ直後の1回だけ。選んであるだけのカードの Tab は先へ進み、発車に届く（面2）', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 2).click();
  const focused = (selector) => page.evaluate((sel) => Boolean(document.activeElement?.matches(sel)), selector);
  // 面を開いた直後から選ばれている1番目のカード（Enter は押していない）：Tab は分岐ボタンへ戻らず、次の部品（▼）へ進む。
  // ここで戻すと、カード⇄分岐ボタンを往復して発車に届かない（キーボードトラップ）
  await pickTrain(page, '焼きにんじん').focus();
  await page.keyboard.press('Tab');
  expect(await focused('.car[data-train="t1"] .car__move'), '選んであるだけのカードの Tab は次の部品へ').toBe(true);
  const visited = [];
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press('Tab');
    visited.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName));
    reached = await focused('#btn-depart');
  }
  expect(reached, `発車に届かない（${visited.join(' → ')}）`).toBe(true);
  // Enter で選んだ直後は、Tab が地図の分岐ボタンへ。そこから戻って、↓で選んであるカードへ着いたあとの Tab は、先へ進む
  await pickTrain(page, 'ステーキ').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  expect(await focused('.switch'), 'Enter で選んだ直後の Tab は分岐ボタンへ').toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  expect(await focused('.car[data-train="t2"] .car__pick'), '↓で選んであるカードへ').toBe(true);
  await page.keyboard.press('Tab');
  expect(await focused('.car[data-train="t2"] .car__move'), '選んだ直後ではないので、Tab は次の部品（▲）へ').toBe(true);
  await expectClean(page, seen);
});

// 運行図の帯と結果の行に、出発番号（地図の丸・編成のカードと同じ）が付く。色だけで列車を見分けさせない
test('運行図の帯と結果の行に、出発番号が付く（面5：1ローストビーフ・2ステーキ・3ひと口ステーキ・4お刺身）', async ({ page }) => {
  const seen = await open(page);
  await level5MergeOrder(page);
  await departAndSkip(page);
  const expected = { 'tc-t4': '1', 'tc-t2': '2', 'tc-t3': '3', 'tc-t1': '4' };
  const rows = await page.locator('.result__row').evaluateAll((els) => els.map((e) => ({ tc: [...e.classList].find((c) => c.startsWith('tc-')), no: e.querySelector('.result__no')?.textContent })));
  expect(rows.length).toBe(4);
  for (const r of rows) expect(r.no, `${r.tc} の結果の行の番号`).toBe(expected[r.tc]);
  const { marks, thin } = await page.locator('.chart__svg').evaluate((svg) => {
    const R = 6.5; // 番号の丸の半径（lib/chart.js の NO_R）。丸の中心は、帯の左端から R+2
    const bars = [...svg.querySelectorAll('.bar--solid')].map((b) => ({ x: +b.getAttribute('x'), y: +b.getAttribute('y'), w: +b.getAttribute('width'), h: +b.getAttribute('height'), tc: [...b.classList].find((c) => c.startsWith('tc-')) }));
    const discs = [...svg.querySelectorAll('.chart__no')].map((g) => ({ cx: +g.querySelector('circle').getAttribute('cx'), cy: +g.querySelector('circle').getAttribute('cy'), no: g.querySelector('text').textContent }));
    const onBar = (b, d) => Math.abs(b.x + R + 2 - d.cx) < 0.6 && Math.abs(b.y + b.h / 2 - d.cy) < 0.6;
    const marks = discs.map((d) => {
      const bar = bars.find((b) => onBar(b, d));
      return { no: d.no, tc: bar?.tc, w: bar?.w };
    });
    // 丸の入る幅（17px）がある帯には、必ず番号が付いている
    const thin = bars.filter((b) => b.w >= R * 2 + 4).filter((b) => !discs.some((d) => onBar(b, d))).length;
    return { marks, thin };
  });
  expect(marks.length, '運行図の帯に番号が1つも付いていない').toBeGreaterThan(0);
  for (const m of marks) {
    expect(m.tc, '番号が帯の上に置かれていない').toBeTruthy();
    expect(m.no, `${m.tc} の帯の番号`).toBe(expected[m.tc]);
    expect(m.w, '丸が入らない細い帯に番号が付いている').toBeGreaterThanOrEqual(17);
  }
  expect(new Set(marks.map((m) => m.tc)).size, '4両すべての列車に、番号の付いた帯がある').toBe(4);
  expect(thin, '17px以上の帯なのに番号が付いていない帯がある').toBe(0);
  await expectClean(page, seen);
});

// ---------------------------------------------------------------- 7周目：見た目評価2周目の指摘（折り返し・結果画面・小さなスマホ・通知・焦げの印）

test('結果の行は、失敗を先に並べる（出発番号の丸はそのまま）', async ({ page }) => {
  const seen = await open(page);
  await level5MergeOrder(page); // お刺身だけが遅れて失敗する並び
  await departAndSkip(page);
  const rows = await page.locator('.result__row').evaluateAll((els) => els.map((e) => ({ ng: e.classList.contains('is-ng'), no: e.querySelector('.result__no')?.textContent })));
  expect(rows.length).toBe(4);
  expect(rows[0].ng, '1行目は失敗').toBe(true);
  expect(rows.slice(1).every((r) => !r.ng), '成功は失敗のあと').toBe(true);
  expect(rows[0].no, '失敗の行の出発番号（お刺身は4番目に出発）').toBe('4');
  await expectClean(page, seen);
});

test('結果のあいだは、注文票に選択枠を残さない（成功した注文の橙の枠は、失敗の印に見える）', async ({ page }) => {
  const seen = await open(page);
  await expect(page.locator('.ticket.is-selected')).toHaveCount(1); // 編集中は、選んだ列車の注文票に枠
  await solveLevel1ByTap(page);
  await departAndSkip(page);
  await expect(page.locator('.ticket.is-selected')).toHaveCount(0);
  await page.locator('#actionbar #btn-rebuild').click();
  await expect(page.locator('.ticket.is-selected')).toHaveCount(1); // 組み直すと、また付く
  await expectClean(page, seen);
});

test('375×667：2回失敗した結果で、見本の入口が結果の一行のすぐ下にあり、スクロールなしで見える。結果シートの先頭は画面の上端', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const seen = await open(page);
  await chipOf(page, 2).click();
  for (const dish of ['焼きにんじん', 'ステーキ']) {
    await pickTrain(page, dish).click();
    await page.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
  }
  for (let i = 0; i < 2; i++) {
    await departAndSkip(page);
    if (i === 0) await page.locator('#actionbar #btn-rebuild').click();
  }
  await settledScroll(page);
  const m = await page.evaluate(() => {
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    return {
      resultTop: box('#result').top, // 小さなスマホでは帯は固定しないので、画面の上端が基準
      sampleBottom: box('#btn-sample').bottom,
      barTop: box('#actionbar').top,
      firstRowTop: box('.result__row').top,
      sampleTop: box('#btn-sample').top,
      lineBottom: box('.result__line').bottom,
      scrolled: window.scrollY,
    };
  });
  expect(m.scrolled, '結果が出るとスクロールする（試験の前提）').toBeGreaterThan(0);
  expect(m.resultTop, '結果シートの先頭が、画面の上端にある（地図の切れ端を残さない）').toBeGreaterThanOrEqual(-1);
  expect(m.resultTop, '結果シートの先頭が、画面の上端にある（地図の切れ端を残さない）').toBeLessThanOrEqual(40);
  expect(m.sampleBottom, '見本の入口が、スクロールなしで見える（帯の上）').toBeLessThanOrEqual(m.barTop);
  expect(m.sampleTop, '見本の入口は、一行の結果のすぐ下（失敗の行より上）').toBeGreaterThanOrEqual(m.lineBottom - 0.5);
  expect(m.sampleTop).toBeLessThanOrEqual(m.firstRowTop);
  await expectClean(page, seen);
});

test('最後の面（面6）をクリアしたあとの帯は、「組み直す」が主役（濃い色）で、「次の面へ」は出ない', async ({ page }) => {
  const seen = await open(page);
  await chipOf(page, 6).click();
  for (let i = 0; i < 2; i++) {
    await departAndSkip(page);
    if (i === 0) await page.locator('#actionbar #btn-rebuild').click();
  }
  await page.locator('#btn-sample').click();
  await departAndSkip(page);
  await expect(page.locator('.result__line')).toContainText('完食');
  await expect(page.locator('#btn-next')).toBeHidden();
  await expect(page.locator('#btn-rebuild')).toHaveClass(/btn--depart/);
  // 途中の面（面1）をクリアしたときは、「組み直す」は控えめで、「次の面へ」が主役
  await chipOf(page, 1).click();
  await solveLevel1ByTap(page);
  await departAndSkip(page);
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-rebuild')).toHaveClass(/btn--play/);
  await expectClean(page, seen);
});

test('375×667：帯は固定せず、編集中は注文票を出さない（編成を広く見せる）。再生と結果のあいだは注文票を出す', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const seen = await open(page);
  await chipOf(page, 6).click();
  expect(await positionOf(page, '.band'), '帯は固定しない').toBe('static');
  await expect(page.locator('#orders')).toBeHidden();
  // 地図は画面の上端に固定される。編成のカードが3枚以上、固定した地図と下の帯のあいだに見える
  await page.locator('.car').last().evaluate((el) => el.scrollIntoView({ block: 'end' }));
  const at = await page.evaluate(() => {
    const map = document.querySelector('.board__map').getBoundingClientRect();
    const bar = document.querySelector('#actionbar').getBoundingClientRect();
    const cars = [...document.querySelectorAll('.car')].map((c) => c.getBoundingClientRect());
    return { mapTop: map.top, visible: cars.filter((c) => c.top >= map.bottom - 0.5 && c.bottom <= bar.top + 0.5).length };
  });
  expect(Math.abs(at.mapTop), '地図が画面の上端に固定されている').toBeLessThanOrEqual(1);
  expect(at.visible, '面6：固定した地図と帯のあいだに、列車カードが3枚以上見える').toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: '発車', exact: true }).click();
  await expect(page.locator('#orders')).toBeVisible(); // 再生中は注文票に✔が付いていく
  await page.getByRole('button', { name: 'スキップ', exact: true }).click();
  await expect(page.locator('#orders')).toBeVisible();
  await expectClean(page, seen);
});

test('一言（通知）は、地図の上ではなく、下の帯のすぐ上に出る。分岐ボタンや駅の札を覆わない', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  await sampleOnLevel2(page);
  await expect(page.locator('#toast')).toHaveText('見本のダイヤを出した');
  const m = await page.evaluate(() => {
    const toast = document.querySelector('#toast').getBoundingClientRect();
    const bar = document.querySelector('#actionbar').getBoundingClientRect();
    const map = document.querySelector('#map').getBoundingClientRect();
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      position: getComputedStyle(document.querySelector('#toast')).position,
      aboveBar: bar.top - toast.bottom,
      onMap: overlaps(toast, map),
    };
  });
  expect(m.position).toBe('fixed');
  expect(m.aboveBar, '通知の下端が、帯の上端より上').toBeGreaterThanOrEqual(0);
  expect(m.onMap, '通知が地図に重ならない').toBe(false);
  await expectClean(page, seen);
});

test('焦げた列車の丸には、黒くなるだけでなく ✖ が付く（色以外の手がかり）', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
  const seen = await open(page);
  await page.clock.pauseAt(new Date('2026-10-12T09:00:05Z'));
  await chipOf(page, 4).click();
  await pickTrain(page, 'ステーキ').click();
  await page.getByRole('button', { name: '分岐 焼く駅（3分）へ', exact: true }).click();
  await page.getByRole('button', { name: '発車', exact: true }).click();
  const burnt = page.locator('#map-svg .chip.is-burnt');
  // 焦げる前は ✖ が見えない
  await page.clock.runFor(3000);
  expect(await page.locator('#map-svg .chip__burn').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  // 焦げたあと（11分より後）は、焦げた列車の ✖ が見える
  for (let i = 0; i < 60 && (await burnt.count()) === 0; i++) await page.clock.runFor(250);
  await expect(burnt).toHaveCount(1);
  expect(await burnt.locator('.chip__burn').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await burnt.locator('.chip__burn').textContent()).toBe('✖');
  await expectClean(page, seen);
});

for (const width of [390, 320]) {
  test(`${width}px：指示文・結果の文・凡例は、文節のかたまり（nowrap の span）で折り返す。文字そのものは変わらない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const seen = await open(page);
    for (const L of LEVELS) {
      await chipOf(page, L.no).click();
      const hint = page.locator('#stage-hint');
      await expect(hint).toHaveText(L.hint);
      expect(await hint.locator('.nw').count(), `面${L.no} の指示文にかたまりがある`).toBeGreaterThanOrEqual(3);
      expect(await overflow(page), `面${L.no}：横にはみ出さない`).toBeLessThanOrEqual(1);
    }
    await chipOf(page, 2).click();
    for (const dish of ['焼きにんじん', 'ステーキ']) {
      await pickTrain(page, dish).click();
      await page.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
    }
    await departAndSkip(page); // にんじんを先に出して、ステーキが遅れて失敗する
    const why = page.locator('.result__why').first();
    expect(await why.locator('.nw').count(), '原因の文にかたまりがある').toBeGreaterThanOrEqual(3);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // かたまりの途中で改行しない：どの span も1行に収まる（nowrap の span が割れていない）
    const broken = await page.locator('.result__why .nw, .chart__legend .nw, #stage-hint .nw').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 1).map((e) => e.textContent));
    expect(broken, '割れたかたまりがある').toEqual([]);
    await expectClean(page, seen);
  });
}
