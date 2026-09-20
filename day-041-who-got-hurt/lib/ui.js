/* 画面に出す文字列はここにまとめる。DOMには触らない（テストから直に読める形にしておく） */
import { directionName, formatDistance } from './geo.js';
import { radiusLabel } from './query.js';

/* 「誰が」を答えの文に差し込む言い方。すべてのときは何も足さない。
   データのフラグは「当事者AかBに含まれる」という意味なので「関わった」と書く */
const WHO_PHRASE = {
  all: '',
  walker: '歩行者が関わった事故が',
  bike: '自転車が関わった事故が',
  elder: '65歳以上が関わった事故が',
};
const WHO_ZERO = {
  all: '',
  walker: '歩行者が関わった事故の',
  bike: '自転車が関わった事故の',
  elder: '65歳以上が関わった事故の',
};

/* 答えは1行。件数だけ太字にしたいので、文字のかたまりに分けて返す。
   分かれ目は語の途中にならない位置なので、そのまま折り返しの機会にも使える */
export const answerSegments = (radius, years, who, total) => [
  { text: `半径${radiusLabel(radius)}で、` },
  { text: `${years}年間に` },
  ...(WHO_PHRASE[who] ? [{ text: WHO_PHRASE[who] }] : []),
  { text: `${total}件`, strong: true },
  { text: '。' },
];
export const answerText = (radius, years, who, total) =>
  answerSegments(radius, years, who, total).map((part) => part.text).join('');

/* 2行目の内訳。絞り込みと同じ項目は繰り返さない（歩行者で絞って「うち歩行者」は意味がない） */
export function answerSubParts(who, summary) {
  const list = who === 'walker' || who === 'bike'
    ? [`うち65歳以上${summary.elder}件`, `死亡事故${summary.death}件`]
    : [`うち歩行者${summary.walker}件`, `自転車${summary.bike}件`, `死亡事故${summary.death}件`];
  return list.map((text, i) => (i < list.length - 1 ? `${text}・` : text));
}
export const answerSubText = (who, summary) => answerSubParts(who, summary).join('');

/* 0件でも空白にしない。これも答えとして出す */
export const zeroParts = (who) => ['この半径では、', `${WHO_ZERO[who] ?? ''}記録がありません。`];
export const zeroText = (who) => zeroParts(who).join('');
export const zeroSubText = () => '半径を広げるか、ほかの場所を選んでください。記録が無いことは、事故が起きなかったことと同じではありません。届け出のない事故は、このデータに入っていません。';

/* 件数は交通量で割っていない。多い＝危ない、とは言えない。答えのすぐ下と限界の両方に出す */
export const TRAFFIC_CAVEAT = '件数は交通量で割っていません。多い場所は、危ないのではなく、通る人や車が多いだけかもしれません。';

/* 集まっている地点。交差点の名前はデータに無いので、方角と距離で名指しする */
export const spotPlaceText = (spot) => (formatDistance(spot.distance) === '0m'
  ? 'ほぼこの地点'
  : `${directionName(spot.bearing)}へ${formatDistance(spot.distance)}`);

export function spotBreakdown(spot) {
  const parts = [];
  if (spot.walker) parts.push(`歩行者${spot.walker}`);
  if (spot.bike) parts.push(`自転車${spot.bike}`);
  if (spot.death) parts.push(`死亡${spot.death}`);
  return parts.length ? `（${parts.join('・')}）` : '';
}

export const spotText = (spot) =>
  `${spotPlaceText(spot)}${spot.crossing ? '・交差点' : ''} — ${spot.count}件${spotBreakdown(spot)}`;

export const spotsTitle = (count) => `事故が集まっている地点 上位${count}か所`;
export const SPOTS_NOTE = 'およそ40mの近さにあるものを1つの地点にまとめています。交差点の名前はデータに入っていないので、選んだ場所からの方角と直線距離で示しています。';

/* 時刻の帯 */
export const hoursTitle = (known) => `何時に起きているか（${known}件）`;
export const hourCellLabel = (hour, count) => `${hour}時台 ${count}件`;
export const peakText = (band) => (band.peak < 0 ? '' : `いちばん多いのは${band.peak}時台で、${band.hours[band.peak]}件です。`);
export const unknownHourText = (band) => (band.unknown > 0 ? `時刻が記録されていない${band.unknown}件は、この帯に入れていません。` : '');

/* 地図のピンは形で分ける。読み上げには形ではなく意味を渡す */
export const pinLabel = (spot) => `${spotPlaceText(spot)} ${spot.count}件`;

export const sourceYears = (index) => {
  const [first, last] = index?.years ?? [];
  return Number.isInteger(first) && Number.isInteger(last) ? `${first}〜${last}年` : '';
};
