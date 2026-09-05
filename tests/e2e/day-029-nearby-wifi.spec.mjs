import { expect, test } from '@playwright/test';

const PATH = '/day-029-nearby-wifi/';
const PLACE = '**/api/day-029/place*';
const AKITA = { latitude: 39.7176, longitude: 140.1305 };
const EMPTY_STYLE = {
  version: 8,
  sources: {
    openfreemap: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> © OpenMapTiles Data from OpenStreetMap',
    },
  },
  layers: [],
};
const consoleErrors = new WeakMap();
const point = (offset) => ({ lat: AKITA.latitude + offset / 10000, lng: AKITA.longitude });

const DATA = {
  municipal: {
    generatedAt: '2026-09-04',
    sources: [
      { id: 'akita', org: '架空秋田市', pageUrl: 'https://example.test/akita', credit: '架空秋田市オープンデータを加工して作成' },
      {
        id: 'long-credit', org: '架空大阪府', pageUrl: 'https://example.test/osaka',
        credit: '「公衆無線LANアクセスポイント一覧」（架空大阪府）（https://data.example.test/dataset/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789）を加工して作成',
      },
    ],
    spots: [
      { src: 'akita', name: '駅前交流ラウンジ', ...point(1), ssid: 'AKITA-LINK', addr: '秋田市架空1', apCount: 1 },
      { src: 'akita', name: '市民ホール', ...point(5), apCount: 2 },
      { src: 'akita', name: '公園案内所', ...point(9), apCount: 1 },
    ],
  },
  osm: {
    generatedAt: '2026-09-04', source: '© OpenStreetMap contributors', license: 'ODbL 1.0',
    spots: [
      { id: 'node/1', name: '千秋ブックカフェ', cat: 'カフェ', fee: 'customers', ...point(2) },
      { id: 'node/2', name: '広小路ダイニング', cat: '飲食店', fee: 'paid', ...point(4) },
      { id: 'node/3', name: '北口コンビニ', cat: 'コンビニ', fee: 'unknown', ...point(6) },
      { id: 'node/4', name: '中央図書室', cat: '図書館', fee: 'free', ssid: 'LIBRARY', ...point(8) },
      { id: 'node/5', name: '旅籠なかいち', cat: '宿', fee: 'customers', ...point(11) },
    ],
  },
  chain: {
    generatedAt: '2026-09-04', source: '© OpenStreetMap contributors', license: 'ODbL 1.0',
    chains: [
      { id: 'all', label: '架空カフェ', tier: 'all', service: 'FREE-WIFI', access: 'none', condition: '登録不要', coverage: '全店', sourceUrl: 'https://example.test/all', checkedAt: '2026-09-04' },
      { id: 'partial', label: '架空バーガー', tier: 'partial', service: 'GUEST', access: 'account', condition: '会員ログインが必要', coverage: '一部店舗', sourceUrl: 'https://example.test/partial', checkedAt: '2026-09-04' },
    ],
    spots: [
      { id: 'node/11', brand: 'all', name: '架空カフェ', ...point(3) },
      { id: 'node/12', brand: 'partial', name: '架空バーガー東口店', ...point(7) },
      { id: 'node/13', brand: 'all', name: '架空カフェ広小路店', ...point(10) },
      { id: 'node/14', brand: 'partial', name: '架空バーガー南口店', ...point(12) },
    ],
  },
};

async function stub(page, { data = DATA, dataFailure = false, placeStatus = 200, places = [{ name: '秋田駅', lat: AKITA.latitude, lng: AKITA.longitude }] } = {}) {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(EMPTY_STYLE) }));
  await page.route(PLACE, (route) => route.fulfill({
    status: placeStatus, contentType: 'application/json', body: JSON.stringify(placeStatus === 200 ? { places } : { error: 'rate_limited' }),
  }));
  const requests = [];
  for (const name of ['osm-wifi', 'osm-chains', 'municipal']) {
    await page.route(`**/data/${name}.json`, (route) => {
      requests.push(name);
      if (dataFailure) return route.abort('internetdisconnected');
      const value = name === 'osm-wifi' ? data.osm : name === 'osm-chains' ? data.chain : data.municipal;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    });
  }
  return requests;
}

const locate = (page) => page.getByRole('button', { name: '現在地から探す' }).click();

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation(AKITA);
  const errors = []; consoleErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
});
test.afterEach(async ({ page }) => { expect(consoleErrors.get(page)).toEqual([]); });

