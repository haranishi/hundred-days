import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ARTWORKS } from '../data/artworks.js';

const files={
  24645:'The Great Wave off Kanagawa.png',
  28560:'Vincent van Gogh - The Bedroom - 1926.417 - Art Institute of Chicago.jpg',
  27992:'Georges Seurat - A Sunday on La Grande Jatte -- 1884 - Google Art Project.jpg',
  20684:'Gustave Caillebotte - Paris Street, Rainy Day - 1964.336 - Art Institute of Chicago.jpg',
  16568:'Claude Monet - Water Lilies - 1933.1157 - Art Institute of Chicago.jpg',
  111442:"Mary Cassatt - The Child's Bath - 1910.2 - Art Institute of Chicago.jpg",
  111436:'Paul Cézanne - The Basket of Apples - 1926.252 - Art Institute of Chicago.jpg',
  80607:'Vincent van Gogh - Self-Portrait - 1954.326 - Art Institute of Chicago.jpg',
  14620:'Claude Monet - Cliff Walk at Pourville - Google Art Project.jpg',
  14655:'Pierre-Auguste Renoir - Two Sisters (On the Terrace) - Google Art Project.jpg',
  61128:'Henri de Toulouse-Lautrec - At the Moulin Rouge - 1928.610 - Art Institute of Chicago.jpg',
  11723:'Berthe Morisot - Woman at Her Toilette - 1924.127 - Art Institute of Chicago.jpg',
  14572:'Hilaire Germain Edgar Degas - The Millinery Shop - 1933.428 - Art Institute of Chicago.jpg',
  94841:"Jules Breton, le chant de l'alouette.1884.jpg",
  90048:'Distant View of Niagara Falls 1830 Thomas Cole.jpg',
  87479:'Domenico Theotokópoulos, called El Greco - The Assumption of the Virgin - 1906.99 - Art Institute of Chicago.jpg',
  66042:"Adriaen van der Spelt - Trompe-l'Oeil Still Life with a Flower Garland and a Curtain - 1949.585 - Art Institute of Chicago.jpg",
  5848:'Nicolas Poussin - Landscape with Saint John on Patmos - 1930.500 - Art Institute of Chicago.jpg',
  95998:'Rembrandt Harmenszoon van Rijn - Old Man with a Gold Chain - 1922.4467 - Art Institute of Chicago.jpg',
  20579:'Gustave Moreau 003.jpg',
  4796:'Joseph Mallord William Turner - Fishing Boats with Hucksters Bargaining for Fish - 1922.4472 - Art Institute of Chicago.jpg',
  144969:'Carl Blechen - The Interior of the Palm House on the Pfaueninsel Near Potsdam - 1996.388 - Art Institute of Chicago.jpg',
  8983:'Vasily Kandinsky - Painting with Troika - 1931.509 - Art Institute of Chicago.jpg',
  154235:'Edvard Munch - The Girl by the Window - 2000.50 - Art Institute of Chicago.jpg',
  869:'Meindert Hobbema - The Watermill with the Great Red Roof - 1894.1031 - Art Institute of Chicago.jpg',
  561:'Jan Steen - The Family Concert - 1891.65 - Art Institute of Chicago.jpg',
  81533:'Édouard Manet - The Races at Longchamp - 1922.424 - Art Institute of Chicago.jpg',
  27943:'Paul Gauguin - Mahana no atua (Day of the God) - 1926.198 - Art Institute of Chicago.jpg',
  25865:'Winslow Homer - The Herring Net - Google Art Project.jpg',
  80530:'Sandro Botticelli - Virgin and Child with an Angel - 1954.283 - Art Institute of Chicago.jpg',
};
const root=new URL('../',import.meta.url);
await mkdir(new URL('assets/art/',root),{recursive:true});
await mkdir(new URL('tools/cache/',root),{recursive:true});
const previous=JSON.parse(await readFile(new URL('data/image-manifest.json',root),'utf8').catch(()=>'[]'));
// Explicit numeric IDs refresh only those entries; otherwise verified existing files are preserved.
const refresh=new Set(process.argv.slice(2).map(Number));
const manifest=[];
for(const work of ARTWORKS){
  const old=previous.find(asset=>asset.id===work.id);
  if(old){
    const bytes=await readFile(new URL(work.image,root));
    if(createHash('sha256').update(bytes).digest('hex')!==old.sha256)throw new Error(`Existing asset changed: ${work.id}`);
    if(!refresh.has(work.id)){manifest.push(old);continue;}
  }
  const api=`https://api.artic.edu/api/v1/artworks/${work.id}?fields=id,title,date_display,artist_display,image_id,is_public_domain,description,short_description,credit_line,main_reference_number,thumbnail`;
  const record=await readFile(new URL(`tools/cache/${work.id}.json`,root),'utf8').then(JSON.parse).catch(async()=>await(await fetch(api,{signal:AbortSignal.timeout(30000)})).json());
  if(!record.data.is_public_domain)throw new Error('Public-domain status not verified');
  await writeFile(new URL(`tools/cache/${work.id}.json`,root),JSON.stringify(record,null,2));
  const params=new URLSearchParams({action:'query',format:'json',titles:`File:${files[work.id]}`,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'960'});
  const cached=await readFile(new URL(`tools/cache/${work.id}-commons.json`,root),'utf8').then(JSON.parse).catch(()=>({}));
  let info=Object.values(cached.query?.pages||{}).find(page=>page.title===`File:${files[work.id]}`)?.imageinfo?.[0];
  if(!info){
    const reply=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`,{headers:{'User-Agent':'ArtUncovered/1.0 (local educational artwork importer)'},signal:AbortSignal.timeout(30000)});
    if(!reply.ok)throw new Error(`Commons ${work.id}: ${reply.status}. Retry later.`);
    const data=await reply.json();info=Object.values(data.query.pages)[0].imageinfo?.[0];
    await writeFile(new URL(`tools/cache/${work.id}-commons.json`,root),JSON.stringify(data,null,2));
  }
  if(!info)throw new Error(`Commons file not found: ${work.id}`);
  const license=info.extmetadata.LicenseShortName?.value||'';
  if(!/public domain|cc0/i.test(license))throw new Error(`Review license for ${work.id}: ${license}`);
  const url=info.thumburl||info.url;
  const response=await fetch(url,{headers:{'User-Agent':'ArtUncovered/1.0 (local educational artwork importer)'},signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error(`Image ${work.id}: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(work.image,root),bytes);
  manifest.push({id:work.id,title:record.data.title,referenceNumber:record.data.main_reference_number,imageId:record.data.image_id,source:work.source,commonsPage:info.descriptionurl,imageUrl:url,license,licenseUrl:info.extmetadata.LicenseUrl?.value||'https://creativecommons.org/publicdomain/mark/1.0/',copyrighted:info.extmetadata.Copyrighted?.value,descriptionLicense:'CC-BY-4.0',creditLine:record.data.credit_line,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),retrieved:new Date().toISOString().slice(0,10)});
  console.log(`${work.id}: ${license}, ${Math.round(bytes.length/1024)} KB`);
  await writeFile(new URL('data/image-manifest.json',root),JSON.stringify([...manifest,...previous.filter(asset=>!manifest.some(done=>done.id===asset.id))],null,2)+'\n');
  await new Promise(resolve=>setTimeout(resolve,3000));
}
await writeFile(new URL('data/image-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
