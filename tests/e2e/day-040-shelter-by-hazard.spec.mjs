import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = '/day-040-shelter-by-hazard/';
const file = (name) => fileURLToPath(new URL(`../../apps/day-040-shelter-by-hazard/tests/fixtures/${name}`, import.meta.url));
const blankTile = readFileSync(file('blank-tile.png'));
const ISSUED = new Date('2026-09-14T03:00:00Z').toUTCString();

const AKITA = { lat: 39.7186, lng: 140.1025 };
const KOCHI = { lat: 33.5665, lng: 133.5432 };
// 実応答を置いてある区画だけ本物を返す。ほかは本物と同じく404（＝その区画に該当が無い）
const CITY_OF = { '910/388': 'akita', '891/410': 'kochi' };

const failures = new WeakMap();
const knobs = new WeakMap();

test.beforeEach(async ({ page, context }) => {
  failures.set(page, []);
  knobs.set(page, { shelterCalls: [], blocked: false, hold: null, address: 'address-akita-sanno' });
  page.on('pageerror', (error) => failures.get(page).push(error.message));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: AKITA.lat, longitude: AKITA.lng });

  // 外部通信はすべて止め、国土地理院の3系統だけを実応答と同梱PNGで置き換える
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    const knob = knobs.get(page);

    const shelter = url.pathname.match(/^\/xyz\/skhb0(\d)\/10\/(\d+)\/(\d+)\.geojson$/);
    if (shelter) {
      const [, hazard, x, y] = shelter;
      knob.shelterCalls.push(url.pathname);
      if (knob.hold) await knob.hold;
      if (knob.blocked) return route.abort();
      const city = CITY_OF[`${x}/${y}`];
      const path = city ? file(`skhb/${city}/skhb0${hazard}.json`) : '';
      if (!path || !existsSync(path)) return route.fulfill({ status: 404, headers: { 'content-type': 'text/plain' }, body: '' });
      return route.fulfill({
        status: 200,
        // 本物と同じく last-modified を露出させる（画面の「配信」表示がここから出る）
        headers: { 'content-type': 'application/json', 'last-modified': ISSUED, 'access-control-expose-headers': 'last-modified' },
        body: readFileSync(path),
      });
    }
    if (url.pathname.startsWith('/xyz/pale/')) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: blankTile });
    }
    if (url.hostname === 'msearch.gsi.go.jp') {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: readFileSync(file(`${knob.address}.json`)) });
    }
    return route.abort();
  });
});

test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

async function open(page) {
  await page.goto(APP);
  await expect(page.locator('#map canvas')).toBeVisible();
}
async function fromHere(page) {
  await page.getByRole('button', { name: '現在地から探す' }).click();
}
async function credits(page) {
  for (const text of ['国土地理院「指定緊急避難場所データ」', '国土地理院コンテンツ利用規約', '地理院タイル（淡色地図）', '国土地理院 住所検索API']) {
    await expect(page.locator('.sources')).toContainText(text);
  }
  // 地図の帰属は MapLibre の常設表示。提供元の文をそのまま出し、二重に足さない
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('地理院タイル');
  expect(await page.locator('.maplibregl-ctrl-attrib a', { hasText: '地理院タイル' }).count()).toBe(1);
}

test('空状態は答えを出さず、出典と地図帰属が常設', async ({ page }) => {
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#answer')).toBeHidden();
  await expect(page.locator('#usable')).toBeHidden();
  await expect(page.locator('#unusable')).toBeHidden();
  await credits(page);
  // 指定避難所との違いと、登録が無い市町村があることは常に出す
  await expect(page.locator('.notes')).toContainText('「指定避難所」とは別です');
  await expect(page.locator('.notes')).toContainText('市町村が登録し、公開に同意した場所だけ');
  await expect(page.locator('.notes')).toContainText('距離は直線距離、徒歩の目安は80m/分');
  expect(knobs.get(page).shelterCalls).toEqual([]);
});

