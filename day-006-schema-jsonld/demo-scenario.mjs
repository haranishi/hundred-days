// Day 006 のデモ動画の振り付け。scripts/record-demo.mjs から読まれる。
//
// 見せたいこと：①必須2つだけでJSONが出る ②営業時間が曜日ごとにまとまる
// ③廃止されたタイプは生成せずに止める、の3点。締めは③（このアプリの主題）。

/** 店舗フォームを一通り埋める。スクショと動画の下ごしらえで共用する。 */
async function fillBusiness(page) {
  await page.fill('#name', '喫茶みどり');
  await page.fill('#postalCode', '100-0001');
  await page.fill('#addressRegion', '東京都');
  await page.fill('#addressLocality', '千代田区');
  await page.fill('#streetAddress', '千代田1-1');
  await page.selectOption('#businessType', 'Restaurant');
  await page.fill('#telephone', '03-1234-5678');
  await page.fill('#url', 'https://example.com/');
  await page.fill('#priceRange', '¥1,000〜¥2,000');
}

/** 月〜金を同じ時刻に、土曜を24時間、日曜を定休にする。曜日がまとまる様子を作る。 */
async function fillHours(page, pause = 0) {
  for (let i = 0; i < 5; i++) {
    await page.fill(`input[name="hours-${i}-opens"]`, '09:00');
    await page.fill(`input[name="hours-${i}-closes"]`, '18:00');
    if (pause) await page.waitForTimeout(pause);
  }
  await page.selectOption('select[name="hours-5-status"]', 'allDay');
  if (pause) await page.waitForTimeout(pause);
  await page.selectOption('select[name="hours-6-status"]', 'closed');
  if (pause) await page.waitForTimeout(pause);
}

// 一覧カードのサムネは「貼れるJSON-LDが出るツール」だと分かることを優先する。
// スクロール量は固定値にせず、出力欄の実位置から求める（レイアウトを変えても崩れないため）。
export async function shotSetup(page) {
  await fillBusiness(page);
  await fillHours(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const top = document.querySelector('#output-section').getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.round(top - 96));
  });
  await page.waitForTimeout(200);
}

export default async function (page, h) {
  // 1. 最初の画面。5つの種類と、打ち消し線の2つを見せる
  await h.pause(1500);

  // 2. 店名を打つ。まだ足りないので出力は「入れると出ます」のまま
  await page.locator('#name').pressSequentially('喫茶みどり', { delay: 110 });
  await h.pause(900);

  // 3. 住所を入れた瞬間にJSONが出る（必須はこの2つだけ）
  await page.fill('#postalCode', '100-0001');
  await page.fill('#addressRegion', '東京都');
  await page.fill('#addressLocality', '千代田区');
  await page.fill('#streetAddress', '千代田1-1');
  await h.pause(500);
  await h.scrollTo('#output-section');
  await h.pause(1900);

  // 4. 業種と営業時間を足す。月〜金が1件にまとまるところが見どころ
  await h.scrollTo('#businessType');
  await page.selectOption('#businessType', 'Restaurant');
  await h.pause(700);
  await h.scrollTo('.hours');
  await fillHours(page, 210);
  await h.pause(500);
  await h.scrollTo('#output-section');
  await h.pause(2400);

  // 5. コピー
  await page.click('#copy');
  await h.pause(1500);

  // 6. 「よくある質問」を選ぶ → 生成せずに廃止を告げる。ここで終わる
  await h.scrollTop(700);
  await h.pause(400);
  await page.click('.type-button[data-type="faq"]');
  await h.pause(3000);
}
