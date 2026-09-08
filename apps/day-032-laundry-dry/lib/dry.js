/* 洗濯物が乾くまでの時間を出す。ここは純関数だけでDOMには触れない。

   考え方は1行で言える。
   「大気が水を蒸発させる力（ET0）」で「洗濯物が持っている水の量」を割ると、乾くまでの時間になる。

   ET0（FAO-56 基準蒸発散量・mm/h）は気温・湿度・風速・日射を1本の式にまとめた値で、
   Open-Meteo が毎時で返してくれる。風を別に足すと二重に数えることになるので足さない。

   ⚠️ 係数（水の量と場所の倍率）は実測ではない。ET0 は芝生を基準にした値で、
   物干しに掛かった布の蒸発量そのものではない。下の3つの体感に合うよう決めた目安。
     - 真夏の晴れた日、Tシャツは1時間ちょっと
     - 秋の晴れた日の朝に干すと、ジーンズは昼過ぎ
     - 冬は晴れていても厚手は1日では乾かない
   この但し書きは画面の「計算の根拠」にも出す。隠すと天気アプリと区別がつかない。 */

import { parseWall, toWall, dateOf } from './time.js';

/** 洗濯物が持っている水の量（面積あたりの水の厚み・mm） */
export const FABRICS = {
  thin: { label: '薄手', water: 0.35, examples: 'Tシャツ・下着・シャツ' },
  normal: { label: 'ふつう', water: 0.65, examples: 'タオル・ズボン' },
  thick: { label: '厚手', water: 1.2, examples: 'ジーンズ・パーカー・バスタオル' }
};

/** 干す場所の倍率。日かげは日射が無いぶん遅くなる目安として日なたの6割 */
export const PLACES = {
  sun: { label: '日なた', factor: 0.55 },
  shade: { label: '日かげ・軒下', factor: 0.33 }
};

/** これ以上降っていれば、その1時間は乾かないものとして扱う（mm） */
export const RAIN_MM = 0.1;
/** 雨に当たったとき、降った量のうち洗濯物に戻る割合と、1時間あたりの上限（mm） */
const REWET_RATIO = 0.3;
const REWET_MAX = 0.5;
/** これを超えて濡れたままだと生乾きのにおいが出やすいとされる時間 */
export const SMELL_HOURS = 5;
/** 何時間先まで追うか */
const MAX_HOURS = 48;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * @param {object} input
 * @param {Array}  input.hours   [{ time, et0, precip, precipProb, isDay, ... }] 1時間刻み・昇順
 * @param {string[]} input.sunsets 日没の壁時計時刻（'2026-09-08T18:00'）
 * @param {string} input.startAt 干し始める時刻
 * @param {'thin'|'normal'|'thick'} input.fabric
 * @param {'sun'|'shade'} input.place
 */
export function predict({ hours, sunsets = [], startAt, fabric = 'normal', place = 'sun' }) {
  const water = (FABRICS[fabric] || FABRICS.normal).water;
  const factor = (PLACES[place] || PLACES.sun).factor;
  const startMin = parseWall(startAt);

  let remaining = water;
  let driedAt = null;
  let rainRisk = 0;
  let wetAgain = null;
  const timeline = [];

  for (let i = 0; i < hours.length && i < MAX_HOURS + 24; i += 1) {
    const hour = hours[i];
    const from = parseWall(hour.time);
    const to = from + 60;
    if (to <= startMin) continue; // 干す前の時間は飛ばす
    if (from - startMin > MAX_HOURS * 60) break;

    const share = (to - Math.max(from, startMin)) / 60; // 干している割合（最初の1時間は端数）
    const raining = (hour.precip ?? 0) >= RAIN_MM;
    const rate = raining ? 0 : Math.max(0, (hour.et0 ?? 0) * factor); // mm/h

    if (driedAt === null) {
      rainRisk = Math.max(rainRisk, hour.precipProb ?? 0);
      if (raining && wetAgain === null) wetAgain = hour.time;
    }

    const dried = rate * share;
    if (driedAt === null && raining) {
      remaining = Math.min(water, remaining + Math.min((hour.precip ?? 0) * REWET_RATIO, REWET_MAX));
    }

    if (driedAt === null && dried > 0 && remaining - dried <= 0) {
      // 乾き切る瞬間を1時間の中で按分する
      const minutesIn = (remaining / rate) * 60;
      driedAt = toWall(Math.max(from, startMin) + minutesIn);
      remaining = 0;
    } else if (driedAt === null) {
      remaining = Math.max(0, remaining - dried);
    }

    timeline.push({
      time: hour.time,
      rate,
      raining,
      isDay: (hour.isDay ?? 1) === 1,
      remaining: Number(remaining.toFixed(4)),
      dried: driedAt !== null && parseWall(hour.time) >= parseWall(driedAt)
    });

    if (driedAt !== null && timeline.length >= 24) break;
  }

  const hoursToDry = driedAt === null ? null : (parseWall(driedAt) - startMin) / 60;
  const sunsetSameDay = sunsets.find((s) => dateOf(s) === dateOf(startAt)) || null;
  const driedToday = Boolean(driedAt && sunsetSameDay && parseWall(driedAt) <= parseWall(sunsetSameDay));

  return {
    fabric,
    place,
    startAt,
    water,
    factor,
    driedAt,
    driedToday,
    hoursToDry,
    bringInBy: bringInTime({ hours, sunsets, driedAt }),
    rainRisk,
    wetAgain,
    smell: hoursToDry !== null && hoursToDry > SMELL_HOURS,
    verdict: judge({ hoursToDry, rainRisk, wetAgain, driedToday }),
    timeline
  };
}

