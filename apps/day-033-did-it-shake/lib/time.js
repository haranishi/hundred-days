/* 比較は絶対時刻、表示は日本時間。端末のタイムゾーンには寄せない。 */
export function nowWall(now = new Date()) {
  const text = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(now));
  return `${text.slice(0, 10)}T${text.slice(11, 16)}`;
}
export const dateOf = (at) => nowWall(at).slice(0, 10);
export const clockOf = (at) => nowWall(at).slice(11, 16);
export function dayOf(at) {
  const wall = nowWall(at);
  return `${Number(wall.slice(5, 7))}月${Number(wall.slice(8, 10))}日`;
}
export const absoluteTime = (at, now) => `${dateOf(at) === dateOf(now) ? '' : `${dayOf(at)} `}${clockOf(at)}`;
export function relativeTime(at, now) {
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return 'いま';
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / 1440)}日前`;
}
