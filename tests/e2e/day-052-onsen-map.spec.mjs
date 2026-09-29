import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = '/day-052-onsen-map/';
const BATHS = JSON.parse(readFileSync(fileURLToPath(new URL('../../day-052-onsen-map/data/baths.json', import.meta.url)), 'utf8'));
const STATS = JSON.parse(readFileSync(fileURLToPath(new URL('../../day-052-onsen-map/data/stats.json', import.meta.url)), 'utf8'));
const AKITA = { latitude: 39.7176, longitude: 140.1305 };
// 地図タイルは空のスタイルで返す（外へは出ない）。柱と点はアプリが自分のソースで描くので、空でも見える
const EMPTY_STYLE = {
  version: 8,
  sources: {
    openfreemap: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      // 本物の TileJSON（https://tiles.openfreemap.org/planet）と同じ文とリンク
      attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    },
  },
  // MapLibre は層から参照されているソースの帰属しか出さない。透明な層でタイルのソースを参照し、本番と同じく帰属を出す
  layers: [{ id: 'stub-openfreemap', type: 'fill', source: 'openfreemap', paint: { 'fill-opacity': 0 } }],
};

const failures = new WeakMap();
const outside = new WeakMap();
const knobs = new WeakMap();

test.beforeEach(async ({ page, context }) => {
  failures.set(page, []);
  outside.set(page, []);
  knobs.set(page, { styleStatus: 200 });
  page.on('pageerror', (error) => failures.get(page).push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') failures.get(page).push(`console: ${message.text()}`); });
  await context.addInitScript(() => { globalThis.__E2E__ = true; });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    outside.get(page).push(url.hostname);
    if (url.hostname === 'tiles.openfreemap.org') {
      const status = knobs.get(page).styleStatus;
      if (status !== 200) return route.fulfill({ status, contentType: 'text/plain', body: 'unavailable' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(EMPTY_STYLE) });
    }
    return route.abort();
  });
});

test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

async function open(page, query = '') {
  await page.goto(`${APP}${query}`);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
}
const rankRow = (page, code) => page.locator(`#rank-list [data-pref="${code}"]`);
const grow = (page) => page.evaluate(() => globalThis.__day052?.grow());
const pillarCount = (page) => page.evaluate(() => globalThis.__day052?.pillarCount());
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('開くと見出しが源泉の数の1位を文で出し、47本の柱が立つ', async ({ page }) => {
  await open(page);
  await expect(page.locator('#headline')).toHaveText('源泉の数、1位は大分県。5,094か所');
  await expect(page.locator('#trend')).toBeHidden();
  await expect(page.locator('.metric[data-metric="sources"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rank-list .rank-row')).toHaveCount(47);
  await expect(page.locator('#rank-list .rank-row').first()).toContainText('大分県');
  await expect(page.locator('#rank-list .rank-row').first()).toContainText('5,094か所');
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'ready');
  await expect(page.locator('#map canvas')).toBeVisible();
  await expect.poll(() => pillarCount(page)).toBe(47);
  await expect.poll(() => grow(page), { timeout: 5000 }).toBe(1);
});

test('銭湯に切り替えると東京都429軒と4年の推移が出て、柱が地面から伸び直す', async ({ page }) => {
  await open(page);
  await expect.poll(() => grow(page), { timeout: 5000 }).toBe(1);
  await page.locator('.metric[data-metric="sento"]').click();
  const first = await grow(page);
  await expect(page.locator('#headline')).toHaveText('銭湯の数、1位は東京都。429軒');
  await expect(page.locator('#trend')).toHaveText('全国の銭湯は4年で3,231軒→2,730軒（501軒減）');
  await expect(page.locator('.metric[data-metric="sento"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\?m=sento$/);
  await expect(page.locator('#ranking-title')).toHaveText('銭湯の数の順位');
  await expect(page.locator('#rank-list .rank-row').first()).toContainText('東京都');
  await expect(rankRow(page, '06')).toContainText('0軒');
  await expect(page.locator('#pillar-note')).toContainText('0の山形県には柱を立てていません');
  // 山形県（0軒）の柱は立てない
  await expect.poll(() => pillarCount(page)).toBe(46);
  expect(first).toBeLessThan(1);
  await expect.poll(() => grow(page), { timeout: 5000 }).toBe(1);
});

test('動きを減らす設定では、切り替えても柱はすぐ立つ', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect.poll(() => grow(page)).toBe(1);
  await page.locator('.metric[data-metric="flow"]').click();
  expect(await grow(page)).toBe(1);
  await expect(page.locator('#headline')).toHaveText('湧き出る量、1位は大分県。毎分293,610L');
  await page.locator('.metric[data-metric="areas"]').click();
  await expect(page.locator('#headline')).toHaveText('温泉地の数、1位は北海道。226か所');
});

test('順位の一覧から秋田県を選ぶと、4指標の順位と地図に載っているお風呂の件数が出る', async ({ page }) => {
  await open(page);
  await rankRow(page, '05').click();
  await expect(page.locator('#pref-card')).toBeVisible();
  await expect(page.locator('#nation')).toBeHidden();
  // 県名と選んでいる指標（源泉の数 616か所・全国11位）は上の帯の見出しに1回だけ出す。シートは残りの3指標から始まる
  await expect(page.locator('#headline')).toHaveText('秋田県\u3000源泉の数 616か所・全国11位');
  await expect(page.locator('#pref-title')).toHaveText('秋田県');
  await expect(page.locator('#pref-title')).toHaveClass(/sr-only/);
  await expect(page.locator('#pref-metrics')).toHaveText('温泉地 104か所（7位）・湧き出る量 毎分79,766L（9位）・銭湯 12軒（32位）');
  // 見える文字だけを数える（読み上げ用の見出し .sr-only は除く）
  const seen = await page.evaluate(() => {
    const hidden = [...document.querySelectorAll('#sheet-body .sr-only')];
    for (const node of hidden) node.style.display = 'none';
    const text = `${document.querySelector('.band').innerText}\n${document.querySelector('#sheet-body').innerText}`;
    for (const node of hidden) node.style.display = '';
    return text;
  });
  expect(seen.split('秋田県').length - 1, '画面に見える「秋田県」は1回だけ').toBe(1);
  expect(seen.split('源泉の数 616か所').length - 1, '選んだ指標は1回だけ').toBe(1);
  const first = await page.locator('#pref-card > :not(.sr-only)').first().getAttribute('id');
  expect(first, 'シートは「← 全国の順位へ」から始まる').toBe('pref-back');
  // 見出しに件数。内訳はチップと同じなので行としては出さない
  await expect(page.locator('#pref-summary-title')).toHaveText('地図に載っているお風呂 120件');
  await expect(page.locator('#pref-card')).toContainText('地図に載っているお風呂 120件');
  await expect(page.locator('#pref-card')).not.toContainText('温泉79、');
  await expect(page.locator('#type-filter [data-type="onsen"]')).toHaveText('温泉 79件');
  await expect(page).toHaveURL(/\?pref=05$/);
  await expect.poll(() => page.evaluate(() => globalThis.__day052.level())).toBe('pref');
  // 件数が多い県は最初の50件＋「もっと見る」
  await expect(page.locator('#bath-list .bath-row')).toHaveCount(50);
  await expect(page.locator('#bath-more')).toHaveText('もっと見る（残り70件）');
  await page.locator('#bath-more').click();
  await expect(page.locator('#bath-list .bath-row')).toHaveCount(100);
  await expect(page.locator('#bath-more')).toHaveText('もっと見る（残り20件）');
  // 指標を切り替えると、カードの強調も変わる
  await page.locator('.metric[data-metric="areas"]').click();
  await expect(page.locator('#pref-metrics')).toHaveText('源泉 616か所（11位）・湧き出る量 毎分79,766L（9位）・銭湯 12軒（32位）');
  await expect(page.locator('#headline')).toHaveText('秋田県\u3000温泉地の数 104か所・全国7位');
  await expect(page).toHaveURL(/\?m=areas&pref=05$/);
});

test('一覧からお風呂を開くと、Googleマップへのリンクに緯度経度が入る', async ({ page }) => {
  await open(page, '?pref=05');
  const first = page.locator('#bath-list .bath-row').first();
  const id = await first.getAttribute('data-id');
  const bath = BATHS.baths.find((one) => one.id === id);
  await first.click();
  await expect(page.locator('#bath-card')).toBeVisible();
  await expect(page.locator('#bath-title')).toHaveText(bath.name ?? '名前の登録なし');
  await expect(page.locator('#bath-title')).toBeFocused();
  const maps = page.getByRole('link', { name: 'Googleマップで開く' });
  await expect(maps).toHaveAttribute('href', `https://www.google.com/maps/search/?api=1&query=${bath.lat.toFixed(5)},${bath.lng.toFixed(5)}`);
  await expect(maps).toHaveAttribute('target', '_blank');
  await expect(maps).toHaveAttribute('rel', /noopener/);
  const kind = { n: 'node', w: 'way', r: 'relation' }[id[0]];
  await expect(page.getByRole('link', { name: 'OpenStreetMapで見る' })).toHaveAttribute('href', `https://www.openstreetmap.org/${kind}/${id.slice(1)}`);
  await expect(page).toHaveURL(new RegExp(`\\?pref=05&bath=${id}$`));
  await expect(page.locator('#bath-back')).toHaveText('← 秋田県の一覧へ');
  await page.locator('#bath-back').click();
  await expect(page.locator('#pref-card')).toBeVisible();
  await expect(page.locator(`#bath-list [data-id="${id}"]`)).toBeFocused();
});

test('お風呂のカードは記載のある項目だけ出し、種類の根拠を文字で書く', async ({ page }) => {
  // アルパこまくさ：種類の登録なし・営業時間の記載あり（料金・露天の記載なし）
  await open(page, '?pref=05&bath=w457377725');
  await expect(page.locator('#bath-title')).toHaveText('アルパこまくさ');
  await expect(page.locator('#bath-type')).toHaveText('種類の登録なし');
  await expect(page.locator('#bath-facts')).toHaveText('営業時間（地図データの記載）09:00-19:00');
  await expect(page.locator('#bath-facts')).not.toContainText('料金');
  // 鶴舞温泉：名前から判断・料金の記載あり
  await page.goto(`${APP}?pref=05&bath=w683753404`);
  await expect(page.locator('#bath-type')).toHaveText('種類：温泉（名前から判断）');
  await expect(page.locator('#bath-facts')).toContainText('料金（地図データの記載）あり');
  await expect(page.locator('.caution')).toContainText('必ず施設に確かめてください');
});

test('「行った」は再読み込みしても残り、記録の一覧から外せる', async ({ page }) => {
  await open(page, '?pref=05&bath=w457377725');
  const visit = page.locator('#bath-visit');
  await expect(visit).toHaveAttribute('aria-pressed', 'false');
  // 1件目に印を付けるまでは、上の「行った記録」を出さない
  await expect(page.locator('#visited-open')).toBeHidden();
  await visit.click();
  await expect(visit).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#visited-open')).toBeVisible();
  await expect(page.locator('#visited-open')).toHaveText('行った記録（1）');
  await expect(page.locator('#visited-open')).toHaveAttribute('title', '行った 1か所・1都道府県');
  await page.reload();
  await expect(page.locator('#bath-visit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#visited-open')).toHaveText('行った記録（1）');

  await page.locator('#visited-open').click();
  await expect(page.locator('#visited-card')).toBeVisible();
  await expect(page.locator('#visited-title')).toBeFocused();
  await expect(page.locator('#visited-list')).toContainText('アルパこまくさ');
  await expect(page.locator('#visited-list')).toContainText('秋田県');
  await expect(page.locator('#visited-lead')).toHaveText('1か所・1都道府県');
  await page.getByRole('button', { name: 'アルパこまくさを行った記録から外す' }).click();
  await expect(page.locator('#visited-open')).toBeHidden();
  await expect(page.locator('#visited-lead')).toContainText('まだありません');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('day052.visited.v1')).items)).toEqual([]);
  await page.locator('#visited-back').click();
  await expect(page.locator('#bath-card')).toBeVisible();
  await expect(page.locator('#bath-visit')).toHaveAttribute('aria-pressed', 'false');
});

