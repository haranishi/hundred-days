// rairakku.com/day<番号>/… を、外部Dayのアプリの住所 day<番号>.rairakku.com/… へ転送する（外部Day共通）。
// 🔴 中継（アドレスを rairakku.com のまま配る）にはしない。アプリは1訪問で約30リクエスト（HTML・JS・音・モデル）。
//    Workers／Pages Functions の無料枠（1日10万回・rairakku.com の問い合わせAPIと共有）を食い、尽きると問い合わせが止まる。
//    転送なら1訪問で1回。
// 外部Dayを足すときは、EXTERNAL_DAYS に番号を足してこのWorkerを出し直す（アプリのビルドではない）。
// 表に無い番号・GET/HEAD以外は、元のサイト（rairakku.com の Pages）へそのまま渡す。
export const EXTERNAL_DAYS = [81, 83];

export function redirectTarget(url) {
  const found = /^\/day0*(\d{1,3})(\/.*)?$/.exec(url.pathname);
  if (!found || !EXTERNAL_DAYS.includes(Number(found[1]))) return null;
  return `https://day${Number(found[1])}.rairakku.com${found[2] ?? '/'}${url.search}`;
}

export default {
  async fetch(request) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const target = redirectTarget(new URL(request.url));
      if (target) return Response.redirect(target, 302);
    }
    return fetch(request);
  },
};
