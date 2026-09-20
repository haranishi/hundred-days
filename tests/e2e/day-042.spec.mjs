import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* 気象庁への通信は全部、調査で取った実応答（2026-09-18 15時／18時45分の発表）に差し替える。
   「いま」は 2026-09-18 21:00 JST に固定するので、帯の印も毎日同じ位置に出る。 */

const APP = '/day-042-typhoon-coming/';
const file = (name) => fileURLToPath(new URL(`../../day-042-typhoon-coming/tests/fixtures/${name}`, import.meta.url));
const DATA = 'https://www.jma.go.jp/bosai/typhoon/data/';
const FIXTURES = {
  [`${DATA}targetTc.json`]: 'bosai-typhoon-targetTc-20260918.json',
  [`${DATA}TC2630/specifications.json`]: 'bosai-TC2630-specifications-20260918.json',
  [`${DATA}TC2630/probabilityTimeseries.json`]: 'bosai-TC2630-probabilityTimeseries-20260918.json',
  [`${DATA}TC2630/probabilityThrough.json`]: 'bosai-TC2630-probabilityThrough-20260918.json',
  [`${DATA}TC2630/forecast.json`]: 'bosai-TC2630-forecast-20260918.json',
};

const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
const NOW = new Date('2026-09-18T21:00:00+09:00');

const knobs = new WeakMap();

test.beforeEach(async ({ page, context }) => {
  knobs.set(page, { errors: [], outside: [], targetTc: null, status: 200 });
  page.on('pageerror', (error) => knobs.get(page).errors.push(error.message));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: TOKYO_STATION.lat, longitude: TOKYO_STATION.lng });
  await page.clock.setFixedTime(NOW);

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const knob = knobs.get(page);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    knob.outside.push(url.href);
    const name = FIXTURES[url.href];
    if (!name) return route.abort();
    if (knob.status !== 200) return route.fulfill({ status: knob.status, body: '' });
    const body = url.href === `${DATA}targetTc.json` && knob.targetTc !== null
      ? knob.targetTc
      : readFileSync(file(name));
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body });
  });
});

test.afterEach(async ({ page }) => { expect(knobs.get(page).errors).toEqual([]); });

const ready = (page) => expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
const open = async (page) => { await page.goto(APP); await ready(page); };
const fromHere = (page) => page.getByRole('button', { name: '現在地から探す' }).click();

async function searchTown(page, query) {
  await page.locator('#town-input').fill(query);
  await page.locator('#search-town').click();
}

test('場所を選ぶ前でも、現況・上位5地域・出典が読める（答えは出さない）', async ({ page }) => {
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-town', '0');
  await expect(page.locator('#answer')).toBeHidden();
  await expect(page.locator('#band-area')).toBeHidden();

  // 現況カード
  await expect(page.locator('#typhoon-title')).toHaveText('台風第25号（ドゥージェン）');
  await expect(page.locator('#typhoon-scale')).toHaveText('台風・大型');
  await expect(page.locator('#typhoon-facts')).toContainText('父島の南約180km');
  await expect(page.locator('#typhoon-facts')).toContainText('西へ 25km/h');
  await expect(page.locator('#typhoon-facts')).toContainText('975hPa');
  await expect(page.locator('#typhoon-facts')).toContainText('全域 110km');
  await expect(page.locator('#typhoon-facts')).toContainText('北東 750km・南西 390km');
  await expect(page.locator('#typhoon-issue')).toHaveText('気象庁 18日 18時45分 発表');

  // 確率が高い地域の上位5つ（積算5日目の降順）
  await expect(page.locator('#top-list > li')).toHaveCount(5);
  await expect(page.locator('#top-list > li').nth(0)).toHaveText('小笠原諸島（東京都）100%');
  await expect(page.locator('#top-list > li').nth(1)).toHaveText('八丈島（東京都）78%');
  await expect(page.locator('#top-list > li').nth(2)).toHaveText('三宅島（東京都）62%');

  // 出典・加工した旨・国が作ったものではない旨の3つを、たたまずに出す
  const sources = page.locator('.sources');
  await expect(sources).toContainText('出典：気象庁「台風情報」');
  await expect(sources).toContainText('加工して作成');
  await expect(sources).toContainText('気象庁や国が作成・監修したものではありません');
  expect(await page.locator('details').count()).toBe(0);

  // 判断の言葉は書かない（気象業務法17条）
  await expect(page.locator('main')).not.toContainText('危険です');
  await expect(page.locator('main')).not.toContainText('安全です');
});

