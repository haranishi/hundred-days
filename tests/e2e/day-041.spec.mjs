import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = '/day-041-who-got-hurt/';
const file = (name) => fileURLToPath(new URL(`../../apps/day-041-who-got-hurt/tests/fixtures/${name}`, import.meta.url));
const blankTile = readFileSync(file('blank-tile.png'));

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const SHIRETOKO = { lat: 44.3308, lng: 145.339 }; /* 知床岬。事故の記録が1件も無い */

const knobs = new WeakMap();

test.beforeEach(async ({ page, context }) => {
  knobs.set(page, { errors: [], packs: [], outside: [], blocked: false, hold: null, address: 'address-akita-sanno' });
  page.on('pageerror', (error) => knobs.get(page).errors.push(error.message));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: TOKYO.lat, longitude: TOKYO.lng });

  // 外部通信はすべて止め、国土地理院の2系統だけを同梱PNGと実応答で置き換える
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const knob = knobs.get(page);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (url.pathname.endsWith('.bin')) {
        knob.packs.push(url.pathname);
        if (knob.hold) await knob.hold;
        if (knob.blocked) return route.abort();
      }
      return route.continue();
    }
    knob.outside.push(url.href);
    if (url.pathname.startsWith('/xyz/pale/')) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: blankTile });
    }
    if (url.hostname === 'msearch.gsi.go.jp') {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: readFileSync(file(`${knob.address}.json`)) });
    }
    return route.abort();
  });
});

test.afterEach(async ({ page }) => { expect(knobs.get(page).errors).toEqual([]); });

async function open(page) {
  await page.goto(APP);
  await expect(page.locator('#map canvas')).toBeVisible();
}
const fromHere = (page) => page.getByRole('button', { name: '現在地から探す' }).click();
const ready = (page) => expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');

