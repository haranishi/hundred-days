import { categories } from './stats.js';
export const formatNumber = (n) => n.toLocaleString('ja-JP');
export const nameOf = (row) => row.ja || row.en;
export const subject = (age, cat) => `${cat === 'all' ? '' : `${categories[cat]}を`}${age}歳で受賞した人は、`;
export function answerText(age, cat, count) {
  return subject(age, cat) + (count ? `${formatNumber(count)}人` : 'まだいません');
}
// 経済学賞は1969年から。分野で絞ったときに「1901年から」と書くと事実と違う
export const sinceYear = (cat) => (cat === 'eco' ? 1969 : 1901);
export function shareText(age, cat, count) {
  return subject(age, cat) + (count ? `${formatNumber(count)}人。` : `${sinceYear(cat)}年からまだいません。`) + '— その歳で、受賞した人';
}
export const nearestText = (summary) => `近いのは${summary.nearest.map((age) => `${age}歳の${formatNumber(summary.histogram.get(age))}人`).join('と')}`;
export const extremeText = (row, label) => row ? `${label}は${row.age}歳の${nameOf(row)}（${row.year}年・${categories[row.cat]}）` : '';
// 注記は公式データの事実だけを書く。月日不明の人は7月1日生まれとして数えるので、実際は1歳若いことがある（数え方の欄で説明）。
// restricted は1958年のパステルナーク（当局に辞退させられた）。本人の意思の辞退と分ける
export function notesOf(row) {
  const status = { declined: '辞退', restricted: '辞退を強いられた' }[row.status] || '';
  return [row.approximate ? '生まれた月日が不明' : '', row.posthumous ? '発表の前に死去' : '', status].filter(Boolean).join('・');
}
