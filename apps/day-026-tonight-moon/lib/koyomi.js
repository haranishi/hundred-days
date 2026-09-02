import { DAY_MS, nearestFullMoon } from './astro.js';

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const PLACES = [
  { id: 'sapporo', label: '札幌', lat: 43.0642, lon: 141.3469 },
  { id: 'sendai', label: '仙台', lat: 38.2682, lon: 140.8694 },
  { id: 'akita', label: '秋田', lat: 39.7186, lon: 140.1024 },
  { id: 'tokyo', label: '東京', lat: 35.6581, lon: 139.7414 },
  { id: 'niigata', label: '新潟', lat: 37.9026, lon: 139.0232 },
  { id: 'nagoya', label: '名古屋', lat: 35.1815, lon: 136.9066 },
  { id: 'osaka', label: '大阪', lat: 34.6937, lon: 135.5023 },
  { id: 'hiroshima', label: '広島', lat: 34.3853, lon: 132.4553 },
  { id: 'kochi', label: '高知', lat: 33.5597, lon: 133.5311 },
  { id: 'fukuoka', label: '福岡', lat: 33.5904, lon: 130.4017 },
  { id: 'kagoshima', label: '鹿児島', lat: 31.5966, lon: 130.5571 },
  { id: 'naha', label: '那覇', lat: 26.2124, lon: 127.6809 }
];

export const HARVEST_MOONS = Object.freeze({
  2024: '2024-09-17', 2025: '2025-10-06', 2026: '2026-09-25',
  2027: '2027-09-15', 2028: '2028-10-03', 2029: '2029-09-22',
  2030: '2030-09-12', 2031: '2031-10-01', 2032: '2032-09-19'
});

const pad = (value) => String(value).padStart(2, '0');

export function parseDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const date = new Date(stamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, stamp };
}

export function parseAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = parseDateKey(value.slice(0, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  if (!date || hour > 23 || minute > 59) return null;
  return Date.UTC(date.year, date.month - 1, date.day, hour - 9, minute);
}

export function nowFromSearch(search, fallback = Date.now()) {
  const params = new URLSearchParams(search);
  return parseAt(params.get('at')) ?? fallback;
}

export function jstParts(utcMs) {
  const shifted = new Date(utcMs + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(), weekday: shifted.getUTCDay()
  };
}

export function dateKey(utcMs) {
  const { year, month, day } = jstParts(utcMs);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function jstMidnight(keyOrMs) {
  const parts = typeof keyOrMs === 'string' ? parseDateKey(keyOrMs) : parseDateKey(dateKey(keyOrMs));
  if (!parts) return null;
  return Date.UTC(parts.year, parts.month - 1, parts.day, -9);
}

export function addDays(key, days) {
  const start = parseDateKey(key);
  if (!start || !Number.isInteger(days)) return null;
  const date = new Date(start.stamp + days * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function differenceDays(from, to) {
  const one = parseDateKey(from);
  const other = parseDateKey(to);
  if (!one || !other) return null;
  return Math.round((other.stamp - one.stamp) / DAY_MS);
}

export function formatDate(key, { year = false } = {}) {
  const p = parseDateKey(key);
  if (!p) return '';
  const weekday = WEEKDAYS[new Date(p.stamp).getUTCDay()];
  return `${year ? `${p.year}年` : ''}${p.month}月${p.day}日（${weekday}）`;
}

export function formatTime(utcMs) {
  if (!Number.isFinite(utcMs)) return '—';
  const rounded = utcMs + 30_000;
  const { hour, minute } = jstParts(rounded);
  return `${hour}:${pad(minute)}`;
}

const SPECIAL_NAMES = {
  1: '新月（朔）', 2: '二日月', 3: '三日月', 7: '七日月', 8: '八日月', 10: '十日夜',
  13: '十三夜', 14: '小望月', 15: '十五夜', 16: '十六夜', 17: '立待月', 18: '居待月',
  19: '寝待月', 20: '更待月', 23: '二十三夜', 26: '二十六夜', 30: '三十日月'
};

const japaneseNumber = (value) => {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (value < 10) return digits[value];
  if (value === 10) return '十';
  if (value < 20) return `十${digits[value - 10]}`;
  if (value === 20) return '二十';
  if (value < 30) return `二十${digits[value - 20]}`;
  return '三十';
};

export function moonName(lunarDay) {
  return SPECIAL_NAMES[lunarDay] ?? `${japaneseNumber(lunarDay)}日の月`;
}

export function lunarDayFor(date, previousNew) {
  return differenceDays(dateKey(previousNew), typeof date === 'string' ? date : dateKey(date)) + 1;
}

export function phaseState({ fraction, waxing }) {
  if (fraction <= 0.03) return '新月のころ';
  if (fraction >= 0.97) return '満月のころ';
  if (Math.abs(fraction - 0.5) <= 0.07) return waxing ? '上弦のころ' : '下弦のころ';
  return waxing ? '満ちていく途中' : '欠けていく途中';
}

export function harvestMoonInfo(key) {
  const current = parseDateKey(key);
  if (!current) return null;
  const own = HARVEST_MOONS[current.year];
  let target = own;
  let mode = 'current';
  if (own && differenceDays(key, own) < 0) {
    target = HARVEST_MOONS[current.year + 1] ?? null;
    mode = 'next';
  }
  if (!target) return { mode: 'missing', target: null };

  const remaining = differenceDays(key, target);
  const targetMidday = jstMidnight(target) + 12 * 60 * 60 * 1000;
  const full = nearestFullMoon(targetMidday);
  const fullKey = dateKey(full);
  const fullOffset = differenceDays(target, fullKey);
  let lead;
  if (mode === 'next') lead = `次の中秋の名月は ${formatDate(target, { year: true })}`;
  else if (remaining === 0) lead = '今夜が中秋の名月';
  else lead = `中秋の名月まで あと ${remaining} 日`;
  const fullText = fullOffset === 0
    ? `満月は名月と同じ日（${formatTime(full)}）`
    : `満月は名月の${Math.abs(fullOffset)}日${fullOffset > 0 ? '後' : '前'}（${Number(fullKey.slice(5, 7))}/${Number(fullKey.slice(8, 10))} ${formatTime(full)}）`;
  return { mode, target, remaining, lead, full, fullKey, fullOffset, fullText };
}

export function clampOffset(value) {
  return Math.max(-30, Math.min(30, Math.round(Number(value) || 0)));
}