test('読み込み中は一覧の骨組みを出し、地図と操作は使える', async ({ page }) => {
  let release;
  knobs.get(page).hold = new Promise((resolve) => { release = resolve; });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('#skeleton')).toBeVisible();
  await expect(page.locator('#status')).toContainText('国土地理院の避難場所データを読み込んでいます');
  await expect(page.locator('#map canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '現在地から探す' })).toBeEnabled();
  knobs.get(page).hold = null;
  release();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
});

test('秋田・洪水は答えが操作より上、使える5か所と使えない一覧が出る', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');

  const answer = await page.locator('#answer').boundingBox();
  const picker = await page.locator('#picker').boundingBox();
  expect(answer.y + answer.height).toBeLessThan(picker.y);

  await expect(page.locator('#answer-text')).toHaveText('洪水のとき、いちばん近い指定緊急避難場所は「中央市民サービスセンター」。170m、徒歩およそ3分。');
  await expect(page.locator('#answer-sub')).toHaveText('いちばん近い場所が、そのまま洪水で使えます。');
  // 答えの直下から一歩目へ進める（一覧は画面の下のほう）
  await expect(page.locator('#answer-action')).toContainText('秋田県秋田市山王1-1-1');
  await expect(page.locator('#answer-action .map-link')).toHaveAttribute('href', /google\.com\/maps\/search/);
  await expect(page.locator('#place-name')).toHaveText('現在地');

  await expect(page.locator('#usable-title')).toHaveText('洪水で使える、近い順5か所');
  await expect(page.locator('#usable-list > li')).toHaveCount(5);
  const first = page.locator('#usable-list > li').first();
  await expect(first.locator('.site-name')).toHaveText('中央市民サービスセンター');
  await expect(first.locator('.measure')).toHaveText('170m・徒歩およそ3分');
  await expect(first.locator('.flags')).toContainText('ほかに使える災害：');
  await expect(first.locator('.map-link')).toHaveAttribute('rel', 'noopener');
  await expect(first.locator('.map-link')).toHaveAttribute('target', '_blank');
  await expect(first.locator('.map-link')).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=39\.\d+,140\.\d+$/);

  await expect(page.locator('#unusable-title')).toHaveText('近いのに、洪水では使えない場所');
  await expect(page.locator('#unusable-list')).toContainText('山王第一街区公園');
  await expect(page.locator('#unusable-list > li')).toHaveCount(8);
  await expect(page.locator('#unusable-more')).toHaveText('ほか1か所');

  // 件数はラベルへ。0件の種類も隠さない
  await expect(page.locator('label.hazard', { hasText: '洪水' })).toContainText('178');
  await expect(page.locator('label.hazard', { hasText: '火山現象' })).toContainText('0');
  await expect(page.locator('#data-date')).toHaveText('（2026-09-14 配信）');

  // ピンは自分1つ＋使える5つ＋使えない8つ。使える・使えないは文字でも分かる
  await expect(page.locator('.pin')).toHaveCount(14);
  await expect(page.locator('.pin[aria-label="選んだ場所"]')).toHaveCount(1);
  await expect(page.locator('.pin[aria-label="1 中央市民サービスセンター 170m 洪水で使える"]')).toHaveCount(1);
  await expect(page.locator('.pin[aria-label="山王第一街区公園 220m 洪水では使えない"]')).toHaveCount(1);

  // 避難の判断はしない
  await expect(page.locator('main')).not.toContainText('逃げてください');
  await expect(page.locator('main')).not.toContainText('安全です');
});

test('災害の種類を切り替えても取り直さず、答えだけ変わる', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  const calls = knobs.get(page).shelterCalls.length;
  expect(calls).toBe(8);

  await page.locator('input[name="hazard"][value="5"]').check();
  await expect(page.locator('#answer-text')).toHaveText('津波のとき、いちばん近い指定緊急避難場所は「山王プレスビル（２階から屋上までの屋外施設および踊り場）」。290m、徒歩およそ4分。');
  await expect(page.locator('#answer-sub')).toHaveText('それより近くに3か所ありますが、津波では使えません。');
  await expect(page.locator('#usable-title')).toHaveText('津波で使える、近い順5か所');
  expect(knobs.get(page).shelterCalls.length).toBe(calls);

  // 登録が無い種類は「登録されていません」。取得も走らない
  await page.locator('input[name="hazard"][value="8"]').check();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'none');
  await expect(page.locator('#no-sites-text')).toHaveText('この区画には、火山現象の指定緊急避難場所が登録されていません');
  await expect(page.locator('#no-sites-sub')).toContainText('ほかの災害の種類に切り替えるか');
  await expect(page.locator('#usable')).toBeHidden();
  expect(knobs.get(page).shelterCalls.length).toBe(calls);

  await page.locator('input[name="hazard"][value="1"]').check();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
});