test('空状態は答えを出さず、出典3行・地図帰属・交通量の但し書きが常設', async ({ page }) => {
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#answer')).toBeHidden();
  await expect(page.locator('#spots')).toBeHidden();
  await expect(page.locator('#hours')).toBeHidden();

  // 出典・加工した旨・国が作ったものではない旨の3つを、たたまずに出す（公共データ利用規約1.0）
  const sources = page.locator('.sources');
  await expect(sources).toContainText('出典：警察庁「交通事故統計情報のオープンデータ」（2019〜2024年）');
  await expect(sources).toContainText('加工して作成');
  await expect(sources).toContainText('警察庁や国が作成・監修したものではありません');
  await expect(sources.getByRole('link', { name: '交通事故統計情報のオープンデータ' }))
    .toHaveAttribute('href', 'https://www.npa.go.jp/publications/statistics/koutsuu/opendata/');

  // 「多い＝危ない」ではない、は折りたたみの中に隠さない
  await expect(page.locator('#caveat')).toBeVisible();
  await expect(page.locator('#caveat')).toContainText('件数は交通量で割っていません');
  /* 罫線は答えとの仕切り。まだ答えが無い空状態では引かない（住所欄の下に短い線が浮いて見える） */
  await expect(page.locator('#caveat')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.limits')).toContainText('交通量で割っていません');
  /* たたまないのはアプリ側の説明のこと。MapLibre の帰属表示は中身が <details> なので、
     それだけは数から外す（下でひらいていることを別に確かめる） */
  expect(await page.locator('details:not(.maplibregl-ctrl-attrib)').count()).toBe(0);

  // 地図の帰属は MapLibre の常設表示。提供元の文をそのまま出し、二重に足さない
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('地理院タイル');
  // 規約上ここは常に読める必要がある。compact に落ちてたたまれていないことを見る
  await expect(page.locator('.maplibregl-ctrl-attrib')).toHaveAttribute('open', '');
  await expect(page.locator('.maplibregl-ctrl-attrib a', { hasText: '地理院タイル' })).toBeVisible();
  expect(await page.locator('.maplibregl-ctrl-attrib a', { hasText: '地理院タイル' }).count()).toBe(1);
  expect(knobs.get(page).packs).toEqual([]);
});

test('読み込み中は骨組みを出し、地図と操作は使える', async ({ page }) => {
  let release;
  knobs.get(page).hold = new Promise((resolve) => { release = resolve; });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('#skeleton')).toBeVisible();
  await expect(page.locator('#status')).toContainText('事故の記録を読み込んでいます');
  await expect(page.locator('#map canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '現在地から探す' })).toBeEnabled();
  knobs.get(page).hold = null;
  release();
  await ready(page);
});

test('東京駅・半径500mの答えと、地点・時刻の帯・ピンが出る', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await ready(page);

  await expect(page.locator('#answer-text')).toHaveText('半径500mで、6年間に351件。');
  await expect(page.locator('#answer-text .count')).toHaveText('351件');
  await expect(page.locator('#answer-sub')).toHaveText('うち歩行者78件・自転車76件・死亡事故2件');
  await expect(page.locator('#place-name')).toHaveText('現在地');

  await expect(page.locator('#spots-title')).toHaveText('事故が集まっている地点 上位5か所');
  await expect(page.locator('#spots-list > li')).toHaveCount(5);
  // 交差点の名前は持っていないので、方角と距離で名指しする
  await expect(page.locator('#spots-list > li').first()).toHaveText('北東へ440m・交差点 — 16件（歩行者3）');
  await expect(page.locator('#spots-note')).toContainText('およそ40mの近さにあるものを1つの地点にまとめています');

  await expect(page.locator('#hours-title')).toHaveText('何時に起きているか（351件）');
  await expect(page.locator('#hour-band > li')).toHaveCount(24);
  await expect(page.locator('#hours-peak')).toHaveText('いちばん多いのは18時台で、30件です。');
  await expect(page.locator('#hour-band > li[data-peak="1"]')).toHaveAttribute('aria-label', '18時台 30件');
  await expect(page.locator('#hour-band > li').first()).toHaveAttribute('aria-label', /^0時台 \d+件$/);

  // 地図には全件を載せる。選んだ場所の目印は1つ
  await expect(page.locator('#map')).toHaveAttribute('data-pins', '351');
  await expect(page.locator('.pin[aria-label="選んだ場所"]')).toHaveCount(1);

  // 危ない・安全といった判断は書かない
  await expect(page.locator('main')).not.toContainText('危険です');
  await expect(page.locator('main')).not.toContainText('安全です');
});

test('半径と絞り込みを切り替えても、同じ場所ならファイルを取り直さない', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await ready(page);
  expect(knobs.get(page).packs).toEqual(['/day-041-who-got-hurt/data/m/533946.bin']);

  await page.locator('input[name="radius"][value="1000"]').check();
  await expect(page.locator('#answer-text')).toHaveText('半径1kmで、6年間に1724件。');
  await expect(page.locator('#map')).toHaveAttribute('data-pins', '1724');

  await page.locator('input[name="who"][value="walker"]').check();
  await expect(page.locator('#answer-text')).toHaveText('半径1kmで、6年間に歩行者が関わった事故が318件。');
  // 絞り込んだ項目は内訳で繰り返さない
  await expect(page.locator('#answer-sub')).toHaveText('うち65歳以上103件・死亡事故2件');
  await expect(page.locator('#map')).toHaveAttribute('data-pins', '318');

  // 歩行者かつ半径300m
  await page.locator('input[name="radius"][value="300"]').check();
  await expect(page.locator('#answer-text')).toHaveText('半径300mで、6年間に歩行者が関わった事故が20件。');

  await page.locator('input[name="who"][value="elder"]').check();
  await expect(page.locator('#answer-text')).toHaveText('半径300mで、6年間に65歳以上が関わった事故が33件。');
  expect(knobs.get(page).packs).toEqual(['/day-041-who-got-hurt/data/m/533946.bin']);
});

test('記録が無い場所でも空白にせず、答えとして出す', async ({ page, context }) => {
  await context.setGeolocation({ latitude: SHIRETOKO.lat, longitude: SHIRETOKO.lng });
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'none');
  await expect(page.locator('#none-text')).toHaveText('この半径では、記録がありません。');
  await expect(page.locator('#none-sub')).toContainText('届け出のない事故は、このデータに入っていません');
  await expect(page.locator('#answer')).toBeHidden();
  await expect(page.locator('#spots')).toBeHidden();
  // 2次メッシュに単独ファイルが無いので、親の1次メッシュ（4桁）を取りに行く
  expect(knobs.get(page).packs).toEqual(['/day-041-who-got-hurt/data/m/6645.bin']);

  await page.locator('input[name="who"][value="walker"]').check();
  await expect(page.locator('#none-text')).toHaveText('この半径では、歩行者が関わった事故の記録がありません。');
});