test('現在地から探すと、千代田区の答えが1行で出る', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-town', '1');

  await expect(page.locator('#answer-text')).toHaveText('千代田区は、5日以内に暴風域に入る確率 30%。');
  await expect(page.locator('#answer-text .count')).toHaveText('30%');
  await expect(page.locator('#answer-sub')).toContainText('山は 21日（月）9時〜12時 の 22%');
  // 判定は5以上で、この区間はちょうど5%。「超える」ではなく「以上になる」と書く
  await expect(page.locator('#answer-sub')).toContainText('5%以上になるのは 21日（月）0時〜3時 から');
  await expect(page.locator('#answer-meta')).toHaveText('気象庁 9月18日 15時の発表（２３区西部の値）・台風第25号');
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：千代田区（東京都）');

  // 0%は「入らない」の保証ではない、は折りたたみの中に隠さない
  await expect(page.locator('#caveat')).toBeVisible();
  await expect(page.locator('#caveat')).toContainText('0%は「入らない」の保証ではありません');
  // 台風は1つなので、ほかの台風の欄は出さない
  await expect(page.locator('#others-area')).toBeHidden();
});

test('市区町村名で探す。1件なら即決定', async ({ page }) => {
  await open(page);
  await searchTown(page, '由利本荘');
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：由利本荘市（秋田県）');
  await expect(page.locator('#answer-text')).toHaveText('由利本荘市は、5日以内に暴風域に入る確率 2%。');
  await expect(page.locator('#answer-sub')).toContainText('山は 21日（月）12時〜15時 の 1%');
  await expect(page.locator('#answer-sub')).toContainText('5%以上になる時間帯はありません');
  await expect(page.locator('#answer-meta')).toContainText('本荘由利地域の値');
});

test('同じ名前があるときは候補を出し、見つからなければ案内文', async ({ page }) => {
  await open(page);
  await searchTown(page, '府中市');
  await expect(page.locator('#candidates .candidate')).toHaveCount(2);
  await page.locator('#candidates .candidate', { hasText: '府中市（東京都）' }).click();
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：府中市（東京都）');
  await expect(page.locator('#answer-text')).toContainText('府中市は、5日以内に暴風域に入る確率');

  await searchTown(page, 'ぬるぽ');
  await expect(page.locator('#candidates')).toContainText('「ぬるぽ」に当たる市区町村が見つかりませんでした');
  // 見つからなくても直前の答えは消さない
  await expect(page.locator('#answer-text')).toContainText('府中市は');
});

test('3時間ごとの帯は40本で、「いま」の印は1つだけ', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await expect(page.locator('#band > li')).toHaveCount(40);
  await expect(page.locator('#band > li[data-now="1"]')).toHaveCount(1);
  // 2026-09-18 21:00 は「18時〜21時」の区間（validtime は区間の終わり）
  await expect(page.locator('#band > li').nth(1)).toHaveAttribute('data-now', '1');
  await expect(page.locator('#band > li').nth(1)).toHaveAttribute('aria-label', '18日18時〜21時 0%');
  await expect(page.locator('#band > li').nth(22)).toHaveAttribute('aria-label', '21日9時〜12時 22%');
  /* 日付の境目は「0時始まり」の区間。validtime は区間の終わりなので 3時 のコマに付く。
     validtime[2] は 19日0時＝21時〜24時の区間なので、境目ではない */
  await expect(page.locator('#band > li[data-daystart="1"]')).toHaveCount(5);
  await expect(page.locator('#band > li').nth(3)).toHaveAttribute('data-daystart', '1');
  await expect(page.locator('#band > li').nth(3).locator('.band-day')).toHaveText('19日（土）');
  // 数字は5%以上のときだけ出す
  await expect(page.locator('#band .band-value')).toHaveCount(6); // 5,11,18,22,21,16
  await expect(page.locator('#band > li').nth(22).locator('.band-value')).toHaveText('22');
});