/** 取り込みの締切＝乾いたあと最初に来る「雨」か「日没」の早いほう */
function bringInTime({ hours, sunsets, driedAt }) {
  if (!driedAt) return null;
  const dried = parseWall(driedAt);
  const rain = hours.find((h) => parseWall(h.time) >= dried && (h.precip ?? 0) >= RAIN_MM);
  const sunset = sunsets.find((s) => parseWall(s) >= dried);
  if (rain && sunset) return parseWall(rain.time) <= parseWall(sunset) ? rain.time : sunset;
  return rain ? rain.time : sunset || null;
}

/** 判定バッジ。乾く速さと雨の risk の両方を見る */
export function judge({ hoursToDry, rainRisk, wetAgain, driedToday }) {
  if (hoursToDry === null || wetAgain || rainRisk >= 60 || !driedToday) return 'bad';
  if (hoursToDry <= SMELL_HOURS && rainRisk < 30) return 'good';
  if (hoursToDry <= 10 && rainRisk < 60) return 'fair';
  return 'bad';
}

export const VERDICTS = {
  good: { label: 'よく乾きます', tone: 'good' },
  fair: { label: '乾きますが、様子見を', tone: 'fair' },
  bad: { label: '今日はやめておく', tone: 'bad' }
};

/**
 * いま以降で、いちばん早く乾く「干し始めの正時」を探す。
 * 今日の日没までに乾く時刻だけを候補にする（夜に干しても乾かないため）。
 * 見つからなければ翌日以降の朝もあたる。
 */
export function bestStart({ hours, sunsets, from, fabric, place, withinHours = 30 }) {
  const fromMin = parseWall(from);
  let best = null;
  for (const hour of hours) {
    const at = parseWall(hour.time);
    if (at < fromMin) continue;
    if (at - fromMin > withinHours * 60) break;
    if ((hour.isDay ?? 1) !== 1) continue; // 夜に干し始める提案はしない
    const result = predict({ hours, sunsets, startAt: hour.time, fabric, place });
    if (result.hoursToDry === null || !result.driedToday) continue;
    if (!best || result.hoursToDry < best.hoursToDry - 0.01) {
      best = { startAt: hour.time, hoursToDry: result.hoursToDry, driedAt: result.driedAt, verdict: result.verdict };
    }
  }
  return best;
}

/** 干し始められる時間かどうか。日没まで1時間を切っていれば「今からだと乾かない」 */
export function tooLateToday({ startAt, sunsets }) {
  const sunset = sunsets.find((s) => dateOf(s) === dateOf(startAt));
  if (!sunset) return false;
  return parseWall(startAt) > parseWall(sunset) - 60;
}

/** 画面の「計算の根拠」に出す、干し始めの時間帯の実測値 */
export function conditionsAt({ hours, startAt }) {
  const at = parseWall(startAt);
  return hours.find((h) => parseWall(h.time) <= at && at < parseWall(h.time) + 60) || hours[0] || null;
}

export const dryRateOf = (hour, place) =>
  ((hour.precip ?? 0) >= RAIN_MM ? 0 : Math.max(0, (hour.et0 ?? 0) * (PLACES[place] || PLACES.sun).factor));

export const clampPercent = (n) => clamp(Math.round(n), 0, 100);
