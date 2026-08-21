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
  // 標本は11地点。うち雨量だけが1、品質フラグが立っているものが1で、残る9地点が順位の母数になる
  await expect(page.locator('#measured-count')).toHaveText('9');
  await expect(page.locator('#top li')).toHaveCount(9);
  await expect(page.locator('#top')).not.toContainText('小車');
  await expect(page.locator('#top')).not.toContainText('故障中');
  // 注記の地点数も、書き置きではなくその日の実数を出す
  await expect(page.locator('#total-count')).toHaveText('11');
  await expect(page.locator('#thermometer-count')).toHaveText('10');
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
  await expect(page.locator('#you .you__rank')).toContainText('9地点中');
  await expect(page.locator('#you .you__rank b')).toHaveText('3');
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

test('地図に観測所がぜんぶ描かれ、南西諸島も別枠で出る', async ({ page }) => {
  await open(page);
  const canvas = page.locator('#map');
  // 標本11地点のうち、地図に出るのは11地点（那覇は左下の別枠に入る）
  await expect(canvas).toHaveAttribute('data-drawn', '11');
});

test('地図の点を押すと、その土地のカードが出る', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // 寄る動きを止めて、位置を確かめやすくする
  await open(page);
  await find(page, '秋田');
  await expect(page.locator('#map')).toHaveAttribute('data-focus', '32402');

  // 探した地点は画面の真ん中に来る。そこを押せば同じ地点が拾える
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#you .you__place')).toHaveText('秋田県 秋田');
});

test('地方を選ぶと、そこへ寄って、遠くの地点は画面から外れる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.click('#regions button:has-text("北海道")');
  const drawn = Number(await page.locator('#map').getAttribute('data-drawn'));
  expect(drawn).toBeLessThan(11);
  expect(drawn).toBeGreaterThan(0);
  // 寄ったら南西諸島の別枠は消えるので、那覇は描かれない
  await expect(page.locator('#regions button:has-text("北海道")')).toHaveAttribute('aria-pressed', 'true');
});

test('同じ名前の観測所が複数あるときは、都道府県つきで選ばせる', async ({ page }) => {
  await open(page);
  await find(page, '金山');
  await expect(page.locator('#you')).toContainText('2か所あります');
  await page.click('#you .choices button:has-text("岐阜県 金山")');
  await expect(page.locator('#you .you__place')).toHaveText('岐阜県 金山');
  await expect(page.locator('#you .you__rank b')).toHaveText('6');
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
