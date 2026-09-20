/* 地域ごとの確率の系列から、画面に出す1行ぶんの事実を選ぶ。
   気象業務法17条があるので、ここでやるのは「選ぶ」だけ。
   補間・平均・独自の指数は作らない。出すのは気象庁が発表した整数そのまま。 */

/** 5日以内に暴風域に入る確率。積算の最後の値（＝5日目） */
export const throughLast = (series) => (Array.isArray(series) && series.length ? series[series.length - 1] : 0);

/** 3時間値の山。同じ値が並んだら早いほうを採る */
export function peakOf(series = []) {
  let index = -1;
  let value = -1;
  series.forEach((current, i) => {
    if (current > value) { value = current; index = i; }
  });
  return index < 0 ? { index: -1, value: 0 } : { index, value };
}

/** 5%以上になる最初の区間（ちょうど5%も含む）。無ければ -1 */
export const firstOver = (series = [], threshold = 5) => series.findIndex((value) => value >= threshold);

/** 地域の系列をまとめて読む。存在しない地域コードは null（画面は「取得できません」にせず場所選びに戻す） */
export function readArea({ timeseries, through }, area) {
  const series = timeseries?.probability?.[area];
  const cumulative = through?.probability?.[area];
  if (!Array.isArray(series) || !Array.isArray(cumulative)) return null;
  const peak = peakOf(series);
  const over = firstOver(series);
  return {
    area,
    series,
    cumulative,
    total: throughLast(cumulative),
    peak: { ...peak, validtime: peak.index >= 0 ? timeseries.validtime[peak.index] : '' },
    over: over < 0 ? null : { index: over, value: series[over], validtime: timeseries.validtime[over] },
    validtime: timeseries.validtime,
    targetDatetime: timeseries.targetDatetime,
  };
}

/**
 * 積算5日目が高い地域の上位。同じ値なら order（気象庁のファイル順＝北→南）が先のほうを上に。
 * orderOf は地域コード → 並び順。分からない地域は最後に回す。
 */
export function topAreas(through, orderOf, limit = 5) {
  const rows = Object.entries(through?.probability ?? {})
    .map(([area, series]) => ({ area, value: throughLast(series), order: orderOf(area) ?? Number.MAX_SAFE_INTEGER }));
  rows.sort((a, b) => (b.value - a.value) || (a.order - b.order));
  return rows.slice(0, limit);
}

/** 台風が2つ以上あるとき、選んだ街の積算が高いほうを主答えにする */
export function rankTyphoons(typhoons, area) {
  return [...typhoons]
    .map((typhoon) => ({ typhoon, total: area ? throughLast(typhoon.through?.probability?.[area]) : 0 }))
    .sort((a, b) => (b.total - a.total) || (a.typhoon.specifications.number - b.typhoon.specifications.number));
}
