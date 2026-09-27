const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ja-JP').trim();
export function filterWorks(works, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return works.filter(work => {
    const text = normalize(`${work.title} ${work.artist} ${work.english} ${work.era}`);
    return words.every(word => text.includes(word));
  });
}
