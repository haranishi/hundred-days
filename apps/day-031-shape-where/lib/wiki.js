/* 正解を見せたあとに、その土地の Wikipedia の要約を1行だけ足す。
   クイズ本体は同梱データだけで完結していて、ここは「取れたら足す」おまけに徹する。
   だから失敗しても画面には何も出さず、コンソールにもエラーを残さない。 */

export const WIKI_ORIGIN = 'https://ja.wikipedia.org';
export const WIKI_LICENSE = 'Wikipedia · CC BY-SA 4.0';
const REQUEST_TIMEOUT = 4000;
const EXTRACT_LIMIT = 110;
/* Wikimedia は「連絡先の分かる User-Agent」を求めている。ブラウザからは User-Agent を
   差し替えられないので、REST API が用意している Api-User-Agent を使う。 */
const AGENT = 'hundred-days-day031 (https://hundred-days.pages.dev/day-031-shape-where/)';

export const summaryUrl = (title) => `${WIKI_ORIGIN}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

/** 記事そのもののURL。応答に content_urls が無かったときの控え */
export const articleUrl = (title) => `${WIKI_ORIGIN}/wiki/${encodeURIComponent(title)}`;

/** 先頭から max 文字に切り、切ったら「…」を足す。絵文字が割れないよう符号位置で数える */
export function trimExtract(text, max = EXTRACT_LIMIT) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const letters = [...clean];
  if (letters.length <= max) return clean;
  return `${letters.slice(0, max).join('')}…`;
}

/**
 * 引く記事名の候補。市区町村は同名の町が全国にあるので、素の名前で外したときに
 * 「大仙市 (秋田県)」の形も試す。都道府県は候補1つで足りる。
 */
export function titleCandidates(item, prefName) {
  const name = String(item?.name || '').trim();
  if (!name) return [];
  const pref = String(prefName || '').trim();
  if (!pref || pref === name) return [name];
  return [name, `${name} (${pref})`];
}

/** 次の候補を試すか。曖昧さ回避に当たったとき、または要約に県名が出てこないとき */
export function shouldTryNext(summary, prefName, remaining) {
  if (remaining <= 0) return false;
  if (!summary) return true;
  if (summary.type === 'disambiguation') return true;
  const pref = String(prefName || '').trim();
  if (!pref) return false;
  return !String(summary.extract || '').includes(pref);
}

/* 写真の配信元。2026-09-07 に実測したところ、ja.wikipedia.org の summary が返す
   thumbnail は thumb.wikimedia.org になっていた（upload.wikimedia.org は元画像の配信元で、
   古い応答ではこちらが返る）。ここを増やしたら scripts/build.mjs の IMG_BY_APP も直すこと。
   CSP で読めない配信元の写真は壊れた枠になるだけなので、その場合は本文だけ出す。 */
const THUMBNAIL_HOSTS = ['https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/'];

export const isThumbnailHost = (url) => THUMBNAIL_HOSTS.some((host) => String(url ?? '').startsWith(host));

/** 応答から画面が使う項目だけ取り出す。要約が空の記事は使わない */
export function pickFields(summary) {
  const extract = trimExtract(summary?.extract, EXTRACT_LIMIT);
  if (!extract) return null;
  const thumb = String(summary?.thumbnail?.source || '');
  return {
    title: String(summary?.title || '').trim(),
    extract,
    thumbnail: isThumbnailHost(thumb) ? thumb : '',
    url: String(summary?.content_urls?.desktop?.page || '').trim()
  };
}

async function getJson(fetchImpl, url, timeout) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetchImpl(url, {
      headers: { 'Api-User-Agent': AGENT, accept: 'application/json' },
      signal: controller?.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // ネットワーク断・時間切れ・壊れたJSON。どれも「足さない」に倒す
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 1ラウンド用の読み手を作る。同じ記事は一度しか取りに行かない。
 * 取れなければ null を返すだけで、例外は投げない。
 */
export function createWikiReader({ fetchImpl = globalThis.fetch?.bind(globalThis), timeout = REQUEST_TIMEOUT } = {}) {
  const cache = new Map();

  async function read(item, prefName) {
    const candidates = titleCandidates(item, prefName);
    if (!candidates.length || typeof fetchImpl !== 'function') return null;
    /* 鍵は候補の全部。「美郷町」は秋田・島根・宮崎にあるので、名前だけを鍵にすると
       全国モードで2件目の町に1件目の記事が付く */
    const cacheName = candidates.join('|');
    if (cache.has(cacheName)) return cache.get(cacheName);

    let result = null;
    // 県名は出てこないが中身のある要約。県名付きの候補が空振りしたときの控えにする
    let spare = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const summary = await getJson(fetchImpl, summaryUrl(candidates[i]), timeout);
      // 曖昧さ回避のページは中身が一覧なので、最後の候補でも使わない
      const usable = summary && summary.type !== 'disambiguation' ? pickFields(summary) : null;
      // 候補が尽きたときは shouldTryNext が false になるので、そこが打ち止め
      if (shouldTryNext(summary, prefName, candidates.length - 1 - i)) {
        if (!spare) spare = usable;
        continue;
      }
      result = usable;
      break;
    }
    const found = result ?? spare;
    cache.set(cacheName, found);
    return found;
  }

  return { read, cache };
}