test('高知は、近いのに洪水で使えない場所が17か所あると出す', async ({ page, context }) => {
  await context.setGeolocation({ latitude: KOCHI.lat, longitude: KOCHI.lng });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#answer-text')).toHaveText('洪水のとき、いちばん近い指定緊急避難場所は「江ノ口小学校」。500m、徒歩およそ7分。');
  await expect(page.locator('#answer-sub')).toHaveText('それより近くに17か所ありますが、洪水では使えません。');
  // 区画の辺まで5km未満なので、東隣の区画も取りに行く（本物と同じく404＝0件）
  expect(knobs.get(page).shelterCalls).toContain('/xyz/skhb01/10/892/410.geojson');
  expect(knobs.get(page).shelterCalls.filter((path) => path.includes('/892/')).length).toBe(1);
});

test('取得に失敗したら最上部に知らせ、もう一度ためすで戻る', async ({ page }) => {
  knobs.get(page).blocked = true;
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure-text')).toContainText('避難場所データを取得できませんでした');
  await expect(page.locator('#usable')).toBeHidden();
  const failure = await page.locator('#failure').boundingBox();
  const picker = await page.locator('#picker').boundingBox();
  expect(failure.y + failure.height).toBeLessThan(picker.y);

  knobs.get(page).blocked = false;
  await page.locator('#retry').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#answer-text')).toContainText('中央市民サービスセンター');
});

test('住所検索は1件なら自動、複数なら候補、0件なら案内文', async ({ page }) => {
  await open(page);
  await page.locator('#address').fill('秋田市山王');
  await page.locator('#search-address').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  // 掴んだ場所の名前を必ず出す（「秋田駅」が北海道に解けることがある）
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：秋田県秋田市山王');

  knobs.get(page).address = 'address-akita-eki';
  await page.locator('#address').fill('秋田駅');
  await page.locator('#search-address').click();
  await expect(page.locator('#candidates .candidate')).toHaveCount(10);
  // 目印「秋田」が早く出る候補を前に並べる（元の応答は北海道中頓別町秋田が先頭）
  await expect(page.locator('#candidates .candidate').first()).toHaveText('秋田県秋田市');
  await expect(page.locator('#candidates .candidates-head')).toHaveText('候補が10件あります。押して選んでください');
  await page.locator('#candidates .candidate', { hasText: '秋田県秋田市' }).first().click();
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：秋田県秋田市');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');

  knobs.get(page).address = 'address-none';
  await page.locator('#address').fill('ぬるぽ');
  await page.locator('#search-address').click();
  await expect(page.locator('#candidates')).toHaveText('「ぬるぽ」に当たる場所が見つかりませんでした。住所や町名で試してください。');
  // 見つからなくても直前の結果は消さない
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
});

test('地図を押すと、その場所で探し直す', async ({ page }) => {
  await open(page);
  await page.locator('#map canvas').click();
  await expect(page.locator('#place-name')).toHaveText('地図で選んだ場所');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'none');
  // 押した場所の区画で8種類ぶん取りに行く（辺に近ければ、選んだ種類だけ隣の区画も足される）
  const calls = knobs.get(page).shelterCalls;
  expect(calls.length).toBeGreaterThanOrEqual(8);
  expect(new Set(calls.map((path) => path.match(/skhb0(\d)/)[1])).size).toBe(8);
});

test('押せるものとピンの当たりは44px以上、375pxでも横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // CI（Linux Chromium）では 43.99… が返るので整数に丸めて測る
  const sizes = await page.locator('#locate, #search-address, #pick-center, label.hazard, .pin, .map-link')
    .evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { name: node.id || node.className, height: Math.round(box.height), width: Math.round(box.width) };
    }));
  expect(sizes.length).toBeGreaterThan(20);
  for (const size of sizes) {
    expect(size.height, `${size.name} の高さ`).toBeGreaterThanOrEqual(44);
    expect(size.width, `${size.name} の幅`).toBeGreaterThanOrEqual(44);
  }
});

test('日本の外を選ぶと、範囲の外だと知らせる', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 48.85, longitude: 2.35 });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure-text')).toHaveText('日本の範囲で場所を選んでください。');
  expect(knobs.get(page).shelterCalls).toEqual([]);
});

test('現在地が拒否されても、住所と地図から探せる', async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_, fail) => fail({ code: 1 }); });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#failure-text')).toHaveText('現在地の利用が許可されていません。住所か地図で場所を選べます。');
  await page.locator('#pick-center').click();
  await expect(page.locator('#place-name')).toHaveText('地図で選んだ場所');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'none');
});
