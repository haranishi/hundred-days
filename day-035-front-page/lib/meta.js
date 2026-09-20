/* 中継が返した生のメタを、紙面に載せる形へ整える。DOMに触らない純関数。 */

import { kanjiNumber, kanjiYear } from './kanji.js';

export const HEADLINE_MAX = 20;
export const LEAD_MAX = 120;

/* 「記事名｜媒体名」から媒体名を落とす。見出しに媒体名が入ると新聞に見えない。
   区切りで割って端の1片が媒体名と一致したときだけ落とす。
   「e-Stat の使い方」のように語中のハイフンで割れる題があるので、総当たりでは切らない。 */
const EDGE_TAIL = /^(.*\S)\s*[｜|‐–—―−\-:：]\s*([^｜|‐–—―−\-:：]{1,40})$/;
const EDGE_HEAD = /^([^｜|‐–—―−\-:：]{1,40})\s*[｜|‐–—―−\-:：]\s*(\S.*)$/;

const key = (value) => String(value ?? '').replace(/\s+/g, '').toLowerCase();
/* 媒体名を落としたあとに残る区切り記号を掃除する。
   note の og:title「note ――つくる、つながる、とどける。」から note を落とすと
   「―つくる、…」になり、見出しが記号で始まってしまう */
const trimEdges = (value) => value.replace(/^[｜|‐–—―−\-:：・\s]+/, '').replace(/[｜|‐–—―−\-:：・\s]+$/, '');

function sameBrand(part, site) {
  const a = key(part);
  const b = key(site);
  if (!a || !b) return false;
  return a === b || (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)));
}

export function stripSiteSuffix(title, site) {
  const text = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!text || !site) return text;
  const tail = EDGE_TAIL.exec(text);
  if (tail && sameBrand(tail[2], site)) return trimEdges(tail[1]);
  const head = EDGE_HEAD.exec(text);
  if (head && sameBrand(head[1], site)) return trimEdges(head[2]);
  return text;
}

/* 一面の見出しは短い。20字で切って「…」を付ける */
export function clipHeadline(text, max = HEADLINE_MAX) {
  const chars = [...String(text ?? '').trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

/* リードは2文まで。og:description は3文以上あることが多く、縦書きで流すと紙面が文字で埋まる */
export function leadSentences(text, max = 2) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sentences = normalized.match(/[^。！？!?]*[。！？!?]/g);
  const picked = sentences ? sentences.slice(0, max).join('').trim() : normalized;
  const chars = [...picked];
  return chars.length <= LEAD_MAX ? picked : `${chars.slice(0, LEAD_MAX - 1).join('')}…`;
}

/* 中継の戻り値 → 紙面の記事1本 */
export function toArticle(raw = {}) {
  const site = String(raw.site ?? raw.host ?? '').trim();
  const headline = clipHeadline(stripSiteSuffix(raw.title, site));
  return {
    headline,
    lead: leadSentences(raw.lead),
    site: site || String(raw.host ?? ''),
    host: String(raw.host ?? ''),
    image: raw.image ?? null,
    publishedAt: publishedLabel(raw.publishedAt),
    url: String(raw.canonical ?? raw.url ?? '')
  };
}

/* 記事の公開日は紙面の日付とは別物なので、記事の末尾に小さく置く。
   紙面に算用数字を混ぜないよう、ここでも漢数字にする */
export function publishedLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + (9 * 60 + date.getTimezoneOffset()) * 60_000);
  return `${kanjiYear(shifted.getFullYear())}年${kanjiNumber(shifted.getMonth() + 1)}月${kanjiNumber(shifted.getDate())}日`;
}