test('localStorage が使えなくても、「行った」は画面の中で動いて保存できないと知らせる', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  });
  await open(page, '?pref=05&bath=w457377725');
  await page.locator('#bath-visit').click();
  await expect(page.locator('#bath-visit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bath-visit-note')).toHaveText('この端末では記録を保存できません。画面を閉じると消えます。');
  await expect(page.locator('#visited-open')).toHaveText('行った記録（1）');
});

test('変な ?pref=99 は知らせてから全国を出し、URLからも外す', async ({ page }) => {
  await open(page, '?pref=99');
  await expect(page.locator('#notice')).toHaveText('指定された県が見つからないので全国を表示しています');
  await expect(page.locator('#nation')).toBeVisible();
  await expect(page.locator('#headline')).toHaveText('源泉の数、1位は大分県。5,094か所');
  await expect(page).toHaveURL(/day-052-onsen-map\/$/);
  // 次の操作で知らせは消える
  await page.locator('.metric[data-metric="sento"]').click();
  await expect(page.locator('#notice')).toBeHidden();
});

test('知らない指標と、見つからないお風呂も知らせる', async ({ page }) => {
  await open(page, '?m=onsen&pref=05&bath=n1');
  await expect(page.locator('#notice')).toHaveText('指定された指標が見つからないので源泉の数を表示しています。指定されたお風呂が見つからないので秋田県を表示しています');
  await expect(page.locator('#pref-card')).toBeVisible();
  await expect(page).toHaveURL(/\?pref=05$/);
});

