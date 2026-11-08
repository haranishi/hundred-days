// 外部Dayのアプリを、rairakku.com の中の住所から、アプリの住所 day<番号>.rairakku.com へ転送する（外部Day共通）。
//   ① rairakku.com/day<番号>/…                … すべての外部Day
//   ② rairakku.com/100days/<フォルダ名>/       … 紹介ページ（meta.json の intro）を持たない外部Dayだけ。他のDayと同じ「正の住所」が、そのままアプリへ届く。
//      🔴 フォルダの直下（/ の有無だけ違う2つ）だけ転送する。その下（screenshot.webp など、100日の一覧のカードが使う素材）は元のサイトへ素通し
//         （2026-11-04：下も転送していたため、カードの画像が day<番号>.rairakku.com/screenshot.webp へ飛んで 404＝壊れていた）
// 🔴 中継（アドレスを rairakku.com のまま配る）にはしない。アプリは1訪問で約30リクエスト（HTML・JS・音・モデル）。
//    Workers／Pages Functions の無料枠（1日10万回・rairakku.com の問い合わせAPIと共有）を食い、尽きると問い合わせが止まる。
//    転送なら1訪問で1回。②の経路は Day ごとに1本ずつ（`/100days/*` のように広げない。全Dayの訪問がこの枠を通ってしまう）。
// 外部Dayを足すときは、EXTERNAL_DAYS に足し（紹介ページが無ければ folder も）、②があれば wrangler.toml に経路を足して、出し直す（アプリのビルドではない）。
// 表に無い番号・GET/HEAD以外は、元のサイト（rairakku.com の Pages）へそのまま渡す。
export const EXTERNAL_DAYS = [
  { number: 81 },                             // 紹介ページあり：rairakku.com/100days/day-081-pagecrate/ はサイトの本物のページなので、転送しない
  { number: 83, folder: 'day-083-car360' },   // 紹介ページなし
  { number: 88, folder: 'day-088-bouquet-studio' }, // 紹介ページなし
];

const target = (day, rest, url) => `https://day${day.number}.rairakku.com${rest ?? '/'}${url.search}`;

export function redirectTarget(url) {
  const short = /^\/day0*(\d{1,3})(\/.*)?$/.exec(url.pathname);
  if (short) {
    const day = EXTERNAL_DAYS.find(entry => entry.number === Number(short[1]));
    if (day) return target(day, short[2], url);
  }
  // 正の住所は、フォルダの直下だけ（末尾の / はあってもなくてもよい）。その下の素材（カードの画像など）は転送しない。
  const canonical = /^\/100days\/([^/]+)\/?$/.exec(url.pathname);
  if (canonical) {
    const day = EXTERNAL_DAYS.find(entry => entry.folder === canonical[1]);
    if (day) return target(day, '/', url);
  }
  return null;
}

export default {
  async fetch(request) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const destination = redirectTarget(new URL(request.url));
      if (destination) return Response.redirect(destination, 302);
    }
    return fetch(request);
  },
};
