/* 消費者物価指数から金額を換算する計算だけを集めた。DOMに触らない。
   世界銀行 World Development Indicators の FP.CPI.TOTL（2010年=100・年平均）が入力。 */
'use strict';

// 金額として受け付ける範囲。上限は1億円。桁が増えると画面の数字が読めなくなるので切る
export const AMOUNT_MIN = 1;
export const AMOUNT_MAX = 100000000;
export const AMOUNT_DEFAULT = 1000;

// 「物価がほとんど動かなかった」とみなす前年比の幅（%）。±この値未満を数える
export const FLAT_THRESHOLD = 0.5;

/* 世界銀行APIの応答（[メタ, 観測値の配列]）を、国ごとの昇順の並びに直す。

   value が null の年が普通に混ざっている（その国のその年の指数が無い）。
   落とさずに計算に回すと、比の分母が null になって NaN が静かに広がるので、ここで落とす。 */
export function parseSeries(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
    throw new Error('世界銀行の応答の形が想定と違います');
  }
  const byCountry = new Map();
  for (const row of payload[1]) {
    const code = String(row?.countryiso3code || '').toUpperCase();
    const year = Number(row?.date);
    const index = row?.value;
    if (!/^[A-Z]{3}$/.test(code)) continue;
    if (!Number.isInteger(year)) continue;
    if (typeof index !== 'number' || !Number.isFinite(index) || index <= 0) continue;
    if (!byCountry.has(code)) byCountry.set(code, []);
    byCountry.get(code).push({ year, index });
  }
  const out = {};
  for (const [code, rows] of byCountry) {
    rows.sort((a, b) => a.year - b.year);
    out[code] = rows;
  }
  return out;
}

// その年の指数。無ければ null（例外にしない＝呼ぶ側が「出せない」と表示できるように）
export function indexOf(series, year) {
  if (!Array.isArray(series)) return null;
  const hit = series.find((r) => r.year === year);
  return hit ? hit.index : null;
}

export const firstYear = (series) => (series?.length ? series[0].year : null);
export const latestYear = (series) => (series?.length ? series[series.length - 1].year : null);

/* fromYear の amount 円が、toYear の物価でいくらにあたるか。

   四捨五入は最後に1回だけ。途中で丸めると、金額ボタンを押した順で答えが変わる */
export function convert(amount, fromYear, toYear, series) {
  const from = indexOf(series, fromYear);
  const to = indexOf(series, toYear);
  if (from === null || to === null) return null;
  return Math.round(amount * (to / from));
}

// 逆向き。toYear の amount 円は、fromYear ならいくらだったか
export function convertBack(amount, fromYear, toYear, series) {
  return convert(amount, toYear, fromYear, series);
}

// fromYear から toYear で物価が何倍になったか
export function ratio(fromYear, toYear, series) {
  const from = indexOf(series, fromYear);
  const to = indexOf(series, toYear);
  if (from === null || to === null) return null;
  return to / from;
}

/* fromYear の次の年から toYear までで、前年比が ±FLAT_THRESHOLD% 未満だった年の数。

   前年の指数が無い年は判定できないので飛ばす。

   比を出したあとに小数第3位で丸めてから比べているのは、浮動小数の誤差をここで止めるため。
   丸めないと 100→100.5 が 0.49999999999998934 になって「ちょうど0.5%」が数に入り、
   100→99.5 は 0.50000000000000044 で入らない。同じ0.5%なのに上下で答えが変わってしまう。 */
export function flatYears(series, fromYear, toYear, threshold = FLAT_THRESHOLD) {
  if (!Array.isArray(series)) return 0;
  let count = 0;
  for (const row of series) {
    if (row.year <= fromYear || row.year > toYear) continue;
    const prev = indexOf(series, row.year - 1);
    if (prev === null) continue;
    const change = Math.round(Math.abs((row.index / prev - 1) * 100) * 1000) / 1000;
    if (change < threshold) count += 1;
  }
  return count;
}

// 2つの国の指数がそろっている最新の年。片方しか無い年では比べられない
export function commonLatestYear(a, b) {
  if (!a?.length || !b?.length) return null;
  const years = new Set(b.map((r) => r.year));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    if (years.has(a[i].year)) return a[i].year;
  }
  return null;
}

/* 入力欄の文字列を金額に直す。

   全角で打つ人が一定数いる（スマホの日本語入力のまま数字を打つとこうなる）。
   カンマ・空白・円記号も落とす。読み取れないものは既定値に戻す＝画面が空にならない。 */
export function parseAmount(raw) {
  if (typeof raw === 'number') return clampAmount(raw);
  const text = String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s円¥￥]/g, '');
  if (!/^\d+$/.test(text)) return AMOUNT_DEFAULT;
  return clampAmount(Number(text));
}

export function clampAmount(value) {
  if (!Number.isFinite(value)) return AMOUNT_DEFAULT;
  const n = Math.round(value);
  if (n < AMOUNT_MIN) return AMOUNT_DEFAULT;
  if (n > AMOUNT_MAX) return AMOUNT_MAX;
  return n;
}

/* 硬貨の直径。価値の比を「面積」で表す＝直径は平方根に比例させる。

   直径を価値に比例させると、6倍の差が円の面積では36倍に見える。作図で嘘をつかないための平方根。
   小さすぎると画面から消えるので下限を置く（下限に当たったことは呼ぶ側が文言で補う）。 */
export function coinDiameter(value, baseValue, baseDiameter, minDiameter = 24) {
  if (!(baseValue > 0) || !(baseDiameter > 0) || !(value >= 0)) return minDiameter;
  const d = baseDiameter * Math.sqrt(value / baseValue);
  return Math.max(minDiameter, Math.round(d));
}

export const formatYen = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ja-JP') : '—');