test('0件の種類のチップは押せず、ほかの県で選んだ種類が0件の県では国の統計の数を添えて知らせる', async ({ page }) => {
  await open(page, '?pref=05');
  const sento = page.locator('#type-filter [data-type="sento"]');
  await expect(sento).toBeDisabled();
  await expect(sento).toHaveAttribute('aria-disabled', 'true');
  expect(Number(await sento.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThan(0.6);
  // 0件のチップは末尾へ。「すべて」「温泉」の次に「種類の登録なし」
  expect(await page.locator('#type-filter [data-type]').evaluateAll((nodes) => nodes.map((node) => node.dataset.type))).toEqual(['all', 'onsen', 'other', 'super', 'foot', 'sento']);
  // 注記を押すと「種類の登録なし」が選ばれる
  const note = page.getByRole('button', { name: '銭湯の多くは「種類の登録なし」に入っています' });
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator('#type-filter [data-type="other"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bath-list .bath-row')).toHaveCount(36);
  await page.locator('#type-filter [data-type="all"]').click();
  await expect(page.locator('#type-filter [data-type="onsen"]')).toBeEnabled();
  // 東京都で銭湯（18件）に絞ってから秋田県へ移ると、0件の知らせが出る
  await page.locator('#pref-back').click();
  await rankRow(page, '13').click();
  await page.locator('#type-filter [data-type="sento"]').click();
  await expect(page.locator('#type-filter [data-type="sento"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#type-filter [data-type="sento"]')).toBeFocused();
  await expect(page.locator('#bath-list .bath-row')).toHaveCount(18);
  await page.locator('#pref-back').click();
  await rankRow(page, '05').click();
  await expect(page.locator('#pref-empty-text')).toHaveText('この県で地図に載っている銭湯はありません（国の統計では12軒）');
  await expect(page.locator('#pref-empty-hint')).toContainText('銭湯の多くが「種類の登録なし」');
  await expect(page.locator('#bath-list .bath-row')).toHaveCount(0);
  await page.locator('#type-filter [data-type="foot"]').click();
  await expect(page.locator('#pref-empty')).toBeHidden();
  await expect(page.locator('#bath-list .bath-row')).toHaveCount(4);
  await expect(page.locator('#bath-list .bath-meta')).toHaveText(['足湯・手湯', '足湯・手湯', '足湯・手湯', '足湯・手湯']);
});

test('地図が使えない端末（WebGLなし）でも、順位の表から県とお風呂を選べる', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      if (/webgl/i.test(String(type))) return null;
      return original.call(this, type, ...rest);
    };
  });
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'failed');
  await expect(page.locator('#map-status')).toHaveText('地図を表示できませんでした。順位の表は使えます');
  await expect(page.locator('#headline')).toHaveText('源泉の数、1位は大分県。5,094か所');
  await expect(page.locator('#rank-list .rank-row')).toHaveCount(47);
  // 近くを見るは、地図の代わりの帯の中に残る
  await expect(page.getByRole('button', { name: '近くを見る' })).toBeVisible();
  await rankRow(page, '05').click();
  await expect(page.locator('#headline')).toHaveText('秋田県\u3000源泉の数 616か所・全国11位');
  await expect(page.locator('#pref-metrics')).toHaveText('温泉地 104か所（7位）・湧き出る量 毎分79,766L（9位）・銭湯 12軒（32位）');
  await expect(page.locator('#pref-summary-title')).toHaveText('地図に載っているお風呂 120件');
  await page.locator('#bath-list .bath-row').first().click();
  await expect(page.getByRole('link', { name: 'Googleマップで開く' })).toHaveAttribute('href', /query=\d+\.\d{5},\d+\.\d{5}$/);
  expect(await noSideScroll(page)).toBe(true);
});

test('地図のスタイルが届かないときも、順位の表を主にして知らせる', async ({ page }) => {
  knobs.get(page).styleStatus = 503;
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'failed');
  await expect(page.locator('#map-status')).toHaveText('地図を表示できませんでした。順位の表は使えます');
  // 地図の右上に並べていた「近くを見る」は、地図が消えたら帯の中へ戻る
  await expect(page.getByRole('button', { name: '近くを見る' })).toBeVisible();
  expect(await page.locator('#near').evaluate((node) => node.parentElement.classList.contains('stage'))).toBe(true);
  await rankRow(page, '44').click();
  await expect(page.locator('#headline')).toHaveText('大分県\u3000源泉の数 5,094か所・全国1位');
  // 503 はブラウザがコンソールに記録する（アプリのエラーではない）
  failures.set(page, failures.get(page).filter((line) => !line.includes('503')));
});

test('データが読めないときは知らせ、もう一度読み込むで戻る', async ({ page }) => {
  let mode = 'hold';
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/day-052-onsen-map/data/stats.json', async (route) => {
    if (mode === 'hold') { await held; return route.abort(); }
    return route.continue();
  });
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#headline')).toHaveText('データを読み込んでいます…');
  release();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#failure')).toBeVisible();
  await expect(page.locator('#headline')).toHaveText('データを読み込めませんでした');
  await expect(page.locator('#nation')).toBeHidden();
  mode = 'pass';
  await page.locator('#retry').click();
  await expect(page.locator('#headline')).toHaveText('源泉の数、1位は大分県。5,094か所');
  await expect(page.locator('#failure')).toBeHidden();
  // 読み込みの失敗はブラウザがコンソールに記録する（アプリのエラーではない）
  failures.set(page, failures.get(page).filter((line) => !line.includes('ERR_FAILED')));
});

test('近くを見るは現在地へ寄り、近い順にお風呂を出す。戻ると近くの一覧へ', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(AKITA);
  await open(page);
  await page.getByRole('button', { name: '近くを見る' }).click();
  await expect(page.locator('#near-card')).toBeVisible();
  await expect(page.locator('#near-title')).toBeFocused();
  await expect(page.locator('#near-lead')).toHaveText(/^現在地から20km以内の、地図に載っているお風呂を近い順に\d+件$/);
  await expect(page.locator('#near-list .bath-meta').first()).toHaveText(/・\d+(\.\d)?(m|km)$/);
  await expect.poll(() => page.evaluate(() => globalThis.__day052.level())).toBe('near');
  await expect(page.locator('.here-marker')).toHaveCount(1);
  await page.locator('#near-list .bath-row').first().click();
  await expect(page.locator('#bath-back')).toHaveText('← 近くのお風呂へ');
  await page.locator('#bath-back').click();
  await expect(page.locator('#near-card')).toBeVisible();
  await page.locator('#near-back').click();
  await expect(page.locator('#nation')).toBeVisible();
  await expect(page.locator('.here-marker')).toHaveCount(0);
});

test('近くを見る：拒否と取得失敗は、それぞれ文で知らせる', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_found, fail) => fail({ code: globalThis.__geoCode ?? 1 });
  });
  await open(page);
  await page.getByRole('button', { name: '近くを見る' }).click();
  await expect(page.locator('#notice')).toHaveText('位置情報の利用が許可されていません。県の柱か順位の表から選べます');
  await page.evaluate(() => { globalThis.__geoCode = 3; });
  await page.getByRole('button', { name: '近くを見る' }).click();
  await expect(page.locator('#notice')).toHaveText('現在地を取得できませんでした。少し待って、もう一度お試しください');
  await expect(page.locator('#nation')).toBeVisible();
});

test('日本の外の現在地は、日本の外だと知らせる', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.85, longitude: 2.35 });
  await open(page);
  await page.getByRole('button', { name: '近くを見る' }).click();
  await expect(page.locator('#notice')).toHaveText('現在地が日本の外のようです。県の柱か順位の表から選べます');
  await expect(page.locator('#nation')).toBeVisible();
});

test('キーボードで順位の一覧から県を選び、Escapeで一段ずつ戻る', async ({ page }) => {
  await open(page);
  await rankRow(page, '05').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pref-title')).toBeFocused();
  await expect(page.locator('#pref-title')).toHaveText('秋田県');
  await page.locator('#bath-list .bath-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bath-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pref-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nation')).toBeVisible();
  await expect(rankRow(page, '05')).toBeFocused();
});

test('地図の柱を押すとその県を開き、柱の上では県名と数を出す', async ({ page }) => {
  await open(page);
  await expect.poll(() => grow(page), { timeout: 5000 }).toBe(1);
  const oita = STATS.prefectures.find((pref) => pref.code === '44').capital;
  const box = await page.locator('#map').boundingBox();
  const at = await page.evaluate(([lng, lat]) => globalThis.__day052.map.project([lng, lat]), [oita.lng, oita.lat]);
  await page.mouse.move(box.x + at.x, box.y + at.y - 6);
  await expect(page.locator('#tip')).toHaveText('大分県 5,094か所（1位）');
  await page.mouse.click(box.x + at.x, box.y + at.y - 6);
  await expect(page.locator('#pref-title')).toHaveText('大分県');
  await expect(page).toHaveURL(/\?pref=44$/);
});

const CREDITS = ['© OpenStreetMap contributors（ODbL）', 'OpenFreeMap', '© OpenMapTiles', '環境省『令和6年度温泉利用状況』（2025年3月末時点）', '厚生労働省『令和6年度衛生行政報告例』（2025年3月末時点）'];
// OSMF の帰属ガイドライン（OpenStreetMap は /copyright へのリンク）と、OpenMapTiles の CC BY 4.0（openmaptiles.org へのリンク）
const CREDIT_LINKS = ['https://www.openstreetmap.org/copyright', 'https://openmaptiles.org/'];

