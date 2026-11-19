import { START } from './contract.js';

const DAYS_IN_YEAR = 365;
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const START_DOY = MONTH_STARTS[START.month - 1] + START.dom - 1;
const SEASONS = [['winter', '冬'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋']];
const SEASON_STARTS = [59, 151, 243, 334];

export function dateOf(day) {
  if (!Number.isSafeInteger(day) || !Number.isSafeInteger(START_DOY + day)) throw new RangeError('暦の日数は範囲内の整数です');
  // 年の境界を暦に合わせ、循環する色の補間には1月1日を0とする通算日を使う。
  const elapsed = START_DOY + day;
  const year = Math.floor(elapsed / DAYS_IN_YEAR) + 1;
  const doy = (elapsed % DAYS_IN_YEAR + DAYS_IN_YEAR) % DAYS_IN_YEAR;
  const month = MONTH_STARTS.findLastIndex((start) => start <= doy) + 1;
  const dom = doy - MONTH_STARTS[month - 1] + 1;
  const week = Math.floor((dom - 1) / 7) + 1;
  const [season, seasonLabel] = SEASONS[Math.floor(month / 3) % 4];
  return { day, year, month, dom, doy, week, season, seasonLabel, label: `${seasonLabel}・${month}月${week}週` };
}

export function nextSeasonDay(day) {
  const { doy } = dateOf(day);
  const next = SEASON_STARTS.find((start) => start > doy) ?? DAYS_IN_YEAR + SEASON_STARTS[0];
  return day + next - doy;
}
