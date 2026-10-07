import { categories } from './stats.js';
export const schedule = [
  ['med', '2026-10-05T18:30:00+09:00'], ['phy', '2026-10-06T18:45:00+09:00'],
  ['che', '2026-10-07T18:45:00+09:00'], ['lit', '2026-10-08T20:00:00+09:00'],
  ['pea', '2026-10-09T18:00:00+09:00'], ['eco', '2026-10-12T18:45:00+09:00'],
].map(([cat, at]) => ({ cat, at, title: categories[cat] }));
export function announcementState(item, prizes, now) {
  if (now < Date.parse(item.at)) return 'waiting';
  const prize = prizes.find((p) => p.cat === item.cat && p.year === 2026);
  return prize?.people?.length ? 'announced' : 'pending';
}
function dayText(date, time) {
  const pieces = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(Date.parse(`${date}T${time}`));
  const read = (type) => pieces.find((part) => part.type === type).value;
  return `${read('month')}月${read('day')}日（${read('weekday')}）`;
}
// 発表済みの賞に「以降の予定」と書かない。日付は API の dateAwarded を優先する
export const announcedText = (item, date = item.at.slice(0, 10)) => `${dayText(date, item.at.slice(11))}に発表`;
export function scheduleText(item, date = item.at.slice(0, 10)) {
  const parts = dayText(date, item.at.slice(11));
  // 公式の予定は平和賞以外「at the earliest」。決まった時刻のように書かない
  return `${parts.replace(/\((.)\)/, '（$1）')} ${timeTextAt(item.at)}${item.cat === 'pea' ? '' : '以降'}の予定`;
}
function timeTextAt(at) {
  const [hour, minute] = at.slice(11, 16).split(':').map(Number);
  return `${hour}時${minute ? `${minute}分` : ''}`;
}