test('PCでは画面下の帯に出典を並べ、OpenStreetMap と OpenMapTiles はリンクにする', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const long = page.locator('.strip-long');
  await expect(long).toBeVisible();
  await expect(page.locator('.strip-short')).toBeHidden();
  for (const text of CREDITS) await expect(long).toContainText(text);
  for (const href of CREDIT_LINKS) await expect(long.locator(`a[href="${href}"]`)).toHaveCount(1);
  await expect(long).toBeInViewport();
  await page.locator('#about-link').click();
  await expect(page.locator('#about-title')).toBeFocused();
});

test('スマホでは出典の帯を1行にし、「詳しく」から出典と注意の節へ移れる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pref=05');
  // 地図の中の帰属表示は、タイルの帰属（OpenMapTiles と OpenStreetMap へのリンク）をそのまま出す
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toContainText('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
  await expect(attribution.locator('a[href="https://www.openstreetmap.org/copyright"]')).toHaveCount(1);
  const short = page.locator('.strip-short');
  await expect(short).toBeVisible();
  await expect(short).toHaveText('出典：OpenStreetMap・OpenMapTiles・環境省・厚労省（詳しく）');
  for (const href of CREDIT_LINKS) await expect(short.locator(`a[href="${href}"]`)).toHaveCount(1);
  await expect(page.locator('.strip-long')).toBeHidden();
  await expect(short).toBeInViewport();
  const lineHeight = await short.evaluate((node) => ({ height: node.getBoundingClientRect().height, line: parseFloat(getComputedStyle(node).lineHeight) }));
  expect(lineHeight.height, '1行に収まる').toBeLessThanOrEqual(lineHeight.line + 1);
  // 省略記号で「詳しく」が切れていない
  expect(await short.evaluate((node) => node.scrollWidth <= node.clientWidth), '帯の文字が切れない').toBe(true);
  // 390px未満では2行に折り返し、出典も「詳しく」も切らない
  for (const width of [375, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const fit = await short.evaluate((node) => ({
      over: node.scrollWidth > node.clientWidth,
      lines: Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)),
    }));
    expect(fit.over, `${width}px で帯の文字が切れない`).toBe(false);
    expect(fit.lines, `${width}px で2行まで`).toBeLessThanOrEqual(2);
    await expect(page.locator('#about-link-short')).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#about-link-short').click();
  await expect(page.locator('#about-title')).toBeFocused();
  await expect(page.locator('#app')).toHaveAttribute('data-sheet', 'open');
  for (const text of CREDITS) await expect(page.locator('#about')).toContainText(text);
  await expect(page.locator('#about-title')).toBeFocused();
  await expect(page.locator('#app')).toHaveAttribute('data-sheet', 'open');
  for (const text of [
    '地図の点は、OpenStreetMapに登録されたお風呂だけです。全部ではありません。',
    '銭湯の多くは「種類の登録なし」に入ります',
    '温泉地の数は、宿泊施設のある場所を数えたものです',
    '必ず施設に確かめてください',
    '柱の位置は県庁所在地（人口の重心）です',
    '「令和6年度温泉利用状況」（2025年3月末時点・都道府県別の表）を加工して作成',
    '5,208件。重複・私用・閉業を除き、同じ県・同じ名前で100m以内のもの（点と建物の輪郭の二重登録）は1件にまとめた',
    '表4（2020年度3,231軒・2024年度2,730軒）を加工して作成',
    // 環境省の利用ルールは、加工したことに加えて加工した主体を書くよう求めている
    'このサイト（100 DAYS / 100 APPS）が上の資料を加工して作ったもので、国が公表した表そのままではありません',
  ]) await expect(page.locator('#about')).toContainText(text);
  for (const href of CREDIT_LINKS) await expect(page.locator(`#about a[href="${href}"]`).first()).toBeVisible();
  // 出典の時点は温泉も銭湯も「2025年3月末時点」にそろえる
  expect(await page.locator('#about').textContent()).not.toMatch(/2024年度末|3月末現在|3月末）/);
  // 出典の表記は数字を半角にそろえる
  for (const selector of ['.strip', '#about']) expect(await page.locator(selector).textContent()).not.toMatch(/[０-９]/);
});

test('外へ出る通信は地図タイル（OpenFreeMap）だけ', async ({ page }) => {
  await open(page, '?pref=05');
  await page.locator('.metric[data-metric="sento"]').click();
  await page.locator('#bath-list .bath-row').first().click();
  await expect(page.locator('#bath-card')).toBeVisible();
  expect([...new Set(outside.get(page))]).toEqual(['tiles.openfreemap.org']);
});

test('押せるものは44px以上で、シートは広げたり縮めたりできる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const toggle = page.locator('#sheet-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sheet-toggle-label')).toHaveText('地図を広く見る');
  await toggle.click();
  const measure = (selector) => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { name: node.id || node.className || node.textContent, width: Math.round(box.width), height: Math.round(box.height) };
  }));
  const check = (sizes) => {
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size.height, `${size.name} の高さ`).toBeGreaterThanOrEqual(44);
      expect(size.width, `${size.name} の幅`).toBeGreaterThanOrEqual(44);
    }
  };
  check(await measure('.metric, #near, #sheet-toggle, .rank-row, #pref-select, #okinawa, .maplibregl-ctrl-group button, .maplibregl-ctrl-attrib-button'));
  await rankRow(page, '05').click();
  check(await measure('#pref-back, .type-chip, .bath-row, #bath-more, #sento-note'));
  await page.locator('#bath-list .bath-row').first().click();
  check(await measure('#bath-back, #bath-maps, #bath-visit, #bath-osm'));
  // 1件目に印を付けたあとに出る「行った記録」も44px以上
  await page.locator('#bath-visit').click();
  check(await measure('#visited-open'));
});

test('390pxと1440pxで横スクロールが出ない', async ({ page }) => {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await open(page);
    expect(await noSideScroll(page), `${width}px 全国`).toBe(true);
    // 件数の多い東京都（341件）と、長い名前のお風呂
    await rankRow(page, '13').click();
    await expect(page.locator('#pref-card')).toBeVisible();
    await expect.poll(() => noSideScroll(page)).toBe(true);
    expect(await page.locator('#sheet-body').evaluate((node) => node.scrollWidth <= node.clientWidth), `${width}px シートの中`).toBe(true);
    await page.locator('#bath-list .bath-row').first().click();
    await expect(page.locator('#bath-card')).toBeVisible();
    expect(await noSideScroll(page), `${width}px お風呂`).toBe(true);
  }
});

// OpenFreeMap の dark スタイルと同じ名前・同じ書き方の文字ラベルの層を持つ小さなスタイル
const LATIN_JA = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name_en'], ['get', 'name']]];
const LABEL_STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    openmaptiles: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { class: 'city', name: '秋田市', 'name:ja': '秋田市', 'name:latin': 'Akita' }, geometry: { type: 'Point', coordinates: [140.1, 39.7] } }] },
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(12,12,12)' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': 'rgb(27,27,29)' } },
    { id: 'highway_motorway_subtle', type: 'line', source: 'openmaptiles', maxzoom: 6, paint: { 'line-color': '#181818' } },
    { id: 'highway_minor', type: 'line', source: 'openmaptiles', minzoom: 8, paint: { 'line-color': '#181818' } },
    { id: 'boundary_state', type: 'line', source: 'openmaptiles', paint: { 'line-color': 'hsl(0,0%,21%)', 'line-dasharray': [2, 2] } },
    { id: 'place_city', type: 'symbol', source: 'openmaptiles', maxzoom: 14, filter: ['==', ['get', 'class'], 'city'], layout: { 'text-field': LATIN_JA } },
    { id: 'place_state', type: 'symbol', source: 'openmaptiles', maxzoom: 12, filter: ['==', ['get', 'class'], 'state'], layout: { 'text-field': LATIN_JA } },
    { id: 'place_country_major', type: 'symbol', source: 'openmaptiles', maxzoom: 6, layout: { 'text-field': LATIN_JA } },
  ],
};

