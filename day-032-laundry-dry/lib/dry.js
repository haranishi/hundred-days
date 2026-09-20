/* 洗濯物の乾きを「いまの空気の状態」だけで見る。ここは純関数だけでDOMには触れない。

   考え方は1行で言える。
   「大気が水を蒸発させる力（ET0）」で「洗濯物が持っている水の量」を割ると、必要な時間になる。

   ET0（FAO-56 基準蒸発散量・mm/h）は気温・湿度・風速・日射を1本の式にまとめた値で、
   Open-Meteo が「いまの値」として返してくれる。風を別に足すと二重に数えることになるので足さない。

   ⚠️ ここが出すのは「いまの勢いが続くと仮定したときに必要な時間」であって、
   「◯時に乾く」という将来の予想ではない。将来の時刻も、将来の天気も、この関数は受け取らない。
   将来の気象を予想して発表することは気象業務法17条の予報業務にあたる（→ README）。
   だから入力は current（1時点）だけで、出力にも現在時刻より先の時刻は入れない。

   ⚠️ 係数（水の量と場所の倍率）は実測ではない。ET0 は芝生を基準にした値で、
   物干しに掛かった布の蒸発量そのものではない。下の3つの体感に合うよう決めた目安。
     - 真夏の晴れた日、Tシャツは1時間ちょっと
     - 秋の晴れた日の昼なら、ジーンズは4〜5時間ぶん
     - 冬は晴れていても厚手は1日ぶんでは足りない
   この但し書きは画面の「計算の根拠」にも出す。隠すと天気アプリと区別がつかない。 */

/** 洗濯物が持っている水の量（面積あたりの水の厚み・mm） */
export const FABRICS = {
  thin: { label: '薄手', water: 0.35, examples: 'Tシャツ・下着・シャツ' },
  normal: { label: 'ふつう', water: 0.65, examples: 'タオル・ズボン' },
  thick: { label: '厚手', water: 1.2, examples: 'ジーンズ・パーカー・バスタオル' }
};

/* 3つとも同時に出す。選ばせない。
   「◯時に乾く」を出していた頃は、選んだ1つの時刻を見せるために切り替えが要った。
   時刻をやめて所要時間にした以上、3行並べたほうが1画面で終わる */
export const FABRIC_ORDER = ['thin', 'normal', 'thick'];

/** 干す場所の倍率。日かげは日射が無いぶん遅くなる目安として日なたの6割 */
export const PLACES = {
  sun: { label: '日なた', factor: 0.55 },
  shade: { label: '日かげ・軒下', factor: 0.33 }
};

/** いまこれ以上降っていれば乾かないものとして扱う（mm/h） */
export const RAIN_MM = 0.1;
/** これを超えて濡れたままだと生乾きのにおいが出やすいとされる時間 */
export const SMELL_HOURS = 5;
/** これより長くかかるなら、時間を出さずに「乾きません」と言い切る */
export const MAX_SHOWN_HOURS = 24;

/** いまの乾く速さ（mm/h）。雨が降っているあいだは0 */
export function dryRate({ et0PerHour = 0, precipPerHour = 0, place = 'sun' }) {
  if ((precipPerHour ?? 0) >= RAIN_MM) return 0;
  const factor = (PLACES[place] || PLACES.sun).factor;
  return Math.max(0, (et0PerHour ?? 0) * factor);
}

/** 水の量 ÷ いまの速さ。速さが0なら「出せない」を意味する null */
export function hoursFor(water, rate) {
  if (!(rate > 0)) return null;
  return water / rate;
}

/**
 * @param {object} input
 * @param {object} input.current parseCurrent() の戻り（1時点ぶんだけ）
 * @param {'sun'|'shade'} input.place
 */
export function estimate({ current, place = 'sun' }) {
  const kind = PLACES[place] ? place : 'sun';
  const et0PerHour = current?.et0PerHour ?? 0;
  const precipPerHour = current?.precipPerHour ?? 0;
  const raining = precipPerHour >= RAIN_MM;
  const rate = dryRate({ et0PerHour, precipPerHour, place: kind });

  const items = FABRIC_ORDER.map((key) => {
    const fabric = FABRICS[key];
    const hours = hoursFor(fabric.water, rate);
    return {
      key,
      label: fabric.label,
      examples: fabric.examples,
      water: fabric.water,
      hours,
      tooLong: hours === null || hours > MAX_SHOWN_HOURS
    };
  });

  const normalHours = items.find((item) => item.key === 'normal').hours;
  return {
    /* observedAt は「いつの空気で計算したか」。いまより先の時刻はこの戻り値のどこにも入れない */
    observedAt: current?.time ?? null,
    place: kind,
    placeLabel: PLACES[kind].label,
    factor: PLACES[kind].factor,
    et0PerHour,
    precipPerHour,
    rate: Math.round(rate * 10000) / 10000,
    raining,
    isDay: current?.isDay !== false,
    items,
    verdict: judge({ rate, raining }),
    smell: normalHours !== null && normalHours <= MAX_SHOWN_HOURS && normalHours > SMELL_HOURS
  };
}

/** 判定。いまの速さといまの雨だけで決める（降水確率＝将来の予想は使わない） */
export function judge({ rate, raining = false }) {
  if (!(rate > 0)) return raining ? 'rain' : 'none';
  const normalHours = FABRICS.normal.water / rate;
  if (normalHours <= SMELL_HOURS) return 'good';
  if (normalHours <= 10) return 'fair';
  return 'slow';
}

export const VERDICTS = {
  good: { label: 'よく乾きます', tone: 'good' },
  fair: { label: 'ゆっくりなら乾きます', tone: 'fair' },
  slow: { label: 'いまはほとんど乾きません', tone: 'bad' },
  rain: { label: 'いま雨が降っています', tone: 'bad' },
  none: { label: 'いまは乾きません', tone: 'bad' }
};

/** 速さが0のときに、その理由を1行で返す */
export function whyNotDrying({ raining, isDay }) {
  if (raining) return '雨に当たると、乾くどころか濡れていきます。いまは外に出さないほうが確実です。';
  if (!isDay) return '日が沈んでいて、大気が水を飛ばす力がほとんどありません。';
  return '気温・湿度・風・日射から見て、大気が水を飛ばす力がほとんどありません。';
}
