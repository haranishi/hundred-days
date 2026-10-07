import { ageAt } from './age.js';
export const categories = { med: '生理学・医学賞', phy: '物理学賞', che: '化学賞', lit: '文学賞', pea: '平和賞', eco: '経済学賞' };
export function mergeAwards(bundled, live = []) {
  const rows = new Map();
  for (const row of [...bundled, ...live]) {
    const identity = `${row.id}:${row.year}:${row.cat}`;
    const previous = rows.get(identity);
    rows.set(identity, { ...row, ja: row.ja || previous?.ja || null });
  }
  return [...rows.values()];
}
export function summarize(awards, age = null, cat = 'all') {
  const rows = awards.filter((row) => cat === 'all' || row.cat === cat)
    .map((row) => ({ ...row, ...ageAt(row) })).filter((row) => row.age !== null)
    .sort((a, b) => a.age - b.age || b.year - a.year || a.id.localeCompare(b.id));
  const histogram = new Map();
  for (const row of rows) histogram.set(row.age, (histogram.get(row.age) || 0) + 1);
  const ages = [...histogram.keys()];
  const n = rows.length;
  const middle = n ? (rows[Math.floor((n - 1) / 2)].age + rows[Math.floor(n / 2)].age) / 2 : null;
  return { rows, histogram, total: n, median: middle, youngest: rows[0], oldest: rows.at(-1),
    matches: rows.filter((row) => row.age === age).sort((a, b) => b.year - a.year || a.id.localeCompare(b.id)),
    younger: rows.filter((row) => row.age < age).length,
    nearest: [ages.filter((one) => one < age).at(-1), ages.find((one) => one > age)].filter((one) => one !== undefined) };
}