test('Day 029 › 初期状態はempty、最初の検索中だけloadingになる', async ({ page }) => {
  await stub(page); await page.goto(PATH);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  const response = page.waitForResponse('**/data/municipal.json'); await locate(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', /loading|results/); await response;
});

test('Day 029 › 現在地から3層の要約・距離順・文字バッジが出る', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await expect(page.locator('#summary')).toContainText('半径 800m に 12 か所（自治体 3・OSM登録 5・推定 4）');
  await expect(page.locator('.spot')).toHaveCount(12);
  await expect(page.locator('.spot-name').first()).toHaveText('駅前交流ラウンジ');
  await expect(page.locator('.spot').first().locator('.badge')).toHaveText(['自治体', '無料']);
  await expect(page.locator('.spot[data-layer="osm"]').first().locator('.badge')).toHaveText(['来店客向け', 'OSM登録']);
  await expect(page.locator('.spot[data-id="chain/all/node/11"] .badge')).toHaveText(['推定']);
});

test('Day 029 › Googleマップは小数5桁の座標検索を新しいタブで開く設定', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page); const link = page.locator('.maps').first();
  await expect(link).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=39\.71\d{3},140\.1\d{4}$/);
  await expect(link).toHaveAttribute('aria-label', 'Googleマップで開く: 駅前交流ラウンジ');
  await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', /noopener/);
});

test('Day 029 › 層のチェックで件数が変わり、設定を保存する', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page); await page.locator('#layer-chain').uncheck();
  await expect(page.locator('#summary')).toContainText('8 か所（自治体 3・OSM登録 5・推定 0）');
  await page.reload(); await expect(page.locator('#layer-chain')).not.toBeChecked();
});

test('Day 029 › 無料絞り込みはOSM有料・不明だけを隠す', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page); await page.locator('#only-free').check();
  await expect(page.locator('#summary')).toContainText('10 か所（自治体 3・OSM登録 3・推定 4）');
  await expect(page.locator('.wifi-marker')).toHaveCount(10);
});

test('Day 029 › 0件から3.2kmへ広げ、同梱データは再取得しない', async ({ page }) => {
  const far = structuredClone(DATA);
  for (const group of [far.municipal.spots, far.osm.spots, far.chain.spots]) for (const spot of group) spot.lat += 0.012;
  const requests = await stub(page, { data: far }); await page.goto(PATH); await locate(page);
  await expect(page.locator('#none-body')).toContainText('半径 800m に登録された場所がありません');
  await page.locator('#widen').click(); await expect(page.locator('#summary')).toContainText('半径 3.2km に 12 か所');
  expect(requests.sort()).toEqual(['municipal', 'osm-chains', 'osm-wifi']);
});

test('Day 029 › 3.2kmでも0件なら別の場所を案内する', async ({ page }) => {
  const empty = { municipal: { sources: DATA.municipal.sources, spots: [] }, osm: { spots: [] }, chain: { chains: DATA.chain.chains, spots: [] } };
  await stub(page, { data: empty }); await page.goto(PATH); await locate(page); await page.locator('#widen').click();
  await expect(page.locator('#none-body')).toContainText('この範囲にはありません。地名で別の場所を探せます');
});

test('Day 029 › 地名検索は先頭候補を使い、1文字は送らない', async ({ page }) => {
  let placeRequests = 0; await stub(page); page.on('request', (request) => { if (request.url().includes('/api/day-029/place')) placeRequests += 1; });
  await page.goto(PATH); await page.locator('#place').fill('秋'); await page.locator('#search').click();
  await expect(page.locator('#message')).toHaveText('地名は2文字以上で入力してください'); expect(placeRequests).toBe(0);
  await page.locator('#place').fill('秋田駅'); await page.locator('#search').click(); await expect(page.locator('.spot')).toHaveCount(12);
});

test('Day 029 › 位置情報拒否とplace上流429を案内する', async ({ context, page }) => {
  await context.clearPermissions(); await stub(page, { placeStatus: 429 }); await page.goto(PATH); await locate(page);
  await expect(page.locator('#error-body')).toHaveText('位置情報が使えません。地名で探せます');
  await page.locator('#place').fill('秋田駅'); await page.locator('#search').click();
  await expect(page.locator('#message')).toHaveText('地名検索の提供元が混み合っています。30秒ほど待ってください');
  consoleErrors.get(page).splice(0);
});

test('Day 029 › 位置情報拒否を押した場所に近いメッセージで案内する', async ({ context, page }) => {
  await context.clearPermissions(); await stub(page); await page.goto(PATH); await locate(page);
  const message = page.locator('#error-body');
  await expect(message).toHaveText('位置情報が使えません。地名で探せます');
  await expect(message).toBeInViewport();
  consoleErrors.get(page).splice(0);
});