test('台風が無い日は「いま、台風はありません」と答える', async ({ page }) => {
  knobs.get(page).targetTc = '[]';
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'none');
  await expect(page.locator('#none-text')).toHaveText('いま、台風はありません。');
  await expect(page.locator('#none-sub')).toHaveText('気象庁が発表している台風は、9月18日 21時00分時点でありません。');
  await expect(page.locator('#typhoon')).toBeHidden();
  await expect(page.locator('#band-area')).toBeHidden();
  await expect(page.locator('#map-area')).toBeHidden();
  await expect(page.locator('#top-areas')).toBeHidden();

  // 場所を決める欄は残す。選んでも確率の発表は無い
  await expect(page.locator('#picker')).toBeVisible();
  await fromHere(page);
  await expect(page.locator('#place-note')).toHaveText('いま台風がないので、確率の発表はありません。');
});

test('取得に失敗したら知らせ、もう一度ためすで戻る', async ({ page }) => {
  knobs.get(page).status = 500;
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#failure-text')).toHaveText('台風の情報を取得できませんでした。通信を確認して、もう一度おためしください。');
  await expect(page.locator('#answer')).toBeHidden();
  await expect(page.locator('#typhoon')).toBeHidden();

  knobs.get(page).status = 200;
  await page.getByRole('button', { name: 'もう一度ためす' }).click();
  await ready(page);
  await expect(page.locator('#typhoon-title')).toHaveText('台風第25号（ドゥージェン）');
});

test('外へ出るのは気象庁だけで、現在地も選んだ場所も送らない', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await searchTown(page, '由利本荘');
  const outside = knobs.get(page).outside;
  expect(outside.length).toBeGreaterThan(0);
  for (const href of outside) {
    expect(new URL(href).hostname, href).toBe('www.jma.go.jp');
    // 確率は全国ぶんが1本で届くので、地域も座標もURLに載らない
    expect(href).not.toContain('35.68');
    expect(href).not.toContain('139.76');
    expect(href).not.toContain('130011');
    expect(href).not.toContain('1310100');
  }
});

test('390px幅でも横にはみ出さず、押せるものの当たりは44px以上', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await fromHere(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const sizes = await page.locator('#locate, #search-town, #town-input')
    .evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { name: node.id, height: Math.round(box.height), width: Math.round(box.width) };
    }));
  expect(sizes.length).toBe(3);
  for (const size of sizes) {
    expect(size.height, `${size.name} の高さ`).toBeGreaterThanOrEqual(44);
    expect(size.width, `${size.name} の幅`).toBeGreaterThanOrEqual(44);
  }
});

test('前に選んだ市区町村を覚えていて、開き直すと答えから始まる', async ({ page }) => {
  await open(page);
  await searchTown(page, '由利本荘');
  await expect(page.locator('#answer-text')).toContainText('由利本荘市は');
  expect(await page.evaluate(() => localStorage.getItem('day-042:town'))).toBe('0521000');
  // 座標は覚えない
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain('39.3');
  expect(stored).not.toContain('140.0');

  await page.reload();
  await ready(page);
  await expect(page.locator('#answer-text')).toHaveText('由利本荘市は、5日以内に暴風域に入る確率 2%。');
});

test('地図が描かれ、シェア欄が据え付けられている', async ({ page }) => {
  await open(page);
  await fromHere(page);
  const map = page.locator('#map');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('role', 'img');
  // 実際に絵が入っている（真っ白ではない）
  const painted = await map.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4 * 97) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size;
  });
  expect(painted, '地図に色が1種類しか無い＝描けていない').toBeGreaterThan(3);

  await expect(page.locator('#share .share')).toHaveCount(1);
  await expect(page.locator('#share').getByRole('link', { name: 'Xで投稿' })).toBeVisible();
  await expect(page.locator('#share').getByRole('button', { name: 'リンクをコピー' })).toBeVisible();
});
