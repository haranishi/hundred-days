/* Day 021 デモ動画の振り付け（record-demo.mjs から呼ばれる）。

   本番URLを実際に操作して撮る。局データも再生も本物（Radio Browser API・実局のストリーム）で、
   スタブは置かない。録画機の位置情報だけ秋田県庁付近に固定する。
   - 秋田は25km圏に局が無いので、「0件 → 半径の自動拡大 → 1000kmで局が並ぶ」が頭で見える
   - 「どこかの街」は Math.random を固定してロンドン（worldCities の2番目）に決め打ちする。
     ランダムのままだと在庫の薄い街を引いて0件のまま終わることがある
   録画に音は乗らない（record-demo.mjs が -an で書き出す）。冒頭の file:// の壊れたコマは
   tools/trim-demo.mjs（day-018と同じ）で切り落とす。 */

const LIVE_ORIGIN = 'https://hundred-days.pages.dev';
const LIVE_URL = `${LIVE_ORIGIN}/day-021-nearby-radio/`;
const AKITA = { latitude: 39.72, longitude: 140.10 };

/** クリック位置に波紋を出してから押す。「ワンタップ」が動画で見えるようにするための演出 */
async function tap(page, locator, settleMs = 120) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('タップ対象が画面にありません');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([px, py]) => {
    const ripple = document.createElement('div');
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.cssText = [
      'position:fixed', 'z-index:9999', 'pointer-events:none', 'width:44px', 'height:44px',
      `left:${px - 22}px`, `top:${py - 22}px`, 'border-radius:50%',
      'border:3px solid rgba(255,196,96,.95)', 'background:rgba(255,196,96,.28)',
      'transform:scale(.5)', 'opacity:1', 'transition:transform .45s ease-out, opacity .45s ease-out'
    ].join(';');
    document.body.append(ripple);
    requestAnimationFrame(() => { ripple.style.transform = 'scale(1.6)'; ripple.style.opacity = '0'; });
    setTimeout(() => ripple.remove(), 600);
  }, [x, y]);
  await page.waitForTimeout(settleMs);
  await page.mouse.click(x, y);
}

/** いま鳴っているカードの番号（無ければ null） */
function playingIndex(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.station-card.is-playing');
    return card ? Number(card.dataset.stationIndex) : null;
  });
}

export default async function scenario(page, h) {
  const context = page.context();
  await context.setGeolocation(AKITA);
  await context.grantPermissions(['geolocation'], { origin: LIVE_ORIGIN });
  await page.addInitScript(() => {
    // worldCities[1] = ロンドン。do-while の再抽選も同じ値を返すので固定になる
    Math.random = () => 1 / 30 + 0.001;
  });

  await page.goto(LIVE_URL, { waitUntil: 'load' });

  // 位置の許可 → 走査 → 25kmで0件 → 自動拡大 → 局が距離順に並ぶ
  await page.waitForSelector('.station-card', { timeout: 20_000 });
  await h.pause(1500);

  // 最寄りの局をタップ → TUNING… → ON AIR
  await tap(page, page.locator('.station-card').first());
  await page.waitForSelector('.station-card.is-playing', { timeout: 12_000 });
  await h.pause(2600);

  // 次へ（ザッピング）。鳴らない局があればNGを付けて自動で次へ進むところも本物の挙動
  const before = await playingIndex(page);
  await tap(page, page.locator('#next-button'));
  await page.waitForFunction((prev) => {
    const card = document.querySelector('.station-card.is-playing');
    return card && Number(card.dataset.stationIndex) !== prev;
  }, before, { timeout: 15_000 });
  await h.pause(2200);

  // 旅モード「どこかの街」→ ロンドン → 最寄りをタップ → ON AIR
  await tap(page, page.locator('#travel-button'));
  await page.waitForFunction(() => document.querySelector('#mode-label')?.textContent.includes('ロンドン'), null, { timeout: 5000 });
  await page.waitForSelector('.station-card', { timeout: 20_000 });
  await h.pause(1300);
  await tap(page, page.locator('.station-card').first());
  await page.waitForSelector('.station-card.is-playing', { timeout: 12_000 });
  await h.pause(3000);
}

// スクショ（screenshot.webp）は公開時に撮ったものをそのまま使うので shotSetup は置かない。
export const shotScroll = 0;