test('Day 029 › 地名候補を表示し、2件目を再通信なしで選べる', async ({ page }) => {
  const places = [
    { name: '秋田駅, 秋田市, 秋田県', lat: AKITA.latitude, lng: AKITA.longitude },
    { name: '秋田港駅, 土崎港, 秋田市', lat: AKITA.latitude + 0.0075, lng: AKITA.longitude },
  ];
  await stub(page, { places }); await page.goto(PATH);
  await page.locator('#place').fill('秋田駅'); await page.locator('#search').click();
  await expect(page.locator('#place-result')).toContainText('この場所で探しています: 秋田駅、秋田市、秋田県');
  await expect(page.locator('.candidate')).toHaveCount(2);
  const firstSummary = await page.locator('#summary').textContent();
  await page.locator('.candidate').nth(1).click();
  await expect(page.locator('.candidate').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#summary')).not.toHaveText(firstSummary);
});

test('Day 029 › 3層を全部外した理由を示し、まとめて復帰できる', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await page.locator('#layer-municipal').uncheck();
  await page.locator('#layer-osm').uncheck();
  await page.locator('#layer-chain').uncheck();
  await expect(page.locator('#none-body')).toHaveText('表示する層のチェックが全部外れています');
  await page.locator('#layers-on').click();
  await expect(page.locator('#summary')).toContainText('12 か所');
});

test('Day 029 › 結果があるまま半径を3.2kmへ切り替える', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await page.locator('#radius-toggle').click();
  await expect(page.locator('#summary')).toContainText('半径 3.2km');
  await expect(page.locator('#radius-toggle')).toHaveText('800mに戻す');
});

test('Day 029 › 110件では近い100件までとリスト末尾を案内する', async ({ page }) => {
  const many = structuredClone(DATA);
  many.municipal.spots = Array.from({ length: 110 }, (_, index) => ({
    src: 'akita', name: `地点${index}`, lat: AKITA.latitude + index / 1_000_000, lng: AKITA.longitude, apCount: 1,
  }));
  many.osm.spots = []; many.chain.spots = [];
  await stub(page, { data: many }); await page.goto(PATH); await locate(page);
  await expect(page.locator('#summary')).toContainText('近い100か所までを表示');
  await expect(page.locator('.spot')).toHaveCount(100);
  await expect(page.locator('li.list-end')).toHaveText('ここまで（近い100か所）');
});

test('Day 029 › 見つからない地名検索の後も直前の結果を残す', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await expect(page.locator('.spot')).toHaveCount(12);
  await page.unroute(PLACE);
  await page.route(PLACE, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ places: [] }) }));
  await page.locator('#place').fill('見つからない場所'); await page.locator('#search').click();
  await expect(page.locator('#message')).toHaveText('その地名は見つかりませんでした');
  await expect(page.locator('.spot')).toHaveCount(12);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'results');
});

test('Day 029 › 390×844で検索後もページ幅に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto(PATH); await locate(page);
  await expect(page.locator('#credits')).toContainText('abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Day 029 › 0件・エラー案内は検索カード内にある', async ({ page }) => {
  await stub(page); await page.goto(PATH);
  await expect(page.locator('.search-card #none')).toHaveCount(1);
  await expect(page.locator('.search-card #error')).toHaveCount(1);
  await expect(page.locator('.results-card #none, .results-card #error')).toHaveCount(0);
});

test('Day 029 › 390×844の0件時に範囲拡大が見える', async ({ page }) => {
  const far = structuredClone(DATA);
  for (const group of [far.municipal.spots, far.osm.spots, far.chain.spots]) for (const spot of group) spot.lat += 0.012;
  await page.setViewportSize({ width: 390, height: 844 }); await stub(page, { data: far }); await page.goto(PATH); await locate(page);
  await expect(page.locator('#widen')).toBeInViewport();
});

test('Day 029 › 凡例は検索前に隠れ検索後に表示される', async ({ page }) => {
  await stub(page); await page.goto(PATH);
  await expect(page.locator('.map-legend')).toBeHidden();
  await locate(page);
  await expect(page.locator('.map-legend')).toBeVisible();
});

test('Day 029 › 検索後の凡例は地図に出る区分だけと一致する', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await expect(page.locator('.map-legend span:not([hidden])')).toHaveCount(6);
});