test('下地の地図の文字は、全国（ズーム6未満）では出さず、6からは日本語名だけ。国名はどのズームでも出さない', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/styles/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(LABEL_STYLE) });
    return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: '' });
  });
  await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'ready');
  const layers = await page.evaluate(() => {
    const map = globalThis.__day052.map;
    return Object.fromEntries(['place_city', 'place_state', 'place_country_major'].map((id) => [id, {
      text: map.getLayoutProperty(id, 'text-field'),
      visibility: map.getLayoutProperty(id, 'visibility') ?? 'visible',
      min: map.getLayer(id).minzoom,
      max: map.getLayer(id).maxzoom,
      filter: map.getFilter(id),
    }]));
  });
  const ja = ['coalesce', ['get', 'name:ja'], ['get', 'name']];
  expect(layers.place_city).toMatchObject({ text: ja, visibility: 'visible', min: 6, max: 14 });
  expect(layers.place_state).toMatchObject({ text: ja, min: 6, max: 12 });
  expect(layers.place_state.filter[0]).toBe('all');
  expect(layers.place_state.filter[2][0]).toBe('within');
  expect(layers.place_state.filter[2][1].type).toBe('MultiPolygon');
  expect(layers.place_country_major.visibility).toBe('none');
  // 地名は背景との比4.5以上の #aab3c1。陸と海の差を上げ（比1.3以上）、県境は見える太さと明るさに
  const paintOf = (layer, property) => page.evaluate(([one, two]) => globalThis.__day052.map.getPaintProperty(one, two), [layer, property]);
  expect(await paintOf('place_city', 'text-color')).toBe('#aab3c1');
  expect(await paintOf('background', 'background-color')).toBe('#262d3a');
  expect(await paintOf('water', 'fill-color')).toBe('#0a1522');
  expect(await paintOf('boundary_state', 'line-color')).toBe('#7d8aa0');
  const width = await paintOf('boundary_state', 'line-width');
  expect(width[0]).toBe('interpolate');
  expect(Math.max(...width.slice(3).filter((value, index) => index % 2 === 1))).toBeGreaterThanOrEqual(1.6);
  // 全国の画面（ズーム6未満）では道路の線も出さない
  expect(await page.evaluate(() => globalThis.__day052.map.getLayer('highway_minor').minzoom)).toBe(8);
  expect(await page.evaluate(() => globalThis.__day052.map.getLayoutProperty('highway_motorway_subtle', 'visibility'))).toBe('none');
  expect(await page.evaluate(() => globalThis.__day052.map.getZoom())).toBeLessThan(6);
});

test('全国の構図：スマホは地図が画面の半分以上で列島を縦に、PCは横に回し、北海道と九州の端が枠に入る', async ({ page }) => {
  const ends = [[141.94, 45.52], [145.82, 43.38], [130.66, 30.99], [129.75, 32.58]]; // 宗谷岬・納沙布岬・佐多岬・野母崎
  for (const [width, height, bearing, pitch] of [[390, 844, 5, 40], [1440, 900, -10, 40], [768, 1024, -15, 40]]) {
    await page.setViewportSize({ width, height });
    await open(page);
    await expect.poll(() => page.evaluate(() => Math.round(globalThis.__day052.map.getBearing()))).toBe(bearing);
    expect(await page.evaluate(() => Math.round(globalThis.__day052.map.getPitch()))).toBe(pitch);
    // 視野角を15°に狭めて、画面の端の柱が斜めに倒れて見えないようにしている
    expect(await page.evaluate(() => Math.round(globalThis.__day052.map.getVerticalFieldOfView()))).toBe(15);
    const box = await page.locator('#map').boundingBox();
    if (width === 390) expect(box.height, '390×844 の地図の高さ').toBeGreaterThanOrEqual(height / 2);
    const at = await page.evaluate((points) => points.map((point) => globalThis.__day052.map.project(point)), ends);
    for (const point of at) {
      expect(point.x, `${width}px の横`).toBeGreaterThanOrEqual(0);
      expect(point.x, `${width}px の横`).toBeLessThanOrEqual(box.width);
      expect(point.y, `${width}px の縦`).toBeGreaterThanOrEqual(0);
      expect(point.y, `${width}px の縦`).toBeLessThanOrEqual(box.height);
    }
  }
});

test('県の画面では柱をすべて隠し（押しても当たらない）、全国に戻ると出す', async ({ page }) => {
  await open(page);
  const visibility = () => page.evaluate(() => globalThis.__day052.map.getLayoutProperty('pillars', 'visibility'));
  await expect.poll(visibility).toBe('visible');
  await rankRow(page, '05').click();
  await expect.poll(visibility).toBe('none');
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.queryRenderedFeatures({ layers: ['pillars'] }).length)).toBe(0);
  await page.locator('#bath-list .bath-row').first().click();
  expect(await visibility()).toBe('none');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#nation')).toBeVisible();
  await expect.poll(visibility).toBe('visible');
});

test('390px幅では、細い柱の周り±12pxを押しても、いちばん近い柱の県を開く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect.poll(() => grow(page), { timeout: 5000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  const sapporo = STATS.prefectures.find((pref) => pref.code === '01').capital;
  const box = await page.locator('#map').boundingBox();
  const { base, half } = await page.evaluate(([lng, lat]) => {
    const map = globalThis.__day052.map;
    const center = map.project([lng, lat]);
    // 柱の半径（14km）が画面で何pxか
    const edge = map.project([lng + 14 / (111.32 * Math.cos((lat * Math.PI) / 180)), lat]);
    return { base: center, half: Math.hypot(edge.x - center.x, edge.y - center.y) };
  }, [sapporo.lng, sapporo.lat]);
  expect(half, '390px幅の柱は細い').toBeLessThan(8);
  // 柱の外（右へ10px）を押しても当たる。スマホの当たりは±22px（直径44px相当）なので、右へ18pxでも当たる
  await page.mouse.click(box.x + base.x + 10, box.y + base.y - 4);
  await expect(page.locator('#pref-title')).toHaveText('北海道');
  await page.locator('#pref-back').click();
  await expect(page.locator('#nation')).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  const again18 = await page.evaluate(([lng, lat]) => globalThis.__day052.map.project([lng, lat]), [sapporo.lng, sapporo.lat]);
  await page.mouse.click(box.x + again18.x + 18, box.y + again18.y - 4);
  await expect(page.locator('#pref-title')).toHaveText('北海道');
  await page.locator('#pref-back').click();
  await expect(page.locator('#nation')).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  // 30px離れた、柱の無い所（札幌の東＝北海道の東側には県庁所在地が無い）では開かない
  const again = await page.evaluate(([lng, lat]) => globalThis.__day052.map.project([lng, lat]), [sapporo.lng, sapporo.lat]);
  expect(await page.evaluate(([x, y]) => globalThis.__day052.map.queryRenderedFeatures([[x - 22, y - 22], [x + 22, y + 22]], { layers: ['pillars'] }).length, [again.x + 30, again.y - 10])).toBe(0);
  await page.mouse.click(box.x + again.x + 30, box.y + again.y - 10);
  await page.waitForTimeout(300);
  await expect(page.locator('#nation')).toBeVisible();
});

