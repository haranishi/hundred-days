/* 時刻はすべて「日本時間の壁掛け時計の文字列」（'2026-09-08T09:00'）で持つ。
   Date に入れて比べると、動かす環境のタイムゾーン次第で結果が変わる（CIはUTC）。
   ここでは文字列を数値の分に直して比べるだけにして、どこで動かしても同じ答えにする。 */

/** '2026-09-08T09:00' → 1970年からの分（実際の時差は考えない。並べ替えと引き算のためだけの数） */
export function parseWall(wall) {
  const y = Number(wall.slice(0, 4));
  const mo = Number(wall.slice(5, 7));
  const d = Number(wall.slice(8, 10));
  const h = Number(wall.slice(11, 13));
  const mi = Number(wall.slice(14, 16));
  if (!Number.isFinite(y + mo + d + h + mi)) throw new Error(`時刻の形が違う: ${wall}`);
  return Date.UTC(y, mo - 1, d, h, mi) / 60000;
}

/** 分 → '2026-09-08T09:00' */
export function toWall(minutes) {
  const at = new Date(Math.round(minutes) * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
}

/** いまの日本時間を壁掛け時計の文字列で返す。海外からでもCIからでも同じ形になる */
export function nowWall(now = new Date()) {
  // 'sv-SE' は 'YYYY-MM-DD HH:mm:ss' で返る
  const text = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
  return `${text.slice(0, 10)}T${text.slice(11, 16)}`;
}

/** '2026-09-08T15:40' → '15:40' */
export const clockOf = (wall) => wall.slice(11, 16);

/** '2026-09-08T15:40' → '2026-09-08' */
export const dateOf = (wall) => wall.slice(0, 10);

/** 4.33 時間 → 「4時間20分」。1時間未満は「40分」 */
export function humanDuration(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** 同じ日なら '15:40'、翌日なら '明日の10:00'、それ以降は '9/10の10:00' */
export function relativeClock(wall, baseWall) {
  const days = Math.round((parseWall(dateOf(wall) + 'T00:00') - parseWall(dateOf(baseWall) + 'T00:00')) / 1440);
  if (days === 0) return clockOf(wall);
  if (days === 1) return `明日の${clockOf(wall)}`;
  const [, mo, d] = dateOf(wall).split('-');
  return `${Number(mo)}/${Number(d)}の${clockOf(wall)}`;
}
