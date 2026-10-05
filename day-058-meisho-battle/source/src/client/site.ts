// 公開先の情報。シェアの URL はここだけを読む。
// 100日チャレンジ版（Day58）の canonical・og:* は、リポジトリの共通ビルド（scripts/build.mjs）が meta.json から差し込む。
// ここを変えるときは、../meta.json の publicUrl と title も同じにする（食い違いは ../tests/ が見つける）。

/** 公開先。末尾の / まで含める */
export const SITE_URL = 'https://hundred-days.pages.dev/day-058-meisho-battle/'

export const SITE_NAME = 'ミニチュア観光名所バトル'

/** シェアの文の最後に付ける短い説明 */
export const SITE_TAGLINE = '組み上がる模型を見て、名所を早押しで当てるゲーム'

/** タイトルの上の帯に出す、100日チャレンジの通し番号 */
export const DAY_LABEL = '100 DAYS / 058'