test('「近くを見る」は右上の拡大・縮小の下にあり、スマホの県の画面でお風呂の点と重ならない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pref=05');
  await expect(page.locator('#bath-list .bath-row').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  const near = await page.getByRole('button', { name: '近くを見る' }).boundingBox();
  const nav = await page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl-group').first().boundingBox();
  expect(near.y, '拡大・縮小の下').toBeGreaterThanOrEqual(nav.y + nav.height);
  expect(Math.abs(near.x - nav.x), '同じ列').toBeLessThanOrEqual(1);
  // 右上のボタンの列（拡大・縮小・方位・近くを見る）の下に、秋田県のお風呂の点が1つも無い
  const box = await page.locator('#map').boundingBox();
  const akita = BATHS.baths.filter((bath) => bath.pref === '05').map((bath) => [bath.lng, bath.lat]);
  const projected = await page.evaluate((points) => points.map((point) => globalThis.__day052.map.project(point)), akita);
  const column = { left: Math.min(near.x, nav.x) - 7, right: Math.max(near.x + near.width, nav.x + nav.width) + 7, top: nav.y - 7, bottom: near.y + near.height + 7 };
  const under = projected.filter((point) => {
    const x = box.x + point.x;
    const y = box.y + point.y;
    return x >= column.left && x <= column.right && y >= column.top && y <= column.bottom;
  });
  expect(under).toEqual([]);
});

test('全国の画面では「県を押せる」ことを1行で伝え、順位の行はボタンに見える形で、棒の右端と縮尺がそろう', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const hint = page.locator('#hint');
  await expect(hint).toHaveText('柱か順位を押すと、その県のお風呂が出ます');
  const line = await hint.evaluate((node) => ({ height: node.getBoundingClientRect().height, line: parseFloat(getComputedStyle(node).lineHeight), overflow: node.scrollWidth > node.clientWidth }));
  expect(line.height, '390pxで1行').toBeLessThanOrEqual(line.line + 1);
  expect(line.overflow, '1行で切れていない').toBe(false);
  // 行の右端に「›」
  const rows = page.locator('#rank-list .rank-row');
  await expect(rows).toHaveCount(47);
  await expect(page.locator('#rank-list .rank-row .chevron')).toHaveCount(47);
  await expect(rows.first().locator('.chevron')).toHaveText('›');
  // ホバーで面の色が変わる
  const first = rows.first();
  await first.scrollIntoViewIfNeeded();
  const before = await first.evaluate((node) => getComputedStyle(node).backgroundColor);
  await first.hover();
  await expect.poll(() => first.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(before);
  // 値の列は固定幅の等幅数字。全行で棒の右端がそろい、1位の棒がいちばん長い
  const bars = await page.locator('#rank-list .rank-row').evaluateAll((nodes) => nodes.map((node) => {
    const bar = node.querySelector('.bar').getBoundingClientRect();
    const fill = node.querySelector('.bar > span').getBoundingClientRect();
    const value = node.querySelector('.value');
    return { right: Math.round(bar.right), width: Math.round(bar.width), fill: fill.width, valueWidth: Math.round(value.getBoundingClientRect().width), nums: getComputedStyle(value).fontVariantNumeric };
  }));
  expect(new Set(bars.map((bar) => bar.right)).size, '棒の右端').toBe(1);
  expect(new Set(bars.map((bar) => bar.width)).size, '棒の長さの基準').toBe(1);
  expect(new Set(bars.map((bar) => bar.valueWidth)).size, '値の列の幅').toBe(1);
  expect(bars.every((bar) => bar.nums.includes('tabular-nums'))).toBe(true);
  expect(Math.round(bars[0].fill)).toBe(bars[0].width);
  expect(bars.every((bar) => bar.fill <= bars[0].fill + 0.5)).toBe(true);
  // 県の画面では案内を出さない
  await rankRow(page, '05').click();
  await expect(hint).toBeHidden();
});

test('順位の見出しの横の「県を選ぶ」で、47都道府県から県の画面へ移る', async ({ page }) => {
  await open(page);
  const select = page.getByRole('combobox', { name: '県を選ぶ' });
  await expect(select).toBeVisible();
  expect(await select.locator('option').count()).toBe(48);
  expect(await select.locator('option').nth(1).textContent()).toBe('北海道');
  expect(await select.locator('option').nth(47).textContent()).toBe('沖縄県');
  await select.selectOption('05');
  await expect(page.locator('#pref-title')).toHaveText('秋田県');
  await expect(page).toHaveURL(/\?pref=05$/);
  await page.locator('#pref-back').click();
  // 選び直せるよう、見出しの表示（空の値）に戻っている
  await expect(select).toHaveValue('');
  await select.selectOption({ label: '大分県' });
  await expect(page.locator('#pref-title')).toHaveText('大分県');
});

test('390の県の画面では、最初の表示にお風呂の一覧の上から2件目までが入り、残り3指標は2行以内', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pref=05');
  await expect(page.locator('#bath-list .bath-row').first()).toBeVisible();
  const view = await page.locator('#sheet-body').boundingBox();
  const rows = await page.locator('#bath-list .bath-row').evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.getBoundingClientRect().toJSON()));
  for (const row of rows) expect(row.bottom, 'スクロールせずに見える').toBeLessThanOrEqual(view.y + view.height + 1);
  const metrics = await page.locator('#pref-metrics').evaluate((node) => ({ height: node.getBoundingClientRect().height, line: parseFloat(getComputedStyle(node).lineHeight) }));
  expect(metrics.height, '2行以内').toBeLessThanOrEqual(metrics.line * 2 + 1);
  // 一覧の見出しの横に並び順。日本語の名前が先、英字だけの名前は後ろ
  await expect(page.locator('#sort-note')).toHaveText('名前順');
  const names = await page.locator('#bath-list .bath-name').evaluateAll((nodes) => nodes.map((node) => node.firstChild.textContent));
  const japanese = (name) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(name);
  const firstLatin = names.findIndex((name) => name !== '名前の登録なし' && !japanese(name));
  expect(japanese(names[0])).toBe(true);
  if (firstLatin !== -1) expect(names.slice(firstLatin).every((name) => !japanese(name))).toBe(true);
  await page.locator('#bath-more').click();
  await page.locator('#bath-more').click();
  const all = await page.locator('#bath-list .bath-name').evaluateAll((nodes) => nodes.map((node) => node.firstChild.textContent));
  const latinAt = all.findIndex((name) => name === 'Kasumi Onsen (Yurihonjo)');
  // 名前の無いもの（「名前の登録なし」）は英字だけの名前のさらに後ろ
  const lastJapanese = all.map((name) => name !== '名前の登録なし' && japanese(name)).lastIndexOf(true);
  expect(latinAt).toBeGreaterThan(lastJapanese);
  expect(all.slice(all.indexOf('名前の登録なし')).every((name) => name === '名前の登録なし')).toBe(true);
});

test('画面の外にある沖縄県を左下の案内で知らせ、押すと沖縄県の画面へ移る', async ({ page }) => {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await open(page);
    await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
    const naha = STATS.prefectures.find((pref) => pref.code === '47').capital;
    const box = await page.locator('#map').boundingBox();
    const at = await page.evaluate(([lng, lat]) => globalThis.__day052.map.project([lng, lat]), [naha.lng, naha.lat]);
    const outside = at.x < 0 || at.y < 0 || at.x > box.width || at.y > box.height;
    expect(outside, `${width}px では沖縄が画面の外（主な4島を大きく入れているため）`).toBe(true);
    const button = page.getByRole('button', { name: '沖縄県', exact: true });
    await expect(button).toBeVisible();
    const place = await button.boundingBox();
    expect(place.x - box.x, '左の端').toBeLessThan(20);
    expect(box.y + box.height - (place.y + place.height), '下の端').toBeLessThan(20);
  }
  await page.getByRole('button', { name: '沖縄県', exact: true }).click();
  await expect(page.locator('#pref-title')).toHaveText('沖縄県');
  await expect(page.locator('#okinawa')).toBeHidden();
});

