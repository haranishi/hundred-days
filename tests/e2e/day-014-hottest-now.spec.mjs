import { expect, test } from '@playwright/test';
import { HOUR_AGO, OBSERVATIONS, TABLE } from '../../apps/day-014-hottest-now/tests/fixtures/amedas.mjs';

/* 上流（気象庁）には繋がない。本物は10分ごとに中身が変わるので、そのままでは何も固定できない。
   配信されている3種類のファイルを、同じ形の標本で置き換える。 */
const PAGE = '/day-014-hottest-now/';
const NOW = '20260821213000';
const HOUR_BEFORE = '20260821203000';

const serve = async (page, { fail = false, withHistory = true } = {}) => {
  await page.route('**/bosai/amedas/**', (route) => {
    if (fail) return route.fulfill({ status: 503, body: 'unavailable' });
    const url = route.request().url();
    if (url.includes('latest_time.txt')) {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '2026-08-21T21:30:00+09:00' });
    }
    if (url.includes('amedastable.json')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TABLE) });
    }
    if (url.includes(`${NOW}.json`)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OBSERVATIONS) });
    }
    if (url.includes(`${HOUR_BEFORE}.json`)) {
      return withHistory
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOUR_AGO) })
        : route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
};

const open = async (page, options) => {
  await serve(page, options);
  await page.goto(PAGE);
  await expect(page.locator('#main')).toBeVisible();
};

const find = async (page, word) => {
  await page.fill('#q', word);
  await page.click('#search button[type="submit"]');
};

test('開いた直後に、いちばん暑い場所と寒い場所とその差が出る', async ({ page }) => {
  await open(page);
  await expect(page.locator('#gap')).toHaveText('25.3');
  await expect(page.locator('#hot-place')).toHaveText('熊本県 牛深');
  await expect(page.locator('#hot-temp')).toHaveText('30.5');
  await expect(page.locator('#cold-place')).toHaveText('静岡県 富士山');
  await expect(page.locator('#stamp')).toHaveText('8月21日 21:30');
});

test('気温を測っていない地点は母数に入らない', async ({ page }) => {
  await open(page);
  // 標本は10地点。うち雨量だけが1、品質フラグが立っているものが1で、残る8地点が順位の母数になる
  await expect(page.locator('#measured-count')).toHaveText('8');
  await expect(page.locator('#top li')).toHaveCount(8);
  await expect(page.locator('#top')).not.toContainText('小車');
  await expect(page.locator('#top')).not.toContainText('故障中');
  // 注記の地点数も、書き置きではなくその日の実数を出す
  await expect(page.locator('#total-count')).toHaveText('10');
  await expect(page.locator('#thermometer-count')).toHaveText('9');
});

test('山の上とは別に、標高の低いところでいちばん寒い場所も出る', async ({ page }) => {
  await open(page);
  await expect(page.locator('#ground-note')).toContainText('標高1,000mより低い観測所');
  await expect(page.locator('#ground-note')).toContainText('北海道 美深');
});

test('平仮名で探せて、同じ気温なら同率の地点数まで出る', async ({ page }) => {
  await open(page);
  await find(page, 'あきた');
  await expect(page.locator('#you .you__place')).toHaveText('秋田県 秋田');
  await expect(page.locator('#you .you__temp')).toHaveText('25.5℃');
  await expect(page.locator('#you .you__rank')).toContainText('8地点中');
  await expect(page.locator('#you .you__rank b')).toHaveText('2');
  await expect(page.locator('#you .you__rank')).toContainText('同じ気温が2地点');
  await expect(page.locator('#you .you__sub')).toContainText('1位の牛深とは 5.0℃差');
});

test('1時間前の観測値が取れたら、増減が書き足される', async ({ page }) => {
  await open(page);
  await expect(page.locator('#hot-sub')).toContainText('1時間で −0.7℃');
  await find(page, '秋田');
  await expect(page.locator('#you .you__sub')).toContainText('1時間で +0.6℃');
});

