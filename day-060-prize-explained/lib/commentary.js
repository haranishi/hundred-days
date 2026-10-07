import { checkCommentary, tokyoDate } from './commentary-check.js';
import { schedule, announcementState } from './announcements.js';
export const emptyCommentary = () => ({ schema: 1, year: 2026, entries: {} });
export async function loadCommentary(fetcher = fetch, now = Date.now()) {
  try {
    const response = await fetcher('./data/commentary.json');
    if (!response.ok) return emptyCommentary();
    const data = await response.json();
    return checkCommentary(data, { now, upperBound: false }).length ? emptyCommentary() : data;
  } catch { return emptyCommentary(); }
}
export function commentaryModel(prize, data = emptyCommentary()) {
  const entry = data.entries?.[prize.cat];
  if (!entry) return { state: 'pending', prize, sources: [] };
  const ids = [], numbers = new Map();
  const refs = (row) => {
    for (const id of row.src) if (!numbers.has(id)) { ids.push(id); numbers.set(id, ids.length); }
    // 一つの文に出典が複数あるときは、番号の小さい順に並べる（[3][1] でなく [1][3]）
    return { ...row, refs: row.src.map((id) => ({ id, number: numbers.get(id) })).sort((a, b) => a.number - b.number) };
  };
  const what = entry.what.map(refs);
  const changed = entry.mode === 'facts' ? [] : entry.changed.map(refs);
  const expected = entry.mode === 'facts' ? [] : entry.expected.map(refs);
  const gap = entry.mode === 'facts' ? null : entry.gap.map(refs);
  return { state: entry.mode === 'facts' ? 'facts' : 'ready', prize, year: data.year, ...entry, what, changed, expected, gap,
    sources: ids.map((id) => ({ id, number: numbers.get(id), ...entry.sources[id] })) };
}
export function leadingPrize(prizes, now) {
  const announced = schedule.filter((item) => announcementState(item, prizes, now) === 'announced')
    .map((item, order) => ({ ...prizes.find((p) => p.cat === item.cat && p.year === 2026), order, at: item.at }));
  announced.sort((a, b) => (b.date || b.at.slice(0, 10)).localeCompare(a.date || a.at.slice(0, 10)) || b.order - a.order);
  const prize = announced[0] || null;
  return { prize, heading: prize && (prize.date || prize.at.slice(0, 10)) === tokyoDate(now) ? '今日の受賞' : 'いちばん新しい受賞' };
}
export function bundledPrizes(data) {
  const prizes = new Map();
  for (const row of [...(data.awards || []), ...(data.orgs || []).map((row) => ({ ...row, isOrg: true }))]) {
    if (row.year !== 2026) continue;
    if (!prizes.has(row.cat)) prizes.set(row.cat, { cat: row.cat, year: 2026, date: row.date, people: [] });
    prizes.get(row.cat).people.push(row);
  }
  return [...prizes.values()];
}
export function commentaryShareText(model) {
  return `${model.headline}${model.gap?.length ? `\n論文の出版年と${model.year}年の差：${model.gap.map((gap) => `${gap.years}年`).join('・')}。` : ''}\n— 今年の受賞の解説`;
}
export function commentaryName(person, entry, bundled = []) {
  const localized = entry?.people?.find((p) => String(p.id) === String(person.id));
  if (localized?.ja && /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/.test(localized.jaSrc)) return localized.ja;
  return bundled.find((p) => String(p.id) === String(person.id))?.ja || person.en;
}