test('取得に失敗したら知らせ、もう一度ためすで戻る', async ({ page }) => {
  knobs.get(page).blocked = true;
  await open(page);
  await fromHere(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure-text')).toContainText('事故の記録を読み込めませんでした');
  await expect(page.locator('#answer')).toBeHidden();

  knobs.get(page).blocked = false;
  await page.locator('#retry').click();
  await ready(page);
  await expect(page.locator('#answer-text')).toHaveText('半径500mで、6年間に351件。');
});

test('住所検索は1件なら自動、複数なら候補、0件なら案内文', async ({ page }) => {
  await open(page);
  await page.locator('#address').fill('秋田市山王');
  await page.locator('#search-address').click();
  await ready(page);
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：秋田県秋田市山王');
  await expect(page.locator('#answer-text')).toContainText('半径500mで、6年間に');

  knobs.get(page).address = 'address-akita-eki';
  await page.locator('#address').fill('秋田駅');
  await page.locator('#search-address').click();
  await expect(page.locator('#candidates .candidate')).toHaveCount(10);
  // 目印「秋田」が早く出る候補を前に並べる（元の応答は北海道中頓別町秋田が先頭）
  await expect(page.locator('#candidates .candidate').first()).toHaveText('秋田県秋田市');
  await page.locator('#candidates .candidate', { hasText: '秋田県秋田市' }).first().click();
  await expect(page.locator('#place-name')).toHaveText('選んだ場所：秋田県秋田市');
  await ready(page);

  knobs.get(page).address = 'address-none';
  await page.locator('#address').fill('ぬるぽ');
  await page.locator('#search-address').click();
  await expect(page.locator('#candidates')).toHaveText('「ぬるぽ」に当たる場所が見つかりませんでした。住所や町名で試してください。');
  // 見つからなくても直前の結果は消さない
  await ready(page);
});

test('地図を押すと、その場所で数え直す', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await ready(page);
  const before = await page.locator('#answer-text').textContent();

  await page.locator('#map canvas').click({ position: { x: 40, y: 40 } });
  await expect(page.locator('#place-name')).toHaveText('地図で選んだ場所');
  await expect(page.locator('#app')).toHaveAttribute('data-state', /ready|none/);
  await expect(page.locator('#answer-text')).not.toHaveText(before);
});

test('外へ出るのは国土地理院だけで、現在地の座標は送らない', async ({ page }) => {
  await open(page);
  await fromHere(page);
  await ready(page);
  const outside = knobs.get(page).outside;
  expect(outside.length).toBeGreaterThan(0);
  for (const href of outside) {
    expect(new URL(href).hostname, href).toBe('cyberjapandata.gsi.go.jp');
    // 座標そのものを問い合わせに載せない（送るのは地図タイルの番号だけ）
    expect(href).not.toContain('35.68');
    expect(href).not.toContain('139.76');
  }
  // 住所で探したときだけ、入力した語が住所検索APIへ届く
  await page.locator('#address').fill('秋田市山王');
  await page.locator('#search-address').click();
  await ready(page);
  expect(outside.some((href) => new URL(href).hostname === 'msearch.gsi.go.jp')).toBe(true);
});

test('押せるものの当たりは44px以上、375pxでも横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await fromHere(page);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // CI（Linux Chromium）では 43.99… が返るので整数に丸めて測る
  const sizes = await page.locator('#locate, #search-address, #pick-center, #address, label.chip, .pin')
    .evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { name: node.id || node.className, height: Math.round(box.height), width: Math.round(box.width) };
    }));
  expect(sizes.length).toBeGreaterThan(10);
  for (const size of sizes) {
    expect(size.height, `${size.name} の高さ`).toBeGreaterThanOrEqual(44);
    expect(size.width, `${size.name} の幅`).toBeGreaterThanOrEqual(44);
  }
});
