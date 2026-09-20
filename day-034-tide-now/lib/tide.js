/* 潮位表の値と絶対時刻だけで計算する。DOM・保存・通信には触れない。 */
import { dateOf, clockOf } from './time.js';
import { moonPosition, sunPosition } from './astro.js';
export const DAY_MS = 86400000;
export class ShapeError extends Error {
  constructor() { super('潮位表の形が変わったようです'); }
}
const pad = (n) => String(n).padStart(2, '0');
function integer(text) {
  if (!/^\s*-?\d+$/.test(text)) throw new ShapeError();
  return Number(text);
}
export function parseLine(line) {
  if (typeof line !== 'string' || line.length !== 136) throw new ShapeError();
  const year = 2000 + integer(line.slice(72, 74));
  const month = integer(line.slice(74, 76));
  const day = integer(line.slice(76, 78));
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const at = Date.parse(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(at) || dateOf(at) !== date) throw new ShapeError();
  const code = line.slice(78, 80);
  if (!/^[A-Z][A-Z0-9]$/.test(code)) throw new ShapeError();
  const hourly = Array.from({ length: 24 }, (_, i) => integer(line.slice(i * 3, i * 3 + 3)));
  // 毎時値の999も欠測。数値の配列を保ち、計算では有限値だけを使う。
  for (let i = 0; i < hourly.length; i++) if (hourly[i] === 999) hourly[i] = NaN;
  const readEvents = (start) => Array.from({ length: 4 }, (_, i) => {
    const offset = start + i * 7;
    const rawTime = line.slice(offset, offset + 4);
    const cm = integer(line.slice(offset + 4, offset + 7));
    if (rawTime === '9999' || cm === 999) return null;
    const hour = integer(rawTime.slice(0, 2)), minute = integer(rawTime.slice(2, 4));
    if (hour < 0 || minute < 0 || hour > 23 || minute > 59) throw new ShapeError();
    return { time: `${pad(hour)}:${pad(minute)}`, cm };
  }).filter(Boolean);
  return { date, code, hourly, highs: readEvents(80), lows: readEvents(108) };
}
export function parseYear(text, code) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const days = new Map();
  for (const line of lines) {
    const day = parseLine(line);
    if (day.code !== code || days.has(day.date)) throw new ShapeError();
    days.set(day.date, day);
  }
  return days;
}
export const valuesOf = (days) => days instanceof Map ? [...days.values()] : Array.isArray(days) ? days : Object.values(days);
export function dateWindow(now) {
  const start = Date.parse(`${dateOf(now)}T00:00:00+09:00`);
  return [-1, 0, 1].map((offset) => dateOf(start + offset * DAY_MS));
}
export function eventsAround(days, now) {
  const dates = dateWindow(now);
  const events = valuesOf(days).filter((day) => dates.includes(day.date)).flatMap((day) =>
    [['high', day.highs], ['low', day.lows]].flatMap(([type, rows]) => rows.map((row) => ({
      ...row, type, date: day.date, at: Date.parse(`${day.date}T${row.time}:00+09:00`)
    })))
  ).sort((a, b) => a.at - b.at);
  return { events, prev: events.filter((event) => event.at <= now).at(-1) ?? null, next: events.find((event) => event.at > now) ?? null };
}
export const closestEvent = ({ prev, next, now }) => [prev, next].filter(Boolean).sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now))[0] ?? null;
export function stateOf({ prev, next, now }) {
  const near = closestEvent({ prev, next, now });
  if (near && Math.abs(near.at - now) <= 30 * 60000) return `slack-${near.type}`;
  if (next) return next.type === 'high' ? 'rising' : 'falling';
  if (prev) return prev.type === 'low' ? 'rising' : 'falling';
  return 'unknown';
}
export function levelNow({ prev, next, hourly, now }) {
  if (prev && next && next.at > prev.at) {
    const ratio = Math.max(0, Math.min(1, (now - prev.at) / (next.at - prev.at)));
    return prev.cm + (next.cm - prev.cm) * (1 - Math.cos(Math.PI * ratio)) / 2;
  }
  const start = Date.parse(`${dateOf(now)}T00:00:00+09:00`);
  const hour = (now - start) / 3600000;
  const points = hourly.map((cm, i) => ({ cm, i })).filter(({ cm }) => Number.isFinite(cm));
  const left = points.filter((p) => p.i <= hour).at(-1), right = points.find((p) => p.i > hour);
  if (left && right) return left.cm + (right.cm - left.cm) * (hour - left.i) / (right.i - left.i);
  return left?.cm ?? right?.cm ?? NaN;
}
export function dailyRange(day) {
  const hourly = day.hourly.filter(Number.isFinite);
  const highs = day.highs.length ? day.highs.map((event) => event.cm) : hourly;
  const lows = day.lows.length ? day.lows.map((event) => event.cm) : hourly;
  return highs.length && lows.length ? Math.max(...highs) - Math.min(...lows) : NaN;
}
export function rangeRank(yearDays, date) {
  const days = valuesOf(yearDays).filter((day) => day.date.slice(0, 4) === date.slice(0, 4));
  const range = dailyRange(days.find((day) => day.date === date));
  const ranges = days.map(dailyRange).filter(Number.isFinite).sort((a, b) => a - b);
  // 同値は中間順位。差が全部同じ年は「ふつう」。
  const position = (ranges.filter((n) => n < range).length + ranges.filter((n) => n === range).length / 2) / ranges.length;
  return position < 1 / 3 ? '小さい方' : position >= 2 / 3 ? '大きい方' : 'ふつう';
}
export function nameFromElongation(degrees) {
  const d = ((degrees % 360) + 360) % 360;
  return [[36, '大潮'], [72, '中潮'], [108, '小潮'], [120, '長潮'], [132, '若潮'], [168, '中潮'], [216, '大潮'], [252, '中潮'], [288, '小潮'], [300, '長潮'], [312, '若潮'], [348, '中潮'], [360, '大潮']].find(([end]) => d < end)[1];
}
export const elongation = (now) => ((moonPosition(now).longitude - sunPosition(now).longitude) % 360 + 360) % 360;
export const tideName = (now) => nameFromElongation(elongation(now));
export function until(at, now) {
  const minutes = Math.max(0, Math.floor((at - now) / 60000));
  if (!minutes) return 'まもなく';
  if (minutes < 60) return `あと${minutes}分`;
  return `あと${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}`;
}
export const HEADINGS = { rising: 'いま、満ち潮', falling: 'いま、引き潮', 'slack-high': '満潮のころ', 'slack-low': '干潮のころ', unknown: '潮の向きが分かりません' };
const eventLabel = (event) => event.type === 'high' ? '満潮' : '干潮';
const eventClock = (event, now) => `${event.date > dateOf(now) ? 'あす ' : event.date < dateOf(now) ? 'きのう ' : ''}${clockOf(event.at)}`;
const NO_NEXT = '次の満干が潮位表にありません';
/* 投稿文だけが使う1行版。画面は「次の満干」と「残り時間」を分けて出す。 */
export function nextText(next, now) {
  return next ? `次の${eventLabel(next)}は ${eventClock(next, now)}・${next.cm}cm` : NO_NEXT;
}
export function answerSub({ prev, next, now }) {
  if (stateOf({ prev, next, now }).startsWith('slack')) {
    const near = closestEvent({ prev, next, now });
    return `${eventClock(near, now)} が${eventLabel(near)}（${near.cm}cm）`;
  }
  return next ? `次の${eventLabel(next)}は ${eventClock(next, now)}（${next.cm}cm）` : NO_NEXT;
}
// 残り時間。潮止まりは時間ではなく次に向かう向きを返し、分からない時は空にする。
export function remainingText({ prev, next, now }) {
  if (stateOf({ prev, next, now }).startsWith('slack')) {
    const near = closestEvent({ prev, next, now });
    return `このあと${near.type === 'high' ? '引き潮' : '満ち潮'}に`;
  }
  return next ? until(next.at, now) : '';
}
export function postText({ station, prev, next, now }) {
  return `『潮、いまどっち？』${station.name}：${HEADINGS[stateOf({ prev, next, now })]}。${nextText(next, now)}（${tideName(now)}）`;
}
