/* デモ動画の振り付け。

   このアプリは同梱データを同一オリジンから読み、地名検索だけ中継 API（functions/api/day-029/）
   を通す。地図タイルは OpenFreeMap から取る。Day 025 と同じく **録画の前に wrangler を起こしておくこと**：

     npm run build
     npx wrangler pages dev dist --port 8788

   そのうえで
     PLAYWRIGHT=<playwrightのindex.jsのパス> node scripts/record-demo.mjs --day 29

   実データ（秋田駅周辺）で撮る。1コマ目は「動いているところ」にする決まりなので、
   録画は頭から撮り、仕上げで頭を切り落とす。 */
const BASE = 'http://127.0.0.1:8788/day-029-nearby-wifi/';
const AKITA = { latitude: 39.7176, longitude: 140.1305 };

async function prepare(page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(AKITA);
  const response = await page.goto(BASE, { waitUntil: 'load' });
  if (!response?.ok()) throw new Error(`${BASE} が開けません（wrangler pages dev dist --port 8788 を先に起こす）`);
}

// 推定（チェーン）の項目があればそれを、無ければ先頭の項目を主役にする
async function pickLayer(page) {
  const chain = page.locator('.spot[data-layer="chain"]');
  return (await chain.count()) > 0 ? 'chain' : (await page.locator('.spot[data-layer="osm"]').count()) > 0 ? 'osm' : 'municipal';
}

// 地図タイルが揃ってから探す（「地図を読み込んでいます…」が結果の上に残らないように）
async function waitForMap(page) {
  await page.waitForFunction(() => document.querySelector('#map-status')?.hidden === true, null, { timeout: 20000 }).catch(() => {});
}

export default async function (page, h) {
  await prepare(page);
  await waitForMap(page);
  await h.pause(700);
  await page.getByRole('button', { name: '現在地から探す' }).click();
  await page.locator('.spot').first().waitFor();
  await h.pause(3000); // 要約・地図・距離順のリストがそろうところを見せる
  const layer = await pickLayer(page);
  await page.locator(`.spot[data-layer="${layer}"]`).first().scrollIntoViewIfNeeded();
  await h.pause(1500);
  await page.locator(`.wifi-marker[data-layer="${layer}"]`).first().dispatchEvent('click'); // ピンが重なる場所でも目当てのピンに届かせる
  await h.pause(1800);
  await page.locator(`.spot[data-layer="${layer}"]`).first().getByRole('link', { name: 'Googleマップで開く' }).hover();
  await h.pause(1800);
  await page.locator('#only-free').check(); // 有料・不明を隠す
  await h.pause(2200);
  await page.locator('#radius-toggle').click(); // 3.2km に広げる（結果があるまま半径を切り替える）
  await page.locator('#summary').filter({ hasText: '3.2km' }).waitFor();
  await h.pause(2600);
  await h.scrollTop(900);
  await h.pause(1200);
}

export async function shotSetup(page) {
  await page.setViewportSize({ width: 1200, height: 750 });
  await prepare(page);
  await waitForMap(page);
  await page.getByRole('button', { name: '現在地から探す' }).click();
  await page.locator('.spot').first().waitFor();
  await page.mouse.move(0, 0); // ホバーの痕を残さない
  await page.waitForTimeout(2500); // タイルが揃うのを待つ
}
