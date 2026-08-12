// Day 005 のデモ動画の振り付け。scripts/record-demo.mjs から読まれる。
//
// 見せたいこと：画像を入れると6色が出て、タップするだけでカラーコードが取れる、という一点。
// ファイル選択ダイアログは録画に映せないので、サンプル3種で「別の画像→別のパレット」を見せる。

// 一覧カードのサムネはパレットが主役。結果（プレビュー〜コピーボタン）が収まる位置まで下げて撮る。
// 1200×750での実測: #result の文書内top=489、result全体の高さ619px → 449で全体が入る。
export const shotScroll = 449;

// スクショは空のドロップゾーンではなく、夕焼けのパレットが出た状態で撮る。
export async function shotSetup(page) {
  await page.click('#samples button[data-sample="sunset"]');
  await page.waitForTimeout(600);
}

export default async function (page, h) {
  // 1. 初期状態：ドロップゾーンとサンプルチップを見せる
  await h.pause(1400);

  // 2. 「夕焼け」→ プレビューと6色のパレットが出る
  await page.click('#samples button[data-sample="sunset"]');
  await h.pause(600);
  await h.scrollTo('#palette');
  await h.pause(1600);

  // 3. いちばん大きい色をタップ → 「コピーしました」
  await page.click('#palette button.swatch');
  await h.pause(1500);

  // 4. 「夜の街」→ パレットが一変する
  await page.click('#samples button[data-sample="night"]');
  await h.pause(600);
  await h.scrollTo('#palette');
  await h.pause(1900);

  // 5. 「新緑」→ もう一度変わる。色ちがいの並びで締める
  await page.click('#samples button[data-sample="green"]');
  await h.pause(600);
  await h.scrollTo('#palette');
  await h.pause(2000);

  // 6. 先頭に戻って終わり
  await h.scrollTop(800);
  await h.pause(1700);
}
