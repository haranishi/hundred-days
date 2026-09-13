/* 時刻の扱いはこれだけ。

   このアプリは時刻の計算をしない。Open-Meteo が返した「いまの時刻」を
   日本時間の壁掛け時計の文字列（'2026-09-13T12:00'）のまま受け取り、そのまま切り出して出す。
   Date に入れて足し引きすると、動かす環境のタイムゾーン次第で答えが変わる（CIはUTC）。
   そもそも将来の時刻を作らないので、足し引きする理由がない。 */

/** '2026-09-13T12:00' → '12:00' */
export const clockOf = (wall) => (typeof wall === 'string' ? wall.slice(11, 16) : '');

/**
 * 所要時間を「約◯時間」にする。
 * 「◯時に乾く」ではなく「◯時間ぶん」を出すための整形なので、時刻には決して変換しない。
 * 24時間を超えるものは数字を出さない（いまの勢いが1日続く前提は無理がある）。
 */
export function hoursSpan(hours, limit = 24) {
  if (hours === null || !Number.isFinite(hours) || hours <= 0) return null;
  if (hours > limit) return null;
  const text = hours < 9.95 ? (Math.round(hours * 10) / 10).toFixed(1) : String(Math.round(hours));
  return `約${text}時間`;
}
