export const groupName = (record, table) => table.class[record.cll] || table.phylum[record.phl] || table.unknown;
export function groupsFor(records, table) {
  const counts = new Map();
  for (const r of records) {
    const name = groupName(r, table);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
}
