// Public museum records and Commons candidates; caches are ignored by git.
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('./cache/', import.meta.url);
await mkdir(root, { recursive: true });
const ids = process.argv.slice(2).map(Number);
async function publicJSON(url) {
  for (let attempt=0;attempt<3;attempt++) {
    const reply=await fetch(url,{headers:{'User-Agent':'ArtUncovered/1.0 educational collection research'},signal:AbortSignal.timeout(30000)});
    if (reply.status===429 || reply.status===503) { await new Promise(r=>setTimeout(r,30000*(attempt+1))); continue; }
    if (!reply.ok) throw new Error(`Public API: ${reply.status}`);
    return reply.json();
  }
  throw new Error('Rate limited: try later');
}
for (const id of ids) {
  const endpoint = `https://api.artic.edu/api/v1/artworks/${id}?fields=id,title,date_display,artist_display,artist_title,image_id,is_public_domain,description,short_description,credit_line,main_reference_number,thumbnail`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${id}: ${response.status}`);
  const record = await response.json(), work = record.data;
  await writeFile(new URL(`${id}.json`, root), JSON.stringify(record, null, 2));
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `"${work.main_reference_number}"`, gsrnamespace: '6', gsrlimit: '5', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960' });
  const commons = await publicJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
  await writeFile(new URL(`${id}-commons.json`, root), JSON.stringify(commons, null, 2));
  console.log(JSON.stringify({ id, title: work.title, artist: work.artist_display, year: work.date_display, pd: work.is_public_domain, ref: work.main_reference_number, thumbnail: work.thumbnail, description: work.description, candidates: Object.values(commons.query?.pages || {}).map(p => p.title) }));
  await new Promise(resolve => setTimeout(resolve, 5000));
}