test('Day 029 › オフラインで同梱データを読めないと再試行を案内する', async ({ page }) => {
  await stub(page, { dataFailure: true }); await page.goto(PATH); await locate(page);
  await expect(page.locator('#error-body')).toContainText('同梱データを読み込めませんでした'); consoleErrors.get(page).splice(0);
});

test('Day 029 › 再読込後に前回の場所から再検索できる', async ({ page }) => {
  await stub(page); await page.goto(PATH); await page.locator('#place').fill('秋田駅'); await page.locator('#search').click();
  // 検索が終わって前回の場所が保存されてから再読込する（保存は結果表示の後）
  await expect(page.locator('#app')).toHaveAttribute('data-state', /results|none/);
  await page.reload(); await expect(page.locator('#last-label')).toContainText('前回: 秋田駅（800m）');
});

test('Day 029 › 推定ピンのタップ文はブランド主語・確認日・未確認を示す', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await expect(page.locator('.spot[data-layer="chain"] .spot-note')).toHaveCount(0);
  // ピンは遠い順に追加（近いピンが前面）なので、順番でなくブランドで選ぶ
  const marker = page.locator('.wifi-marker[data-layer="chain"][data-id^="chain/partial/"]').first(); const id = await marker.getAttribute('data-id'); await marker.dispatchEvent('click');
  const row = page.locator(`.spot[data-id="${id}"]`); await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(row.locator('.spot-note')).toHaveText('架空バーガーは公式サイトで一部店舗で無料Wi-Fiを案内しています（2026-09-04時点）。会員ログインが必要。ただし、この地点で実際に使えるかは確認していません');
});

test('Day 029 › 出典欄に自治体クレジットと地図隅の出典が出る', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  await expect(page.locator('#credits')).toContainText('架空秋田市オープンデータを加工して作成');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap contributors');
  // OpenFreeMap の文言はタイルのスタイルが持つ出典で、差し替えた空スタイルではレイヤーが無く出ない（実画面では出ることを目視済み）。ここでは出典欄の方を見る
  await expect(page.locator('#credits')).toContainText('OpenFreeMap');
});

test('Day 029 › 開いた地図出典と凡例が各画面幅で重ならない', async ({ page }) => {
  await stub(page);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 750 }); await page.goto(PATH); await locate(page);
    const attribution = page.locator('.maplibregl-ctrl-attrib');
    await attribution.locator('.maplibregl-ctrl-attrib-button').click();
    const [legendBox, attributionBox] = await Promise.all([
      page.locator('.map-legend').boundingBox(),
      attribution.boundingBox(),
    ]);
    expect(legendBox).not.toBeNull(); expect(attributionBox).not.toBeNull();
    const overlaps = legendBox.x < attributionBox.x + attributionBox.width
      && legendBox.x + legendBox.width > attributionBox.x
      && legendBox.y < attributionBox.y + attributionBox.height
      && legendBox.y + legendBox.height > attributionBox.y;
    expect(overlaps, `${width}pxで凡例と出典が重なっています`).toBe(false);
  }
});

test('Day 029 › 320・390・1280pxで横スクロールしない', async ({ page }) => {
  await stub(page);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 750 }); await page.goto(PATH); await locate(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('Day 029 › 操作要素は44px以上', async ({ page }) => {
  await stub(page); await page.goto(PATH); await locate(page);
  const sizes = await page.locator('#locate, #search, .filter, .spot-main, .maps, .wifi-marker').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, name: node.className || node.id };
  }));
  // MapLibre のピンは transform の丸めで 43.99…px と測れることがある（CI の Linux で実測）。整数に丸めて比べる
  expect(sizes.every((size) => Math.round(size.width) >= 44 && Math.round(size.height) >= 44), JSON.stringify(sizes)).toBe(true);
});

test('Day 029 › 通信先は同一オリジンとOpenFreeMapだけでWi-Fi中継を呼ばない', async ({ page }) => {
  const forbidden = []; const wifiApi = [];
  page.on('request', (request) => {
    const url = new URL(request.url()); if (url.pathname.includes('/api/day-029/wifi')) wifiApi.push(url.href);
    if (['data:', 'blob:'].includes(url.protocol) || url.hostname === 'tiles.openfreemap.org') return;
    if (url.pathname.startsWith('/api/day-029/place') || url.pathname.startsWith('/day-029-nearby-wifi/')) return;
    forbidden.push(request.url());
  });
  await stub(page); await page.goto(PATH); await locate(page); await expect(page.locator('.spot')).toHaveCount(12);
  expect(wifiApi).toEqual([]); expect(forbidden).toEqual([]);
});
