/* 気象庁の時刻はすべて日本時間（+09:00 付きのISO）で届く。
   端末のタイムゾーンで表示が変わると「21日9時」が別の時刻に見えるので、
   Date のローカル変換には通さず、文字列の年月日時分をそのまま日本時間として扱う。 */

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
/* オフセットまで見る。ここを緩くすると、末尾が Z（＝UTC）の時刻を日本時間と読んで
   9時間ずれた文を黙って出してしまう。+09:00 以外は読めない時刻として扱う */
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\+09:00$/;

/** ISO文字列 → 日本時間の壁時計（年・月・日・時・分と、UTCでの絶対時刻）。+09:00 以外は null */
export function jst(iso) {
  const found = PATTERN.exec(String(iso ?? ''));
  if (!found) return null;
  const [, year, month, day, hour, minute] = found.map(Number);
  return { year, month, day, hour, minute, at: Date.UTC(year, month - 1, day, hour - 9, minute) };
}

/** いまの日本時間の壁時計。端末のタイムゾーンに依存しない */
export function jstNow(now = Date.now()) {
  const shifted = new Date(now + 9 * 3600_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    at: now,
  };
}

const weekday = (wall) => WEEK[new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay()];

/** 「21日」と「（月）」。狭い画面では曜日だけ隠せるように分けて返す */
export const dayParts = (iso) => {
  const wall = typeof iso === 'string' ? jst(iso) : iso;
  return wall ? [`${wall.day}日`, `（${weekday(wall)}）`] : ['', ''];
};

/** 「21日（月）」 */
export const dayLabel = (iso) => dayParts(iso).join('');

/**
 * 3時間の区間を人の言い方にする。気象庁の validtime は区間の「終わり」なので、
 * 終わりだけを出すと3時間ずれて読まれる（docs/data-discovery.md）。
 * 2026-09-21T12:00:00+09:00 → 「21日（月）9時〜12時」
 * 日をまたぐ区間は、始まりの日付で「20日（日）21時〜24時」と書く。
 */
export function intervalText(endIso, hours = 3) {
  const end = jst(endIso);
  if (!end) return '';
  const start = shift(end, -hours);
  const endHour = end.hour === 0 && start.day !== end.day ? 24 : end.hour;
  return `${dayLabel(start)}${start.hour}時〜${endHour}時`;
}

/** 帯の読み上げ用。曜日を外した「21日9時〜12時」 */
export function intervalShort(endIso, hours = 3) {
  const end = jst(endIso);
  if (!end) return '';
  const start = shift(end, -hours);
  const endHour = end.hour === 0 && start.day !== end.day ? 24 : end.hour;
  return `${start.day}日${start.hour}時〜${endHour}時`;
}

/** 壁時計を時間ぶんずらす。日本時間のまま動かすので日付繰り上がりも正しく出る */
export function shift(wall, hours) {
  const moved = new Date(wall.at + hours * 3600_000 + 9 * 3600_000);
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
    hour: moved.getUTCHours(),
    minute: moved.getUTCMinutes(),
    at: wall.at + hours * 3600_000,
  };
}

/** 「9月18日 15時」 */
export const issueText = (iso) => {
  const wall = jst(iso);
  return wall ? `${wall.month}月${wall.day}日 ${wall.hour}時` : '';
};

/** 「18日 18時45分」 */
export const clockText = (iso) => {
  const wall = jst(iso);
  return wall ? `${wall.day}日 ${wall.hour}時${String(wall.minute).padStart(2, '0')}分` : '';
};

/** 「9月18日 21時00分」。台風が無いときの確認時刻に使う */
export const stampText = (wall) =>
  `${wall.month}月${wall.day}日 ${wall.hour}時${String(wall.minute).padStart(2, '0')}分`;

/** 区間の始まりが0時か（帯の日付の区切りを置く位置） */
export const startsDay = (endIso, hours = 3) => {
  const end = jst(endIso);
  return Boolean(end) && shift(end, -hours).hour === 0;
};

/**
 * 「いま」がどの区間に入るか。区間は (終わり−3時間, 終わり] の半開区間として扱う。
 * 区切りの時刻はちょうど1つの区間にだけ入る。どこにも入らなければ -1。
 */
export function currentIndex(validtime, nowMs, hours = 3) {
  for (let i = 0; i < validtime.length; i += 1) {
    const end = jst(validtime[i]);
    if (!end) continue;
    if (nowMs > end.at - hours * 3600_000 && nowMs <= end.at) return i;
  }
  return -1;
}
