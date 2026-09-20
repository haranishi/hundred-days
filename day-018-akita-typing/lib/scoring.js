/* 会計と成績。「速さの数字」ではなく「元が取れたか」と「どこでつまずいたか」を出すのが目的。 */

import { primaryRomaji } from './romaji.js';

/* 値段は打鍵数の段階で決める。かなの文字数で決めると `はたはた`(4かな8打) と
   `じゅんさい`(5かな6打) が逆転するので、実際に打つ手間に合わせている。 */
export const PRICE_TIERS = [
  { maxKeys: 6, price: 100 },
  { maxKeys: 8, price: 150 },
  { maxKeys: 10, price: 210 },
  { maxKeys: 12, price: 280 },
  { maxKeys: Infinity, price: 350 }
];

export function priceOfReading(reading) {
  const keys = primaryRomaji(reading).length;
  return PRICE_TIERS.find((t) => keys <= t.maxKeys).price;
}

/**
 * コース料金を回の長さで按分する。
 * ?duration= で15秒にしたとき、60秒ぶんの料金のままだと必ず足が出る。
 * 50円単位に丸めるのは、画面に出る額を読みやすくするため。
 */
export function scaledTarget(target, durationMs, baseMs) {
  if (!baseMs || durationMs === baseMs) return target;
  return Math.max(50, Math.round((target * durationMs) / baseMs / 50) * 50);
}

/**
 * いまのペースが「元が取れる線」からどれだけ離れているか。
 * 正なら先行、負なら遅れ。対戦中の1行（元まであと¥X）とバーの目印はこの値で決める。
 *
 * 60秒で target に届けばよいので、経過ぶんの取り分は target × 経過比率。
 * 時間が0のときは要求も0＝まだ誰も遅れていない。
 */
export function paceDelta(eaten, target, elapsedMs, durationMs) {
  if (!durationMs || durationMs <= 0) return eaten;
  const ratio = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return eaten - target * ratio;
}

/** 食べた額とコース料金を突き合わせる */
export function settle(eaten, target) {
  const diff = eaten - target;
  if (diff > 0) return { diff, verdict: 'profit', label: '元が取れた' };
  if (diff < 0) return { diff, verdict: 'loss', label: '足が出た' };
  return { diff: 0, verdict: 'even', label: 'ちょうど' };
}

/** 打鍵速度（1秒あたり）。時間0のときは0を返す */
export function keysPerSecond(hits, elapsedMs) {
  if (!elapsedMs || elapsedMs <= 0) return 0;
  return hits / (elapsedMs / 1000);
}

/** 正確率（%）。1打も無ければ0 */
export function accuracy(hits, misses) {
  const total = hits + misses;
  if (total === 0) return 0;
  return (hits / total) * 100;
}

/**
 * つまずいた打鍵の上位。
 * misses は { 押してほしかったキー: 回数 }。同数のときはキーの順で安定させる。
 */
export function stumbles(misses, top = 3) {
  return Object.entries(misses)
    .filter(([, count]) => count > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([key, count]) => ({ key, count }));
}

export function formatYen(value) {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(value)).toLocaleString('ja-JP')}`;
}
