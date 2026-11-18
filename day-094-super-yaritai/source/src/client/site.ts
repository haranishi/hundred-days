// 公開先の情報。シェアの URL はここだけを読む。
// ⚠️ index.html の canonical・og:url・og:image にも同じ URL を書いてある（SNS の読み取りは JS を動かさないので、
//    静的な HTML に書くしかない）。変えるときは両方を直す。食い違いは tests/e2e/meta.spec.ts が見つける。

/** 公開先。末尾の / まで含める */
export const SITE_URL = 'https://day94.rairakku.com/';

/** ゲームの正式名称 */
export const SITE_NAME = 'スーパーやりたい放題';

/** シェアの文に付けるハッシュタグ（# は付けない） */
export const HASHTAG = 'スーパーやりたい放題';

/** タイトル画面の一言 */
export const SITE_TAGLINE = '2分間で、スーパーの“やっちゃダメ”を全部やれ';

/** OGP の画像（1200×630。public/og.png） */
export const OG_IMAGE_URL = `${SITE_URL}og.png`;
