/* 紙面の日付と号数を漢数字にする。新聞の日付欄に算用数字は出ない。 */

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/* 年は位取りしない。「二千二十六年」ではなく「二〇二六年」と1桁ずつ並べる */
export function kanjiYear(value) {
  return String(value).split('').map((d) => DIGITS[Number(d)] ?? d).join('');
}

/* 1〜99。月日と号数に使う。10は「十」、35は「三十五」 */
export function kanjiNumber(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(value);
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens > 1 ? DIGITS[tens] : ''}十${ones ? DIGITS[ones] : ''}`;
}

/* 紙面は日本の新聞なので、見る人の時間帯によらず日本時間の日付を出す。
   CIはUTCで走るため、ここを端末の暦に任せると日付が1日ずれる */
export function jstParts(now = new Date()) {
  const shifted = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60_000);
  return {
    year: shifted.getFullYear(),
    month: shifted.getMonth() + 1,
    day: shifted.getDate(),
    weekday: WEEKDAYS[shifted.getDay()]
  };
}

export function paperDate(now = new Date()) {
  const { year, month, day, weekday } = jstParts(now);
  return `${kanjiYear(year)}年${kanjiNumber(month)}月${kanjiNumber(day)}日（${weekday}）`;
}

export function issueLabel(day) {
  return `第${kanjiNumber(day)}号`;
}