test('上位3県の柱の根元に「県名 数」を置き、指標を変えたら差し替え、県の画面では出さない', async ({ page }) => {
  await open(page);
  const labels = page.locator('.top-label');
  await expect(labels).toHaveText(['大分県 5,094', '鹿児島県 2,735', '北海道 2,249']);
  // 柱の陰に隠れないよう、根元の少し下
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  const oita = STATS.prefectures.find((pref) => pref.code === '44').capital;
  const box = await page.locator('#map').boundingBox();
  const base = await page.evaluate(([lng, lat]) => globalThis.__day052.map.project([lng, lat]), [oita.lng, oita.lat]);
  const label = await labels.first().boundingBox();
  expect(label.y - box.y).toBeGreaterThan(base.y);
  expect(Math.abs(label.x + label.width / 2 - (box.x + base.x))).toBeLessThan(3);
  await page.locator('.metric[data-metric="sento"]').click();
  await expect(labels).toHaveText(['東京都 429', '大阪府 354', '青森県 261']);
  await rankRow(page, '05').click();
  await expect(labels).toHaveCount(0);
  await page.locator('#pref-back').click();
  await expect(labels).toHaveText(['東京都 429', '大阪府 354', '青森県 261']);
});

test('点の5色は Okabe-Ito の配色で、チップ・一覧・地図の点が同じ色', async ({ page }) => {
  await open(page, '?pref=05');
  const colorOf = (selector) => page.locator(selector).first().evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(await colorOf('#type-filter [data-type="onsen"] .dot')).toBe('rgb(230, 159, 0)');
  expect(await colorOf('#type-filter [data-type="sento"] .dot')).toBe('rgb(86, 180, 233)');
  expect(await colorOf('#type-filter [data-type="super"] .dot')).toBe('rgb(240, 228, 66)');
  expect(await colorOf('#type-filter [data-type="foot"] .dot')).toBe('rgb(0, 158, 115)');
  expect(await colorOf('#type-filter [data-type="other"] .dot')).toBe('rgb(154, 161, 173)');
  const onsenRow = page.locator('#bath-list .bath-row').filter({ hasText: '温泉' }).first();
  expect(await onsenRow.locator('.dot').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(230, 159, 0)');
  const circle = await page.evaluate(() => globalThis.__day052.map.getPaintProperty('baths', 'circle-color'));
  expect(circle).toEqual(['match', ['get', 't'], 'onsen', '#E69F00', 'sento', '#56B4E9', 'super', '#F0E442', 'foot', '#009E73', '#9AA1AD']);
});

test('上の帯は画面に合わせて変わる：県では県の文、お風呂では見出しと切り替えを畳んで地図を380px以上に', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pref=05');
  await expect(page.locator('#headline')).toHaveText('秋田県　源泉の数 616か所・全国11位');
  await expect(page.locator('.metrics')).toBeVisible();
  await page.locator('#bath-list .bath-row').first().click();
  await expect(page.locator('#bath-card')).toBeVisible();
  await expect(page.locator('#headline')).toBeHidden();
  await expect(page.locator('.metrics')).toBeHidden();
  const map = await page.locator('#map').boundingBox();
  expect(map.height, '390×844 のお風呂の画面の地図').toBeGreaterThanOrEqual(380);
  // 施設名がその画面でいちばん大きい文字。「出典と注意」は小見出し
  const sizes = await page.evaluate(() => {
    const size = (node) => parseFloat(getComputedStyle(node).fontSize);
    const visible = [...document.querySelectorAll('.band *, .sheet-body *')].filter((node) => node.childNodes.length && node.getClientRects().length && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()));
    return { title: size(document.getElementById('bath-title')), largest: Math.max(...visible.filter((node) => node.id !== 'bath-title').map(size)), about: size(document.getElementById('about-title')) };
  });
  expect(sizes.title).toBeGreaterThan(sizes.largest);
  expect(sizes.about).toBeLessThan(16);
  // 選んだ点の横に施設名。寄りすぎないよう、ズームは10.5
  const name = await page.locator('#bath-title').textContent();
  await expect(page.locator('.bath-label')).toHaveText(name);
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  expect(await page.evaluate(() => globalThis.__day052.map.getZoom())).toBeCloseTo(10.5, 1);
  // ヘッダーとカードの「行った」は同じ形（縁取りの丸いボタン）
  await page.locator('#bath-visit').click();
  const radius = await page.evaluate(() => ['bath-maps', 'bath-visit', 'visited-open'].map((id) => getComputedStyle(document.getElementById(id)).borderTopLeftRadius));
  expect(radius).toEqual(['10px', '10px', '10px']);
});

test('小さな崩れ：「近く」のアイコンと文字が重ならず、方位のボタンに名前があり、選択中は白地に紺', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pref=05');
  const icon = await page.locator('#near .near-icon').boundingBox();
  const text = await page.locator('#near .near-short').boundingBox();
  expect(icon.y + icon.height, 'アイコンの下に文字').toBeLessThanOrEqual(text.y + 0.5);
  const compass = page.locator('.maplibregl-ctrl-compass');
  await expect(compass).toHaveAttribute('aria-label', '北を上にして傾きを戻す');
  await expect(compass).toHaveAttribute('title', '北を上にして傾きを戻す');
  // 選ばれている状態は、タブもチップも「白い枠2px（縁1px＋内側の線1px）＋少し明るい地」
  const pickedLook = (node) => {
    const style = getComputedStyle(node);
    return [style.borderTopColor, style.borderTopWidth, style.boxShadow, style.backgroundColor];
  };
  const tab = await page.locator('.metric[aria-pressed="true"]').evaluate(pickedLook);
  const chip = await page.locator('#type-filter [aria-pressed="true"]').evaluate(pickedLook);
  expect(tab).toEqual(['rgb(243, 246, 251)', '1px', 'rgb(243, 246, 251) 0px 0px 0px 1px inset', 'rgb(49, 60, 82)']);
  expect(chip).toEqual(tab);
  const idle = await page.locator('.metric[aria-pressed="false"]').first().evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(idle).not.toBe(tab[3]);
  // 朱色の塗りは主ボタン（Googleマップで開く）だけ
  const orange = await page.evaluate(() => [...document.querySelectorAll('button, a')].filter((node) => getComputedStyle(node).backgroundColor === 'rgb(255, 180, 62)').map((node) => node.id));
  expect(orange).toEqual(['bath-maps']);
  // 日本語は文節で折り返し、崩れやすい語句は折り返さない
  expect(await page.evaluate(() => getComputedStyle(document.body).wordBreak)).toBe('auto-phrase');
  expect(await page.locator('#sento-note .nowrap').textContent()).toBe('種類の登録なし');
  expect(await page.evaluate(() => [...document.querySelectorAll('.caution .nowrap, #about .nowrap')].map((node) => node.textContent))).toEqual(['出かける前に', '種類の登録なし', '出かける前に', '県庁所在地']);
  // ホバーの見た目は、ホバーできる端末（@media (hover: hover)）の中だけ
  const stray = await page.evaluate(() => {
    const sheet = [...document.styleSheets].find((one) => one.href?.endsWith('/app.css'));
    const out = [];
    const walk = (rules, inHover) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, inHover || rule.conditionText.includes('hover: hover'));
        else if (rule.selectorText?.includes(':hover') && !inHover) out.push(rule.selectorText);
      }
    };
    walk(sheet.cssRules, false);
    return out;
  });
  expect(stray).toEqual([]);
});