test('1時間前が取れなくても、いまの順位は出る', async ({ page }) => {
  await open(page, { withHistory: false });
  await expect(page.locator('#hot-place')).toHaveText('熊本県 牛深');
  await expect(page.locator('#hot-sub')).not.toContainText('1時間で');
});

test('棒が伸びている途中で地点を選んでも、印が消えない', async ({ page }) => {
  await open(page);
  // 棒は画面に入ってから0.7秒かけて伸びる。その途中で地点が選ばれる状況を作る
  await page.locator('.dist').scrollIntoViewIfNeeded();
  await find(page, '秋田');
  await expect(page.locator('#you .you__place')).toBeVisible();
  await page.waitForTimeout(1000);
  const painted = await page.evaluate(() => {
    const canvas = document.getElementById('hist');
    const context = canvas.getContext('2d');
    // 棒より上、印だけが描かれる帯に色が乗っているか
    const band = context.getImageData(0, 0, canvas.width, Math.round(canvas.height * 0.12)).data;
    let count = 0;
    for (let index = 3; index < band.length; index += 4) if (band[index] > 0) count += 1;
    return count;
  });
  expect(painted).toBeGreaterThan(0);
});

test('同じ名前の観測所が複数あるときは、都道府県つきで選ばせる', async ({ page }) => {
  await open(page);
  await find(page, '金山');
  await expect(page.locator('#you')).toContainText('2か所あります');
  await page.click('#you .choices button:has-text("岐阜県 金山")');
  await expect(page.locator('#you .you__place')).toHaveText('岐阜県 金山');
  await expect(page.locator('#you .you__rank b')).toHaveText('5');
});

test('雨量しか測っていない地点を選ぶと、理由と近くの代わりが出る', async ({ page }) => {
  await open(page);
  await find(page, '小車');
  await expect(page.locator('#you .you__card--empty')).toBeVisible();
  await expect(page.locator('#you')).toContainText('気温は測っていません');
  await page.click('#you .choices button:has-text("北海道 美深")');
  await expect(page.locator('#you .you__place')).toHaveText('北海道 美深');
});

test('温度計はあるのに値が届いていない地点は、測っていない地点と言い分ける', async ({ page }) => {
  await open(page);
  await find(page, '故障中');
  await expect(page.locator('#you')).toContainText('いまの気温が届いていません');
  await expect(page.locator('#you')).not.toContainText('雨量などだけを測っていて');
});

test('見つからない地名と空欄では、別のことを言う', async ({ page }) => {
  await open(page);
  await find(page, 'ぬるぽ');
  await expect(page.locator('#you')).toContainText('見つかりませんでした');
  await find(page, '   ');
  await expect(page.locator('#you')).toContainText('地点名を入れてください');
});

test('気象庁に繋がらないときはエラーを出し、押せば読み直す', async ({ page }) => {
  await serve(page, { fail: true });
  await page.goto(PAGE);
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#main')).toBeHidden();
  await serve(page);
  await page.click('#retry');
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden();
});

test.describe('現在地から探す', () => {
  test.use({ geolocation: { latitude: 39.72, longitude: 140.1 }, permissions: ['geolocation'] });

  test('許可されたら最寄りの観測所が選ばれ、距離も出る', async ({ page }) => {
    await open(page);
    await page.click('#locate');
    await expect(page.locator('#you .you__place')).toHaveText('秋田県 秋田');
    await expect(page.locator('#you .you__sub')).toContainText('現在地から');
  });
});

test.describe('現在地を断ったとき', () => {
  test.use({ geolocation: { latitude: 39.72, longitude: 140.1 }, permissions: [] });

  test('断られても地点名で探せることを伝える', async ({ page }) => {
    await open(page);
    await page.click('#locate');
    await expect(page.locator('#you')).toContainText('地点名で探せます');
    await expect(page.locator('#main')).toBeVisible();
  });
});