test('地図の中の帰属表示は、開いた直後は出たままで、5秒たつと（i）に畳まれ、押すと開く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  const shown = () => attribution.evaluate((node) => node.classList.contains('maplibregl-compact-show'));
  const collapsed = () => attribution.evaluate((node) => node.classList.contains('maplibregl-compact') && !node.classList.contains('maplibregl-compact-show'));
  // OSMF の帰属ガイドライン：畳んでよいのは地図の操作か表示から5秒後だけ。開いた直後は読める状態で出す
  await expect.poll(shown).toBe(true);
  await expect(attribution.locator('.maplibregl-ctrl-attrib-inner')).toBeVisible();
  await expect(attribution).toContainText('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
  // 広がっている間も、左下の「沖縄県 ↙」と上位の県名のラベルには重ならない
  const box = await attribution.boundingBox();
  for (const selector of ['#okinawa', '.top-label']) {
    for (const other of await page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))) {
      const apart = other.right <= box.x || box.x + box.width <= other.left || other.bottom <= box.y || box.y + box.height <= other.top;
      expect(apart, `${selector} と帰属表示が重ならない`).toBe(true);
    }
  }
  // 構図は畳んだ（i）の高さで決める（lib/map.js の COLLAPSED_ATTRIBUTION_HEIGHT）
  await expect.poll(collapsed, { timeout: 12_000 }).toBe(true);
  await expect(attribution.locator('.maplibregl-ctrl-attrib-inner')).toBeHidden();
  expect(await page.locator('.maplibregl-ctrl-bottom-right').evaluate((node) => node.offsetHeight)).toBe(68);
  // ＋・−・「近く」と同じ暗い角丸・影なしのボタン
  const look = await attribution.evaluate((node) => {
    const style = getComputedStyle(node);
    const button = node.querySelector('.maplibregl-ctrl-attrib-button').getBoundingClientRect();
    return { background: style.backgroundColor, radius: style.borderTopLeftRadius, shadow: style.boxShadow, width: Math.round(button.width), height: Math.round(button.height) };
  });
  const group = await page.locator('.maplibregl-ctrl-top-right .maplibregl-ctrl-group').first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, radius: style.borderTopLeftRadius, shadow: style.boxShadow };
  });
  expect(look).toEqual({ ...group, width: 44, height: 44 });
  expect(group.shadow).toMatch(/0px 0px 0px 1px$/);
  // 畳んだあとに利用者が開いたら、開いたままにする
  await attribution.locator('.maplibregl-ctrl-attrib-button').click();
  await expect(attribution.locator('.maplibregl-ctrl-attrib-inner')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(attribution.locator('.maplibregl-ctrl-attrib-inner')).toBeVisible();
  // 下の帯にも OpenStreetMap と OpenMapTiles の表記がある
  await expect(page.locator('.strip-short')).toContainText('OpenStreetMap・OpenMapTiles');
});

test('5秒より前でも、利用者が地図を動かしたら帰属表示を畳む', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect.poll(() => attribution.evaluate((node) => node.classList.contains('maplibregl-compact-show'))).toBe(true);
  const canvas = await page.locator('#map canvas').boundingBox();
  const x = canvas.x + canvas.width * 0.55;
  const y = canvas.y + canvas.height * 0.25;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 80, y + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => attribution.evaluate((node) => !node.classList.contains('maplibregl-compact-show')), { timeout: 2_000 }).toBe(true);
});

test('根元のラベルは、390では1位の1本だけ・768以上は上位3本で、どれも「沖縄県」の案内から8px以上離れる', async ({ page }) => {
  for (const [width, height, count] of [[390, 844, 1], [768, 1024, 3], [1440, 900, 3]]) {
    await page.setViewportSize({ width, height });
    await open(page);
    await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
    await expect(page.locator('.top-label')).toHaveCount(count);
    await expect(page.locator('.top-label').first()).toHaveText('大分県 5,094');
    const button = await page.locator('#okinawa').boundingBox();
    const labels = await page.locator('.top-label').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    for (const label of labels) {
      const gapX = Math.max(button.x - label.right, label.left - (button.x + button.width));
      const gapY = Math.max(button.y - label.bottom, label.top - (button.y + button.height));
      expect(Math.max(gapX, gapY), `${width}px のラベルと案内のすき間`).toBeGreaterThanOrEqual(8);
    }
  }
});

test('390で柱が重なって見えるところは、指にいちばん近い柱の県を開く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect.poll(() => grow(page), { timeout: 5000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  // 関東は、東京都・埼玉県・神奈川県・千葉県の柱が画面の上で重なるほど近い
  const box = await page.locator('#map').boundingBox();
  const bases = await page.evaluate((prefs) => prefs.map((pref) => ({ code: pref.code, ...globalThis.__day052.map.project([pref.capital.lng, pref.capital.lat]) })),
    STATS.prefectures.filter((pref) => ['11', '12', '13', '14'].includes(pref.code)));
  const spread = Math.max(...bases.map((one) => Math.max(...bases.map((two) => Math.hypot(one.x - two.x, one.y - two.y)))));
  expect(spread, '4本の根元が近い').toBeLessThan(40);
  for (const { code, x, y } of bases) {
    // それぞれの柱の根元の真上（柱の中）を押すと、その県が開く
    await page.mouse.click(box.x + x, box.y + y - 2);
    await expect(page.locator('#pref-title')).toHaveText(STATS.prefectures.find((pref) => pref.code === code).name);
    await page.locator('#pref-back').click();
    await expect(page.locator('#nation')).toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  }
});

test('390のお風呂の画面は、選んだ点をボタンの列を除いた範囲の中央に置き、名前は列にかからない。つまみは「くわしく見る」', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '?pref=05');
  await expect(page.locator('#sheet-toggle-label')).toHaveText('一覧を広げる');
  // お風呂の行の右端にも「›」
  await expect(page.locator('#bath-list .bath-row .chevron').first()).toHaveText('›');
  expect(await page.locator('#bath-list .bath-row .chevron').count()).toBe(await page.locator('#bath-list .bath-row').count());
  await page.locator('#bath-list .bath-row').first().click();
  await expect(page.locator('#bath-card')).toBeVisible();
  await expect(page.locator('#sheet-toggle-label')).toHaveText('くわしく見る');
  await expect.poll(() => page.evaluate(() => globalThis.__day052.map.isMoving())).toBe(false);
  const id = await page.evaluate(() => new URLSearchParams(location.search).get('bath'));
  const bath = BATHS.baths.find((one) => one.id === id);
  const map = await page.locator('#map').boundingBox();
  const at = await page.evaluate(([lng, lat]) => globalThis.__day052.map.project([lng, lat]), [bath.lng, bath.lat]);
  const column = await page.locator('.maplibregl-ctrl-top-right').boundingBox();
  const usable = column.x - map.x;
  expect(Math.abs(at.x - usable / 2), '横の中央').toBeLessThan(4);
  // 名前のラベルは右のボタンの列にかからない。長い名前は空いている幅で「…」にする
  const label = await page.locator('.bath-label').evaluate((node) => ({ ...node.getBoundingClientRect().toJSON(), cut: node.scrollWidth > node.clientWidth, overflow: getComputedStyle(node).textOverflow }));
  expect(label.right).toBeLessThanOrEqual(column.x);
  expect(label.left).toBeGreaterThanOrEqual(map.x);
  expect(label.overflow).toBe('ellipsis');
  await page.locator('#sheet-toggle').click();
  await expect(page.locator('#sheet-toggle-label')).toHaveText('地図を広く見る');
});

test('768では絞り込みのチップを折り返し、どのチップも文字を途中で切らない', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, '?pref=05');
  await expect(page.locator('#type-filter')).toBeVisible();
  const view = await page.locator('#type-filter').evaluate((node) => ({ wrap: getComputedStyle(node).flexWrap, scroll: node.scrollWidth > node.clientWidth + 1, right: node.getBoundingClientRect().right }));
  expect(view.wrap).toBe('wrap');
  expect(view.scroll).toBe(false);
  const chips = await page.locator('#type-filter .type-chip').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
  for (const right of chips) expect(right).toBeLessThanOrEqual(view.right + 0.5);
});
